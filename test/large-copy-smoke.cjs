const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { runCopy, sha256 } = require('../copy-engine');
(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-large-audit-')));
  try {
    const source = path.join(root, 'CARD'); await fs.mkdir(source);
    const file = path.join(source, 'large-512MiB.BRAW'); await fs.writeFile(file, ''); await fs.truncate(file, 512 * 1024 * 1024);
    const events = [], destination = path.join(root, 'backup');
    const result = await runCopy({ sourceDirs: [source], destDir: destination, onProgress: event => events.push(event) });
    assert.equal(result.status, 'completed'); assert.equal(result.copied, 1); assert.equal(result.transferredBytes, 512 * 1024 * 1024);
    assert.equal(await sha256(file), await sha256(path.join(destination, 'CARD', path.basename(file))));
    const progress = events.filter(event => typeof event.percentage === 'number');
    assert.ok(progress.every((event, index) => event.percentage < 100 && (!index || event.percentage >= progress[index-1].percentage)));
    assert.ok(events.some(event => event.currentFileBytes > 0));
    const controller = new AbortController(); const cancelledDestination = path.join(root, 'cancelled'); let interrupted = false;
    await assert.rejects(runCopy({ sourceDirs: [source], destDir: cancelledDestination, signal: controller.signal, onProgress: event => {
      if (!interrupted && event.currentFileBytes > 0) { interrupted = true; controller.abort(); }
    } }));
    assert.ok(interrupted); await assert.rejects(fs.stat(path.join(cancelledDestination, 'CARD', path.basename(file))), { code: 'ENOENT' });
    assert.ok(!(await fs.readdir(path.join(cancelledDestination, 'CARD'))).some(name => name.endsWith('.part')));
    assert.equal((await fs.stat(file)).size, 512 * 1024 * 1024);
    console.log(JSON.stringify({ bytes: result.transferredBytes, sha256Verified: true, monotonicProgress: true, cancellationDuringCopy: true, noPartialFinalFile: true, sourceUntouched: true }));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
