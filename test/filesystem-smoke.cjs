// Requires only the two disposable images created by the audit, never /Volumes.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { runCopy, sha256, readResourceFork } = require('../copy-engine');
const { setCreationTime } = require('../mac-metadata');
const { compareFolders, reconcileFolders } = require('../compare-engine');

(async () => {
  const caseRoot = path.join((await fs.readFile('/tmp/securecopy-case-audit-location.txt', 'utf8')).trim(), 'mount');
  const exfatRoot = path.join((await fs.readFile('/tmp/securecopy-exfat-audit-location.txt', 'utf8')).trim(), 'mount');
  assert.ok(caseRoot.includes('securecopy-case-audit-') && exfatRoot.includes('securecopy-exfat-audit-'));
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-filesystem-suite-')));
  const sourceCase = await fs.mkdtemp(path.join(caseRoot, 'audit-source-'));
  const targetCase = await fs.mkdtemp(path.join(caseRoot, 'audit-target-'));
  const targetExfat = await fs.mkdtemp(path.join(exfatRoot, 'audit-target-'));
  const folderSource = await fs.mkdtemp(path.join(caseRoot, 'audit-folders-'));
  try {
    for (const [name, data] of [['Clip.MOV', 'AAAA'], ['clip.MOV', 'BBBB']]) await fs.writeFile(path.join(sourceCase, name), data);
    assert.equal((await fs.readdir(sourceCase)).length, 2);
    const insensitive = path.join(root, 'insensitive');
    const collision = await runCopy({ sourceDirs: [sourceCase], destDir: insensitive });
    assert.equal(collision.status, 'partial'); assert.equal(collision.copied, 1); assert.match(collision.failures[0].reason, /Conflitto di nomi/);
    const preserved = await fs.readdir(path.join(insensitive, path.basename(sourceCase))); assert.equal(preserved.length, 1);
    assert.equal(await fs.readFile(path.join(insensitive, path.basename(sourceCase), preserved[0]), 'utf8'), await fs.readFile(path.join(sourceCase, preserved[0]), 'utf8'));
    const sensitive = await runCopy({ sourceDirs: [sourceCase], destDir: targetCase });
    assert.equal(sensitive.status, 'completed'); assert.equal(sensitive.copied, 2);
    for (const name of ['Clip.MOV', 'clip.MOV']) assert.equal(await sha256(path.join(sourceCase, name)), await sha256(path.join(targetCase, path.basename(sourceCase), name)));
    for (const folder of ['Folder', 'folder']) {
      await fs.mkdir(path.join(folderSource, folder)); await fs.writeFile(path.join(folderSource, folder, `${folder}.MOV`), folder);
    }
    const folderTarget = path.join(root, 'folder-copy');
    const folderCopy = await runCopy({ sourceDirs: [folderSource], destDir: folderTarget });
    assert.equal(folderCopy.status, 'partial'); assert.equal(folderCopy.copied, 1);
    const names = await fs.readdir(path.join(folderTarget, path.basename(folderSource)));
    assert.equal(names.length, 1); assert.equal((await fs.readdir(path.join(folderTarget, path.basename(folderSource), names[0]))).length, 1);
    const comparisonTarget = path.join(root, 'folder-comparison'); await fs.mkdir(comparisonTarget);
    const session = await compareFolders(folderSource, comparisonTarget);
    const reconciled = await reconcileFolders(session, []);
    assert.equal(reconciled.status, 'partial'); assert.equal(reconciled.copied.length, 1);

    const media = path.join(root, 'CARD'); await fs.mkdir(media);
    const birth = Date.parse('2026-09-18T13:39:47.000Z');
    for (const name of ['clip.BRAW', 'photo.CR3', 'empty.XMP']) {
      const file = path.join(media, name); await fs.writeFile(file, Buffer.alloc(name.startsWith('empty') ? 0 : 1024 * 1024, 23));
      await fs.utimes(file, new Date('2026-09-01'), new Date('2026-09-01')); await setCreationTime(file, birth);
    }
    const exfat = await runCopy({ sourceDirs: [media], destDir: targetExfat });
    assert.equal(exfat.status, 'completed', JSON.stringify(exfat.failures)); assert.equal(exfat.copied, 3);
    for (const name of await fs.readdir(media)) {
      const target = path.join(targetExfat, 'CARD', name);
      assert.equal(await sha256(path.join(media, name)), await sha256(target)); assert.equal((await fs.stat(target)).birthtimeMs, birth);
    }
    const second = await runCopy({ sourceDirs: [media], destDir: targetExfat });
    assert.equal(second.status, 'completed'); assert.equal(second.skipped, 3); assert.equal(second.copied, 0);
    const restored = await runCopy({ sourceDirs: [path.join(targetExfat, 'CARD')], destDir: path.join(root, 'return-from-exfat') });
    assert.equal(restored.status, 'completed'); assert.equal(restored.copied, 3);
    const replaceSource = path.join(media, 'clip.BRAW'), replaceTarget = path.join(targetExfat, 'CARD/clip.BRAW');
    const oldHash = await sha256(replaceTarget);
    await fs.writeFile(replaceSource, 'new verified BRAW payload');
    const replaced = await runCopy({ sourceDirs: [media], destDir: targetExfat, onlyPaths: ['CARD/clip.BRAW'] });
    assert.equal(replaced.status, 'completed'); assert.equal(replaced.copied, 1);
    assert.equal(await sha256(replaced.verifiedFiles[0].previousVersion), oldHash);
    const preservedHash = await sha256(replaceTarget);
    await fs.writeFile(replaceSource, 'another BRAW payload that must not lose the previous version');
    const canonicalReplaceTarget = await fs.realpath(replaceTarget);
    const originalOpen = fs.open; let injected = false;
    fs.open = async (file, flags, ...args) => {
      const handle = await originalOpen(file, flags, ...args);
      if (file === canonicalReplaceTarget && flags === 'wx' && !injected) {
        injected = true; const write = handle.write.bind(handle);
        handle.write = async (bytes, offset) => { await write(bytes, offset, 2); throw Object.assign(new Error('Injected full disk'), { code: 'ENOSPC' }); };
      }
      return handle;
    };
    let failed;
    try { failed = await runCopy({ sourceDirs: [media], destDir: targetExfat, onlyPaths: ['CARD/clip.BRAW'] }); }
    finally { fs.open = originalOpen; }
    assert.ok(injected); assert.equal(failed.status, 'partial'); assert.equal(await sha256(replaceTarget), preservedHash);
    assert.ok(failed.failures[0].incompletePath); assert.ok(failed.failures[0].previousVersion);

    const original = path.join(media, 'resource.PICT'); await fs.writeFile(original, 'picture'); await fs.writeFile(`${original}/..namedfork/rsrc`, 'resource bytes'); await setCreationTime(original, birth);
    const fork = await runCopy({ sourceDirs: [media], destDir: targetExfat, onlyPaths: ['CARD/resource.PICT'] });
    assert.equal(fork.status, 'partial');
    assert.equal(fork.copied, 0); assert.ok(fork.failures.length);
    assert.ok((await readResourceFork(original)).bytes > 0);
    await assert.rejects(fs.stat(path.join(targetExfat, 'CARD/resource.PICT')), { code: 'ENOENT' });

    const precise = path.join(media, 'fractional.MOV'); await fs.writeFile(precise, 'fractional birth'); await setCreationTime(precise, birth + 123);
    const rounded = await runCopy({ sourceDirs: [media], destDir: targetExfat, onlyPaths: ['CARD/fractional.MOV'] });
    assert.equal(rounded.status, 'partial'); assert.equal(rounded.copied, 1); assert.equal(rounded.failures[0].metadataOnly, true);
    assert.equal(await sha256(precise), await sha256(path.join(targetExfat, 'CARD/fractional.MOV')));
    console.log(JSON.stringify({ caseCollisionProtected: true, distinctCaseSensitiveFilesCopied: true, exfatNonemptyAndEmptyFiles: true, exfatCreationSecondsPreserved: true, exfatIdenticalSkipped: true, exfatToApfs: true, unsupportedExfatResourceForkNotDeclaredValid: true, unrepresentableCreationDateReportedWithoutDeletingContent: true }));
  } finally {
    for (const own of [root, sourceCase, targetCase, targetExfat, folderSource]) await fs.rm(own, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
