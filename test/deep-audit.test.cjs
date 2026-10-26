const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const sync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCopy, readResourceFork, sha256 } = require('../src/copy-engine');
const { compareFolders, reconcileFolders } = require('../src/compare-engine');

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-deep-audit-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'CARD'), destDir = path.join(root, 'backup');
  await fs.mkdir(source); await fs.mkdir(destDir);
  return { root, source, destDir, target: path.join(destDir, 'CARD') };
}

for (const fallback of [false, true]) {
  test(`resource-fork payload is preserved and verified with fallback=${fallback}`, { skip: process.platform !== 'darwin' }, async t => {
    const { source, destDir, target } = await fixture(t);
    const file = path.join(source, 'archive.media');
    await fs.writeFile(file, 'data fork'); await fs.writeFile(`${file}/..namedfork/rsrc`, 'essential image payload');
    const link = fs.link;
    if (fallback) fs.link = async () => { throw Object.assign(new Error('No hard links'), { code: 'ENOTSUP' }); };
    let report;
    try { report = await runCopy({ sourceDirs: [source], destDir }); }
    finally { fs.link = link; }
    assert.equal(report.status, 'completed'); assert.deepEqual(report.failures, []);
    assert.equal(await fs.readFile(`${path.join(target, 'archive.media')}/..namedfork/rsrc`, 'utf8'), 'essential image payload');
    assert.deepEqual(report.verifiedFiles[0].resourceFork, await readResourceFork(file));
    const second = await runCopy({ sourceDirs: [source], destDir }); assert.equal(second.skipped, 1);
  });
}

test('different resource-fork bytes cannot be skipped as identical', { skip: process.platform !== 'darwin' }, async t => {
  const { source, destDir, target } = await fixture(t);
  const file = path.join(source, 'photo.unknown'); await fs.writeFile(file, 'same data');
  await fs.writeFile(`${file}/..namedfork/rsrc`, 'original resource');
  await runCopy({ sourceDirs: [source], destDir });
  const destination = path.join(target, 'photo.unknown'); await fs.writeFile(`${destination}/..namedfork/rsrc`, 'corrupted payload');
  assert.equal(await sha256(file), await sha256(destination));
  const result = await runCopy({ sourceDirs: [source], destDir });
  assert.equal(result.status, 'completed'); assert.equal(result.copied, 1); assert.equal(result.skipped, 0);
  assert.deepEqual(await readResourceFork(file), await readResourceFork(destination));
  assert.ok(result.verifiedFiles[0].previousVersion);
});

for (const from of ['left', 'right']) for (const mutation of ['remove', 'same-size-corruption']) {
  test(`comparison ${from}: final verification catches ${mutation} of an earlier copied file`, async t => {
    const { source: left, destDir: right } = await fixture(t);
    const source = from === 'left' ? left : right, target = from === 'left' ? right : left;
    for (const name of ['one.MOV', 'two.CR3']) await fs.writeFile(path.join(source, name), 'camera data');
    const session = await compareFolders(left, right);
    let first;
    const events = [];
    const result = await reconcileFolders(session, [], { onProgress: event => {
      events.push(event);
      if (!first && event.phase === 'reconcile' && event.count === 1) {
        first = event.current;
        if (mutation === 'remove') sync.unlinkSync(path.join(target, first));
        else sync.writeFileSync(path.join(target, first), 'XXXXXXXXXXX');
      }
    } });
    assert.equal(result.status, 'partial'); assert.ok(result.failures.some(item => item.path === first));
    assert.equal(result.copied.length, 1);
    const entry = result.comparison.entries.find(entry => entry.relative === first);
    assert.equal(entry.verified, false);
    if (mutation === 'remove') assert.equal(from === 'left' ? entry.rightExists : entry.leftExists, false);
    assert.ok(events.some(event => event.current === first && event.outcome === 'failed'));
    const retry = await reconcileFolders(result.comparison, [{ relative: first, keep: from }], { selectedOnly: true });
    assert.equal(retry.status, 'completed'); assert.equal(retry.copied.length, 1);
    assert.equal(await sha256(path.join(source, first)), await sha256(path.join(target, first)));
  });
}

test('a failed resource-fork publication preserves the old destination', { skip: process.platform !== 'darwin' }, async t => {
  const { source, destDir, target } = await fixture(t);
  const file = path.join(source, 'frame.PICT'); await fs.writeFile(file, 'new'); await fs.writeFile(`${file}/..namedfork/rsrc`, 'new image');
  await fs.mkdir(target); const destination = path.join(target, 'frame.PICT'); await fs.writeFile(destination, 'old');
  const link = fs.link, open = sync.createWriteStream;
  fs.link = async () => { throw Object.assign(new Error('No hard links'), { code: 'ENOTSUP' }); };
  sync.createWriteStream = (file, ...args) => {
    if (String(file) === `${destination}/..namedfork/rsrc`) throw new Error('Resource fork refused');
    return open(file, ...args);
  };
  try {
    const result = await runCopy({ sourceDirs: [source], destDir });
    assert.equal(result.status, 'partial'); assert.equal(result.copied, 0);
    assert.equal(await fs.readFile(destination, 'utf8'), 'old');
    assert.ok(result.failures[0].previousVersion); assert.ok(result.failures[0].incompletePath);
  } finally { fs.link = link; sync.createWriteStream = open; }
});

test('an empty directory removed during reconciliation is reported missing again', async t => {
  const { source, destDir } = await fixture(t);
  await fs.mkdir(path.join(source, 'empty'));
  const session = await compareFolders(source, destDir);
  const result = await reconcileFolders(session, [], { onProgress: event => {
    if (event.phase === 'reconcile' && event.outcome === 'created') sync.rmdirSync(path.join(destDir, 'empty'));
  } });
  assert.equal(result.status, 'partial'); assert.equal(result.failures[0].path, 'empty');
  assert.equal(result.comparison.entries[0].rightExists, false);
});
