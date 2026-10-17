const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { launch, waitFor } = require('./electron-driver.cjs');
const { sha256 } = require('../copy-engine');

(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-full-app-audit-')));
  const shots = path.resolve(__dirname, '../audit/2026-10-15/screenshots'); await fs.mkdir(shots, { recursive: true });
  let app;
  try {
    const profile = path.join(root, 'profile'); app = await launch(profile, process.argv[2] || 'arm64');
    for (const previous of ['0', '100']) {
      await app.evaluate(`localStorage.setItem('securecopy-glass-intensity',${JSON.stringify(previous)});`);
      await app.command('Page.reload');
      await waitFor(() => app.evaluate('document.readyState === "complete" && !!window.SecureCopyAppearance && localStorage.getItem("securecopy-glass-intensity") === null'));
      const glass = await app.evaluate('({value:getComputedStyle(document.documentElement).getPropertyValue("--glass-percentage").trim(),blur:getComputedStyle(document.documentElement).getPropertyValue("--glass-blur").trim(),slider:!!document.getElementById("glass-intensity"),api:Object.keys(window.SecureCopyAppearance)})');
      assert.equal(glass.value, '70%'); assert.equal(glass.blur, '20px'); assert.equal(glass.slider, false); assert.deepEqual(glass.api, ['setSection']);
    }
    for (const view of ['home', 'copy', 'compare', 'monitor']) {
      await app.evaluate(`switchScreen(${JSON.stringify(view)});`);
      assert.equal(await app.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--glass-percentage").trim()'), '70%');
    }
    await app.evaluate('logoClick.click();');
    assert.equal(await app.evaluate('document.activeElement.id'), 'credits-close');
    assert.equal(await app.evaluate('document.querySelectorAll("#credits-box input[type=range]").length'), 0);
    const image = await app.command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(shots, 'settings-fixed-70.png'), Buffer.from(image.data, 'base64'));
    await app.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await app.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    assert.equal(await app.evaluate('creditsBox.style.display'), 'none');
    await app.evaluate('logoClick.click(); const language = document.getElementById("language-select"); language.value="en"; language.dispatchEvent(new Event("change", {bubbles:true}));');
    await waitFor(() => app.evaluate('document.documentElement.lang === "en"'));
    assert.equal(await app.evaluate('!!document.getElementById("glass-intensity")'), false);
    await app.evaluate('document.getElementById("language-select").value="it"; document.getElementById("language-select").dispatchEvent(new Event("change", {bubbles:true})); closeSettings();');
    await waitFor(() => app.evaluate('document.documentElement.lang === "it"'));
    const source = path.join(root, 'CARD'); await fs.mkdir(source);
    for (let n = 0; n < 24; n++) await fs.writeFile(path.join(source, `clip-${String(n).padStart(2, '0')}.MOV`), Buffer.alloc(8192, n));
    const destinations = [];
    for (let n = 0; n < 3; n++) { const directory = path.join(root, `backup-${n}`); await fs.mkdir(directory); destinations.push(directory); }
    await app.evaluate(`window.__auditProgress=[]; window.__auditPauseId=null; window.__auditCancelId=null; window.__didPause=false;window.__didCancel=false;
      window.electronAPI.onCopyProgress(event=>{ window.__auditProgress.push(event); if(event.filesProcessed>=1 && event.id===window.__auditPauseId && !window.__didPause){window.__didPause=true;window.electronAPI.pauseQueue(event.id);} if(event.filesProcessed>=1 && event.id===window.__auditCancelId && !window.__didCancel){window.__didCancel=true;window.electronAPI.cancelCopy(event.id);} });`);
    const batch = await app.evaluate(`window.electronAPI.startBatch(${JSON.stringify([source])},${JSON.stringify(destinations)},'now','replace')`);
    assert.equal(batch.length, 3); assert.equal(batch.filter(item => item.status === 'processing').length, 2); assert.equal(batch.filter(item => item.status === 'pending').length, 1);
    await app.evaluate(`window.__auditPauseId=${JSON.stringify(batch[0].id)};window.__auditCancelId=${JSON.stringify(batch[2].id)};`);
    await waitFor(() => app.evaluate(`operations.some(item=>item.id===${JSON.stringify(batch[0].id)} && item.status==='paused')`));
    await app.evaluate(`window.electronAPI.resumeQueue(${JSON.stringify(batch[0].id)})`);
    const cancelled = await waitFor(() => app.evaluate(`operations.find(item=>item.id===${JSON.stringify(batch[2].id)} && item.status==='cancelled') || null`));
    assert.ok(cancelled.result.copied >= 1);
    const cancelledTarget = path.join(destinations[2], 'CARD'), before = new Map();
    for (const name of (await fs.readdir(cancelledTarget)).filter(name => !name.startsWith('.'))) before.set(name, (await fs.stat(path.join(cancelledTarget, name))).ino);
    const retryId = await app.evaluate(`window.electronAPI.retryCopy(${JSON.stringify(cancelled.id)})`);
    const retry = await waitFor(() => app.evaluate(`operations.find(item=>item.id===${JSON.stringify(retryId)} && item.status==='completed') || null`));
    assert.equal(retry.result.totalFiles, 24); assert.equal(retry.result.failures.length, 0); assert.ok(retry.result.skipped >= before.size);
    await waitFor(() => app.evaluate(`operations.filter(item=>${JSON.stringify(batch.slice(0, 2).map(item => item.id))}.includes(item.id) && item.status==='completed').length===2`));
    for (const [name, ino] of before) assert.equal((await fs.stat(path.join(cancelledTarget, name))).ino, ino);
    for (const destination of destinations) for (const name of await fs.readdir(source)) assert.equal(await sha256(path.join(source, name)), await sha256(path.join(destination, 'CARD', name)));
    const progress = await app.evaluate('window.__auditProgress');
    for (const id of new Set(progress.map(item => item.id))) {
      const events = progress.filter(item => item.id === id);
      assert.ok(events.every((event, index) => event.percentage < 100 && (!index || event.percentage >= events[index-1].percentage)));
    }
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(profile, 'pending-queue.json'), 'utf8')), []);
    const invalidId = await app.evaluate(`window.electronAPI.startCopy(${JSON.stringify([source])},${JSON.stringify(source)},'overlap')`);
    const invalid = await waitFor(() => app.evaluate(`operations.find(item=>item.id===${JSON.stringify(invalidId)} && item.status==='failed') || null`));
    assert.match(invalid.result.failures[0].reason, /sovrappongono|contiene|separate|destinazione/i);
    await app.evaluate(`focusedJobId=${JSON.stringify(retryId)};renderSelectedOperation(operations.find(item=>item.id===focusedJobId));sourcePaths=${JSON.stringify([source])};destPaths=${JSON.stringify([destinations[0]])};renderSources();renderDestinations();newCopyBtn.click();`);
    assert.deepEqual(await app.evaluate('sourcePaths'), []); assert.deepEqual(await app.evaluate('destPaths'), []);
    console.log(JSON.stringify({ fixedGlass70AllScreens: true, previousPreferencesIgnored: true, sliderRemoved: true, settingsFocusAndEscape: true, italianAndEnglish: true, twoConcurrentPlusQueued: true, pauseResume: true, cancellationAndRetry: true, existingCopiesPreserved: true, all72FilesShaVerified: true, monotonicProgress: true, overlapRejected: true, newCopyResetsPickers: true }));
  } finally { await app?.stop(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
