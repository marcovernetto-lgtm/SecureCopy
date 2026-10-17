const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { runCopy, copyFileVerified, sha256 } = require('../copy-engine');
const { compareFolders, reconcileFolders, expandComparisonDecisions } = require('../compare-engine');

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-audit-fix-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'SD'), destination = path.join(root, 'dest');
  await fs.mkdir(source); await fs.mkdir(destination);
  return { root, source, destination };
}

async function publicationFailure(t, { existing = true, abort = false } = {}) {
  const f = await fixture(t);
  const sourceFile = path.join(f.source, 'clip.mov'), target = path.join(f.destination, 'clip.mov');
  await fs.writeFile(sourceFile, 'new verified media');
  if (existing) await fs.writeFile(target, 'old valid media');
  const link = fs.link, open = fs.open; let injected = false;
  const controller = new AbortController();
  fs.link = async () => { throw Object.assign(new Error('No hard links'), { code: 'ENOTSUP' }); };
  fs.open = async (...args) => {
    const handle = await open(...args);
    if (args[0] === target && args[1] === 'wx' && !injected) {
      injected = true;
      const write = handle.write.bind(handle);
      handle.write = async (buffer, offset) => {
        await write(buffer, offset, 2);
        if (abort) controller.abort();
        throw Object.assign(new Error('Injected write failure'), { code: 'ENOSPC' });
      };
    }
    return handle;
  };
  try {
    await assert.rejects(copyFileVerified({ path: sourceFile, stats: await fs.stat(sourceFile) }, target, { signal: controller.signal }), /Copia incompleta conservata/);
  } finally { fs.link = link; fs.open = open; }
  assert.equal(await fs.readFile(sourceFile, 'utf8'), 'new verified media');
  const directory = path.join(f.destination, '.securecopy-versions');
  const names = await fs.readdir(directory);
  assert.equal(await fs.readFile(path.join(directory, names.find(name => name.startsWith('incomplete-'))), 'utf8'), 'ne');
  if (existing) {
    assert.equal(await fs.readFile(target, 'utf8'), 'old valid media');
    assert.equal(await fs.readFile(path.join(directory, names.find(name => name.startsWith('version-'))), 'utf8'), 'old valid media');
  } else await assert.rejects(fs.stat(target), { code: 'ENOENT' });
}

test('failed fallback publication preserves incomplete data and restores the previous file', t => publicationFailure(t));
test('failed first publication preserves incomplete data without exposing it as the final file', t => publicationFailure(t, { existing: false }));
test('cancellation during fallback publication still restores the previous file', t => publicationFailure(t, { abort: true }));

test('a competing final file is never moved or overwritten during recovery', async t => {
  const { source, destination } = await fixture(t);
  const file = path.join(source, 'clip.mov'), target = path.join(destination, 'clip.mov');
  await fs.writeFile(file, 'new'); await fs.writeFile(target, 'old');
  const link = fs.link;
  fs.link = async (from, to) => {
    if (to === target) { await fs.writeFile(target, 'external', { flag: 'wx' }); throw Object.assign(new Error('Conflict'), { code: 'EEXIST' }); }
    return link(from, to);
  };
  try { await assert.rejects(copyFileVerified({ path: file, stats: await fs.stat(file) }, target), /Conflict/); }
  finally { fs.link = link; }
  assert.equal(await fs.readFile(target, 'utf8'), 'external');
  const versions = path.join(destination, '.securecopy-versions');
  const names = await fs.readdir(versions);
  assert.equal(names.length, 1); assert.equal(await fs.readFile(path.join(versions, names[0]), 'utf8'), 'old');
});

test('fallback space is checked before moving the previous version', async t => {
  const { source, destination } = await fixture(t);
  const file = path.join(source, 'clip.mov'), target = path.join(destination, 'clip.mov');
  await fs.writeFile(file, Buffer.alloc(1024)); await fs.writeFile(target, 'old');
  const before = await fs.stat(target), link = fs.link, statfs = fs.statfs;
  let calls = 0;
  fs.link = async () => { throw Object.assign(new Error('No hard links'), { code: 'ENOTSUP' }); };
  fs.statfs = async () => ({ bavail: ++calls === 1 ? 4096 : 1, bsize: 1 });
  try { await assert.rejects(copyFileVerified({ path: file, stats: await fs.stat(file) }, target), /Spazio disponibile insufficiente/); }
  finally { fs.link = link; fs.statfs = statfs; }
  assert.equal((await fs.stat(target)).ino, before.ino); assert.equal(await fs.readFile(target, 'utf8'), 'old');
  assert.deepEqual(await fs.readdir(destination), ['clip.mov']);
});

test('missing retry paths are failures and do not create unrelated directories', async t => {
  const { source, destination } = await fixture(t);
  await fs.mkdir(path.join(source, 'other')); await fs.writeFile(path.join(source, 'other', 'clip.mov'), 'safe');
  const result = await runCopy({ sourceDirs: [source], destDir: destination, onlyPaths: ['SD/deleted.mov'] });
  assert.equal(result.status, 'partial'); assert.equal(result.totalFiles, 0);
  assert.ok(result.failures.some(failure => failure.path === 'SD/deleted.mov'));
  assert.deepEqual(await fs.readdir(destination), []);
});

test('an empty retry never expands into a full copy', async t => {
  const { source, destination } = await fixture(t); await fs.writeFile(path.join(source, 'clip.mov'), 'safe');
  const result = await runCopy({ sourceDirs: [source], destDir: destination, onlyPaths: [] });
  assert.equal(result.status, 'partial'); assert.equal(result.totalFiles, 0); assert.deepEqual(await fs.readdir(destination), []);
});

test('retry creates only required ancestors and preserves unrelated destination directories', async t => {
  const { source, destination } = await fixture(t);
  await fs.mkdir(path.join(source, 'wanted')); await fs.writeFile(path.join(source, 'wanted', 'clip.mov'), 'video');
  await fs.mkdir(path.join(source, 'other')); await fs.writeFile(path.join(source, 'other', 'skip.mov'), 'other');
  const result = await runCopy({ sourceDirs: [source], destDir: destination, onlyPaths: ['SD/wanted/clip.mov'] });
  assert.equal(result.status, 'completed'); assert.equal(result.copied, 1);
  assert.deepEqual(await fs.readdir(path.join(destination, 'SD')), ['wanted']);
});

for (const keep of ['left', 'right']) {
  test(`selecting a folder copies nested files ${keep} without including hidden files or other folders`, async t => {
    const { source: left, destination: right } = await fixture(t);
    const from = keep === 'left' ? left : right, to = keep === 'left' ? right : left;
    await fs.mkdir(path.join(from, 'DAY', 'nested'), { recursive: true });
    await fs.writeFile(path.join(from, 'DAY', 'nested', 'clip.mov'), 'video');
    await fs.writeFile(path.join(from, 'DAY', '.DS_Store'), 'hidden');
    await fs.mkdir(path.join(from, 'other')); await fs.writeFile(path.join(from, 'other', 'untouched.mov'), 'other');
    const session = await compareFolders(left, right);
    const choices = expandComparisonDecisions(session, [{ relative: 'DAY', keep }]);
    assert.equal(choices.length, 3);
    const result = await reconcileFolders(session, [{ relative: 'DAY', keep }], { selectedOnly: true });
    assert.equal(result.status, 'completed'); assert.deepEqual(result.failures, []);
    assert.equal(await fs.readFile(path.join(to, 'DAY', 'nested', 'clip.mov'), 'utf8'), 'video');
    assert.deepEqual(await fs.readdir(to), ['DAY']);
    assert.deepEqual(await fs.readdir(path.join(to, 'DAY')), ['nested']);
    assert.ok(result.comparison.entries.find(entry => entry.relative === 'DAY/nested/clip.mov').verified);
  });
}

test('copy percentage is monotonic, below 100 until finalization, and SHA reads report byte progress', async t => {
  const { source, destination } = await fixture(t);
  await fs.writeFile(path.join(source, 'clip.mov'), Buffer.alloc(1024 * 1024, 9));
  const events = [];
  const result = await runCopy({ sourceDirs: [source], destDir: destination, onProgress: event => events.push(event) });
  assert.equal(result.status, 'completed');
  const values = events.filter(event => event.percentage !== undefined).map(event => event.percentage);
  assert.ok(values.length > 4); assert.ok(values.every((value, index) => value < 100 && (!index || value >= values[index - 1])));
  assert.ok(events.some(event => event.phase === 'verify' && event.readBytes > 0));
  const second = [];
  const identical = await runCopy({ sourceDirs: [source], destDir: destination, onProgress: event => second.push(event) });
  assert.equal(identical.skipped, 1); assert.equal(identical.transferredBytes, 0);
  assert.ok(second.some(event => event.readPass === 'destination' && event.readBytes > 0));
});

test('long Unicode file names copy, replace with preserved version, and keep both without name overflow', async t => {
  const { source, destination } = await fixture(t);
  const name = 'à'.repeat(110) + '.MOV', file = path.join(source, name);
  await fs.writeFile(file, 'first');
  let result = await runCopy({ sourceDirs: [source], destDir: destination });
  assert.equal(result.status, 'completed'); assert.equal(result.copied, 1);
  await fs.writeFile(file, 'second');
  result = await runCopy({ sourceDirs: [source], destDir: destination });
  assert.equal(result.status, 'completed'); assert.equal(await fs.readFile(result.verifiedFiles[0].previousVersion, 'utf8'), 'first');
  await fs.writeFile(file, 'third');
  result = await runCopy({ sourceDirs: [source], destDir: destination, policy: 'both' });
  assert.equal(result.status, 'completed');
  const copied = path.join(destination, result.verifiedFiles[0].path);
  assert.ok(Buffer.byteLength(path.basename(copied)) <= 240);
  assert.equal(await sha256(file), await sha256(copied));
  assert.equal(await fs.readFile(path.join(destination, 'SD', name), 'utf8'), 'second');
});

test('internal temporary names are excluded from ordinary copies', async t => {
  const { source, destination } = await fixture(t);
  await fs.writeFile(path.join(source, '.securecopy-01234567-0123-0123-0123-012345678901.part'), 'temporary');
  await fs.writeFile(path.join(source, '.clip.mov.securecopy-01234567-0123-0123-0123-012345678901.part'), 'old temporary');
  await fs.writeFile(path.join(source, 'clip.mov'), 'video');
  const result = await runCopy({ sourceDirs: [source], destDir: destination });
  assert.equal(result.totalFiles, 1); assert.equal(result.status, 'completed');
  assert.deepEqual(await fs.readdir(path.join(destination, 'SD')), ['clip.mov']);
});

test('comparison publishes live inventory entries before the analysis phase', async t => {
  const { source, destination } = await fixture(t);
  await fs.writeFile(path.join(source, 'clip.mov'), 'video');
  const events = [];
  await compareFolders(source, destination, { onProgress: event => events.push(event) });
  const position = events.findIndex(event => event.phase === 'inventory' && event.current === 'clip.mov');
  assert.ok(position >= 0); assert.ok(position < events.findIndex(event => event.phase === 'analyze'));
});
