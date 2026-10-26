const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, waitFor } = require('./electron-driver.cjs');

(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-dismiss-audit-')));
  let app;
  try {
    const profile = path.join(root, 'profile');
    const dummySrc = path.join(root, 'dummy-src');
    const dummyDst = path.join(root, 'dummy-dst');
    await fs.mkdir(profile, { recursive: true });
    await fs.mkdir(dummySrc, { recursive: true });
    await fs.mkdir(dummyDst, { recursive: true });

    // Seed pending copy queue
    const pendingQueueFile = path.join(profile, 'pending-queue.json');
    await fs.writeFile(pendingQueueFile, JSON.stringify([
      { id: 'interrupted-1', sourceDirs: [dummySrc], destDir: dummyDst, description: 'Copia interrotta di prova', status: 'pending' }
    ]));

    // Seed comparison recovery
    const comparisonRecoveryFile = path.join(profile, 'comparison-recovery.json');
    await fs.writeFile(comparisonRecoveryFile, JSON.stringify({
      leftRoot: dummySrc,
      rightRoot: dummyDst,
      mode: 'quick',
      decisions: [{ relative: 'test.txt', keep: 'left' }]
    }));

    app = await launch(profile);

    // 1. Verify pending copy recovery detected
    const count = await app.evaluate('window.electronAPI.getPendingCopyRecoveryCount()');
    assert.equal(count, 1, 'Deve rilevare 1 copia in sospeso');

    // 2. Verify banner visibility on setup screen
    await app.evaluate('showSetupScreen();');
    const copyWrapHiddenBefore = await app.evaluate('document.getElementById("recover-copy-wrap").hidden');
    assert.equal(copyWrapHiddenBefore, false, 'Il banner di recupero copia deve essere visibile');

    // 3. Click the dismiss (X) button
    await app.evaluate('document.getElementById("dismiss-copy-recovery").click();');
    await waitFor(async () => {
      const isHidden = await app.evaluate('document.getElementById("recover-copy-wrap").hidden');
      const countNow = await app.evaluate('window.electronAPI.getPendingCopyRecoveryCount()');
      return isHidden && countNow === 0;
    });

    const copyWrapHiddenAfter = await app.evaluate('document.getElementById("recover-copy-wrap").hidden');
    assert.equal(copyWrapHiddenAfter, true, 'Il banner di recupero copia deve sparire dopo il click sulla X');

    // Verify pending-queue.json is removed from disk
    let pendingFileExists = true;
    try {
      await fs.access(pendingQueueFile);
    } catch {
      pendingFileExists = false;
    }
    assert.equal(pendingFileExists, false, 'pending-queue.json deve essere eliminato dal disco');

    // 4. Test Comparison Recovery Dismissal
    await app.evaluate('showCompareScreen();');
    const compareWrapHiddenBefore = await app.evaluate('document.getElementById("compare-recover-wrap").hidden');
    assert.equal(compareWrapHiddenBefore, false, 'Il banner di recupero confronto deve essere visibile');

    // Click comparison dismiss (X) button
    await app.evaluate('document.getElementById("dismiss-compare-recovery").click();');
    await waitFor(async () => {
      const isHidden = await app.evaluate('document.getElementById("compare-recover-wrap").hidden');
      const rec = await app.evaluate('window.electronAPI.getComparisonRecovery()');
      return isHidden && rec === null;
    });

    const compareWrapHiddenAfter = await app.evaluate('document.getElementById("compare-recover-wrap").hidden');
    assert.equal(compareWrapHiddenAfter, true, 'Il banner di confronto deve sparire dopo il click sulla X');

    // Verify comparison-recovery.json is removed from disk
    let compFileExists = true;
    try {
      await fs.access(comparisonRecoveryFile);
    } catch {
      compFileExists = false;
    }
    assert.equal(compFileExists, false, 'comparison-recovery.json deve essere eliminato dal disco');

    // 5. Restart app and verify persistence of clean state
    await app.quit();
    app = await launch(profile);

    const countOnRestart = await app.evaluate('window.electronAPI.getPendingCopyRecoveryCount()');
    assert.equal(countOnRestart, 0, 'Al riavvio il conteggio delle copie in sospeso deve rimanere 0');

    const compOnRestart = await app.evaluate('window.electronAPI.getComparisonRecovery()');
    assert.equal(compOnRestart, null, 'Al riavvio il confronto deve rimanere nullo');

    console.log(JSON.stringify({
      pendingCopyDismissed: true,
      comparisonDismissed: true,
      filesRemovedFromDisk: true,
      cleanStatePersistedOnRestart: true
    }));
  } finally {
    await app?.stop();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
