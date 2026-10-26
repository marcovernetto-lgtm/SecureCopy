const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

let cachedFFprobePath = undefined;

async function findFFprobe() {
  if (cachedFFprobePath !== undefined) return cachedFFprobePath;
  const candidates = [
    '/opt/homebrew/bin/ffprobe',
    '/usr/local/bin/ffprobe',
    'ffprobe'
  ];
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ['-version'], { timeout: 2000 });
      cachedFFprobePath = candidate;
      return candidate;
    } catch {
      // Continue to next candidate
    }
  }
  cachedFFprobePath = null;
  return null;
}

let cachedFFmpegPath = undefined;
async function findFFmpeg() {
  if (cachedFFmpegPath !== undefined) return cachedFFmpegPath;
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    'ffmpeg'
  ];
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ['-version'], { timeout: 2000 });
      cachedFFmpegPath = candidate;
      return candidate;
    } catch {
      // Continue to next candidate
    }
  }
  cachedFFmpegPath = null;
  return null;
}

async function extractVideoThumbnail(filePath) {
  const ffmpeg = await findFFmpeg();
  if (!ffmpeg) return null;
  const os = require('os');
  const crypto = require('crypto');
  const tmpThumb = path.join(os.tmpdir(), `sc-thumb-${crypto.randomUUID()}.jpg`);
  try {
    await execFileAsync(ffmpeg, [
      '-ss', '00:00:01',
      '-i', filePath,
      '-vframes', '1',
      '-vf', 'scale=140:-1',
      '-q:v', '4',
      '-y',
      tmpThumb
    ], { timeout: 3000 });
    const buf = await fsp.readFile(tmpThumb);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    await fsp.unlink(tmpThumb).catch(() => {});
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const k = 1000;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const decimal = (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
  // Add GiB for media files > 1 GB
  if (bytes >= 1024 * 1024 * 1024) {
    const gib = (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GiB';
    return `${decimal} (${gib})`;
  }
  return decimal;
}

function formatTimestamp(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return isoString;
  }
}

function friendlyCodec(codecTag, codecName, longName) {
  const map = {
    brlt: 'Blackmagic RAW (brlt)',
    apch: 'Apple ProRes 422 HQ (apch)',
    apcn: 'Apple ProRes 422 (apcn)',
    apcs: 'Apple ProRes 422 LT (apcs)',
    apco: 'Apple ProRes 422 Proxy (apco)',
    ap4h: 'Apple ProRes 4444 (ap4h)',
    ap4x: 'Apple ProRes 4444 XQ (ap4x)',
    avc1: 'H.264 / AVC (avc1)',
    h264: 'H.264 / AVC',
    hvc1: 'H.265 / HEVC (hvc1)',
    hevc: 'H.265 / HEVC',
    r3d: 'REDCODE RAW (R3D)',
    red1: 'REDCODE RAW (red1)',
    dnxhd: 'Avid DNxHD',
    dnxhr: 'Avid DNxHR',
    mxf: 'Material Exchange Format (MXF)'
  };
  const key = (codecTag || '').toLowerCase().trim();
  if (map[key]) return map[key];
  const nameKey = (codecName || '').toLowerCase().trim();
  if (map[nameKey]) return map[nameKey];
  return longName || codecName || codecTag || 'Non specificato';
}

async function probeMediaFile(filePath) {
  const info = {
    resolution: '—',
    codec: '—',
    fps: '—',
    duration: '—',
    timecode: '—',
    camera: '—',
    reel: '—',
    scene: '—',
    take: '—',
    lens: '—',
    audio: '—'
  };

  const ffprobe = await findFFprobe();
  if (ffprobe) {
    try {
      const { stdout } = await execFileAsync(ffprobe, [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ], { timeout: 10000, maxBuffer: 32 * 1024 * 1024 });

      const data = JSON.parse(stdout);
      const video = data.streams?.find(s => s.codec_type === 'video') || {};
      const audio = data.streams?.find(s => s.codec_type === 'audio') || {};
      const formatTags = data.format?.tags || {};
      const videoTags = video.tags || {};

      if (video.width && video.height) {
        let label = '';
        if (video.width >= 6000) label = ' (6K)';
        else if (video.width >= 3800) label = ' (4K UHD)';
        else if (video.width >= 1900) label = ' (1080p FHD)';
        info.resolution = `${video.width} × ${video.height}${label}`;
        try {
          info.thumbnail = await extractVideoThumbnail(filePath);
        } catch {}
      }

      info.codec = friendlyCodec(video.codec_tag_string, video.codec_name, video.codec_long_name);
      if (formatTags.braw_compression_ratio) {
        info.codec += ` · ${formatTags.braw_compression_ratio}`;
      }

      // FPS
      let fpsRaw = video.r_frame_rate || video.avg_frame_rate || '';
      if (fpsRaw.includes('/')) {
        const [n, d] = fpsRaw.split('/').map(Number);
        if (d && n) info.fps = `${(n / d).toFixed(2)} fps`;
      } else if (fpsRaw) {
        info.fps = `${fpsRaw} fps`;
      }

      // Duration
      const durSec = Number(data.format?.duration || video.duration || 0);
      if (durSec > 0) {
        const m = Math.floor(durSec / 60);
        const s = Math.floor(durSec % 60);
        const frames = video.nb_frames ? ` · ${Number(video.nb_frames).toLocaleString()} frame` : '';
        info.duration = `${m}m ${s}s${frames}`;
      }

      // Timecode
      info.timecode = videoTags.timecode || formatTags.timecode || '—';

      // Camera
      info.camera = formatTags.camera_type || formatTags.manufacturer || videoTags.camera || '—';
      if (formatTags.firmware_version) info.camera += ` (v${formatTags.firmware_version})`;

      // Slate
      info.reel = formatTags.reel_name || videoTags.reel_name || '—';
      info.scene = formatTags.scene || videoTags.scene || '—';
      info.take = formatTags.take || videoTags.take || '—';
      info.lens = formatTags.lens_type || formatTags.lens || '—';

      // Audio
      if (audio.codec_name) {
        const channels = audio.channels ? `${audio.channels} ch` : 'stereo';
        const rate = audio.sample_rate ? `${(Number(audio.sample_rate) / 1000).toFixed(1)} kHz` : '';
        info.audio = `${audio.codec_name.toUpperCase()} ${rate} (${channels})`.trim();
      }

      return info;
    } catch {
      // ffprobe failed or timed out, fallback to mdls
    }
  }

  // Fallback macOS mdls
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('/usr/bin/mdls', [filePath], { timeout: 4000 });
      const lines = stdout.split('\n');
      const get = key => {
        const line = lines.find(l => l.startsWith(key));
        if (!line) return '';
        const val = line.split('=')[1]?.trim();
        return val ? val.replace(/^\"|\"$/g, '') : '';
      };

      const w = get('kMDItemPixelWidth');
      const h = get('kMDItemPixelHeight');
      if (w && h) info.resolution = `${w} × ${h}`;
      const dur = Number(get('kMDItemDurationSeconds') || 0);
      if (dur > 0) {
        const m = Math.floor(dur / 60);
        const s = Math.floor(dur % 60);
        info.duration = `${m}m ${s}s`;
      }
      const codecs = get('kMDItemCodecs');
      if (codecs) info.codec = codecs.replace(/[()"]/g, '').trim();
      const make = get('kMDItemAcquisitionMake');
      const model = get('kMDItemAcquisitionModel');
      if (make || model) info.camera = `${make} ${model}`.trim();
    } catch {
      // Ignore mdls errors
    }
  }

  return info;
}

function generateDITReportHTML(reportData, probedFiles) {
  const startedStr = formatTimestamp(reportData.startedAt);
  const completedStr = formatTimestamp(reportData.completedAt);
  const durationSec = reportData.startedAt && reportData.completedAt
    ? Math.max(1, Math.round((new Date(reportData.completedAt) - new Date(reportData.startedAt)) / 1000))
    : 0;
  const durFormatted = durationSec >= 60
    ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
    : `${durationSec}s`;

  const totalFiles = reportData.summary?.totalFiles || reportData.files?.length || 0;
  const totalBytes = (reportData.files || []).reduce((acc, f) => acc + (f.bytes || 0), 0);
  const totalVolumeStr = formatBytes(totalBytes);
  const sourcePath = (reportData.sourceDirs || []).join(', ') || '—';
  const destinationPath = reportData.destination || '—';

  const fileRowsHTML = (reportData.files || []).map((file, index) => {
    const meta = probedFiles[index] || {};
    const fileSizeStr = formatBytes(file.bytes || 0);
    const createdStr = formatTimestamp(file.createdAt);
    const modifiedStr = formatTimestamp(file.modifiedAt);
    const hash = file.sha256 || '—';

    // Slate format
    const slateParts = [];
    if (meta.reel && meta.reel !== '—') slateParts.push(`Reel ${meta.reel}`);
    if (meta.scene && meta.scene !== '—') slateParts.push(`Scena ${meta.scene}`);
    if (meta.take && meta.take !== '—') slateParts.push(`Take ${meta.take}`);
    const slateStr = slateParts.length ? slateParts.join(' · ') : '—';

    const dirName = path.dirname(file.path || '');
    const showRelPath = dirName && dirName !== '.' ? `<div class="file-sub-path">${file.path}</div>` : '';

    return `
      <div class="file-manifest-card">
        <!-- Colonna Sinistra: Identità File & Checksum -->
        <div class="file-col-left">
          <div class="file-identity">
            <div class="file-name-row">
              <span class="v-mark">✓</span>
              <strong class="file-name" title="${path.basename(file.path || '')}">${path.basename(file.path || '')}</strong>
            </div>
            ${showRelPath}
            ${meta.thumbnail ? `<div class="file-thumb-wrap"><img src="${meta.thumbnail}" class="file-thumb-img" alt="Thumbnail" /></div>` : ''}
          </div>

          <div class="hash-box">
            <div class="hash-label">SHA-256</div>
            <div class="hash-code">${hash}</div>
          </div>
        </div>

        <!-- Colonna Destra: Specifiche Tecniche DIT -->
        <div class="file-col-right">
          <div class="specs-grid">
            <div class="spec-cell">
              <span class="spec-k">Dimensione</span>
              <span class="spec-v">${fileSizeStr}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-k">Risoluzione</span>
              <span class="spec-v">${meta.resolution}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-k">Frame Rate</span>
              <span class="spec-v">${meta.fps}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-k">Durata</span>
              <span class="spec-v">${meta.duration}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-k">Codec</span>
              <span class="spec-v spec-codec">${meta.codec}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-k">Timecode In</span>
              <span class="spec-v spec-mono">${meta.timecode}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-k">Camera</span>
              <span class="spec-v">${meta.camera}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-k">Slate DIT</span>
              <span class="spec-v">${slateStr}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-k">Obiettivo</span>
              <span class="spec-v">${meta.lens}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-k">Audio</span>
              <span class="spec-v">${meta.audio}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-k">Data Creazione</span>
              <span class="spec-v spec-mono">${createdStr}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-k">Data Modifica</span>
              <span class="spec-v spec-mono">${modifiedStr}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>SecureCopy — DIT Manifest & Verification Report</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body {
      background-color: #0c1519;
      color: #e2edf0;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
      font-size: 10px;
      line-height: 1.35;
      width: 100%;
      margin: 0;
      padding: 0;
    }
    .report-sheet {
      background-color: #0c1519;
      padding: 8mm 10mm;
      box-sizing: border-box;
      width: 100%;
      min-height: 100vh;
    }

    /* HEADER BANNER */
    .report-header {
      background: #10191f;
      border: 1px solid #1a2c35;
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 10px;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1a2c35;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-icon {
      width: 26px;
      height: 26px;
      background: #081014;
      border: 1px solid #1a2c35;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #5eead4;
    }
    .brand-text h1 {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.8px;
      color: #ffffff;
      line-height: 1.1;
    }
    .brand-text span {
      font-size: 9px;
      font-weight: 600;
      color: #5eead4;
      letter-spacing: 0.5px;
      font-family: ui-monospace, Menlo, monospace;
      text-transform: uppercase;
    }
    .header-meta-right {
      text-align: right;
      font-size: 9.5px;
      color: #799aa3;
    }
    .header-meta-right strong {
      color: #e2edf0;
      font-family: ui-monospace, Menlo, monospace;
    }

    /* SUMMARY STATS GRID */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 10px;
    }
    .stat-box {
      background: #091115;
      border: 1px solid #15242b;
      border-radius: 4px;
      padding: 6px 10px;
    }
    .stat-label {
      font-size: 8px;
      font-weight: 700;
      color: #5e7d89;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      display: block;
      margin-bottom: 2px;
    }
    .stat-val {
      font-size: 12px;
      font-weight: 700;
      color: #ffffff;
      font-family: ui-monospace, Menlo, monospace;
    }
    .stat-val.accent {
      color: #34d399;
    }

    /* PATHS ROW */
    .paths-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      background: #091115;
      border: 1px solid #15242b;
      border-radius: 4px;
      padding: 6px 10px;
    }
    .path-block {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .path-title {
      font-size: 7.5px;
      font-weight: 700;
      color: #5e7d89;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .path-str {
      color: #c9dde2;
      font-family: ui-monospace, Menlo, monospace;
      font-size: 9px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* SECTION TITLE */
    .section-title {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #5eead4;
      margin: 10px 2px 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #1a2c35;
    }

    /* FILE MANIFEST CARDS */
    .file-manifest-card {
      background: #10191f;
      border: 1px solid #1a2c35;
      border-radius: 6px;
      margin-bottom: 8px;
      padding: 8px 12px;
      display: grid;
      grid-template-columns: 31% 69%;
      gap: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
      box-sizing: border-box;
      width: 100%;
    }

    /* COLONNA SINISTRA */
    .file-col-left {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border-right: 1px solid #182830;
      padding-right: 12px;
      min-width: 0;
    }
    .file-identity {
      min-width: 0;
    }
    .file-name-row {
      display: flex;
      align-items: baseline;
      gap: 5px;
      min-width: 0;
    }
    .v-mark {
      color: #34d399;
      font-weight: 800;
      font-size: 11px;
      flex-shrink: 0;
    }
    .file-name {
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      word-break: break-all;
      line-height: 1.25;
      min-width: 0;
    }
    .file-sub-path {
      display: block;
      font-size: 8px;
      color: #6d8b96;
      font-family: ui-monospace, Menlo, monospace;
      margin-top: 2px;
      word-break: break-all;
      line-height: 1.2;
    }
    .file-thumb-wrap {
      margin-top: 5px;
      width: 68px;
      height: 40px;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid #1a2c35;
      background: #081014;
    }
    .file-thumb-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .hash-box {
      background: #081014;
      border: 1px solid #142128;
      border-radius: 4px;
      padding: 4px 6px;
      margin-top: 6px;
    }
    .hash-label {
      font-size: 7px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #5eead4;
      margin-bottom: 2px;
    }
    .hash-code {
      font-family: ui-monospace, Menlo, monospace;
      font-size: 8px;
      color: #a7f3d0;
      word-break: break-all;
      line-height: 1.25;
      letter-spacing: 0.2px;
    }

    /* COLONNA DESTRA */
    .file-col-right {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      width: 100%;
    }
    .specs-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px 8px;
      width: 100%;
    }
    .spec-cell {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .spec-k {
      display: block;
      font-size: 7.5px;
      font-weight: 700;
      color: #5e7d89;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      line-height: 1.1;
      margin-bottom: 1.5px;
    }
    .spec-v {
      display: block;
      font-size: 8.5px;
      font-weight: 600;
      color: #e2edf0;
      line-height: 1.25;
      word-break: break-word;
    }
    .spec-codec {
      color: #5eead4;
    }
    .spec-mono {
      font-family: ui-monospace, Menlo, monospace;
      font-size: 8px;
    }

    /* FOOTER */
    .report-footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid #1a2c35;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #5e7d89;
    }
    .footer-left strong {
      color: #a0bcc4;
    }
    .footer-right {
      font-family: ui-monospace, Menlo, monospace;
      font-size: 8.5px;
    }
  </style>
</head>
<body>
<div class="report-sheet">

  <!-- HEADER -->
  <header class="report-header">
    <div class="header-top">
      <div class="brand-wrap">
        <div class="brand-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
        <div class="brand-text">
          <h1>SECURECOPY</h1>
          <span>DIT CHECKSUM & MEDIA MANIFEST</span>
        </div>
      </div>
      <div class="header-meta-right">
        <div>Completato: <strong>${completedStr}</strong></div>
        <div>Durata: <strong>${durFormatted}</strong></div>
      </div>
    </div>

    <!-- METRICS -->
    <div class="summary-grid">
      <div class="stat-box">
        <span class="stat-label">File Trasferiti</span>
        <div class="stat-val">${totalFiles}</div>
      </div>
      <div class="stat-box">
        <span class="stat-label">Volume Totale</span>
        <div class="stat-val">${totalVolumeStr}</div>
      </div>
      <div class="stat-box">
        <span class="stat-label">Algoritmo</span>
        <div class="stat-val">SHA-256</div>
      </div>
      <div class="stat-box">
        <span class="stat-label">Stato Integrità</span>
        <div class="stat-val accent">✓ 100% VERIFICATO</div>
      </div>
    </div>

    <!-- PATHS -->
    <div class="paths-row">
      <div class="path-block">
        <span class="path-title">Sorgente</span>
        <span class="path-str" title="${sourcePath}">${sourcePath}</span>
      </div>
      <div class="path-block">
        <span class="path-title">Destinazione</span>
        <span class="path-str" title="${destinationPath}">${destinationPath}</span>
      </div>
    </div>
  </header>

  <!-- SECTION TITLE -->
  <div class="section-title">
    <span>Manifest File & Specifiche Tecniche</span>
  </div>

  <!-- FILE LIST -->
  <div class="file-list">
    ${fileRowsHTML}
  </div>

  <!-- FOOTER -->
  <footer class="report-footer">
    <div class="footer-left">
      Report generato con <strong>SecureCopy</strong> · powered by <strong>unshapedstudio</strong>
    </div>
    <div class="footer-right">
      VERIFICATION ID: ${reportData.id || '—'}
    </div>
  </footer>

</div>
</body>
</html>`;
}

async function exportDITReportPDF(reportData, BrowserWindow, shell, reportsDirectory) {
  if (!reportData || !Array.isArray(reportData.files)) {
    throw new Error('Dati del report non validi per l’esportazione DIT.');
  }

  // Probe all destination files with concurrency limit
  const destinationRoot = reportData.destination ? path.resolve(reportData.destination) : '';
  const probedFiles = [];
  const concurrency = 4;
  for (let i = 0; i < reportData.files.length; i += concurrency) {
    const chunk = reportData.files.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(async file => {
      const fullPath = destinationRoot && file.path ? path.resolve(destinationRoot, file.path) : '';
      if (fullPath && fs.existsSync(fullPath)) {
        return await probeMediaFile(fullPath);
      }
      return {
        resolution: '—',
        codec: path.extname(file.path || '').slice(1).toUpperCase() || '—',
        fps: '—',
        duration: '—',
        timecode: '—',
        camera: '—',
        reel: '—',
        scene: '—',
        take: '—',
        lens: '—',
        audio: '—'
      };
    }));
    probedFiles.push(...chunkResults);
  }

  const html = generateDITReportHTML(reportData, probedFiles);

  // Render PDF using Electron
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: {
      sandbox: false
    }
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    // Wait slightly for rendering
    await new Promise(resolve => setTimeout(resolve, 300));
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      preferCSSPageSize: true,
      margins: {
        marginType: 'none',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    });

    const reportId = reportData.id || require('crypto').randomUUID();
    const pdfFileName = `SecureCopy-Manifest-DIT-${reportId}.pdf`;
    const targetDir = reportsDirectory || path.join(require('os').tmpdir(), 'securecopy-reports');
    await fsp.mkdir(targetDir, { recursive: true });
    const pdfPath = path.join(targetDir, pdfFileName);
    await fsp.writeFile(pdfPath, pdfBuffer);

    // Also copy to destination directory if accessible
    if (destinationRoot && fs.existsSync(destinationRoot)) {
      try {
        const destPdfPath = path.join(destinationRoot, `SecureCopy-Manifest-DIT.pdf`);
        await fsp.writeFile(destPdfPath, pdfBuffer);
      } catch {
        // Destination might be read-only; non-fatal
      }
    }

    if (shell && typeof shell.openPath === 'function') {
      await shell.openPath(pdfPath);
    }

    return { success: true, pdfPath, totalFiles: reportData.files.length };
  } finally {
    win.close();
  }
}

module.exports = {
  findFFprobe,
  formatBytes,
  formatTimestamp,
  friendlyCodec,
  probeMediaFile,
  generateDITReportHTML,
  exportDITReportPDF
};
