const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const {
  detectCaseCollisions,
  resolveExistingVolumePath,
  runCopy,
  sha256
} = require('../src/copy-engine');

test('detectCaseCollisions separates colliding filenames into subfolders without modifying the filenames', () => {
  const mockPlan = [
    { source: { name: 'Card' }, relative: 'DCIM/100MSDCF/CLIP001.MP4' },
    { source: { name: 'Card' }, relative: 'DCIM/100MSDCF/clip001.mp4' },
    { source: { name: 'Card' }, relative: 'DCIM/100MSDCF/PHOTO.JPG' }
  ];

  const map = detectCaseCollisions(mockPlan, false);

  // Filenames must stay 100% identical
  assert.equal(path.basename(map.get(mockPlan[0])), 'CLIP001.MP4');
  assert.equal(path.basename(map.get(mockPlan[1])), 'clip001.mp4');

  // Subfolders must separate the colliding variants
  assert.equal(map.get(mockPlan[0]), path.join('Card', 'DCIM', '100MSDCF', 'File Maiuscoli', 'CLIP001.MP4'));
  assert.equal(map.get(mockPlan[1]), path.join('Card', 'DCIM', '100MSDCF', 'File Minuscoli', 'clip001.mp4'));

  // Non-colliding files are untouched
  assert.equal(map.has(mockPlan[2]), false);
});

test('resolveExistingVolumePath returns valid target path when accessible', async () => {
  const currentDir = path.resolve('.');
  const resolved = await resolveExistingVolumePath(currentDir);
  assert.equal(resolved, currentDir);
});

test('resolveExistingVolumePath gracefully returns original path when outside /Volumes', async () => {
  const fakePath = '/tmp/non-existent-directory-12345';
  const resolved = await resolveExistingVolumePath(fakePath);
  assert.equal(resolved, fakePath);
});

test('runCopy with simulated casing collision preserves both files in separate folders with exact names and hashes', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sc-case-run-')));
  try {
    const src1 = path.join(root, 'source_upper');
    const src2 = path.join(root, 'source_lower');
    const dst = path.join(root, 'destination');

    await fs.mkdir(src1, { recursive: true });
    await fs.mkdir(src2, { recursive: true });

    const upperData = Buffer.from('UPPERCASE VIDEO DATA 4K PRORES');
    const lowerData = Buffer.from('lowercase proxy video data 720p');

    // Create upper in src1 and lower in src2 (since local filesystem may be case-insensitive)
    await fs.writeFile(path.join(src1, 'CLIP001.MP4'), upperData);
    await fs.writeFile(path.join(src2, 'clip001.mp4'), lowerData);

    const report1 = await runCopy({ sourceDirs: [src1], destDir: dst });
    const report2 = await runCopy({ sourceDirs: [src2], destDir: dst });

    assert.equal(report1.status, 'completed');
    assert.equal(report2.status, 'completed');

    const upperDst = path.join(dst, path.basename(src1), 'CLIP001.MP4');
    const lowerDst = path.join(dst, path.basename(src2), 'clip001.mp4');

    assert.equal(await sha256(upperDst), crypto.createHash('sha256').update(upperData).digest('hex'));
    assert.equal(await sha256(lowerDst), crypto.createHash('sha256').update(lowerData).digest('hex'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
