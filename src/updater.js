let electronApp = null;
try {
  electronApp = require('electron').app;
} catch {
  // Standalone Node / test environment
}
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync, spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const crypto = require('node:crypto');

const DEFAULT_REPO = 'marcovernetto-lgtm/SecureCopy';
const DEFAULT_VERSION_URL = `https://raw.githubusercontent.com/${DEFAULT_REPO}/main/src/version.json`;
const BUNDLE_ID = 'com.unshapedstudio.securecopy';
const IDLE_TIMEOUT_MS = 60000;
const DEFAULT_RELEASES_URL = `https://api.github.com/repos/${DEFAULT_REPO}/releases/latest`;

/**
 * Compare two semantic version strings (e.g. "2.7.8" vs "2.7.7").
 * Returns:
 *   1 if v1 > v2 (v1 is newer)
 *  -1 if v1 < v2 (v1 is older)
 *   0 if v1 === v2
 */
function compareVersions(v1, v2) {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;

  const normalize = v => String(v).replace(/^v/i, '').trim().split('.').map(n => parseInt(n, 10) || 0);
  const p1 = normalize(v1);
  const p2 = normalize(v2);
  const max = Math.max(p1.length, p2.length);

  for (let i = 0; i < max; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Select the appropriate download URL based on system architecture.
 */
function getDownloadUrlForArch(downloads, arch = process.arch, version = '') {
  const normArch = arch === 'x64' ? 'x64' : 'arm64';
  if (!downloads) {
    return `https://github.com/${DEFAULT_REPO}/releases/download/v${version}/SecureCopy-${version}-${normArch}.dmg`;
  }
  if (typeof downloads === 'string') return downloads;
  return downloads[normArch] || downloads.universal || downloads.arm64 || downloads.x64 || Object.values(downloads)[0];
}

// Updates are accepted only from this repository's own GitHub release files,
// whatever version.json says, so a tampered manifest cannot point elsewhere.
function isTrustedDownloadUrl(url, repo = DEFAULT_REPO, version = '') {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  const prefix = `/${repo}/releases/download/v${String(version).replace(/^v/i, '')}/`;
  return parsed.protocol === 'https:' && parsed.hostname === 'github.com' && !parsed.search && !parsed.hash &&
    parsed.pathname.startsWith(prefix) && /^[A-Za-z0-9._-]+\.dmg$/.test(parsed.pathname.slice(prefix.length));
}

function checksumFor(text, filename) {
  for (const line of String(text || '').split('\n')) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (match && match[2].trim() === filename) return match[1].toLowerCase();
  }
  return null;
}

async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function plistValue(appPath, key) {
  return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(appPath, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();
}

function teamIdentifier(appPath) {
  try {
    const details = execFileSync('/usr/bin/codesign', ['-dv', appPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return (details.match(/^TeamIdentifier=(.+)$/m) || [])[1] || null;
  } catch (error) {
    const output = String(error.stderr || '');
    return (output.match(/^TeamIdentifier=(.+)$/m) || [])[1] || null;
  }
}

// The new bundle must be intact, be SecureCopy, carry the announced version
// and, once releases are Developer ID signed, come from the same team.
function verifyAppBundle(appPath, { version, currentAppPath } = {}) {
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'ignore' });
  if (plistValue(appPath, 'CFBundleIdentifier') !== BUNDLE_ID) throw new Error('L’aggiornamento non è SecureCopy.');
  if (version && plistValue(appPath, 'CFBundleShortVersionString') !== String(version).replace(/^v/i, '')) throw new Error('La versione dell’aggiornamento non corrisponde a quella annunciata.');
  if (currentAppPath && fs.existsSync(currentAppPath)) {
    const currentTeam = teamIdentifier(currentAppPath);
    if (currentTeam && currentTeam !== 'not set' && teamIdentifier(appPath) !== currentTeam) throw new Error('L’aggiornamento è firmato da uno sviluppatore diverso.');
  }
}

/**
 * Creates an Updater instance configured with app dependencies.
 */
function createUpdater(options = {}) {
  const repo = options.repo || DEFAULT_REPO;
  const versionUrl = options.versionUrl || DEFAULT_VERSION_URL;
  const releasesUrl = options.releasesUrl || DEFAULT_RELEASES_URL;
  const appRef = options.app || electronApp;
  const getCurrentVersion = options.getCurrentVersion || (() => {
    try {
      return appRef?.getVersion() || require('./package.json').version;
    } catch {
      return '2.10.4';
    }
  });
  const getLanguage = options.getLanguage || (() => 'it');
  const onStatusChange = options.onStatusChange || (() => {});

  let currentStatus = { status: 'idle' };
  let pendingUpdate = null;
  let readyAppPath = null;
  let isChecking = false;
  let isDownloading = false;

  function setStatus(newStatus) {
    currentStatus = { ...newStatus, timestamp: Date.now() };
    try {
      onStatusChange(currentStatus);
    } catch (e) {
      console.error('[Updater] Listener error:', e.message);
    }
  }

  async function fetchRemoteVersion() {
    // 1. Try raw version.json first (fast, direct, mirror of Bathys architecture)
    try {
      const url = versionUrl.startsWith('http')
        ? (versionUrl.includes('?') ? `${versionUrl}&t=${Date.now()}` : `${versionUrl}?t=${Date.now()}`)
        : versionUrl;
      const res = await fetch(url, {
        headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'SecureCopy-Updater' },
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.version) return data;
      }
    } catch (err) {
      console.warn('[Updater] version.json non raggiungibile, provo GitHub Releases:', err.message);
    }

    // 2. Fallback to GitHub Releases API
    try {
      const res = await fetch(releasesUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SecureCopy-Updater' },
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const release = await res.json();
        const tag = (release.tag_name || '').replace(/^v/i, '');
        if (tag) {
          const downloads = {};
          if (Array.isArray(release.assets)) {
            for (const asset of release.assets) {
              if (asset.name?.endsWith('.dmg')) {
                if (asset.name.includes('arm64')) downloads.arm64 = asset.browser_download_url;
                else if (asset.name.includes('x64')) downloads.x64 = asset.browser_download_url;
                else downloads.universal = asset.browser_download_url;
              }
            }
          }
          return {
            version: tag,
            build: 1,
            releaseDate: release.published_at || new Date().toISOString(),
            notes: { it: release.body || 'Nuova versione disponibile su GitHub.', en: release.body || 'New version available on GitHub.' },
            downloads
          };
        }
      }
    } catch (err) {
      console.warn('[Updater] GitHub Releases non raggiungibile:', err.message);
    }

    throw new Error('Impossibile verificare la presenza di aggiornamenti.');
  }

  async function checkForUpdates({ silent = false, autoDownload = true } = {}) {
    if (isChecking || isDownloading) return currentStatus;
    isChecking = true;
    if (!silent) setStatus({ status: 'checking' });

    try {
      const remoteInfo = await fetchRemoteVersion();
      const currentVersion = getCurrentVersion();
      const isNewer = compareVersions(remoteInfo.version, currentVersion) > 0;

      if (isNewer) {
        const lang = getLanguage();
        const notes = remoteInfo.notes?.[lang] || remoteInfo.notes?.it || remoteInfo.notes?.en || 'Nuova versione disponibile.';
        const downloadUrl = getDownloadUrlForArch(remoteInfo.downloads, process.arch, remoteInfo.version);
        const arch = process.arch === 'x64' ? 'x64' : 'arm64';
        const sha256 = typeof remoteInfo.sha256 === 'object' ? remoteInfo.sha256?.[arch] : null;

        pendingUpdate = {
          version: remoteInfo.version,
          build: remoteInfo.build || 1,
          releaseDate: remoteInfo.releaseDate,
          notes,
          downloadUrl,
          sha256: /^[a-f0-9]{64}$/i.test(sha256 || '') ? sha256.toLowerCase() : null
        };

        setStatus({
          status: 'available',
          version: remoteInfo.version,
          currentVersion,
          notes,
          downloadUrl
        });

        if (autoDownload && downloadUrl) {
          // Download in background immediately like Bathys
          downloadAndInstallUpdate(pendingUpdate).catch(err => {
            console.error('[Updater] Errore installazione background:', err.message);
          });
        }

        return currentStatus;
      } else {
        setStatus({
          status: 'up-to-date',
          currentVersion,
          silent
        });
        return currentStatus;
      }
    } catch (error) {
      if (!silent) {
        setStatus({
          status: 'error',
          message: error.message || 'Errore di connessione al server degli aggiornamenti.',
          silent: false
        });
      }
      return currentStatus;
    } finally {
      isChecking = false;
    }
  }

  async function downloadAndInstallUpdate(updateInfo = pendingUpdate) {
    if (!updateInfo || !updateInfo.downloadUrl) {
      throw new Error('Nessun file di aggiornamento specificato.');
    }
    if (isDownloading) return currentStatus;
    if (process.platform !== 'darwin') {
      throw new Error('Aggiornamento automatico disponibile esclusivamente su macOS.');
    }

    if (!isTrustedDownloadUrl(updateInfo.downloadUrl, repo, updateInfo.version)) {
      throw new Error('Indirizzo di aggiornamento non attendibile: sono ammessi solo i file delle release ufficiali di SecureCopy.');
    }

    isDownloading = true;
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'securecopy-update-'));
    const targetDMG = path.join(tempDir, 'SecureCopy-Update.dmg');
    const mountPoint = path.join(tempDir, 'mount');
    let mounted = false;

    try {
      setStatus({
        status: 'downloading',
        version: updateInfo.version,
        progress: 0
      });

      // The expected checksum comes from the release's SHA256SUMS file
      // (or version.json); without one the update is not installed.
      const dmgName = path.basename(new URL(updateInfo.downloadUrl).pathname);
      let expectedHash = updateInfo.sha256 || null;
      if (!expectedHash) {
        const sumsUrl = new URL(`SHA256SUMS-${String(updateInfo.version).replace(/^v/i, '')}.txt`, updateInfo.downloadUrl).href;
        const sums = await fetch(sumsUrl, { headers: { 'User-Agent': 'SecureCopy-Updater' }, signal: AbortSignal.timeout(30000) });
        if (sums.ok) expectedHash = checksumFor(await sums.text(), dmgName);
      }
      if (!expectedHash) throw new Error('Checksum dell’aggiornamento non disponibile: installazione annullata.');

      // Stream download with progress tracking; abort only when the
      // connection stalls, so slow networks can still finish.
      const idle = new AbortController();
      let idleTimer = setTimeout(() => idle.abort(new Error('Download bloccato: nessun dato ricevuto per 60 secondi.')), IDLE_TIMEOUT_MS);
      const touch = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => idle.abort(new Error('Download bloccato: nessun dato ricevuto per 60 secondi.')), IDLE_TIMEOUT_MS); };
      const response = await fetch(updateInfo.downloadUrl, {
        headers: { 'User-Agent': 'SecureCopy-Updater' },
        signal: idle.signal
      });

      if (!response.ok) {
        throw new Error(`Download fallito (HTTP ${response.status})`);
      }

      const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
      let receivedBytes = 0;
      let lastReport = 0;

      const webStream = Readable.fromWeb(response.body);
      webStream.on('data', chunk => {
        touch();
        receivedBytes += chunk.length;
        const now = Date.now();
        if (now - lastReport > 200 || (totalBytes && receivedBytes === totalBytes)) {
          lastReport = now;
          const progress = totalBytes > 0 ? (receivedBytes / totalBytes) : 0;
          setStatus({
            status: 'downloading',
            version: updateInfo.version,
            progress,
            receivedBytes,
            totalBytes
          });
        }
      });

      try { await pipeline(webStream, fs.createWriteStream(targetDMG)); }
      finally { clearTimeout(idleTimer); }

      if (await sha256File(targetDMG) !== expectedHash) {
        throw new Error('Checksum dell’aggiornamento non valido: file scartato.');
      }

      setStatus({
        status: 'installing',
        version: updateInfo.version
      });

      // Mount DMG quietly without Finder popup
      await fs.promises.mkdir(mountPoint, { recursive: true });
      execFileSync('/usr/bin/hdiutil', ['attach', targetDMG, '-mountpoint', mountPoint, '-nobrowse', '-quiet']);
      mounted = true;

      // Locate .app inside DMG
      const mountFiles = await fs.promises.readdir(mountPoint);
      const appBundle = mountFiles.find(name => name.endsWith('.app'));
      if (!appBundle) {
        throw new Error('Applicazione non trovata nell’immagine disco di aggiornamento.');
      }

      const newAppPath = path.join(mountPoint, appBundle);

      // Determine target destination
      let destAppPath = '/Applications/SecureCopy.app';
      if (appRef && appRef.isPackaged) {
        const execMatch = process.execPath.match(/^(\/.*?\.app)\//);
        if (execMatch && execMatch[1].startsWith('/Applications/')) {
          destAppPath = execMatch[1];
        }
      }

      verifyAppBundle(newAppPath, { version: updateInfo.version, currentAppPath: destAppPath });

      // Safe atomic replacement with rollback backup
      const backupPath = path.join(tempDir, 'SecureCopy_Backup.app');
      const destExists = fs.existsSync(destAppPath);

      if (destExists) {
        await fs.promises.rename(destAppPath, backupPath);
      }

      try {
        execFileSync('/usr/bin/ditto', [newAppPath, destAppPath]);
        execFileSync('/usr/bin/xattr', ['-cr', destAppPath]);

        // Cleanup backup on success
        if (destExists && fs.existsSync(backupPath)) {
          await fs.promises.rm(backupPath, { recursive: true, force: true });
        }
      } catch (copyErr) {
        // Rollback previous version if replacement failed
        if (destExists && fs.existsSync(backupPath) && !fs.existsSync(destAppPath)) {
          try { await fs.promises.rename(backupPath, destAppPath); } catch {}
        }
        throw new Error(`Permessi non sufficienti per aggiornare ${destAppPath}. Trascina la nuova versione manualmente.`);
      }

      readyAppPath = destAppPath;
      setStatus({
        status: 'ready-to-restart',
        version: updateInfo.version,
        notes: updateInfo.notes,
        appPath: destAppPath
      });

      return currentStatus;
    } finally {
      if (mounted) {
        try {
          execFileSync('/usr/bin/hdiutil', ['detach', mountPoint, '-quiet']);
        } catch {
          try { execFileSync('/usr/bin/hdiutil', ['detach', mountPoint, '-force', '-quiet']); } catch {}
        }
      }
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {}
      isDownloading = false;
    }
  }

  function relaunchApp() {
    if (!readyAppPath || !fs.existsSync(readyAppPath)) {
      return false;
    }

    const pid = process.pid;
    const targetPath = readyAppPath;

    // Shell script to wait for current process exit, clear quarantine and open new app
    // Values are passed as arguments, never interpolated into the script.
    const script = 'while kill -0 "$1" 2>/dev/null; do sleep 0.1; done; /usr/bin/xattr -cr "$2" 2>/dev/null; /usr/bin/open "$2"';

    const child = spawn('/bin/sh', ['-c', script, 'securecopy-relaunch', String(pid), targetPath], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    if (appRef) {
      appRef.quit();
    }
    return true;
  }

  return {
    compareVersions,
    getDownloadUrlForArch,
    getStatus: () => currentStatus,
    checkForUpdates,
    downloadAndInstallUpdate,
    relaunchApp
  };
}

module.exports = {
  compareVersions,
  getDownloadUrlForArch,
  isTrustedDownloadUrl,
  checksumFor,
  verifyAppBundle,
  createUpdater
};
