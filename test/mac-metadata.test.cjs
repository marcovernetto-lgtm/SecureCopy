const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { setCreationTime } = require('../mac-metadata');
const { runCopy, copyFileVerified, sha256 } = require('../copy-engine');
const { compareFolders, reconcileFolders } = require('../compare-engine');
const options = { skip: process.platform !== 'darwin' };

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-metadata-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'destination');
  await fs.mkdir(source); await fs.mkdir(destination);
  return { root, source, destination };
}

async function photo(directory, name = 'C3840.MP4') {
  const file = path.join(directory, name);
  await fs.writeFile(file, Buffer.alloc(1024 * 1024, 117));
  await fs.chmod(file, 0o640);
  await fs.utimes(file, new Date('2026-09-01T13:39:47.123Z'), new Date('2026-09-01T13:39:47.123Z'));
  await setCreationTime(file, Date.parse('2026-09-18T13:39:47.789Z'));
  return { path: file, stats: await fs.stat(file) };
}

async function equalCopy(item, destination) {
  const actual = await fs.stat(destination);
  assert.equal(await sha256(item.path), await sha256(destination));
  assert.ok(Math.abs(item.stats.birthtimeMs - actual.birthtimeMs) <= 5);
  assert.ok(Math.abs(item.stats.mtimeMs - actual.mtimeMs) <= 5);
  assert.equal(item.stats.mode & 0o777, actual.mode & 0o777);
}

test('native creation date preserves milliseconds, late birth date and literal special characters', options, async t => {
  const { source } = await fixture(t);
  const item = await photo(source, 'Matrimonio à " $(touch injected) \' .MP4');
  assert.equal(item.stats.birthtimeMs, Date.parse('2026-09-18T13:39:47.789Z'));
  assert.ok(Math.abs(item.stats.mtimeMs - Date.parse('2026-09-01T13:39:47.123Z')) <= 5);
  assert.ok(item.stats.birthtimeMs > item.stats.mtimeMs);
  assert.deepEqual(await fs.readdir(source), [path.basename(item.path)]);
});

test('copy succeeds when creation is later than modification and a second copy skips verified files', options, async t => {
  const { source, destination } = await fixture(t);
  const item = await photo(source);
  const progress = [];
  const report = await runCopy({ sourceDirs: [source], destDir: destination, onProgress: event => progress.push(event) });
  assert.equal(report.status, 'completed'); assert.equal(report.copied, 1);
  assert.deepEqual(report.failures, []); assert.equal(report.verifiedFiles.length, 1);
  await equalCopy(item, path.join(destination, 'source', 'C3840.MP4'));
  assert.ok(progress.some(event => event.phase === 'verify'));
  assert.equal(progress.at(-1).filesProcessed, 1);
  const second = await runCopy({ sourceDirs: [source], destDir: destination });
  assert.equal(second.status, 'completed'); assert.equal(second.skipped, 1); assert.equal(second.copied, 0);
  assert.deepEqual(await fs.readdir(path.join(destination, 'source')), ['C3840.MP4']);
});

test('publication on filesystems without hard links also restores creation date', options, async t => {
  const { source, destination } = await fixture(t);
  const item = await photo(source);
  const originalLink = fs.link;
  fs.link = async () => { throw Object.assign(new Error('Hard links unavailable'), { code: 'ENOTSUP' }); };
  try {
    const target = path.join(destination, 'C3840.MP4');
    assert.equal(await copyFileVerified(item, target), 'copied');
    await equalCopy(item, target);
    assert.deepEqual(await fs.readdir(destination), ['C3840.MP4']);
  } finally { fs.link = originalLink; }
});

test('retry copies only the selected failed path and keeps other files intact', options, async t => {
  const { source, destination } = await fixture(t);
  const missing = await photo(source, 'retry.MP4');
  await photo(source, 'already-copied.MP4');
  await fs.mkdir(path.join(destination, 'source'));
  const untouched = path.join(destination, 'source', 'already-copied.MP4');
  await fs.writeFile(untouched, 'must remain unchanged');
  const before = await fs.stat(untouched);
  const report = await runCopy({ sourceDirs: [source], destDir: destination, onlyPaths: ['source/retry.MP4'] });
  assert.equal(report.totalFiles, 1); assert.equal(report.copied, 1); assert.deepEqual(report.failures, []);
  await equalCopy(missing, path.join(destination, 'source', 'retry.MP4'));
  assert.equal(await fs.readFile(untouched, 'utf8'), 'must remain unchanged');
  assert.equal((await fs.stat(untouched)).ino, before.ino);
});

for (const keep of ['left', 'right']) {
  test(`comparison copies ${keep} to the other side, retaining live presence and verified dates`, options, async t => {
    const { source: left, destination: right } = await fixture(t);
    const item = await photo(keep === 'left' ? left : right);
    const session = await compareFolders(left, right, { mode: 'quick' });
    const progress = [];
    const result = await reconcileFolders(session, [{ relative: 'C3840.MP4', keep }], { selectedOnly: true, onProgress: event => progress.push(event) });
    assert.equal(result.status, 'completed'); assert.deepEqual(result.failures, []);
    await equalCopy(item, path.join(keep === 'left' ? right : left, 'C3840.MP4'));
    const entry = result.comparison.entries.find(entry => entry.relative === 'C3840.MP4');
    assert.ok(entry.leftExists); assert.ok(entry.rightExists); assert.ok(entry.verified);
    assert.ok(progress.some(event => event.outcome === 'verified'));
    const deep = await compareFolders(left, right, { mode: 'deep' });
    assert.equal(deep.entries.find(entry => entry.relative === 'C3840.MP4').status, 'identical');
  });
}

test('cancelled or unsafe metadata writes do not change the target', options, async t => {
  const { source, destination } = await fixture(t);
  const item = await photo(source);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(setCreationTime(item.path, 1, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal((await fs.stat(item.path)).birthtimeMs, item.stats.birthtimeMs);
  const link = path.join(destination, 'link'); await fs.symlink(item.path, link);
  await assert.rejects(setCreationTime(link, 1), /non è sicuro/);
  await assert.rejects(setCreationTime(item.path, NaN), /non valido/);
  assert.equal((await fs.stat(item.path)).birthtimeMs, item.stats.birthtimeMs);
});

test('changed source still fails before publishing a copy', options, async t => {
  const { source, destination } = await fixture(t);
  const item = await photo(source);
  await fs.appendFile(item.path, 'changed');
  await assert.rejects(copyFileVerified(item, path.join(destination, 'file.MP4')), /sorgente è cambiato/);
  assert.deepEqual(await fs.readdir(destination), []);
});
