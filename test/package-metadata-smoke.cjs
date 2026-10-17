const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { setCreationTime } = require('../mac-metadata');
const { sha256 } = require('../copy-engine');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-package-test-')));
  const profile = path.join(root, 'profile'); await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'background-settings.json'), JSON.stringify({ diskNotices: false }));
  await fs.writeFile(path.join(profile, 'report-retention.json'), JSON.stringify({ days: 90 }));
  const crypto = require('node:crypto');
  const reportDirectory = path.join(profile, 'reports'); await fs.mkdir(reportDirectory);
  const artifactId = crypto.randomUUID();
  const expired = path.join(reportDirectory, `SecureCopy-verifica-${artifactId}.json`);
  const oldDate = new Date(Date.now() - 21 * 86400000);
  await fs.writeFile(expired, JSON.stringify({ schema: 'SecureCopy verification report v1', id: artifactId, completedAt: oldDate.toISOString() }));
  await fs.utimes(expired, oldDate, oldDate);
  const preserved = path.join(root, 'copied-material.RAW'); await fs.writeFile(preserved, 'preserved material');
  const source = path.join(root, 'SD1'), destination = path.join(root, 'destination');
  await fs.mkdir(source); await fs.mkdir(path.join(destination, 'SD1'), { recursive: true });
  for (const file of ['C3840.MP4', 'retry.XML']) {
    const target = path.join(source, file); await fs.writeFile(target, Buffer.alloc(1024 * 1024, 43));
    await fs.utimes(target, new Date('2026-09-01'), new Date('2026-09-01'));
    await setCreationTime(target, Date.parse('2026-09-18T13:39:47.789Z'));
  }
  // An actual copy conflict verifies partial progress and retry through real IPC.
  await fs.mkdir(path.join(destination, 'SD1', 'retry.XML'));
  const architecture = process.argv[2] || 'arm64';
  assert.ok(['arm64', 'x64'].includes(architecture), 'Architettura di test non valida');
  const executable = path.resolve(__dirname, `../dist/mac-${architecture}/SecureCopy.app/Contents/MacOS/SecureCopy`);
  const child = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--disable-background-timer-throttling'], { stdio: 'ignore' });
  let socket;
  try {
    async function waitFor(fn) {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) { const result = await fn(); if (result) return result; await delay(100); }
      throw new Error('Timeout verifica app');
    }
    const port = await waitFor(async () => (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '')).split('\n')[0]);
    const page = await waitFor(async () => {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
      return targets.find(target => target.type === 'page' && target.url.includes('index.html'));
    });
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let id = 0; const pending = new Map();
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data); const request = pending.get(data.id);
      if (request) { clearTimeout(request.timer); pending.delete(data.id); data.error ? request.reject(new Error(JSON.stringify(data.error))) : request.resolve(data.result); }
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id; const timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout ${method}`)); }, 15000);
      pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }));
    });
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await waitFor(() => evaluate('document.readyState === "complete" && typeof operations !== "undefined" && !!window.electronAPI'));
    await evaluate('window.__copyAuditProgress = []; window.electronAPI.onCopyProgress(data => window.__copyAuditProgress.push(data));');
    assert.equal(await evaluate('operations.length'), 0);
    assert.equal(await evaluate('window.electronAPI.getReportRetention()'), 20);
    assert.equal(await evaluate('document.getElementById("report-retention").textContent'), '20 giorni');
    assert.equal(JSON.parse(await fs.readFile(path.join(profile, 'report-retention.json'), 'utf8')).days, 20);
    await assert.rejects(fs.stat(expired), { code: 'ENOENT' });
    assert.equal(await fs.readFile(preserved, 'utf8'), 'preserved material');
    await evaluate(`document.getElementById('nav-operations-btn').click(); window.electronAPI.startCopy(${JSON.stringify([source])}, ${JSON.stringify(destination)}, 'Verifica aggiornamento')`);
    const first = await waitFor(() => evaluate('operations.find(item => item.status === "partial") || null'));
    assert.equal(first.result.copied, 1); assert.equal(first.result.failures.length, 1);
    const partialText = await evaluate('document.getElementById("progress-details").textContent');
    assert.equal(partialText, '1 di 2 file verificati');
    const beforeRetry = await fs.stat(path.join(destination, 'SD1', 'C3840.MP4'));
    await fs.rmdir(path.join(destination, 'SD1', 'retry.XML'));
    await evaluate(`window.electronAPI.retryCopy(${JSON.stringify(first.id)})`);
    const retried = await waitFor(() => evaluate('operations.find(item => item.status === "completed") || null'));
    assert.equal(retried.result.totalFiles, 1); assert.equal(retried.result.copied, 1); assert.deepEqual(retried.result.failures, []);
    assert.equal((await fs.stat(path.join(destination, 'SD1', 'C3840.MP4'))).ino, beforeRetry.ino);
    for (const file of ['C3840.MP4', 'retry.XML']) {
      assert.equal(await sha256(path.join(source, file)), await sha256(path.join(destination, 'SD1', file)));
      assert.ok(Math.abs((await fs.stat(path.join(source, file))).birthtimeMs - (await fs.stat(path.join(destination, 'SD1', file))).birthtimeMs) <= 5);
    }
    const snapshots = new Map();
    // A permission-only difference must be a notice, not a failed/repeated media copy.
    await fs.chmod(path.join(destination, 'SD1', 'retry.XML'), 0o600);
    for (const file of ['C3840.MP4', 'retry.XML']) snapshots.set(file, await fs.stat(path.join(destination, 'SD1', file)));
    await evaluate(`window.electronAPI.startCopy(${JSON.stringify([source])}, ${JSON.stringify(destination)}, 'Controlla tutti i file già presenti')`);
    const identical = await waitFor(() => evaluate('operations.find(item => item.description === "Controlla tutti i file già presenti" && item.status === "completed") || null'));
    assert.equal(identical.result.skipped, 2); assert.equal(identical.result.copied, 0); assert.equal(identical.result.transferredBytes, 0);
    assert.equal(identical.result.filesProcessed, 2); assert.deepEqual(identical.result.failures, []);
    await evaluate(`focusedJobId = ${JSON.stringify(identical.id)}; renderSelectedOperation(operations.find(item => item.id === focusedJobId));`);
    assert.equal(await evaluate('document.getElementById("progress-percentage").textContent'), '100%');
    assert.ok(identical.result.warnings.length);
    assert.equal(await evaluate('document.getElementById("metadata-details").classList.contains("hidden")'), false);
    assert.equal(await evaluate('document.getElementById("failure-details").classList.contains("hidden")'), true);
    const savedReport = JSON.parse(await fs.readFile(identical.result.reportPath, 'utf8'));
    assert.ok(savedReport.summary.warnings.length); assert.equal(savedReport.files.length, 2);
    await evaluate('document.getElementById("metadata-details").open = true;');
    const noticeScreenshot = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(os.tmpdir(), `securecopy-2.7.4-notices-${architecture}.png`), Buffer.from(noticeScreenshot.data, 'base64'));
    const progress = await evaluate('window.__copyAuditProgress');
    for (const jobId of new Set(progress.map(event => event.id))) {
      const events = progress.filter(event => event.id === jobId);
      assert.ok(events.every((event, index) => event.percentage < 100 && (!index || event.percentage >= events[index - 1].percentage)));
    }
    for (const file of ['C3840.MP4', 'retry.XML']) {
      const after = await fs.stat(path.join(destination, 'SD1', file));
      assert.equal(after.ino, snapshots.get(file).ino); assert.equal(after.ctimeMs, snapshots.get(file).ctimeMs);
    }
    for (const from of ['left', 'right']) {
      const left = path.join(root, `folder-${from}-left`), right = path.join(root, `folder-${from}-right`);
      await fs.mkdir(left); await fs.mkdir(right);
      const sourceRoot = from === 'left' ? left : right, targetRoot = from === 'left' ? right : left;
      await fs.mkdir(path.join(sourceRoot, 'DAY', 'nested'), { recursive: true });
      await fs.writeFile(path.join(sourceRoot, 'DAY', 'nested', 'clip.mov'), Buffer.alloc(1024 * 1024, 19));
      await fs.writeFile(path.join(sourceRoot, 'DAY', '.DS_Store'), 'hidden');
      await evaluate(`(async () => { compareLeft = ${JSON.stringify(left)}; compareRight = ${JSON.stringify(right)}; switchScreen('compare'); await analyzeComparison(); return true; })()`);
      await evaluate(`window.__folderCopy = runComparisonCopy([{relative:'DAY', keep:${JSON.stringify(from)}}],true); true`);
      await waitFor(() => evaluate('!!document.querySelector("dialog.copy-confirmation[open]")'));
      assert.match(await evaluate('document.querySelector(".copy-confirmation-summary").textContent'), /^3 elementi/);
      await evaluate('document.querySelector("dialog.copy-confirmation .button.primary").click();');
      await evaluate('window.__folderCopy');
      const state = await evaluate('({entry:compareResult.entries.find(entry=>entry.relative==="DAY/nested/clip.mov"),text:document.getElementById("compare-progress").textContent,rows:[...document.querySelectorAll(".compare-row")].map(row=>({path:row.dataset.relative,presence:row.dataset.presence,green:row.classList.contains("present")}))})');
      assert.equal(state.entry.verified, true); assert.equal(state.entry.leftExists, true); assert.equal(state.entry.rightExists, true);
      assert.ok(state.rows.some(row => row.path === 'DAY/nested/clip.mov' && row.presence === 'both' && row.green));
      assert.equal(await sha256(path.join(sourceRoot, 'DAY', 'nested', 'clip.mov')), await sha256(path.join(targetRoot, 'DAY', 'nested', 'clip.mov')));
      assert.deepEqual(await fs.readdir(path.join(targetRoot, 'DAY')), ['nested']);
    }
    await evaluate(`switchScreen('monitor'); focusedJobId = ${JSON.stringify(first.id)}; renderSelectedOperation(operations.find(item => item.id === focusedJobId));`);
    const screenshot = await command('Page.captureScreenshot', { format: 'png' });
    const image = path.join(os.tmpdir(), 'securecopy-2.7.4-partial-verified.png'); await fs.writeFile(image, Buffer.from(screenshot.data, 'base64'));
    const data = await evaluate('({queue:operations.length, details:document.getElementById("progress-details").textContent, summary:document.getElementById("result-summary").textContent, version:document.querySelector(".settings-about").textContent})');
    console.log(JSON.stringify({ monotonicProgress: true, folderConfirmationIncludesFiles: true, folderCopiesBothDirections: true, greenPresenceAfterVerification: true, retention20Days: true, expiredReportRemoved: true, copiedMaterialPreserved: true, allIdenticalCompletedWithoutWrites: true, partialFilesVerified: partialText, retryOnlyFailed: true, existingCopyUnchanged: true, creationDatesPreserved: true, data, screenshot: image }));
  } finally {
    socket?.close(); child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
