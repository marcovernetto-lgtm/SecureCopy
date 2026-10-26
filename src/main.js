const { app, BrowserWindow, ipcMain, dialog, shell, Menu, powerSaveBlocker } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const crypto = require('crypto');
const { runCopy } = require('./copy-engine');
const { RETENTION_DAYS, managedDirectory, cleanupArtifacts, saveActivityLog } = require('./artifact-retention');
const { overlap, snapshot, matches } = require('./fs-safety');
const { compareFolders, reconcileFolders, forRenderer, expandComparisonDecisions } = require('./compare-engine');
const { createUpdater } = require('./updater');
const { exportDITReportPDF } = require('./dit-report');
const {
  sendTelegramMessage,
  detectTelegramChatId,
  sendTestNotification,
  formatCopyCompletionMessage
} = require('./telegram-notify');

let mainWindow;
let backgroundService = null;
let appUpdater = null;
let updaterInterval = null;
let quitting = false;
const profileDirectory = app.commandLine?.getSwitchValue('user-data-dir');
if (profileDirectory) app.setPath('userData', path.resolve(profileDirectory));
const primaryInstance = !app.requestSingleInstanceLock || app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', () => app.whenReady().then(openMainWindow));
let copyQueue = [];
let pendingCopyRecovery = [];
const activeJobs = new Map();
const jobTasks = new Set();
const MAX_ACTIVE_OPERATIONS = 10;
const completedJobs = [];
const completedReports = new Map();
let queueRunning = false;
let queueStore = null;
let compareSession = null;
let compareController = null;
let comparisonItem = null;
let uiLanguage = 'it';
let comparisonRecovery = null;
let recoveryStore = null;
let lastRecoveryWrite = 0;
let reportRetentionDays = RETENTION_DAYS;
let retentionTimer = null;
let mediaSettings = {
  mediaSeparation: false,
  soundAlerts: true,
  autoEject: false,
  telegramEnabled: false,
  telegramBotToken: '',
  telegramChatId: ''
};

async function loadMediaSettings() {
  try {
    const file = path.join(app.getPath('userData'), 'media-settings.json');
    const data = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    if (typeof data.mediaSeparation === 'boolean') mediaSettings.mediaSeparation = data.mediaSeparation;
    if (typeof data.soundAlerts === 'boolean') mediaSettings.soundAlerts = data.soundAlerts;
    if (typeof data.autoEject === 'boolean') mediaSettings.autoEject = data.autoEject;
    if (typeof data.telegramEnabled === 'boolean') mediaSettings.telegramEnabled = data.telegramEnabled;
    if (typeof data.telegramBotToken === 'string') mediaSettings.telegramBotToken = data.telegramBotToken;
    if (typeof data.telegramChatId === 'string') mediaSettings.telegramChatId = data.telegramChatId;
  } catch { /* defaults */ }
}

async function saveMediaSettings(newSettings) {
  if (typeof newSettings.mediaSeparation === 'boolean') mediaSettings.mediaSeparation = newSettings.mediaSeparation;
  if (typeof newSettings.soundAlerts === 'boolean') mediaSettings.soundAlerts = newSettings.soundAlerts;
  if (typeof newSettings.autoEject === 'boolean') mediaSettings.autoEject = newSettings.autoEject;
  if (typeof newSettings.telegramEnabled === 'boolean') mediaSettings.telegramEnabled = newSettings.telegramEnabled;
  if (typeof newSettings.telegramBotToken === 'string') mediaSettings.telegramBotToken = newSettings.telegramBotToken;
  if (typeof newSettings.telegramChatId === 'string') mediaSettings.telegramChatId = newSettings.telegramChatId;
  try {
    const file = path.join(app.getPath('userData'), 'media-settings.json');
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await fs.promises.writeFile(temp, JSON.stringify(mediaSettings, null, 2), { mode: 0o600, flag: 'wx' });
    await fs.promises.rename(temp, file);
  } catch (err) {
    console.error('Salvataggio impostazioni media:', err.message);
  }
  return mediaSettings;
}
let retentionTask = null;
let powerBlocker = null;
const activeOperationCount = () => activeJobs.size + (compareController ? 1 : 0);
function updatePowerProtection() {
  if ((activeOperationCount() || jobTasks.size) && powerBlocker === null) powerBlocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!activeOperationCount() && !jobTasks.size && powerBlocker !== null) { powerSaveBlocker.stop(powerBlocker); powerBlocker = null; }
}

const send = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
};
const sendLog = (level, message) => send('copy-log', { level, message: `[${level}] ${message}` });
function rememberReport(id, file) {
  completedReports.set(id,file);
  if (completedReports.size > 200) {
    const protectedIds = new Set(completedJobs.map(item => item.id));
    const candidate = [...completedReports.keys()].find(key => key !== id && !protectedIds.has(key));
    if (candidate) completedReports.delete(candidate);
  }
}
function availableComparisonRecovery() {
  return !compareController && comparisonRecovery?.decisions?.length ? comparisonRecovery : null;
}
function publishComparisonRecovery() {
  send('comparison-recovery-updated', availableComparisonRecovery());
}
function publishPendingCopyRecovery() {
  send('pending-copy-recovery-updated', pendingCopyRecovery.length);
}
function saveComparisonRecovery(force = false) {
  if (!recoveryStore) return;
  if (!force && Date.now() - lastRecoveryWrite < 500) return;
  lastRecoveryWrite = Date.now();
  try {
    if (!comparisonRecovery) { fs.rmSync(recoveryStore, { force: true }); return; }
    const temp = `${recoveryStore}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(comparisonRecovery), { mode: 0o600 });
    fs.renameSync(temp, recoveryStore);
  } catch (error) { sendLog('WARNING', `Ripresa non salvata: ${error.message}`); }
  finally { publishComparisonRecovery(); }
}
function saveQueue() {
  if (!queueStore) return;
  const pending = pendingCopyRecovery.concat(copyQueue.filter(item => item.status === 'pending')).concat([...activeJobs.values()].map(job => ({ ...job.item, recovered: true })))
    .map(item => ({ ...item, progress: 0, filesProcessed: 0 }));
  if (pending.length === 0) {
    try { fs.rmSync(queueStore, { force: true }); } catch {}
    return;
  }
  const temp = `${queueStore}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(pending), { mode: 0o600 });
    fs.renameSync(temp, queueStore);
  } catch (error) {
    sendLog('WARNING', `Impossibile salvare la coda: ${error.message}`);
  }
}
function updateQueue() {
  updatePowerProtection();
  saveQueue();
  send('queue-updated', [...activeJobs.values()].map(job => job.item)
    .concat(copyQueue, comparisonItem ? [comparisonItem] : [], completedJobs));
}
function restoreQueue() {
  queueStore = path.join(app.getPath('userData'), 'pending-queue.json');
  recoveryStore = path.join(app.getPath('userData'), 'comparison-recovery.json');
  try { comparisonRecovery = JSON.parse(fs.readFileSync(recoveryStore, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') console.error(error.message); }
  try {
    fs.mkdirSync(path.dirname(queueStore), { recursive: true });
    const saved = JSON.parse(fs.readFileSync(queueStore, 'utf8'));
    if (Array.isArray(saved)) {
      pendingCopyRecovery = saved.filter(item => Array.isArray(item.sourceDirs) && item.sourceDirs.length &&
        item.sourceDirs.every(value => typeof value === 'string') && typeof item.destDir === 'string')
        .map(item => ({ ...item, id: item.recovered || typeof item.id !== 'string' ? crypto.randomUUID() : item.id, recoveredFrom: item.recovered ? item.id : undefined, status: 'pending', progress: 0, filesProcessed: 0 }));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Impossibile ripristinare la coda:', error);
  }
  publishPendingCopyRecovery();
  publishComparisonRecovery();
}
async function applyReportRetention() {
  if (retentionTask) return retentionTask;
  retentionTask = cleanupArtifacts(app.getPath('userData'), { days: reportRetentionDays }).then(removed => {
    for (const file of removed) {
      for (const [id, saved] of completedReports) if (saved === file) completedReports.delete(id);
      for (const job of completedJobs) if (job.result?.reportPath === file) job.result.reportPath = null;
    }
    if (removed.length) updateQueue();
    return removed;
  }).finally(() => { retentionTask = null; });
  return retentionTask;
}
function restoreHistory() {
  const directory = path.join(app.getPath('userData'), 'reports');
  try {
    const files = fs.readdirSync(directory).filter(name => name.endsWith('.json')).map(name => ({ name, modified: fs.statSync(path.join(directory, name)).mtimeMs })).sort((a,b) => b.modified-a.modified).slice(0,200);
    for (const { name } of files) {
      try {
        const file = path.join(directory, name);
        const report = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!report.id) continue;
        completedReports.set(report.id, file);
      } catch (error) { console.error('Report non leggibile:', name, error.message); }
    }
  } catch (error) { if (error.code !== 'ENOENT') console.error(error.message); }
}
const trusted = event => mainWindow && !mainWindow.isDestroyed() &&
  event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame;
const handle = (channel, callback) => ipcMain.handle(channel, (event, ...args) => {
  if (!trusted(event)) throw new Error('Richiesta non autorizzata.');
  return callback(...args);
});
const listen = (channel, callback) => ipcMain.on(channel, (event, ...args) => {
  if (trusted(event)) callback(...args);
});

function openMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  app.dock?.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
}
function createWindow(background = false) {
  mainWindow = new BrowserWindow({
    width: 1200, height: 850, minWidth: 740, minHeight: 560,
    icon: path.join(__dirname, 'Assets', 'ICON.png'),
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, preload: path.join(__dirname, 'preload.js')
    }
  });
  const localPage = path.join(__dirname, 'index.html');
  const allowedExternal = new Set([
    'https://buymeacoffee.com/vemarcus',
    'https://github.com/marcovernetto-lgtm/SecureCopy',
    'https://github.com/marcovernetto-lgtm/SecureCopy/releases',
    'https://t.me/BotFather'
  ]);
  const openApprovedExternal = url => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && (
        allowedExternal.has(url) ||
        url.startsWith('https://t.me/') ||
        (parsed.hostname === 'github.com' && parsed.pathname.startsWith('/marcovernetto-lgtm/SecureCopy'))
      )) {
        shell.openExternal(url).catch(error => sendLog('WARNING', error.message));
      }
    } catch {}
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openApprovedExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== pathToFileURL(localPage).href) {
      event.preventDefault();
      openApprovedExternal(url);
    }
  });
  mainWindow.loadFile(localPage);
  mainWindow.webContents.on('did-finish-load', updateQueue);
  mainWindow.once('ready-to-show', () => { if (!background) mainWindow?.show(); });
  mainWindow.on('close', event => {
    if (process.platform === 'darwin' && !quitting) { event.preventDefault(); mainWindow.hide(); app.dock?.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  if (!primaryInstance) return;
  await loadMediaSettings().catch(() => {});
  restoreQueue();
  try {
    const root = app.getPath('userData');
    if (await fs.promises.realpath(root) !== path.resolve(root)) throw new Error('Cartella dati non sicura.');
    const retentionFile = path.join(root, 'report-retention.json');
    let loadedDays = RETENTION_DAYS;
    try {
      const data = JSON.parse(await fs.promises.readFile(retentionFile, 'utf8'));
      const parsed = Number(data.days);
      if ([2, 5, 10, 20, 30].includes(parsed)) {
        loadedDays = parsed;
      } else {
        throw new Error('Valore conservazione non valido');
      }
    } catch {
      const temp = path.join(root, `report-retention-${crypto.randomUUID()}.tmp`);
      await fs.promises.writeFile(temp, JSON.stringify({ days: RETENTION_DAYS }), { mode: 0o600, flag: 'wx' });
      await fs.promises.rename(temp, retentionFile);
    }
    reportRetentionDays = loadedDays;
  }
  catch (error) { console.error('Impostazione conservazione:', error.message); }
  try { await applyReportRetention(); } catch (error) { console.error('Conservazione report:', error.message); }
  retentionTimer = setInterval(() => applyReportRetention().catch(error => console.error('Conservazione report/log:', error.message)), 15 * 60 * 1000);
  retentionTimer.unref();
  restoreHistory();
  backgroundService = require(path.join(__dirname, 'background-service')).createBackgroundService({
    app, openMainWindow, getMainWindow: () => mainWindow, getLanguage: () => uiLanguage,
    onError: error => { openMainWindow(); send('app-error', { message: error.message }); }
  });
  const startup = backgroundService.getSettings();
  const background = process.argv.includes('--background') || !!startup.openedAtLogin;
  createWindow(background);
  if (background) app.dock?.hide();
  backgroundService.start().catch(error => console.error('Avvio monitor dischi:', error.message));
  app.on('activate', openMainWindow);

  appUpdater = createUpdater({
    app,
    getCurrentVersion: () => app.getVersion(),
    getLanguage: () => uiLanguage,
    onStatusChange: (status) => {
      send('update-status-changed', status);
    }
  });

  setTimeout(() => {
    if (!quitting && appUpdater) {
      appUpdater.checkForUpdates({ silent: true }).catch(err => {
        console.warn('[Updater] Avvio silenzioso:', err.message);
      });
    }
  }, 4000);

  updaterInterval = setInterval(() => {
    if (!quitting && appUpdater) {
      appUpdater.checkForUpdates({ silent: true }).catch(() => {});
    }
  }, 4 * 60 * 60 * 1000);
  updaterInterval.unref();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', event => {
  if (quitting) return;
  quitting = true;
  clearInterval(retentionTimer);
  if (updaterInterval) clearInterval(updaterInterval);
  backgroundService?.stop();
  saveQueue();
  saveComparisonRecovery(true);
  const pending = [...jobTasks];
  if (compareController?.completion) pending.push(compareController.completion);
  for (const job of activeJobs.values()) job.controller.abort();
  compareController?.abort();
  if (pending.length) { event.preventDefault(); Promise.allSettled(pending).then(() => app.quit()); }
});
app.on('render-process-gone', (_event, contents, details) => {
  if (details.reason === 'crashed' && mainWindow && !mainWindow.isDestroyed() && contents === mainWindow.webContents) {
    for (const job of activeJobs.values()) job.controller.abort();
    compareController?.abort();
    mainWindow.reload();
  }
});

handle('get-app-version', () => app.getVersion());
handle('check-for-updates', () => appUpdater ? appUpdater.checkForUpdates({ silent: false }) : { status: 'idle' });
handle('install-update', () => appUpdater ? appUpdater.downloadAndInstallUpdate() : { status: 'idle' });
handle('relaunch-app', () => appUpdater ? appUpdater.relaunchApp() : false);
handle('get-update-status', () => appUpdater ? appUpdater.getStatus() : { status: 'idle' });

handle('get-pending-copy-recovery-count', () => pendingCopyRecovery.length);
handle('recover-pending-copies', () => {
  const count = pendingCopyRecovery.length;
  copyQueue.push(...pendingCopyRecovery);
  pendingCopyRecovery = [];
  updateQueue();
  publishPendingCopyRecovery();
  return count;
});
handle('dismiss-pending-copies', () => {
  const count = pendingCopyRecovery.length;
  pendingCopyRecovery = [];
  if (queueStore) {
    try {
      if (copyQueue.some(item => item.status === 'pending') || activeJobs.size > 0) {
        saveQueue();
      } else {
        fs.rmSync(queueStore, { force: true });
      }
    } catch (err) {
      sendLog('WARNING', `Impossibile cancellare copie in sospeso: ${err.message}`);
    }
  }
  updateQueue();
  publishPendingCopyRecovery();
  return count;
});
handle('get-report-retention', () => reportRetentionDays);
handle('get-media-settings', () => mediaSettings);
handle('set-media-settings', async settings => saveMediaSettings(settings));
handle('detect-telegram-chat-id', async token => detectTelegramChatId(token));
handle('test-telegram-notification', async ({ botToken, chatId }) => sendTestNotification(botToken, chatId));
handle('get-background-settings', () => backgroundService.getSettings());
handle('set-login-startup', enabled => backgroundService.setLogin(enabled));
handle('set-disk-notices', enabled => backgroundService.setDiskNotices(enabled));
handle('set-report-retention', async days => {
  const validDays = [2, 5, 10, 20, 30];
  const parsed = Number(days);
  if (!validDays.includes(parsed)) {
    throw new Error('I valori supportati per la conservazione sono 2, 5, 10, 20 o 30 giorni.');
  }
  reportRetentionDays = parsed;
  const file = path.join(app.getPath('userData'), 'report-retention.json');
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.promises.writeFile(temp, JSON.stringify({ days: parsed }), { mode: 0o600, flag: 'wx' });
  await fs.promises.rename(temp, file);
  await applyReportRetention();
  updateQueue();
  return reportRetentionDays;
});
handle('save-activity-log', async messages => {
  const file = await saveActivityLog(app.getPath('userData'), messages);
  await applyReportRetention();
  shell.showItemInFolder(file);
  return file;
});
handle('set-language', language => {
  uiLanguage = language === 'en' ? 'en' : 'it';
  backgroundService?.refreshLanguage();
  return uiLanguage;
});
handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: uiLanguage === 'en' ? 'Choose folder' : 'Scegli cartella',
    buttonLabel: uiLanguage === 'en' ? 'Choose' : 'Scegli'
  });
  return result.canceled ? null : result.filePaths[0];
});
handle('dialog:openMultipleDirectories', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    title: uiLanguage === 'en' ? 'Choose source files or folders' : 'Scegli file o cartelle sorgente',
    buttonLabel: uiLanguage === 'en' ? 'Choose' : 'Scegli'
  });
  if (!result.canceled) backgroundService?.confirmSelectedSources(result.filePaths);
  return result.canceled ? null : result.filePaths;
});

function validatePaths(sourceDirs, destDir) {
  if (!Array.isArray(sourceDirs) || !sourceDirs.length ||
      !sourceDirs.every(value => typeof value === 'string' && value.length) ||
      typeof destDir !== 'string' || !destDir.length) {
    throw new Error('Seleziona sorgenti e destinazione valide.');
  }
  backgroundService?.validateSources(sourceDirs);
}
function canonicalSync(input) {
  const absolute = path.resolve(input);
  try { return fs.realpathSync(absolute); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(canonicalSync(parent), path.basename(absolute));
  }
}
function pathsOverlap(a, b) { return overlap(canonicalSync(a), canonicalSync(b)); }
function destinationDevice(input) {
  let current = path.resolve(input);
  while (true) {
    try { return fs.statSync(current).dev; } catch (error) {
      if (error.code !== 'ENOENT' || path.dirname(current) === current) throw error;
      current = path.dirname(current);
    }
  }
}
function conflictsWithActive(destDir, sourceDirs = []) {
  const target = path.resolve(destDir);
  const conflictsWithCopy = [...activeJobs.values()].some(({ item }) => {
    const active = path.resolve(item.destDir);
    return pathsOverlap(active, target) ||
      sourceDirs.some(source => pathsOverlap(source, active)) ||
      item.sourceDirs.some(source => pathsOverlap(source, target));
  });
  if (conflictsWithCopy) return true;
  const device = destinationDevice(target);
  const comparisonsOnDevice = compareController && comparisonItem?.operation === 'reconcile' && [comparisonItem.leftRoot,comparisonItem.rightRoot].some(root => destinationDevice(root) === device) ? 1 : 0;
  if ([...activeJobs.values()].filter(({ item }) => destinationDevice(item.destDir) === device).length + comparisonsOnDevice >= 2) return true;
  if (!compareController || !comparisonItem) return false;
  const roots = [comparisonItem.leftRoot, comparisonItem.rightRoot];
  return roots.some(root => pathsOverlap(root, target) ||
    (comparisonItem.operation === 'reconcile' &&
      sourceDirs.some(source => pathsOverlap(root, source))));
}
function makeItem(sourceDirs, destDir, description, mode) {
  return {
    id: crypto.randomUUID(), sourceDirs: sourceDirs.map(canonicalSync), destDir: canonicalSync(destDir),
    expectedDestination: snapshot(fs.statSync(canonicalSync(destDir))),
    expectedSources: sourceDirs.map(source => snapshot(fs.statSync(canonicalSync(source)))),
    description: typeof description === 'string' && description.length < 500
      ? description : `Copia ${sourceDirs.length} cartella/e → ${destDir}`,
    mode, status: 'pending', progress: 0, filesProcessed: 0, totalFiles: 0,
    addedAt: new Date().toISOString()
  };
}
function scheduleQueue() {
  if (!queueRunning || quitting) return;
  while (activeOperationCount() < MAX_ACTIVE_OPERATIONS && copyQueue.length) {
    const index = copyQueue.findIndex(item =>
      !(item.waitFor || []).some(id => activeJobs.has(id) ||
        (compareController && comparisonItem?.id === id)) &&
      !conflictsWithActive(item.destDir, item.sourceDirs));
    if (index < 0) break;
    const [next] = copyQueue.splice(index, 1);
    startJob(next);
  }
  if (!copyQueue.length) {
    queueRunning = false;
    updateQueue();
    send('queue-empty');
  }
}
function startJob(item) {
  const controller = new AbortController();
  const job = { item, controller, paused: false, pausedAt: null, pausedMs: 0 };
  activeJobs.set(item.id, job);
  item.status = 'processing';
  item.startedAt = new Date().toISOString();
  updateQueue();
  send('queue-item-started', item);
  sendLog('INFO', `Avvio ${item.description}`);
  let lastProgress = 0;
  let lastPhase = '';
  let lastSentTransferred = 0;
  let transferStartedAt = null;
  let observedTransferred = 0;
  const waitIfPaused = async signal => {
    if (job.paused && job.item.status !== 'paused') {
      job.item.status = 'paused';
      job.pausedAt = Date.now();
      updateQueue();
    }
    while (job.paused) {
      if (signal.aborted) throw new Error('Operazione annullata');
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (job.pausedAt !== null) {
      job.pausedMs += Date.now() - job.pausedAt;
      job.pausedAt = null;
    }
  };
  job.task = Promise.resolve().then(() => {
    if (item.expectedDestination && !matches(item.expectedDestination, snapshot(fs.statSync(item.destDir)), true)) throw new Error('Il disco di destinazione è cambiato. Selezionalo di nuovo.');
    for (let i=0; i<item.sourceDirs.length; i++) if (item.expectedSources?.[i] && !matches(item.expectedSources[i], snapshot(fs.statSync(item.sourceDirs[i])), true)) throw new Error('Il disco sorgente è cambiato. Selezionalo di nuovo.');
    return runCopy({
    sourceDirs: item.sourceDirs, destDir: item.destDir, policy: item.policy || 'replace', onlyPaths: item.onlyPaths, signal: controller.signal,
    mediaSeparation: mediaSettings.mediaSeparation,
    waitIfPaused,
    onLog: (level, message) => sendLog(level, `[${item.description}] ${message}`),
    onProgress: progress => {
      const now = Date.now();
      const transferred = progress.transferredBytes || 0;
      observedTransferred = Math.max(observedTransferred, transferred);
      if (observedTransferred > 0 && transferStartedAt === null) transferStartedAt = now;
      const activeMs = transferStartedAt === null ? 0 :
        now - transferStartedAt - job.pausedMs - (job.pausedAt === null ? 0 : now - job.pausedAt);
      const averageSpeedBytesPerSec = activeMs >= 2000
        ? observedTransferred / (activeMs / 1000) : null;
      if (now - lastProgress < 120 && progress.phase === lastPhase &&
          transferred <= lastSentTransferred && progress.filesProcessed !== progress.totalFiles) return;
      lastProgress = now;
      lastPhase = progress.phase;
      lastSentTransferred = Math.max(lastSentTransferred, transferred);
      const percentage = Math.max(item.progress || 0, Math.min(99, progress.percentage || 0));
      const data = { ...progress, id: item.id, percentage,
        averageSpeedBytesPerSec };
      item.progress = percentage;
      item.filesProcessed = progress.filesProcessed || 0;
      item.totalFiles = progress.totalFiles || progress.filesFound || 0;
      send('copy-progress', data);
      send('queue-progress', data);
    }
  });
  }).then(report => finishJob(item, report), error => {
      const report = error.report || { copied: 0, skipped: 0, failures: [] };
      report.status = controller.signal.aborted ? 'cancelled' : 'failed';
      report.failures = [...(report.failures || []), { path: '', reason: error.message }];
      sendLog(report.status === 'cancelled' ? 'CANCEL' : 'ERROR', error.message);
      return finishJob(item, report);
    }).catch(error => sendLog('ERROR', `Impossibile completare il report: ${error.message}`)).finally(() => { jobTasks.delete(job.task); updatePowerProtection(); });
  jobTasks.add(job.task);
  return item.id;
}
async function finishJob(item, report) {
  const job = activeJobs.get(item.id);
  if (!job) return;
  activeJobs.delete(item.id);
  const completedAt = new Date().toISOString();
  try {
    const { directory } = await managedDirectory(app.getPath('userData'), 'reports', { create: true });
    const file = path.join(directory, `SecureCopy-verifica-${item.id}.json`);
    const temp = `${file}.tmp`;
    const document = {
      schema: 'SecureCopy verification report v1', id: item.id,
      sourceDirs: item.sourceDirs, destination: item.destDir, policy: item.policy || 'replace',
      startedAt: item.startedAt, completedAt, status: report.status,
      summary: { totalFiles: report.totalFiles || 0, copied: report.copied || 0,
        skipped: report.skipped || 0, kept: report.kept || 0, failures: report.failures || [], warnings: report.warnings || [] },
      files: report.verifiedFiles || []
    };
    await fs.promises.writeFile(temp, JSON.stringify(document, null, 2), { flag: 'wx', mode: 0o600 });
    await fs.promises.rename(temp, file);
    rememberReport(item.id, file);
    sendLog('INFO', `Report SHA-256: ${file}`);
  } catch (error) {
    sendLog('WARNING', `Report di verifica non salvato: ${error.message}`);
    if (report.status === 'completed') report.status = 'partial';
    report.failures = [...(report.failures || []), { path: '', reason: `Report non salvato: ${error.message}` }];
  }
  item.status = report.status;
  item.progress = report.status === 'completed' ? 100 : Math.min(99, item.progress || 0);
  item.completedAt = completedAt;
  item.filesCopied = report.copied || 0;
  item.filesSkipped = report.skipped || 0;
  item.filesFailed = report.failures?.length || 0;
  const { verifiedFiles, ...summary } = report;
  item.result = { ...summary, reportPath: completedReports.get(item.id) || null };
  if (quitting && report.status === 'cancelled') {
    // before-quit saves active jobs, but the final queue update must not erase
    // them as cancellation finishes. Recovery rechecks existing bytes on restart.
    const { result, reportId, ...recoverable } = item;
    if (!pendingCopyRecovery.some(saved => saved.id === item.id)) pendingCopyRecovery.push({ ...recoverable, status: 'pending', recovered: true });
  }
  completedJobs.unshift(item);
  if (completedJobs.length > 20) completedJobs.pop();
  send('queue-item-completed', { ...item, result: item.result });
  send('copy-finished', { ...item.result, id: item.id, description: item.description });
  sendLog(report.status === 'completed' ? 'COMPLETE' : 'WARNING',
    `${item.description}: ${report.status}, ${item.filesCopied} copiati, ${item.filesSkipped} già validi, ${item.filesFailed} problemi.`);
  if (mediaSettings.soundAlerts !== false) {
    if (report.status === 'completed' && (!report.failures || !report.failures.length)) {
      send('play-completion-sound', 'Assets/SOUND.mp3');
    } else if (process.platform === 'darwin') {
      require('child_process').execFile('/usr/bin/afplay', ['/System/Library/Sounds/Sosumi.aiff'], () => {});
    }
  }
  if (mediaSettings.autoEject === true && report.status === 'completed' && (!report.failures || !report.failures.length) && process.platform === 'darwin') {
    for (const src of (item.sourceDirs || [])) {
      if (typeof src === 'string' && src.startsWith('/Volumes/')) {
        const mountPoint = src.split(path.sep).slice(0, 3).join(path.sep);
        require('child_process').execFile('/usr/sbin/diskutil', ['eject', mountPoint], () => {
          sendLog('INFO', `Supporto ${path.basename(mountPoint)} espulso in sicurezza.`);
        });
      }
    }
  }
  if (mediaSettings.telegramEnabled && mediaSettings.telegramBotToken && mediaSettings.telegramChatId) {
    const text = formatCopyCompletionMessage(item, report);
    sendTelegramMessage(mediaSettings.telegramBotToken, mediaSettings.telegramChatId, text).then(res => {
      if (res && res.ok) {
        sendLog('INFO', 'Notifica Telegram inviata con successo.');
      } else {
        sendLog('WARNING', `Notifica Telegram non riuscita: ${res?.error || 'errore sconosciuto'}`);
      }
    }).catch(err => {
      sendLog('WARNING', `Notifica Telegram fallita: ${err.message}`);
    });
  }
  updateQueue();
  scheduleQueue();
}
handle('open-report', id => {
  const file = completedReports.get(id);
  if (!file) return false;
  shell.showItemInFolder(file);
  return true;
});
handle('export-dit-report', async id => {
  let reportPath = completedReports.get(id);
  if (!reportPath) {
    const { directory } = await managedDirectory(app.getPath('userData'), 'reports', { create: true });
    const direct = path.join(directory, `SecureCopy-verifica-${id}.json`);
    if (fs.existsSync(direct)) reportPath = direct;
  }
  if (!reportPath || !fs.existsSync(reportPath)) {
    throw new Error('Report di verifica non trovato per questa operazione.');
  }
  const reportData = JSON.parse(await fs.promises.readFile(reportPath, 'utf8'));
  const { directory } = await managedDirectory(app.getPath('userData'), 'reports', { create: true });
  return await exportDITReportPDF(reportData, BrowserWindow, shell, directory);
});
handle('open-copy-destination', async id => {
  const item = completedJobs.find(job => job.id === id);
  if (!item || item.kind === 'compare' || typeof item.destDir !== 'string') return false;
  const root = path.resolve(item.destDir);
  let directory = root;
  if (item.sourceDirs.length === 1) {
    const copiedFolder = path.join(root, path.basename(item.sourceDirs[0]));
    if ((await fs.promises.stat(copiedFolder).catch(() => null))?.isDirectory()) directory = copiedFolder;
  }
  const error = await shell.openPath(directory);
  if (error) throw new Error(error);
  return true;
});
handle('open-reports-folder', async () => {
  const { directory } = await managedDirectory(app.getPath('userData'), 'reports', { create: true });
  await shell.openPath(directory);
  return true;
});
handle('retry-copy', id => {
  const previous = completedJobs.find(item => item.id === id);
  if (!previous || previous.kind === 'compare' || previous.status === 'completed') throw new Error('Nessuna copia da riprovare.');
  const item = makeItem(previous.sourceDirs, previous.destDir, previous.description, 'now');
  item.policy = previous.policy || 'replace';
  if (previous.status === 'partial') {
    item.onlyPaths = (previous.result?.failures || []).map(failure => {
      if (!failure.path) return null;
      if (!path.isAbsolute(failure.path)) return failure.path;
      for (const source of item.sourceDirs) {
        if (pathsOverlap(source, failure.path)) return path.join(path.basename(source), path.relative(source, failure.path));
      }
      if (pathsOverlap(item.destDir, failure.path)) return path.relative(item.destDir, failure.path);
      return null;
    }).filter(Boolean);
    if (!item.onlyPaths.length) throw new Error('Nessun file specifico da recuperare. Controlla il report e avvia una nuova copia per verificare il materiale.');
  }
  if (activeOperationCount() < MAX_ACTIVE_OPERATIONS && !conflictsWithActive(item.destDir,item.sourceDirs)) startJob(item);
  else { copyQueue.push(item); queueRunning=true; updateQueue(); }
  return item.id;
});
handle('start-copy', (sourceDirs, destDir, description) => {
  validatePaths(sourceDirs, destDir);
  if (activeOperationCount() >= MAX_ACTIVE_OPERATIONS) throw new Error('Sono già in corso dieci operazioni. Aggiungi questa copia alla coda.');
  if (conflictsWithActive(destDir, sourceDirs)) throw new Error('La destinazione o la sorgente è già usata da una copia attiva.');
  const item = makeItem(sourceDirs, destDir, description, 'now');
  return startJob(item);
});
handle('start-batch', (sourceDirs, destDirs, mode, policy = 'replace') => {
  if (!['replace', 'skip', 'both'].includes(policy)) throw new Error('Politica di copia non valida.');
  if (!Array.isArray(destDirs) || !destDirs.length ||
      !['now', 'after'].includes(mode)) throw new Error('Destinazioni o modalità non valide.');
  destDirs.forEach(destDir => validatePaths(sourceDirs, destDir));
  const resolved = destDirs.map(canonicalSync);
  if (new Set(resolved).size !== resolved.length) throw new Error('Le destinazioni devono essere diverse.');
  const items = destDirs.map(destDir => makeItem(sourceDirs, destDir,
    `Copia ${sourceDirs.length > 1 ? `${sourceDirs.length} elementi` : path.basename(sourceDirs[0])} → ${destDir}`, mode));
  for (const item of items) item.policy = policy;
  if (mode === 'after') {
    const waitFor = [...activeJobs.keys(), ...(compareController ? [comparisonItem.id] : [])];
    for (const item of items) item.waitFor = waitFor;
  }
  for (const item of items) {
    if (mode === 'now' && activeOperationCount() < MAX_ACTIVE_OPERATIONS &&
        !conflictsWithActive(item.destDir, item.sourceDirs)) startJob(item);
    else copyQueue.push(item);
  }
  if (mode === 'now' || activeOperationCount()) queueRunning = true;
  updateQueue();
  return items.map(item => ({ id: item.id, status: item.status, destDir: item.destDir }));
});
handle('add-to-queue', (sourceDirs, destDir, description) => {
  validatePaths(sourceDirs, destDir);
  const item = makeItem(sourceDirs, destDir, description, 'after');
  item.waitFor = [...activeJobs.keys(), ...(compareController ? [comparisonItem.id] : [])];
  copyQueue.push(item);
  updateQueue();
  send('queue-item-added', item);
  if (activeOperationCount()) queueRunning = true;
  return item.id;
});
handle('start-queue', () => {
  if (!copyQueue.length) return false;
  queueRunning = true;
  scheduleQueue();
  return true;
});
handle('clear-completed', () => {
  completedJobs.length = 0;
  if (comparisonItem && comparisonItem.status !== 'processing') comparisonItem = null;
  updateQueue();
  return true;
});
handle('remove-from-queue', id => {
  const index = copyQueue.findIndex(item => item.id === id);
  if (index < 0) return false;
  copyQueue.splice(index, 1);
  updateQueue();
  return true;
});
handle('clear-queue', () => {
  copyQueue = [];
  queueRunning = false;
  updateQueue();
  send('queue-cleared');
  return true;
});
handle('pause-queue', id => {
  if (comparisonItem?.id === id && compareController) { comparisonItem.paused = true; updateQueue(); return true; }
  const job = activeJobs.get(id);
  if (!job) return false;
  job.paused = true;
  job.item.status = 'pausing';
  updateQueue();
  send('queue-paused', { id });
  return true;
});
handle('resume-queue', id => {
  if (comparisonItem?.id === id && compareController) { comparisonItem.paused = false; updateQueue(); return true; }
  const job = activeJobs.get(id);
  if (!job) return false;
  job.paused = false;
  job.item.status = 'processing';
  updateQueue();
  send('queue-resumed', { id });
  return true;
});
handle('cancel-copy', id => {
  if (comparisonItem?.id === id && compareController) { compareController.abort(); return true; }
  const job = activeJobs.get(id);
  if (!job) return false;
  job.controller.abort();
  sendLog('CANCEL', `Interruzione richiesta: ${job.item.description}`);
  return true;
});
handle('reorder-queue', (id, direction) => {
  const index = copyQueue.findIndex(item => item.id === id);
  const next = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || next < 0 || next >= copyQueue.length) return false;
  [copyQueue[index], copyQueue[next]] = [copyQueue[next], copyQueue[index]];
  updateQueue();
  return true;
});

async function saveComparisonReport(result, copied = [], failures = [], status = failures.length ? 'partial' : 'completed') {
  const reportId = crypto.randomUUID();
  const { directory } = await managedDirectory(app.getPath('userData'), 'reports', { create: true });
  const reportPath = path.join(directory, `SecureCopy-confronto-${reportId}.json`);
  const temp = `${reportPath}.tmp`;
  const compact = item => item && ({ type: item.type, sha256: item.hash || null,
    metadata: item.metadata || null, error: item.error || null });
  const header = {
    schema: 'SecureCopy comparison report v1', id: reportId, mode: result.mode, exclusions: result.exclusions, analyzedAt: result.analyzedAt, incremental: result.incremental || false,
    leftRoot: result.leftRoot, rightRoot: result.rightRoot,
    completedAt: new Date().toISOString(), status, verdict: result.verdict,
    summary: result.summary, copied, failures
  };
  // Bound report serialization memory even for hundreds of thousands of rows.
  const handle = await fs.promises.open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(header).slice(0, -1) + ',"entries":[');
    for (let offset = 0; offset < result.entries.length; offset += 256) {
      const rows = result.entries.slice(offset, offset + 256).map(entry => JSON.stringify({
        ...entry, left: compact(result.left.get(entry.relative)), right: compact(result.right.get(entry.relative))
      }));
      await handle.writeFile((offset ? ',' : '') + rows.join(','));
    }
    await handle.writeFile(']}\n');
  } finally { await handle.close(); }
  await fs.promises.rename(temp, reportPath);
  rememberReport(reportId, reportPath);
  return { reportId, reportPath };
}
function beginComparison(kind, leftRoot, rightRoot) {
  if (kind === 'reconcile' && [leftRoot,rightRoot].some(root => [...activeJobs.values()].filter(({ item }) => destinationDevice(item.destDir) === destinationDevice(root)).length >= 2)) throw new Error('Due copie sono già attive su questo disco. Attendi che una termini.');
  if (compareController) throw new Error('È già in corso un confronto cartelle.');
  if (activeOperationCount() >= MAX_ACTIVE_OPERATIONS) {
    throw new Error('Sono già in corso dieci operazioni. Attendi che una termini.');
  }
  if ([...activeJobs.values()].some(({ item }) =>
    [leftRoot, rightRoot].some(root => pathsOverlap(root, item.destDir) ||
      (kind === 'reconcile' && item.sourceDirs.some(source => pathsOverlap(root, source)))))) {
    throw new Error('Una copia attiva usa una cartella del confronto. Attendi che termini per evitare risultati incoerenti.');
  }
  if (comparisonItem && comparisonItem.status !== 'processing') {
    completedJobs.unshift({ ...comparisonItem });
    if (completedJobs.length > 20) completedJobs.pop();
  }
  const controller = new AbortController();
  controller.completion = new Promise(resolve => { controller.finish = resolve; });
  compareController = controller;
  comparisonItem = {
    id: crypto.randomUUID(), kind: 'compare', operation: kind, leftRoot: canonicalSync(leftRoot), rightRoot: canonicalSync(rightRoot), mode: compareSession?.mode || 'quick',
    description: `${kind === 'reconcile' ? 'Allineamento' : 'Confronto'}: ${path.basename(leftRoot)} ↔ ${path.basename(rightRoot)}`,
    status: 'processing', progress: 0, phase: 'inventory',
    startedAt: new Date().toISOString()
  };
  updateQueue();
  return controller;
}
function reportComparisonProgress(progress) {
  let percentage = progress.percentage;
  if (comparisonItem.operation === 'reconcile') {
    if (progress.step === 'precheck') percentage = progress.phase === 'inventory' ? 0 : Math.floor((progress.percentage || 0) * 0.15);
    else if (progress.phase === 'file-copy') percentage = 15 + Math.floor((progress.total ? (progress.count + (progress.filePercentage || 0) / 100) / progress.total : 0) * 75);
    else if (progress.phase === 'reconcile') percentage = 15 + Math.floor((progress.total ? progress.count / progress.total : 1) * 75);
    else if (progress.step === 'verify') percentage = progress.phase === 'inventory' ? 90 : 90 + Math.floor((progress.percentage || 0) * 0.09);
  } else if (progress.phase === 'inventory') percentage = 0;
  percentage = Math.max(comparisonItem.progress, Math.min(99, percentage ?? comparisonItem.progress));
  if (comparisonRecovery && progress.phase === 'reconcile' && ['verified', 'created'].includes(progress.outcome)) {
    comparisonRecovery.decisions = comparisonRecovery.decisions.filter(choice => choice.relative !== progress.current);
    saveComparisonRecovery();
  }
  comparisonItem.progress = percentage;
  comparisonItem.phase = progress.phase;
  comparisonItem.current = progress.current || '';
  comparisonItem.processedItems = progress.processedItems;
  comparisonItem.totalItems = progress.totalItems;
  send('compare-progress', { ...progress, percentage });
  send('queue-progress', { ...progress, id: comparisonItem.id, percentage });
}

function finishComparison(controller, error = null) {
  if (error) {
    comparisonItem.status = controller.signal.aborted ? 'cancelled' : 'failed';
    comparisonItem.error = error.message;
  }
  comparisonItem.completedAt = new Date().toISOString();
  compareController = null;
  publishComparisonRecovery();
  updateQueue();
  scheduleQueue();
  controller.finish?.();
}
handle('compare-folders', async (leftRoot, rightRoot, mode = 'quick', exclusions = []) => {
  if (typeof leftRoot !== 'string' || typeof rightRoot !== 'string') throw new Error('Seleziona due cartelle.');
  const controller = beginComparison('analyze', leftRoot, rightRoot);
  compareSession = null;
  let operationError = null;
  try {
    const result = await compareFolders(leftRoot, rightRoot, {
      mode, exclusions,
      signal: controller.signal,
      onProgress: reportComparisonProgress
    });
    compareSession = result;
    comparisonItem.mode = result.mode;
    comparisonItem.status = 'completed';
    comparisonItem.verdict = result.verdict;
    comparisonItem.progress = 100;
    try {
      const saved = await saveComparisonReport(result);
      Object.assign(comparisonItem, saved);
      return JSON.stringify({ ...forRenderer(result), ...saved });
    } catch (error) {
      sendLog('WARNING', `Report confronto non salvato: ${error.message}`);
      return JSON.stringify(forRenderer(result));
    }
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    finishComparison(controller, operationError);
  }
});
handle('get-comparison-recovery', availableComparisonRecovery);
handle('dismiss-comparison-recovery', () => {
  comparisonRecovery = null;
  if (recoveryStore) {
    try {
      fs.rmSync(recoveryStore, { force: true });
    } catch (err) {
      sendLog('WARNING', `Impossibile rimuovere ripresa confronto: ${err.message}`);
    }
  }
  publishComparisonRecovery();
  return true;
});
handle('pause-comparison', paused => {
  if (!compareController || comparisonItem.operation !== 'reconcile') return false;
  comparisonItem.paused = paused === true;
  updateQueue();
  return true;
});
handle('preview-comparison', async (decisions, policy) => {
  if (!compareSession || !Array.isArray(decisions)) throw new Error('Confronto non disponibile.');
  decisions = expandComparisonDecisions(compareSession, decisions);
  const index = new Map(compareSession.entries.map(entry => [entry.relative, entry]));
  const required = { left: 0, right: 0 };
  for (const decision of decisions) {
    const entry = index.get(decision.relative);
    if (!entry || !['left','right'].includes(decision.keep) || !(decision.keep==='left' ? entry.leftExists : entry.rightExists)) throw new Error('Scelta non valida.');
    if (policy === 'skip' && entry.leftExists && entry.rightExists) continue;
    required[decision.keep==='left'?'right':'left'] += (decision.keep==='left'?entry.leftDetails:entry.rightDetails)?.size || 0;
  }
  const result = [];
  for (const side of ['left','right']) {
    if (!required[side]) continue;
    const root = side==='left'?compareSession.leftRoot:compareSession.rightRoot;
    const stats = await fs.promises.statfs(root);
    const available = stats.bavail * stats.bsize;
    if (available < required[side]) throw new Error(`Spazio insufficiente in ${side==='left'?'sorgente':'destinazione'}.`);
    const parts = root.split(path.sep);
    result.push({side, volume:parts[1]==='Volumes'?parts[2]:path.parse(root).root, available, bytes:required[side]});
  }
  return result;
});
handle('cancel-compare', () => {
  if (!compareController) return false;
  compareController.abort();
  return true;
});
handle('reconcile-folders', async (decisions, selectedOnly = false, policy = 'replace') => {
  if (!['replace', 'skip', 'both'].includes(policy)) throw new Error('Politica di copia non valida.');
  if (!compareSession) throw new Error('Esegui prima il confronto.');
  const session = compareSession;
  decisions = expandComparisonDecisions(session, decisions);
  const roots = [session.leftRoot, session.rightRoot];
  if ([...activeJobs.values()].some(({ item }) =>
    roots.some(root => pathsOverlap(root, item.destDir) ||
      item.sourceDirs.some(source => pathsOverlap(root, source))))) {
    throw new Error('Una copia in corso usa queste cartelle. Attendi che termini prima di allinearle.');
  }
  const controller = beginComparison('reconcile', session.leftRoot, session.rightRoot);
  let operationError = null;
  comparisonRecovery = { leftRoot: session.leftRoot, rightRoot: session.rightRoot, mode: session.mode, exclusions: session.exclusions, policy, decisions: selectedOnly ? decisions : session.entries.filter(entry => entry.status === 'missing' && entry.copyable).map(entry => ({ relative: entry.relative, keep: entry.leftExists ? 'left' : 'right' })).concat(decisions) };
  saveComparisonRecovery(true);
  try {
    const { comparison, copied, failures, status } = await reconcileFolders(session, decisions, {
      policy,
      waitIfPaused: async signal => { while (comparisonItem?.paused) { if (signal.aborted) throw new Error('Operazione annullata'); await new Promise(resolve => setTimeout(resolve, 150)); } },
      selectedOnly: selectedOnly === true,
      signal: controller.signal,
      onProgress: reportComparisonProgress
    });
    compareSession = comparison;
    if (status === 'completed') comparisonRecovery = null;
    saveComparisonRecovery(true);
    comparisonItem.status = status || (failures.length ? 'partial' : 'completed');
    comparisonItem.verdict = comparison.verdict;
    comparisonItem.progress = 100;
    let saved = {};
    try {
      saved = await saveComparisonReport(comparison, copied, failures, status);
    } catch (error) {
      failures.push({ path: '', reason: `Report non salvato: ${error.message}` });
      if (comparisonItem.status === 'completed') comparisonItem.status = 'partial';
    }
    Object.assign(comparisonItem, saved);
    return JSON.stringify({ ...forRenderer(comparison), copied, failures, status: comparisonItem.status, ...saved });
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    saveComparisonRecovery(true);
    finishComparison(controller, operationError);
  }
});
handle('open-versions', async (relative, side) => {
  if (!compareSession || !['left','right'].includes(side)) throw new Error('Confronto non disponibile.');
  const entry = (side==='left'?compareSession.left:compareSession.right).get(relative);
  if (!entry) return false;
  const directory = path.join(path.dirname(entry.path), '.securecopy-versions');
  const stats = await fs.promises.lstat(directory).catch(() => null);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) return false;
  const error = await shell.openPath(directory);
  if (error) throw new Error(error);
  return true;
});
handle('compare-context-menu', relative => {
  if (!compareSession || typeof relative !== 'string') return false;
  const left = compareSession.left.get(relative);
  const right = compareSession.right.get(relative);
  const template = [];
  if (left) template.push({ label: uiLanguage === 'en' ? 'Show source file in Finder' : 'Mostra file sorgente nel Finder',
    click: () => shell.showItemInFolder(left.path) });
  if (right) template.push({ label: uiLanguage === 'en' ? 'Show destination file in Finder' : 'Mostra file destinazione nel Finder',
    click: () => shell.showItemInFolder(right.path) });
  if (!template.length) return false;
  Menu.buildFromTemplate(template).popup({ window: mainWindow });
  return true;
});

module.exports = { getBackgroundService: () => backgroundService, getMainWindow: () => mainWindow };
