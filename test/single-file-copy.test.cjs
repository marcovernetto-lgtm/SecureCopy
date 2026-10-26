const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { runCopy, sha256 } = require('../src/copy-engine');
const { setCreationTime } = require('../src/mac-metadata');

async function makeFixture(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-single-file-test-')));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const destination = path.join(base, 'destination');
  await fs.mkdir(destination);
  return { base, destination };
}

test('copying a single file directly to destination preserves contents, name, and exact dates', async t => {
  const { base, destination } = await makeFixture(t);
  const sourceFile = path.join(base, 'A014_C001_102601_001.braw');
  const buffer = Buffer.alloc(512 * 1024, 0x42);
  await fs.writeFile(sourceFile, buffer);

  const mtime = new Date('2026-05-14T10:20:30.456Z');
  await fs.utimes(sourceFile, mtime, mtime);
  if (process.platform === 'darwin') {
    await setCreationTime(sourceFile, Date.parse('2026-05-10T08:15:00.000Z'));
  }

  const report = await runCopy({ sourceDirs: [sourceFile], destDir: destination });
  assert.equal(report.status, 'completed');
  assert.equal(report.copied, 1);
  assert.equal(report.failures.length, 0);

  const targetFile = path.join(destination, 'A014_C001_102601_001.braw');
  assert.equal(await sha256(sourceFile), await sha256(targetFile));

  const sourceStat = await fs.stat(sourceFile);
  const targetStat = await fs.stat(targetFile);
  assert.equal(sourceStat.size, targetStat.size);
  assert.equal(Math.round(sourceStat.mtimeMs), Math.round(targetStat.mtimeMs));
  if (process.platform === 'darwin') {
    assert.equal(Math.round(sourceStat.birthtimeMs), Math.round(targetStat.birthtimeMs));
  }

  // Second run skips already verified file
  const second = await runCopy({ sourceDirs: [sourceFile], destDir: destination });
  assert.equal(second.status, 'completed');
  assert.equal(second.skipped, 1);
  assert.equal(second.transferredBytes, 0);
});

test('copying multiple files directly copies each file into destination root', async t => {
  const { base, destination } = await makeFixture(t);
  const file1 = path.join(base, 'clip1.mov');
  const file2 = path.join(base, 'audio1.wav');
  await fs.writeFile(file1, 'movie-content');
  await fs.writeFile(file2, 'sound-wave-content');

  const report = await runCopy({ sourceDirs: [file1, file2], destDir: destination });
  assert.equal(report.status, 'completed');
  assert.equal(report.copied, 2);
  assert.equal(report.failures.length, 0);

  assert.equal(await fs.readFile(path.join(destination, 'clip1.mov'), 'utf8'), 'movie-content');
  assert.equal(await fs.readFile(path.join(destination, 'audio1.wav'), 'utf8'), 'sound-wave-content');
  assert.equal(await sha256(file1), await sha256(path.join(destination, 'clip1.mov')));
  assert.equal(await sha256(file2), await sha256(path.join(destination, 'audio1.wav')));
});

test('copying mixed folder and single file preserves folder hierarchy for folder and places file in destination', async t => {
  const { base, destination } = await makeFixture(t);
  const folder = path.join(base, 'CARD_A');
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, 'shot1.r3d'), 'red-raw-data');
  const standaloneFile = path.join(base, 'metadata.xml');
  await fs.writeFile(standaloneFile, '<xml>metadata</xml>');

  const report = await runCopy({ sourceDirs: [folder, standaloneFile], destDir: destination });
  assert.equal(report.status, 'completed');
  assert.equal(report.copied, 2);
  assert.equal(report.failures.length, 0);

  assert.equal(await fs.readFile(path.join(destination, 'CARD_A', 'shot1.r3d'), 'utf8'), 'red-raw-data');
  assert.equal(await fs.readFile(path.join(destination, 'metadata.xml'), 'utf8'), '<xml>metadata</xml>');
});

test('single file retry onlyPaths operates specifically on that file', async t => {
  const { base, destination } = await makeFixture(t);
  const file = path.join(base, 'failed-file.mov');
  await fs.writeFile(file, 'retry-data');

  const retryReport = await runCopy({ sourceDirs: [file], destDir: destination, onlyPaths: ['failed-file.mov'] });
  assert.equal(retryReport.status, 'completed');
  assert.equal(retryReport.copied, 1);
  assert.equal(await fs.readFile(path.join(destination, 'failed-file.mov'), 'utf8'), 'retry-data');
});
