const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const { runCopy, copyFileVerified, sha256 } = require('../src/copy-engine');
const { setCreationTime } = require('../src/mac-metadata');
const { readMacMetadata } = require('../src/file-metadata');
const options = { skip: process.platform !== 'darwin' };

async function fixture(t, count = 1) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-identical-test-')));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const source = path.join(base, 'SD1'), destination = path.join(base, 'destination'); await fs.mkdir(source);
  for (let index = 0; index < count; index++) {
    const file = path.join(source, `photo-${index}.RAW`);
    await fs.writeFile(file, Buffer.alloc(1024 * 1024, index + 7));
    await fs.utimes(file, new Date('2026-09-01T15:39:47.123Z'), new Date('2026-09-01T15:39:47.123Z'));
    await setCreationTime(file, Date.parse('2026-09-18T15:39:47.123Z'));
    await exec('/usr/bin/xattr', ['-w', 'com.unshapedstudio.securecopy-test', `metadata-${index}`, file]);
  }
  const first = await runCopy({ sourceDirs: [source], destDir: destination });
  assert.equal(first.copied, count); assert.deepEqual(first.failures, []);
  return { source, destination, target: path.join(destination, 'SD1'), sourceFile: path.join(source, 'photo-0.RAW'), targetFile: path.join(destination, 'SD1', 'photo-0.RAW') };
}

function fingerprint(stats) {
  return Object.fromEntries(['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'birthtimeMs', 'mode', 'uid', 'gid'].map(key => [key, stats[key]]));
}

test('every identical file is checked, no destination file or folder is rewritten, and the operation completes with zero bytes transferred', options, async t => {
  const { source, destination, target } = await fixture(t, 3);
  const names = await fs.readdir(target), snapshots = new Map();
  for (const name of ['', ...names]) snapshots.set(name, fingerprint(await fs.stat(path.join(target, name))));
  const phases = [];
  const result = await runCopy({ sourceDirs: [source], destDir: destination, onProgress: event => phases.push(event) });
  assert.equal(result.status, 'completed'); assert.equal(result.totalFiles, 3); assert.equal(result.filesProcessed, 3);
  assert.equal(result.skipped, 3); assert.equal(result.copied, 0); assert.equal(result.transferredBytes, 0);
  assert.equal(result.verifiedFiles.length, 3); assert.deepEqual(result.failures, []);
  assert.equal(new Set(phases.filter(event => event.phase === 'compare').map(event => event.currentFile)).size, 3);
  for (const name of ['', ...names]) assert.deepEqual(fingerprint(await fs.stat(path.join(target, name))), snapshots.get(name));
  assert.deepEqual(await fs.readdir(target), names);
});

for (const policy of ['replace', 'both', 'skip']) {
  test(`identical files are already verified under ${policy}, even with an obsolete force flag`, options, async t => {
    const { sourceFile, targetFile, target } = await fixture(t);
    const before = fingerprint(await fs.stat(targetFile)); const stats = await fs.stat(sourceFile);
    let hash;
    const result = await copyFileVerified({ path: sourceFile, stats }, targetFile, { policy, force: true, onVerified: value => { hash = value; } });
    assert.equal(result, 'skipped'); assert.equal(hash, await sha256(sourceFile));
    assert.deepEqual(fingerprint(await fs.stat(targetFile)), before);
    assert.deepEqual(await fs.readdir(target), ['photo-0.RAW']);
  });
}

test('same size and dates cannot hide different contents; the other identical files remain untouched', options, async t => {
  const { source, destination, target, targetFile } = await fixture(t, 3);
  const original = await fs.stat(targetFile);
  await fs.writeFile(targetFile, Buffer.alloc(original.size, 94));
  await fs.utimes(targetFile, original.atime, original.mtime); await setCreationTime(targetFile, original.birthtimeMs);
  const untouched = fingerprint(await fs.stat(path.join(target, 'photo-2.RAW')));
  const result = await runCopy({ sourceDirs: [source], destDir: destination });
  assert.equal(result.status, 'completed'); assert.equal(result.copied, 1); assert.equal(result.skipped, 2);
  assert.equal(result.verifiedFiles.length, 3); assert.ok(result.verifiedFiles.find(file => file.path.endsWith('photo-0.RAW')).previousVersion);
  assert.deepEqual(fingerprint(await fs.stat(path.join(target, 'photo-2.RAW'))), untouched);
});

test('extended-attribute-only differences are detected and corrected with the previous version preserved', options, async t => {
  const { source, destination, sourceFile, targetFile } = await fixture(t);
  const beforeHash = await sha256(targetFile);
  await exec('/usr/bin/xattr', ['-w', 'com.unshapedstudio.securecopy-test', 'different metadata', targetFile]);
  assert.equal(beforeHash, await sha256(sourceFile));
  const result = await runCopy({ sourceDirs: [source], destDir: destination, allowMetadataDifferences: false });
  assert.equal(result.status, 'completed'); assert.equal(result.copied, 1); assert.equal(result.skipped, 0);
  assert.deepEqual(await readMacMetadata(sourceFile), await readMacMetadata(targetFile));
  const previous = result.verifiedFiles[0].previousVersion; assert.ok(previous); assert.ok(await fs.stat(previous));
});

test('ACL-only differences cannot be reported as identical', options, async t => {
  const { source, destination, sourceFile, targetFile } = await fixture(t);
  await exec('/bin/chmod', ['+a', 'everyone allow read', targetFile]);
  assert.notEqual((await readMacMetadata(sourceFile)).acl, (await readMacMetadata(targetFile)).acl);
  const result = await runCopy({ sourceDirs: [source], destDir: destination, allowMetadataDifferences: false });
  assert.equal(result.copied, 1); assert.equal(result.skipped, 0); assert.deepEqual(result.failures, []);
  assert.deepEqual(await readMacMetadata(sourceFile), await readMacMetadata(targetFile));
});

test('permission-only differences cannot be reported as identical', options, async t => {
  const { source, destination, sourceFile, targetFile } = await fixture(t);
  await fs.chmod(targetFile, 0o600);
  const result = await runCopy({ sourceDirs: [source], destDir: destination, allowMetadataDifferences: false });
  assert.equal(result.copied, 1); assert.equal(result.skipped, 0); assert.deepEqual(result.failures, []);
  assert.equal((await fs.stat(sourceFile)).mode, (await fs.stat(targetFile)).mode);
});

test('a two-minute date difference cannot be reported as identical', options, async t => {
  const { source, destination, targetFile } = await fixture(t);
  const original = await fs.stat(targetFile);
  await fs.utimes(targetFile, original.atimeMs / 1000, (original.mtimeMs + 120000) / 1000);
  await setCreationTime(targetFile, original.birthtimeMs);
  const result = await runCopy({ sourceDirs: [source], destDir: destination, allowMetadataDifferences: false });
  assert.equal(result.copied, 1); assert.equal(result.skipped, 0); assert.deepEqual(result.failures, []);
});

test('seconds/sub-minute date differences within tolerance are treated as identical', options, async t => {
  const { source, destination, targetFile } = await fixture(t);
  const original = await fs.stat(targetFile);
  await fs.utimes(targetFile, original.atimeMs / 1000, (original.mtimeMs + 5000) / 1000);
  await setCreationTime(targetFile, original.birthtimeMs);
  const result = await runCopy({ sourceDirs: [source], destDir: destination, allowMetadataDifferences: false });
  assert.equal(result.copied, 0); assert.equal(result.skipped, 1); assert.deepEqual(result.failures, []);
});

test('native sub-millisecond dates are preserved and do not cause repeated copying', options, async t => {
  const { source, destination, sourceFile, targetFile } = await fixture(t);
  await fs.writeFile(sourceFile, 'content with native high precision modification time');
  const before = await fs.stat(sourceFile);
  const first = await runCopy({ sourceDirs: [source], destDir: destination });
  assert.equal(first.copied, 1); assert.deepEqual(first.failures, []);
  assert.ok(Math.abs(before.mtimeMs - (await fs.stat(targetFile)).mtimeMs) <= 0.01);
  const second = await runCopy({ sourceDirs: [source], destDir: destination });
  assert.equal(second.skipped, 1); assert.equal(second.copied, 0); assert.deepEqual(second.failures, []);
});
