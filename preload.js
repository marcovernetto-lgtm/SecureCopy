const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Folder selection
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    selectMultipleFolders: () => ipcRenderer.invoke('dialog:openMultipleDirectories'),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    getBackgroundSettings: () => ipcRenderer.invoke('get-background-settings'),
    getMediaSettings: () => ipcRenderer.invoke('get-media-settings'),
    setMediaSettings: (settings) => ipcRenderer.invoke('set-media-settings', settings),
    detectTelegramChatId: (token) => ipcRenderer.invoke('detect-telegram-chat-id', token),
    testTelegramNotification: (botToken, chatId) => ipcRenderer.invoke('test-telegram-notification', { botToken, chatId }),
    setLoginStartup: enabled => ipcRenderer.invoke('set-login-startup', enabled),
    setDiskNotices: enabled => ipcRenderer.invoke('set-disk-notices', enabled),
    onBackgroundSettingsUpdated: callback => ipcRenderer.on('background-settings-updated', (_event, settings) => callback(settings)),
    onDiskImportRequested: callback => ipcRenderer.on('disk-import-requested', (_event, request) => callback(request)),
    getReportRetention: () => ipcRenderer.invoke('get-report-retention'),
    setReportRetention: days => ipcRenderer.invoke('set-report-retention', days),
    setLanguage: (language) => ipcRenderer.invoke('set-language', language),

    getPendingCopyRecoveryCount: () => ipcRenderer.invoke('get-pending-copy-recovery-count'),
    recoverPendingCopies: () => ipcRenderer.invoke('recover-pending-copies'),
    retryCopy: id => ipcRenderer.invoke('retry-copy', id),
    startCopy: (sourcePaths, destPath, description) => ipcRenderer.invoke('start-copy', sourcePaths, destPath, description),
    startBatch: (sourcePaths, destPaths, mode, policy) => ipcRenderer.invoke('start-batch', sourcePaths, destPaths, mode, policy),
    cancelCopy: (id) => ipcRenderer.invoke('cancel-copy', id),
    openCopyDestination: (id) => ipcRenderer.invoke('open-copy-destination', id),
    openReport: (id) => ipcRenderer.invoke('open-report', id),
    exportDITReport: (id) => ipcRenderer.invoke('export-dit-report', id),
    openReportsFolder: () => ipcRenderer.invoke('open-reports-folder'),
    saveActivityLog: messages => ipcRenderer.invoke('save-activity-log', messages),
    // JSON crosses the isolated-world bridge without recursively freezing every result object.
    compareFolders: (left, right, mode, exclusions) => ipcRenderer.invoke('compare-folders', left, right, mode, exclusions),
    reconcileFolders: (decisions, selectedOnly, policy) => ipcRenderer.invoke('reconcile-folders', decisions, selectedOnly, policy),
    openVersions: (relative, side) => ipcRenderer.invoke('open-versions', relative, side),
    getComparisonRecovery: () => ipcRenderer.invoke('get-comparison-recovery'),
    onComparisonRecoveryUpdated: callback => ipcRenderer.on('comparison-recovery-updated', (_event, recovery) => callback(recovery)),
    previewComparison: (decisions, policy) => ipcRenderer.invoke('preview-comparison', decisions, policy),
    pauseComparison: paused => ipcRenderer.invoke('pause-comparison', paused),
    cancelCompare: () => ipcRenderer.invoke('cancel-compare'),
    showCompareContextMenu: (relative) => ipcRenderer.invoke('compare-context-menu', relative),
    onCompareProgress: (callback) => ipcRenderer.on('compare-progress', (_event, data) => callback(data)),

    // Queue operations
    addToQueue: (sourcePaths, destPath, description) => ipcRenderer.invoke('add-to-queue', sourcePaths, destPath, description),
    removeFromQueue: (queueId) => ipcRenderer.invoke('remove-from-queue', queueId),
    clearQueue: () => ipcRenderer.invoke('clear-queue'),
    clearCompleted: () => ipcRenderer.invoke('clear-completed'),
    pauseQueue: (id) => ipcRenderer.invoke('pause-queue', id),
    resumeQueue: (id) => ipcRenderer.invoke('resume-queue', id),
    startQueue: () => ipcRenderer.invoke('start-queue'),
    reorderQueue: (itemId, direction) => ipcRenderer.invoke('reorder-queue', itemId, direction),

    // Event listeners
    onCopyLog: (callback) => ipcRenderer.on('copy-log', (event, data) => callback(data)),
    onCopyProgress: (callback) => ipcRenderer.on('copy-progress', (event, data) => callback(data)),
    onCopyFinished: (callback) => ipcRenderer.on('copy-finished', (_event, result) => callback(result)),
    onPlayCompletionSound: (callback) => ipcRenderer.on('play-completion-sound', (event, soundPath) => callback(soundPath)),
    onAppError: (callback) => ipcRenderer.on('app-error', (event, error) => callback(error)),

    // Queue event listeners
    onQueueUpdated: (callback) => ipcRenderer.on('queue-updated', (event, queue) => callback(queue)),
    onQueueItemStarted: (callback) => ipcRenderer.on('queue-item-started', (event, item) => callback(item)),
    onQueueItemCompleted: (callback) => ipcRenderer.on('queue-item-completed', (event, item) => callback(item)),
    onQueueProgress: (callback) => ipcRenderer.on('queue-progress', (event, data) => callback(data)),
    onQueueEmpty: (callback) => ipcRenderer.on('queue-empty', () => callback()),
    onQueuePaused: (callback) => ipcRenderer.on('queue-paused', () => callback()),
    onQueueResumed: (callback) => ipcRenderer.on('queue-resumed', () => callback()),
    onQueueCleared: (callback) => ipcRenderer.on('queue-cleared', () => callback()),

    // Auto-update
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
    onUpdateStatusChanged: (callback) => ipcRenderer.on('update-status-changed', (_event, data) => callback(data)),

    // Utility functions
    isElectron: true,
    platform: process.platform,
    version: process.versions.electron
});
