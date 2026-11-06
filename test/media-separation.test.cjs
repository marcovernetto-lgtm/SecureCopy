const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { runCopy, categorizeMediaFile } = require('../src/copy-engine');

test('categorizeMediaFile properly identifies Video, Foto RAW, and Foto JPEG', () => {
  assert.equal(categorizeMediaFile('clip.mov'), 'Video');
  assert.equal(categorizeMediaFile('A001_C001.braw'), 'Video');
  assert.equal(categorizeMediaFile('shot.mp4'), 'Video');
  assert.equal(categorizeMediaFile('footage.r3d'), 'Video');

  assert.equal(categorizeMediaFile('photo.cr3'), 'Foto RAW');
  assert.equal(categorizeMediaFile('DSC0001.arw'), 'Foto RAW');
  assert.equal(categorizeMediaFile('_DSC1234.nef'), 'Foto RAW');
  assert.equal(categorizeMediaFile('image.dng'), 'Foto RAW');

  assert.equal(categorizeMediaFile('photo.jpg'), 'Foto JPEG');
  assert.equal(categorizeMediaFile('image.jpeg'), 'Foto JPEG');
  assert.equal(categorizeMediaFile('capture.heic'), 'Foto JPEG');
  assert.equal(categorizeMediaFile('render.png'), 'Foto JPEG');
});

test('categorizeMediaFile maps sidecars (.xmp, .thm, .lrf) to proper category', () => {
  const files = [
    { path: '/card/DCIM/DSC0001.arw' },
    { path: '/card/DCIM/DSC0001.xmp' },
    { path: '/card/CLIP/C0001.mp4' },
    { path: '/card/CLIP/C0001.thm' }
  ];
  assert.equal(categorizeMediaFile('/card/DCIM/DSC0001.xmp', files), 'Foto RAW');
  assert.equal(categorizeMediaFile('/card/CLIP/C0001.thm', files), 'Video');
});

test('runCopy with mediaSeparation: true separates Video, Foto RAW and Foto JPEG into 3 folders', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sc-media-sep-')));
  const source = path.join(root, 'CAMERA_CARD');
  const dcim = path.join(source, 'DCIM', '100CANON');
  const clips = path.join(source, 'PRIVATE', 'M4ROOT', 'CLIP');
  await fs.mkdir(dcim, { recursive: true });
  await fs.mkdir(clips, { recursive: true });

  const rawFile = path.join(dcim, 'IMG_0001.CR3');
  const jpgFile = path.join(dcim, 'IMG_0001.JPG');
  const xmpFile = path.join(dcim, 'IMG_0001.XMP');
  const movFile = path.join(clips, 'C0001.MOV');

  await fs.writeFile(rawFile, 'raw content');
  await fs.writeFile(jpgFile, 'jpg content');
  await fs.writeFile(xmpFile, 'xmp metadata');
  await fs.writeFile(movFile, 'video stream');

  const destination = path.join(root, 'BACKUP');
  await fs.mkdir(destination, { recursive: true });

  const report = await runCopy({
    sourceDirs: [source],
    destDir: destination,
    mediaSeparation: true
  });

  assert.equal(report.status, 'completed');
  assert.equal(report.copied, 4);

  // Check destination folders
  const videoDest = path.join(destination, 'CAMERA_CARD', 'Video', 'C0001.MOV');
  const rawDest = path.join(destination, 'CAMERA_CARD', 'Foto RAW', 'IMG_0001.CR3');
  const xmpDest = path.join(destination, 'CAMERA_CARD', 'Foto RAW', 'IMG_0001.XMP');
  const jpgDest = path.join(destination, 'CAMERA_CARD', 'Foto JPEG', 'IMG_0001.JPG');

  assert.equal(await fs.readFile(videoDest, 'utf8'), 'video stream');
  assert.equal(await fs.readFile(rawDest, 'utf8'), 'raw content');
  assert.equal(await fs.readFile(xmpDest, 'utf8'), 'xmp metadata');
  assert.equal(await fs.readFile(jpgDest, 'utf8'), 'jpg content');
});

test('runCopy with mediaSeparation: false preserves original hierarchy', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sc-media-sep-off-')));
  const source = path.join(root, 'CAMERA_CARD');
  const dcim = path.join(source, 'DCIM', '100CANON');
  await fs.mkdir(dcim, { recursive: true });

  const rawFile = path.join(dcim, 'IMG_0001.CR3');
  await fs.writeFile(rawFile, 'raw content');

  const destination = path.join(root, 'BACKUP');
  await fs.mkdir(destination, { recursive: true });

  const report = await runCopy({
    sourceDirs: [source],
    destDir: destination,
    mediaSeparation: false
  });

  assert.equal(report.status, 'completed');
  const expectedDest = path.join(destination, 'CAMERA_CARD', 'DCIM', '100CANON', 'IMG_0001.CR3');
  assert.equal(await fs.readFile(expectedDest, 'utf8'), 'raw content');
});

test('media separation keeps user folders that start with digits and drops DCF camera folders', async () => {
  const { resolveDestinationRelative } = require('../src/copy-engine');
  const source = { name: 'CARD', root: '/card' };
  const item = relative => ({ source, path: path.join('/card', relative), relative });
  const files = [item('2024_Matrimonio/IMG_1.JPG'), item('001_Intervista/A.MOV'), item('DCIM/100CANON/IMG_2.CR3')];
  assert.equal(resolveDestinationRelative(files[0], files, true), path.join('CARD', 'Foto JPEG', '2024_Matrimonio', 'IMG_1.JPG'));
  assert.equal(resolveDestinationRelative(files[1], files, true), path.join('CARD', 'Video', '001_Intervista', 'A.MOV'));
  assert.equal(resolveDestinationRelative(files[2], files, true), path.join('CARD', 'Foto RAW', 'IMG_2.CR3'));
});

test('XMP sidecars match only their own media file', () => {
  const files = [{ path: '/card/C0001.xmp' }, { path: '/card/C00010.MP4' }, { path: '/card/X.CR3.xmp' }, { path: '/card/X.CR3' },
    { path: '/card/P1.JPG' }, { path: '/card/P1.xmp' }, { path: '/other/C0001.MP4' }];
  assert.equal(categorizeMediaFile('/card/C0001.xmp', files), 'Foto RAW', 'no prefix match with C00010.MP4, no cross-folder match');
  assert.equal(categorizeMediaFile('/card/X.CR3.xmp', files), 'Foto RAW');
  assert.equal(categorizeMediaFile('/card/P1.xmp', files), 'Foto JPEG');
});

test('media destination planning stays linear on large cards', () => {
  const { resolveDestinationRelative, detectCaseCollisions } = require('../src/copy-engine');
  const source = { name: 'CARD', root: '/card' };
  const files = [];
  for (let i = 0; i < 30000; i++) {
    const relative = path.join('DCIM', `${100 + (i % 9)}CANON`, `IMG_${i}.${i % 3 ? 'CR3' : 'XMP'}`);
    files.push({ source, path: path.join('/card', relative), relative });
  }
  const started = Date.now();
  const collisions = detectCaseCollisions(files, true);
  for (const file of files) resolveDestinationRelative(file, files, true, collisions);
  assert.ok(Date.now() - started < 3000, `planning took ${Date.now() - started} ms`);
});
