const test = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, getDownloadUrlForArch, createUpdater } = require('../src/updater');

test('compareVersions accurately compares semantic version strings', () => {
  assert.equal(compareVersions('2.7.8', '2.7.7'), 1);
  assert.equal(compareVersions('2.7.7', '2.7.8'), -1);
  assert.equal(compareVersions('2.7.7', '2.7.7'), 0);
  assert.equal(compareVersions('v2.7.8', '2.7.7'), 1);
  assert.equal(compareVersions('2.8.0', 'v2.7.99'), 1);
  assert.equal(compareVersions('3.0.0', '2.99.99'), 1);
  assert.equal(compareVersions('2.7.7.1', '2.7.7'), 1);
  assert.equal(compareVersions('2.7', '2.7.0'), 0);
  assert.equal(compareVersions('2.7.1', '2.7'), 1);
  assert.equal(compareVersions(null, '2.7.7'), -1);
  assert.equal(compareVersions('2.7.7', null), 1);
});

test('getDownloadUrlForArch returns architecture-specific DMG', () => {
  const downloads = {
    arm64: 'https://example.com/SecureCopy-arm64.dmg',
    x64: 'https://example.com/SecureCopy-x64.dmg'
  };

  assert.equal(getDownloadUrlForArch(downloads, 'arm64'), 'https://example.com/SecureCopy-arm64.dmg');
  assert.equal(getDownloadUrlForArch(downloads, 'x64'), 'https://example.com/SecureCopy-x64.dmg');

  // Fallback to constructed GitHub releases URL if downloads is undefined
  const defaultUrl = getDownloadUrlForArch(undefined, 'arm64', '2.7.8');
  assert.match(defaultUrl, /SecureCopy-2\.7\.8-arm64\.dmg/);
});

test('createUpdater manages status and reports up-to-date when versions match', async () => {
  let statusList = [];
  const updater = createUpdater({
    getCurrentVersion: () => '2.7.8',
    versionUrl: 'data:application/json,' + encodeURIComponent(JSON.stringify({
      version: '2.7.8',
      build: 1,
      releaseDate: '2026-10-26',
      notes: { it: 'Nessuna novità' },
      downloads: { arm64: 'https://example.com/dl.dmg' }
    })),
    onStatusChange: (status) => {
      statusList.push(status.status);
    }
  });

  assert.equal(updater.getStatus().status, 'idle');
  const result = await updater.checkForUpdates({ silent: false, autoDownload: false });
  assert.equal(result.status, 'up-to-date');
  assert.equal(updater.getStatus().status, 'up-to-date');
  assert.ok(statusList.includes('checking'));
  assert.ok(statusList.includes('up-to-date'));
});

test('createUpdater detects newer version and sets status to available', async () => {
  let latestStatus = null;
  const updater = createUpdater({
    getCurrentVersion: () => '2.7.7',
    versionUrl: 'data:application/json,' + encodeURIComponent(JSON.stringify({
      version: '2.7.8',
      build: 2,
      releaseDate: '2026-10-26',
      notes: { it: 'Aggiornamento importante' },
      downloads: { arm64: 'https://example.com/SecureCopy-2.7.8-arm64.dmg' }
    })),
    onStatusChange: (status) => {
      latestStatus = status;
    }
  });

  const result = await updater.checkForUpdates({ silent: false, autoDownload: false });
  assert.equal(result.status, 'available');
  assert.equal(result.version, '2.7.8');
  assert.equal(result.notes, 'Aggiornamento importante');
  assert.equal(latestStatus.status, 'available');
});

test('createUpdater handles fetch failure gracefully without throwing in silent mode', async () => {
  const updater = createUpdater({
    getCurrentVersion: () => '2.7.8',
    versionUrl: 'http://127.0.0.1:59999/non-existent.json',
    releasesUrl: 'http://127.0.0.1:59999/non-existent-releases.json'
  });

  const silentResult = await updater.checkForUpdates({ silent: true, autoDownload: false });
  assert.equal(silentResult.status, 'idle');

  const nonSilentResult = await updater.checkForUpdates({ silent: false, autoDownload: false });
  assert.equal(nonSilentResult.status, 'error');
  assert.ok(nonSilentResult.message);
});
