const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { RETENTION_DAYS, cleanupArtifacts, saveActivityLog } = require('../src/artifact-retention');
const DAY = 86400000;

async function setup(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-retention-test-')));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const userData = path.join(base, 'app-data'), disk = path.join(base, 'mounted-disk');
  await fs.mkdir(userData); await fs.mkdir(disk);
  await fs.mkdir(path.join(userData, 'reports')); await fs.mkdir(path.join(userData, 'logs'));
  return { base, userData, disk, now: Date.now() };
}

async function report(directory, now, age, { type = 'verifica', id = crypto.randomUUID(), ...extra } = {}) {
  const file = path.join(directory, `SecureCopy-${type}-${id}.json`);
  const data = { schema: type === 'verifica' ? 'SecureCopy verification report v1' : 'SecureCopy comparison report v1',
    id, completedAt: new Date(now - age * DAY).toISOString(), ...extra };
  await fs.writeFile(file, JSON.stringify(data));
  await fs.utimes(file, new Date(now - age * DAY), new Date(now - age * DAY));
  return file;
}

test('only recognized report/log artifacts older than 20 days are removed; copied media, versions and referenced paths are untouched', async t => {
  const { userData, disk, now } = await setup(t);
  const media = path.join(disk, 'C3840.MP4'); await fs.writeFile(media, 'copied media');
  const versions = path.join(disk, '.securecopy-versions'); await fs.mkdir(versions);
  const oldVersion = path.join(versions, 'C3840.MP4.previous'); await fs.writeFile(oldVersion, 'previous media');
  const reports = path.join(userData, 'reports');
  const expired = await report(reports, now, 21, { sourceDirs: [disk], destination: disk, files: [{ path: media, previousVersion: oldVersion }] });
  const comparison = await report(reports, now, 22, { type: 'confronto', leftRoot: disk, rightRoot: disk });
  const outsideReport = await report(disk, now, 21);
  const recent = await report(reports, now, 19);
  const log = await saveActivityLog(userData, ['<script>malicious</script>', 'file.MP4']);
  const content = await fs.readFile(log, 'utf8'); assert.ok(content.includes('&lt;script&gt;malicious&lt;/script&gt;'));
  await fs.writeFile(log, content.replace(/createdAt=[^ ]+/, 'createdAt=' + new Date(now - 21 * DAY).toISOString()));
  await fs.utimes(log, new Date(now - 21 * DAY), new Date(now - 21 * DAY));
  assert.equal(RETENTION_DAYS, 20);
  const removed = await cleanupArtifacts(userData, { now });
  assert.deepEqual(new Set(removed), new Set([expired, comparison, log]));
  assert.equal(await fs.readFile(media, 'utf8'), 'copied media');
  assert.equal(await fs.readFile(oldVersion, 'utf8'), 'previous media');
  assert.ok(await fs.stat(outsideReport)); assert.ok(await fs.stat(recent));
});

test('unknown files, invalid dates/schema/IDs, subfolders and recent artifacts with old timestamps are preserved', async t => {
  const { userData, now } = await setup(t); const dir = path.join(userData, 'reports');
  const preserved = [];
  preserved.push(await report(dir, now, 21, { schema: 'customer data' }));
  preserved.push(await report(dir, now, 21, { completedAt: 'not a date' }));
  preserved.push(await report(dir, now, 21, { completedAt: new Date(now - DAY).toISOString() }));
  const updated = await report(dir, now, 21); await fs.utimes(updated, new Date(now), new Date(now)); preserved.push(updated);
  const mismatched = await report(dir, now, 21);
  const data = JSON.parse(await fs.readFile(mismatched, 'utf8')); data.id = crypto.randomUUID();
  await fs.writeFile(mismatched, JSON.stringify(data)); await fs.utimes(mismatched, new Date(now - 21 * DAY), new Date(now - 21 * DAY)); preserved.push(mismatched);
  const media = path.join(dir, 'photo.RAW'); await fs.writeFile(media, 'a media file'); preserved.push(media);
  const pending = path.join(userData, 'pending-queue.json'); await fs.writeFile(pending, '[]'); preserved.push(pending);
  const folder = path.join(dir, 'SecureCopy-verifica-' + crypto.randomUUID() + '.json'); await fs.mkdir(folder); preserved.push(folder);
  preserved.push(await report(folder, now, 21));
  const oldExport = path.join(userData, 'logs', 'SecureCopy_Log_123.html'); await fs.writeFile(oldExport, '<html>old manual export</html>'); preserved.push(oldExport);
  assert.deepEqual(await cleanupArtifacts(userData, { now }), []);
  for (const file of preserved) assert.ok(await fs.lstat(file));
});

test('symlinked report/log files and hard links to files on disks are never deleted', async t => {
  const { userData, disk, now } = await setup(t);
  const original = await report(disk, now, 30);
  const link = path.join(userData, 'reports', path.basename(original)); await fs.symlink(original, link);
  const hardlinked = await report(path.join(userData, 'reports'), now, 30);
  const copied = path.join(disk, 'copied.json'); await fs.link(hardlinked, copied);
  assert.deepEqual(await cleanupArtifacts(userData, { now }), []);
  assert.ok((await fs.lstat(link)).isSymbolicLink()); assert.ok(await fs.stat(hardlinked));
  assert.ok(await fs.stat(original)); assert.ok(await fs.stat(copied));
});

for (const kind of ['reports', 'logs']) {
  test(`a redirected ${kind} folder is refused without touching the destination disk`, async t => {
    const { userData, disk, now } = await setup(t);
    const outside = await report(disk, now, 30);
    await fs.rmdir(path.join(userData, kind)); await fs.symlink(disk, path.join(userData, kind));
    await assert.rejects(cleanupArtifacts(userData, { now }), /non sicura/);
    assert.ok(await fs.stat(outside));
  });
}

test('a redirected app-data root and invalid log input are refused', async t => {
  const { base, userData, disk, now } = await setup(t);
  const link = path.join(base, 'redirect'); await fs.symlink(disk, link);
  await assert.rejects(cleanupArtifacts(link, { now }), /non sicura/);
  await assert.rejects(saveActivityLog(userData, ['okay', {}]), /non valido/);
  assert.deepEqual(await fs.readdir(path.join(userData, 'logs')), []);
});

test('saved log is managed internally and retained before its expiry; cleanup can repeat safely', async t => {
  const { userData, now } = await setup(t);
  const log = await saveActivityLog(userData, ['Copia completata']);
  assert.equal(path.dirname(log), path.join(userData, 'logs'));
  assert.equal((await fs.stat(log)).mode & 0o777, 0o600);
  assert.deepEqual(await cleanupArtifacts(userData, { now }), []);
  assert.deepEqual(await cleanupArtifacts(userData, { now }), []);
  assert.ok(await fs.stat(log));
});
