const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, waitFor } = require('./electron-driver.cjs');

(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-quit-audit-')));
  let app;
  try {
    const profile = path.join(root, 'profile'), source = path.join(root, 'CARD'), dest = path.join(root, 'backup');
    await fs.mkdir(source); await fs.mkdir(dest);
    for (let n = 0; n < 20; n++) await fs.writeFile(path.join(source, `clip-${String(n).padStart(2, '0')}.MOV`), Buffer.alloc(4096, n));
    app = await launch(profile);
    await app.evaluate('window.__pausedForQuit = false; window.electronAPI.onCopyProgress(event => { if (event.filesProcessed >= 1 && !window.__pausedForQuit) { window.__pausedForQuit = true; window.electronAPI.pauseQueue(event.id); } });');
    await app.evaluate(`window.electronAPI.startCopy(${JSON.stringify([source])},${JSON.stringify(dest)},'Prova chiusura e recupero')`);
    await waitFor(() => app.evaluate('operations.some(item => item.status === "paused")'));
    await app.quit();
    const pending = JSON.parse(await fs.readFile(path.join(profile, 'pending-queue.json'), 'utf8'));
    console.log(JSON.stringify({ pendingAfterGracefulQuit: pending.length }));
    assert.equal(pending.length, 1, 'La chiusura ordinata deve conservare il lavoro interrotto');
    const target = path.join(dest, 'CARD');
    const present = (await fs.readdir(target)).filter(name => !name.startsWith('.'));
    const fingerprints = new Map(await Promise.all(present.map(async name => [name, (await fs.stat(path.join(target, name))).ino])));
    app = await launch(profile);
    assert.equal(await app.evaluate('operations.length'), 0);
    assert.equal(await app.evaluate('window.electronAPI.getPendingCopyRecoveryCount()'), 1);
    await app.evaluate('window.electronAPI.recoverPendingCopies();');
    await app.evaluate('window.electronAPI.startQueue();');
    const result = await waitFor(() => app.evaluate('operations.find(item => item.status === "completed") || null'));
    assert.equal(result.result.totalFiles, 20); assert.equal(result.result.failures.length, 0);
    for (const [name, ino] of fingerprints) assert.equal((await fs.stat(path.join(target, name))).ino, ino);
    console.log(JSON.stringify({ gracefulQuitRecovery: true, existingCopiesPreserved: true, copied: result.result.copied, skipped: result.result.skipped }));
  } finally { await app?.stop(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
