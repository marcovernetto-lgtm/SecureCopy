const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const sync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { runCopy, sha256 } = require('../copy-engine');

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-media-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'CARD'), destDir = path.join(root, 'backup');
  await fs.mkdir(source); await fs.mkdir(destDir);
  return { root, source, destDir, target: path.join(destDir, 'CARD') };
}

test('all visible files and sidecars copy byte-for-byte regardless of extension or codec; hidden trees are ignored', async t => {
  const { source, destDir, target } = await fixture(t);
  const names = ['video.BRAW', 'clip.R3D', 'preview.LRF', 'movie.MXF', 'sequence.CRM', 'video.MOV', 'image.CR3', 'image.NEF', 'image.ARW', 'image.DNG', 'image.HEIC', 'image.AVIF', 'image.JPG', 'image.TIFF', 'clip.XML', 'clip.XMP', 'unknown.new-camera-codec', 'NO_EXTENSION', 'empty.RAW', 'Café 日本語 🎥.mp4'];
  for (const [index, name] of names.entries()) await fs.writeFile(path.join(source, name), Buffer.alloc(name === 'empty.RAW' ? 0 : 4096, index));
  await fs.mkdir(path.join(source, 'DCIM', 'empty'), { recursive: true });
  await fs.mkdir(path.join(source, '.Spotlight-V100')); await fs.writeFile(path.join(source, '.Spotlight-V100', 'index'), 'hidden');
  for (const name of ['.DS_Store', '._video.BRAW']) await fs.writeFile(path.join(source, name), 'hidden');
  await fs.mkdir(path.join(source, 'System Volume Information'));
  await fs.symlink('/nonexistent', path.join(source, '.hidden-link'));
  if (process.platform === 'darwin') {
    const hidden = path.join(source, 'Finder-hidden.MOV'); await fs.writeFile(hidden, 'hidden');
    execFileSync('/usr/bin/chflags', ['hidden', hidden]);
  }
  const report = await runCopy({ sourceDirs: [source], destDir });
  assert.equal(report.status, 'completed'); assert.equal(report.copied, names.length); assert.deepEqual(report.failures, []);
  assert.deepEqual((await fs.readdir(target)).sort(), [...names, 'DCIM'].sort());
  for (const name of names) assert.equal(await sha256(path.join(source, name)), await sha256(path.join(target, name)));
  assert.ok((await fs.stat(path.join(target, 'DCIM', 'empty'))).isDirectory());
});

test('unsupported file and directory metadata produces notices while verified contents complete', async t => {
  const { source, destDir, target } = await fixture(t);
  await fs.writeFile(path.join(source, 'clip.MXF'), 'media data');
  const chmod = fs.chmod, utimes = fs.utimes;
  fs.chmod = async (file, ...args) => { if (String(file).startsWith(destDir)) throw Object.assign(new Error('Unsupported permissions'), { code: 'ENOTSUP' }); return chmod(file, ...args); };
  fs.utimes = async (file, ...args) => { if (String(file).startsWith(destDir)) throw Object.assign(new Error('Unsupported dates'), { code: 'ENOTSUP' }); return utimes(file, ...args); };
  try {
    const result = await runCopy({ sourceDirs: [source], destDir });
    assert.equal(result.status, 'completed'); assert.equal(result.copied, 1); assert.deepEqual(result.failures, []);
    assert.ok(result.warnings.length >= 2); assert.equal(await sha256(path.join(source, 'clip.MXF')), await sha256(path.join(target, 'clip.MXF')));
  } finally { fs.chmod = chmod; fs.utimes = utimes; }
});

test('unrepresentable creation dates preserve verified media, report a date error and retry without recopying', { skip: process.platform !== 'darwin' }, async t => {
  const { source, destDir, target } = await fixture(t);
  await fs.writeFile(path.join(source, 'clip.BRAW'), 'camera bytes');
  const lstat = fs.lstat;
  fs.lstat = async (file, ...args) => {
    const stats = await lstat(file, ...args);
    if (String(file).startsWith(destDir) && stats.isFile()) stats.birthtimeMs = Math.floor(stats.birthtimeMs / 2000) * 2000;
    return stats;
  };
  try {
    const result = await runCopy({ sourceDirs: [source], destDir });
    assert.equal(result.status, 'partial'); assert.equal(result.copied, 1); assert.equal(result.failures.length, 1); assert.equal(result.failures[0].metadataOnly, true); assert.equal(result.verifiedFiles[0].creationDatePreserved, false);
    assert.match(result.failures[0].reason, /data di creazione/);
    assert.equal(await sha256(path.join(target, 'clip.BRAW')), await sha256(path.join(source, 'clip.BRAW')));
    const before = await fs.stat(path.join(target, 'clip.BRAW'));
    const second = await runCopy({ sourceDirs: [source], destDir });
    assert.equal(second.skipped, 1); assert.equal(second.copied, 0); assert.equal(second.status, 'partial'); assert.equal(second.failures[0].metadataOnly, true);
    assert.equal((await fs.stat(path.join(target, 'clip.BRAW'))).ino, before.ino);
  } finally { fs.lstat = lstat; }
});

test('identical bytes with different filesystem attributes are verified without rewriting', async t => {
  const { source, destDir, target } = await fixture(t);
  await fs.writeFile(path.join(source, 'image.RAW'), 'photo bytes');
  await runCopy({ sourceDirs: [source], destDir });
  const file = path.join(target, 'image.RAW'); await fs.chmod(file, 0o600); await fs.utimes(file, new Date(Date.now() + 10000), new Date(Date.now() + 10000));
  const before = await fs.stat(file);
  const report = await runCopy({ sourceDirs: [source], destDir });
  assert.equal(report.status, 'completed'); assert.equal(report.skipped, 1); assert.equal(report.copied, 0); assert.ok(report.warnings.length);
  assert.equal((await fs.stat(file)).ino, before.ino); assert.equal((await fs.stat(file)).ctimeMs, before.ctimeMs);
});

test('retry repairs only creation date when contents are already intact', { skip: process.platform !== 'darwin' }, async t => {
  const { source, destDir, target } = await fixture(t);
  const file = path.join(source, 'photo.CR3'); await fs.writeFile(file, 'intact camera data');
  await runCopy({ sourceDirs: [source], destDir });
  const destination = path.join(target, 'photo.CR3');
  const { setCreationTime } = require('../mac-metadata');
  const expected = await fs.stat(file);
  await setCreationTime(destination, expected.birthtimeMs - 30000);
  const before = await fs.stat(destination);
  const result = await runCopy({ sourceDirs: [source], destDir, onlyPaths: ['CARD/photo.CR3'] });
  assert.equal(result.status, 'completed'); assert.equal(result.copied, 0); assert.equal(result.skipped, 1);
  assert.equal(result.transferredBytes, 0); assert.equal((await fs.stat(destination)).ino, before.ino);
  assert.ok(Math.abs((await fs.stat(destination)).birthtimeMs - expected.birthtimeMs) <= 0.01);
});

for (const command of ['/usr/bin/ditto', '/usr/bin/xattr']) {
  test(`filesystem ${command} errors do not prevent byte verification or creation-date preservation`, { skip: process.platform !== 'darwin' }, async t => {
    const { source, destDir } = await fixture(t);
    const file = path.join(source, 'camera.unknown'); await fs.writeFile(file, 'arbitrary camera content');
    const script = `
      const cp = require('node:child_process'); const original = cp.execFile;
      cp.execFile = function(file, ...args) {
        if (file === ${JSON.stringify(command)}) { const callback = args.at(-1); queueMicrotask(() => callback(Object.assign(new Error('Unsupported filesystem metadata'), {code:'ENOTSUP'}))); return {}; }
        return original.call(this, file, ...args);
      };
      require(${JSON.stringify(path.resolve(__dirname, '../copy-engine'))}).runCopy({sourceDirs:[${JSON.stringify(source)}],destDir:${JSON.stringify(destDir)}}).then(report=>console.log(JSON.stringify(report))).catch(error=>{console.error(error);process.exitCode=1;});`;
    const report = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }));
    assert.equal(report.status, 'completed'); assert.equal(report.copied, 1); assert.deepEqual(report.failures, []); assert.ok(report.warnings.length);
    const target = path.join(destDir, 'CARD/camera.unknown');
    assert.equal(await sha256(file), await sha256(target));
    assert.ok(Math.abs((await fs.stat(file)).birthtimeMs - (await fs.stat(target)).birthtimeMs) <= 0.01);
  });
}

for (const action of ['remove', 'truncate', 'same-size-corruption']) {
  test(`final coverage catches ${action} of an earlier copied file and retry touches only that file`, async t => {
    const { source, destDir, target } = await fixture(t);
    for (const name of ['one.MOV', 'two.CR3']) await fs.writeFile(path.join(source, name), 'original camera bytes');
    let first, injected = false;
    const report = await runCopy({ sourceDirs: [source], destDir, onProgress: event => {
      if (event.filesProcessed === 1 && !injected) {
        injected = true; first = event.currentFile;
        const file = path.join(destDir, first);
        if (action === 'remove') sync.unlinkSync(file);
        else sync.writeFileSync(file, action === 'truncate' ? 'x' : 'X'.repeat('original camera bytes'.length));
      }
    } });
    assert.ok(injected); assert.equal(report.status, 'partial'); assert.equal(report.failures.length, 1);
    assert.equal(report.verifiedFiles.length, 1); assert.equal(report.copied, 1);
    const untouched = path.join(destDir, report.verifiedFiles[0].path), before = await fs.stat(untouched);
    const retry = await runCopy({ sourceDirs: [source], destDir, onlyPaths: [first] });
    assert.equal(retry.status, 'completed'); assert.equal(retry.totalFiles, 1); assert.equal(retry.copied, 1);
    assert.equal((await fs.stat(untouched)).ino, before.ino);
    assert.equal(await sha256(path.join(target, path.basename(first))), await sha256(path.join(source, path.basename(first))));
  });
}

test('new source material appearing mid-copy is listed for targeted retry', async t => {
  const { source, destDir } = await fixture(t);
  await fs.writeFile(path.join(source, 'initial.MOV'), 'clip'); let injected = false;
  const report = await runCopy({ sourceDirs: [source], destDir, onProgress: event => {
    if (event.filesProcessed === 1 && !injected) { injected = true; sync.writeFileSync(path.join(source, 'late.NEF'), 'new raw photo'); }
  } });
  assert.equal(report.status, 'partial'); assert.equal(report.totalFiles, 2);
  assert.equal(report.failures[0].path, path.join(source, 'late.NEF'));
  const retry = await runCopy({ sourceDirs: [source], destDir, onlyPaths: ['CARD/late.NEF'] });
  assert.equal(retry.status, 'completed'); assert.equal(retry.copied, 1);
});

test('corrupt temporary data is never reported copied or published as valid', async t => {
  const { source, destDir, target } = await fixture(t);
  await fs.writeFile(path.join(source, 'clip.MP4'), 'original data');
  const open = fs.open; let injected = false;
  fs.open = async (file, flags, ...args) => {
    if (String(file).endsWith('.part') && typeof flags === 'number' && !injected) { injected = true; await fs.writeFile(file, 'corrupt!'); }
    return open(file, flags, ...args);
  };
  try {
    const result = await runCopy({ sourceDirs: [source], destDir });
    assert.ok(injected); assert.equal(result.status, 'partial'); assert.equal(result.copied, 0); assert.equal(result.verifiedFiles.length, 0);
    await assert.rejects(fs.stat(path.join(target, 'clip.MP4')), { code: 'ENOENT' });
  } finally { fs.open = open; }
});
