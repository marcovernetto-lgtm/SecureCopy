const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const {
  formatBytes,
  formatTimestamp,
  friendlyCodec,
  probeMediaFile,
  generateDITReportHTML
} = require('../dit-report');

test('formatBytes handles small, large, and zero byte values accurately', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(-10), '0 B');
  assert.equal(formatBytes(500), '500.00 B');
  assert.equal(formatBytes(1500), '1.50 KB');
  assert.equal(formatBytes(1000 * 1000 * 25), '25.00 MB');
  const large = formatBytes(100174978504);
  assert.ok(large.includes('GB'));
  assert.ok(large.includes('GiB'));
});

test('formatTimestamp formats dates consistently', () => {
  assert.equal(formatTimestamp(null), '—');
  assert.equal(formatTimestamp(''), '—');
  const formatted = formatTimestamp('2026-10-12T05:03:44.000Z');
  assert.match(formatted, /^2026-10-12 \d{2}:03:44$/);
});

test('friendlyCodec maps camera and broadcast codecs to professional labels', () => {
  assert.equal(friendlyCodec('brlt'), 'Blackmagic RAW (brlt)');
  assert.equal(friendlyCodec('apch'), 'Apple ProRes 422 HQ (apch)');
  assert.equal(friendlyCodec('ap4h'), 'Apple ProRes 4444 (ap4h)');
  assert.equal(friendlyCodec('r3d'), 'REDCODE RAW (R3D)');
  assert.equal(friendlyCodec('h264'), 'H.264 / AVC');
  assert.equal(friendlyCodec('custom_codec', 'Custom Name'), 'Custom Name');
});

test('probeMediaFile gracefully handles non-existent or text files', async () => {
  const tmpFile = path.join(os.tmpdir(), `test-probe-${Date.now()}.txt`);
  await fs.writeFile(tmpFile, 'not a video file');
  try {
    const info = await probeMediaFile(tmpFile);
    assert.ok(info);
    assert.equal(info.fps, '—');
    assert.equal(info.resolution, '—');
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
});

test('generateDITReportHTML produces dark-themed DIT report without purple', () => {
  const reportData = {
    id: 'test-dit-report-id',
    startedAt: '2026-10-25T22:28:41.953Z',
    completedAt: '2026-10-26T01:04:59.465Z',
    sourceDirs: ['/Volumes/CARD_A01'],
    destination: '/Volumes/BACKUP_RAID/SHOOT_DAY_1',
    summary: { totalFiles: 1 },
    files: [
      {
        path: 'A001_C001.mov',
        bytes: 1024 * 1024 * 500,
        createdAt: '2026-10-25T22:20:00.000Z',
        modifiedAt: '2026-10-25T22:20:00.000Z',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      }
    ]
  };

  const probed = [
    {
      resolution: '3840 × 2160 (4K UHD)',
      codec: 'Apple ProRes 422 HQ (apch)',
      fps: '25.00 fps',
      duration: '5m 12s · 7,800 frame',
      timecode: '01:00:00:00',
      camera: 'ARRI ALEXA Mini LF',
      reel: 'A001',
      scene: '12',
      take: '3',
      lens: 'Cooke S4/i 35mm',
      audio: 'PCM 24-bit 48.0 kHz (2 ch)'
    }
  ];

  const html = generateDITReportHTML(reportData, probed);
  assert.ok(html.includes('SECURECOPY'));
  assert.ok(html.includes('DIT CHECKSUM & MEDIA MANIFEST'));
  assert.ok(html.includes('A001_C001.mov'));
  assert.ok(html.includes('ARRI ALEXA Mini LF'));
  assert.ok(html.includes('Cooke S4/i 35mm'));
  assert.equal(html.includes('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'), false); // Removed hash code per user request
  assert.equal(html.includes('Slate DIT'), false); // Removed Slate DIT per user request
  assert.equal(html.includes('Algoritmo'), false); // Removed Algoritmo per user request
  assert.ok(html.includes('✓ Verificato'));
  assert.ok(html.includes('PAGINA 1 DI 1'));
  assert.ok(html.includes('#0c1519')); // Dark background

  // Strict user rule: NO PURPLE!
  assert.equal(html.toLowerCase().includes('purple'), false);
  assert.equal(html.toLowerCase().includes('#800080'), false);
  assert.equal(html.toLowerCase().includes('violet'), false);

  // Minimalist, anti-AI-slop design checks
  assert.equal(html.includes('file-index'), false);
  assert.equal(html.includes('#001'), false);
  assert.equal(html.includes('INTEGRITÀ BIT-PER-BIT CERTIFICATA'), false);
  assert.equal(html.includes('linear-gradient'), false);
  assert.ok(html.includes('margin: 0;'));
  assert.ok(html.includes('v-mark'));
});

test('generateDITReportHTML filters non-media files and paginates multi-page reports cleanly', () => {
  const dummyFiles = [];
  const dummyProbed = [];
  for (let i = 1; i <= 10; i++) {
    const num = String(i).padStart(3, '0');
    dummyFiles.push({
      path: `A001_C${num}_0824_001.mov`,
      bytes: 1024 * 1024 * 1024 * i,
      createdAt: '2026-10-26T10:00:00.000Z',
      modifiedAt: '2026-10-26T10:00:00.000Z',
      sha256: 'deadbeef'
    });
    dummyProbed.push({
      resolution: '4K',
      codec: 'ProRes 4444',
      fps: '25 fps'
    });
  }

  // Include non-media XML and THM sidecars
  dummyFiles.push({ path: 'clip_metadata.xml', bytes: 2048 });
  dummyProbed.push({});
  dummyFiles.push({ path: 'clip_preview.thm', bytes: 8192 });
  dummyProbed.push({});

  const reportData = {
    id: 'test-multipage',
    startedAt: '2026-10-26T10:00:00.000Z',
    completedAt: '2026-10-26T10:15:00.000Z',
    sourceDirs: ['/Volumes/CARD'],
    destination: '/Volumes/RAID',
    files: dummyFiles
  };

  const html = generateDITReportHTML(reportData, dummyProbed);

  // Must filter out non-media files
  assert.equal(html.includes('clip_metadata.xml'), false);
  assert.equal(html.includes('clip_preview.thm'), false);
  assert.ok(html.includes('File Trasferiti</span>\n              <div class="stat-val">10</div>'));

  // Multi-page checks: should have page 1 and page 2
  assert.ok(html.includes('PAGINA 1 DI 2'));
  assert.ok(html.includes('PAGINA 2 DI 2'));
  assert.ok(html.includes('subsequent-header'));
});
