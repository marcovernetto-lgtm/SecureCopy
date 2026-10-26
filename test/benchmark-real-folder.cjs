const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const { visibleEntries } = require('../src/visible-files');
const { sha256 } = require('../src/copy-engine');
const { launch, delay } = require('./electron-driver.cjs');
const exec = promisify(execFile);
const SOURCE = process.env.SECURECOPY_BENCHMARK_SOURCE || process.argv[2] || '/Volumes/ExternalDrive/DCIM';
const OUTPUT = path.resolve('audit/2026-10-16/lumix-benchmark.json');
const finderScript = `on run argv
  set sourceFolder to POSIX file (item 1 of argv) as alias
  set destinationFolder to POSIX file (item 2 of argv) as alias
  with timeout of 7200 seconds
    tell application "Finder" to duplicate sourceFolder to destinationFolder
  end timeout
  return "Copy finished"
end run`;
async function manifest(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await visibleEntries(directory, await fs.readdir(directory, { withFileTypes: true }))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else {
        const stats = await fs.lstat(file);
        assert.ok(stats.isFile(), `Unsupported entry: ${file}`);
        result.push({ relative: path.relative(root, file), bytes: stats.size, dev: stats.dev, ino: stats.ino, mtimeMs: stats.mtimeMs, birthtimeMs: stats.birthtimeMs });
      }
    }
  }
  await visit(root);
  return result.sort((a,b) => a.relative.localeCompare(b.relative));
}
(async () => {
  const source = await fs.realpath(SOURCE);
  const before = await manifest(source);
  const bytes = before.reduce((total, file) => total + file.bytes, 0);
  const desktop = path.join(os.homedir(), 'Desktop');
  const capacity = await fs.statfs(desktop);
  assert.ok(capacity.bavail * capacity.bsize > bytes * 2 + 10 * 2**30, 'Spazio insufficiente per due copie separate');
  const root = await fs.mkdtemp(path.join(desktop, 'Test copia Lumix 2026-10-16 - '));
  const finderDest = path.join(root, 'Finder'), appDest = path.join(root, 'SecureCopy');
  await fs.mkdir(finderDest); await fs.mkdir(appDest);
  const metrics = { source, root, files: before.length, bytes, version: '2.7.6', order: ['Finder', 'SecureCopy'], cacheNotFlushed: true, startedAt: new Date().toISOString() };
  const persist = async () => {
    const text = JSON.stringify(metrics, null, 2);
    await fs.writeFile(OUTPUT, text);
    await fs.writeFile(path.join(root, 'Risultati.json'), text);
  };
  await persist(); await fs.writeFile('/tmp/securecopy-lumix-benchmark-location.txt', root);
  console.log(JSON.stringify({ stage: 'Finder', root, files: before.length, GB: bytes / 1e9 }));
  let app, timer;
  try {
    let started = performance.now();
    timer = setInterval(() => console.log(JSON.stringify({ stage: 'Finder', elapsedSeconds: (performance.now()-started)/1000 })), 20000);
    try { await exec('/usr/bin/osascript', ['-e', finderScript, source, finderDest], { maxBuffer: 1024*1024 }); }
    finally { clearInterval(timer); }
    metrics.finderSeconds = (performance.now()-started)/1000;
    const finderFiles = await manifest(path.join(finderDest, 'Lumix'));
    assert.deepEqual(finderFiles.map(({relative,bytes})=>({relative,bytes})), before.map(({relative,bytes})=>({relative,bytes})));
    await persist(); console.log(JSON.stringify({ stage: 'Finder-finished', seconds: metrics.finderSeconds }));

    const profile = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-lumix-profile-')));
    metrics.profile = profile;
    app = await launch(profile);
    await app.evaluate('switchScreen("monitor");');
    started = performance.now();
    const id = await app.evaluate(`window.electronAPI.startCopy(${JSON.stringify([source])},${JSON.stringify(appDest)},'Confronto tempi · Lumix 53 GB')`);
    let outcome, lastLog = 0;
    for (;;) {
      const state = await app.evaluate(`(()=>{const item=operations.find(job=>job.id===${JSON.stringify(id)});return item?{status:item.status,progress:item.progress,filesProcessed:item.filesProcessed,totalFiles:item.totalFiles,result:item.result}:null;})()`);
      if (state?.result) { outcome = state.result; break; }
      if (performance.now()-lastLog > 20000) {
        lastLog = performance.now();
        console.log(JSON.stringify({ stage: 'SecureCopy', elapsedSeconds:(performance.now()-started)/1000, ...state }));
      }
      assert.ok(performance.now()-started < 7200000, 'Timeout della prova: controllare copia e report');
      await delay(500);
    }
    metrics.secureCopySeconds = (performance.now()-started)/1000;
    metrics.ratio = metrics.secureCopySeconds / metrics.finderSeconds;
    metrics.extraPercent = (metrics.ratio-1)*100;
    metrics.status = outcome.status;
    metrics.copied = outcome.copied;
    metrics.failures = outcome.failures;
    await persist();
    console.log(JSON.stringify({ stage:'SecureCopy-finished',seconds:metrics.secureCopySeconds,ratio:metrics.ratio,status:metrics.status,failures:metrics.failures }));
    assert.equal(outcome.status, 'completed', JSON.stringify(outcome.failures));
    assert.equal(outcome.copied, before.length);
    const report = JSON.parse(await fs.readFile(outcome.reportPath, 'utf8'));
    assert.equal(report.files.length, before.length);
    await fs.copyFile(outcome.reportPath, path.join(root, 'Report SecureCopy.json'));
    const screenshot = await app.command('Page.captureScreenshot', { format:'png' });
    await fs.writeFile(path.join(root, 'SecureCopy completata.png'), Buffer.from(screenshot.data,'base64'));
    await app.quit(); app = null;
    // Outside the timed runs: verify the Finder copy against all SHA-256 hashes produced by the app.
    let verified = 0;
    for (const file of report.files) {
      assert.equal(await sha256(path.join(finderDest, file.path)), file.sha256, file.path);
      verified++;
      if (verified % 20 === 0) console.log(JSON.stringify({stage:'Verifica-Finder-fuori-cronometro',verified,total:report.files.length}));
    }
    assert.deepEqual(await manifest(source), before, 'La sorgente è cambiata durante il benchmark');
    metrics.finderHashesVerified = verified;
    metrics.sourceUnchanged = true;
    metrics.completedAt = new Date().toISOString();
    await persist();
    await fs.writeFile(path.join(root, 'LEGGIMI.txt'), `Confronto reale: ${before.length} file, ${(bytes/1e9).toFixed(2)} GB.\nFinder: ${metrics.finderSeconds.toFixed(2)} secondi.\nSecureCopy 2.7.6 con verifica completa: ${metrics.secureCopySeconds.toFixed(2)} secondi.\nRapporto: ${metrics.ratio.toFixed(2)} volte; ${metrics.extraPercent.toFixed(1)}% in più.\nTutte le copie Finder confrontate con gli hash SHA-256 del report SecureCopy, fuori dai tempi misurati.\nOrdine Finder poi SecureCopy: cache di macOS non svuotata, possibile vantaggio per la seconda prova. Profilo app isolato; stessa build verificata installata.\nEntrambe le copie sono conservate; la sorgente non è stata modificata.\n`);
    console.log(JSON.stringify({stage:'Completed',...metrics}));
  } catch (error) {
    metrics.error = error.message; await persist(); throw error;
  } finally {
    clearInterval(timer);
    if (app) { await app.quit().catch(()=>{}); await app.stop(); }
    // Real copied material and its reports are intentionally retained.
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
