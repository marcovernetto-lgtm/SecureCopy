/**
 * SecureCopy Renderer Process
 * Handles UI interactions, updates, and communication with the main process.
 */

// DOM Elements
const sourceBtn = document.getElementById('source-btn');
const sourceMultiBtn = document.getElementById('source-multi-btn');
const destBtn = document.getElementById('dest-btn');
const startBtn = document.getElementById('start-btn');
const cancelBtn = document.getElementById('cancel-btn');
const sourcePathEl = document.getElementById('source-path');
const destPathEl = document.getElementById('dest-path');
const logContainer = document.getElementById('log-container');
const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressDetails = document.getElementById('progress-details');
const progressPercentage = document.getElementById('progress-percentage');
const progressStatus = document.getElementById('progress-status');
const progressSpeed = document.getElementById('progress-speed');
const creditsBox = document.getElementById('credits-box');
const errorOverlay = document.getElementById('error-overlay');
const errorMessage = document.getElementById('error-message');
const deviceInfoBanner = document.getElementById('device-info-banner');
const logoClick = document.getElementById('logo-click');
const creditsClose = document.getElementById('credits-close');
const printLogBtn = document.getElementById('print-log-btn');
const printLogContainer = document.getElementById('print-log-container');
const addToQueueBtn = document.getElementById('add-to-queue-btn');
const clearQueueBtn = document.getElementById('clear-queue-btn');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const newCopyBtn = document.getElementById('new-copy-btn');
const pauseQueueBtn = document.getElementById('pause-queue-btn');
const resumeQueueBtn = document.getElementById('resume-queue-btn');
const queueContainer = document.getElementById('queue-container');
const queueEmptyMessage = document.getElementById('queue-empty-message');
const queuePreviewSection = document.getElementById('queue-preview-section');
const monitorLogPanel = document.getElementById('monitor-log-panel');
const queueItems = document.getElementById('queue-items');
const startQueueBtn = document.getElementById('start-queue-btn');
const destList = document.getElementById('dest-list');
const activeCopyCount = document.getElementById('active-copy-count');
const setupScreen = document.getElementById('setup-screen');
const monitorScreen = document.getElementById('monitor-screen');
const backToSetupBtn = document.getElementById('back-to-setup-btn');
const queueCountBadge = document.getElementById('queue-count-badge');
const queuePreviewList = document.getElementById('queue-preview-list');
const copyStatusContainer = document.getElementById('copy-status-container');
const monitorNavBtn = document.getElementById('monitor-nav-btn');
const currentFileEl = document.getElementById('progress-current');
const currentFilePanel = document.getElementById('current-file-panel');
const currentFileLabel = document.getElementById('current-file-label');
const currentFileProgress = document.getElementById('current-file-progress');
const currentFileTrack = document.getElementById('current-file-track');
const currentFileBar = document.getElementById('current-file-bar');
const resultSummary = document.getElementById('result-summary');
const failureDetails = document.getElementById('failure-details');
const failureSummary = document.getElementById('failure-summary');
const failureList = document.getElementById('failure-list');
const openReportBtn = document.getElementById('open-report-btn');
const exportDITReportBtn = document.getElementById('export-dit-report-btn');
const openCopyDestinationBtn = document.getElementById('open-copy-destination-btn');
const openReportsFolderBtn = document.getElementById('open-reports-folder-btn');
const homeScreen = document.getElementById('home-screen');
const sourceList = document.getElementById('source-list');
const homeCopyBtn = document.getElementById('copy-nav-btn');
const flowCard = document.getElementById('transfer-flow-card');
const flowSourceName = document.getElementById('flow-source-name');
const flowSourcePath = document.getElementById('flow-source-path');
const flowDestName = document.getElementById('flow-dest-name');
const flowDestPath = document.getElementById('flow-dest-path');
const flowSpeedTag = document.getElementById('flow-speed-tag');
const navHomeBtn = document.getElementById('nav-home-btn');
const navCopyBtn = document.getElementById('nav-copy-btn');
const navCompareBtn = document.getElementById('nav-compare-btn');
const navOperationsBtn = document.getElementById('nav-operations-btn');
const homeActivity = document.getElementById('home-activity');
let currentScreen = 'home';
const latestProgress = new Map();


// State Variables
let sourcePaths = [];
let destPaths = [];
let copyQueue = [];
let operations = [];
let copyInProgress = false;
let focusedJobId = null;
let trackedComparisonId = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Hide specific elements on startup
    if (creditsBox) creditsBox.style.display = 'none';
    if (printLogContainer) printLogContainer.classList.add('hidden');
    const copyStatusContainer = document.getElementById('copy-status-container');
    if (copyStatusContainer) copyStatusContainer.classList.add('hidden');

    // Initialize UI
    initializeParticles();
    initializeQueueDisplay();
    renderSources();
    renderDestinations();
    updateStartButtonState();
    updateCompareActions();
    showHomeScreen();
});

// Error Handling
window.addEventListener('error', (event) => {
    try {
        console.error('JavaScript error:', event.error);
        const msg = event.error?.message || 'Errore sconosciuto';
        showError('Errore JavaScript: ' + msg);
    } catch (error) {
        console.error('Errore nella gestione errori JavaScript:', error);
    }
});

window.addEventListener('unhandledrejection', (event) => {
    try {
        console.error('Unhandled promise rejection:', event.reason);
        const msg = event.reason?.message || 'Errore sconosciuto';
        showError('Errore Promise: ' + msg);
    } catch (error) {
        console.error('Errore nella gestione promise rejection:', error);
    }
});

function showError(message) {
    if (errorMessage && errorOverlay) {
        errorMessage.textContent = cleanOperationError(message) || 'Errore sconosciuto';
        errorOverlay.classList.add('show');
    }
}

function hideError() {
    if (errorOverlay) {
        errorOverlay.classList.remove('show');
    }
}
function displayResult(result, jobId = focusedJobId) {
    if (!resultSummary) return;
    const label = { completed: 'Completata', partial: 'Parziale', failed: 'Fallita', cancelled: 'Annullata' }[result.status] || 'Terminata';
    resultSummary.textContent = `${label} — ${result.copied || 0} copiati · ${result.skipped || 0} già validi${result.kept ? ` · ${result.kept} saltati per scelta` : ''} · ${result.failures?.length || 0} problemi`;
    resultSummary.dataset.status = result.status || 'failed';
    resultSummary.classList.remove('hidden');
    document.getElementById('retry-copy-btn').classList.toggle('hidden', result.status === 'completed');
    openReportBtn?.classList.toggle('hidden', !result.reportPath);
    document.getElementById('export-dit-report-btn')?.classList.toggle('hidden', !result.reportPath);
    openCopyDestinationBtn?.classList.toggle('hidden', !jobId);
    newCopyBtn.textContent = 'Nuova copia';
    newCopyBtn?.classList.remove('hidden');
    progressStatus.textContent = label;
    progressDetails.textContent = `${(result.copied || 0) + (result.skipped || 0)} di ${result.totalFiles || 0} file verificati`;
    progressBar.dataset.status = result.status;
    const finalPercentage = result.status === 'completed' ? 100 : Math.min(99, latestProgress.get(jobId)?.percentage || 0);
    progressBar.style.width = `${finalPercentage}%`;
    progressPercentage.textContent = `${finalPercentage}%`;
    currentFilePanel?.classList.remove('hidden');
    currentFileTrack?.classList.remove('hidden');
    currentFileBar.style.transition = 'none';
    currentFileBar.style.width = '0%';
    currentFileProgress.textContent = '0%';
    currentFileEl.textContent = '';
    currentFileEl.title = '';
    updateAverageSpeed(null);
    const failures = Array.isArray(result.failures) ? result.failures : [];
    failureDetails?.classList.toggle('hidden', failures.length === 0);
    if (failureDetails) failureDetails.open = false;
    if (failureSummary) failureSummary.textContent = `${failures.length} ${failures.length === 1 ? 'elemento da controllare' : 'elementi da controllare'}`;
    failureList?.replaceChildren();
    for (const failure of failures) {
        const row = document.createElement('div');
        row.className = 'failure-row';
        const file = document.createElement('span');
        file.className = 'failure-path';
        file.textContent = failure.path || 'Operazione';
        file.title = failure.path || '';
        const reason = document.createElement('span');
        reason.className = 'failure-reason';
        reason.textContent = failure.reason || 'Motivo non disponibile';
        row.append(file, reason);
        failureList.append(row);
    }
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const metadataDetails = document.getElementById('metadata-details');
    metadataDetails.classList.toggle('hidden', warnings.length === 0);
    metadataDetails.open = false;
    document.getElementById('metadata-summary').textContent = `Avvisi sui metadati (${warnings.length})`;
    const metadataList = document.getElementById('metadata-list');
    metadataList.replaceChildren();
    for (const warning of warnings) {
        const row = document.createElement('div'); row.className = 'failure-row';
        const file = document.createElement('span'); file.className = 'failure-path'; file.textContent = warning.path || 'Operazione';
        const reason = document.createElement('span'); reason.className = 'failure-reason'; reason.textContent = warning.reason;
        row.append(file, reason); metadataList.append(row);
    }
}
function renderComparisonProgress(item) {
    document.getElementById('retry-copy-btn').classList.add('hidden');
    const label = item.operation === 'reconcile' ? 'Allineamento cartelle' : 'Confronto cartelle';
    const finished = { completed: 'Completato', partial: 'Parziale',
        failed: 'Fallito', cancelled: 'Annullato' }[item.status];
    progressStatus.textContent = finished || label;
    progressDetails.textContent = item.totalItems
        ? `${item.processedItems || 0} di ${item.totalItems} elementi analizzati`
        : item.phase === 'inventory' ? 'Censimento delle cartelle…' : label;
    progressPercentage.textContent = `${item.progress || 0}%`;
    progressBar.style.width = `${item.progress || 0}%`;
    progressBar.dataset.status = item.status;
    currentFilePanel.classList.remove('hidden');
    currentFileLabel.textContent = 'Elemento in esame';
    currentFileEl.textContent = finished ? '' : item.current || '';
    currentFileEl.title = currentFileEl.textContent;
    currentFileProgress.textContent = '';
    currentFileTrack.classList.remove('hidden');
    currentFileBar.style.transition = 'none';
    currentFileBar.style.width = '0%';
    updateAverageSpeed(null);
    newCopyBtn.textContent = 'Nuovo confronto';
    newCopyBtn.classList.toggle('hidden', !finished);
    openCopyDestinationBtn?.classList.add('hidden');
    if (finished) {
        const verdict = { perfect: item.mode === 'quick' ? 'Corrispondenza rapida' : 'Contenuti verificati', verify: 'Copia da verificare',
            missing: 'File mancanti' }[item.verdict];
        resultSummary.textContent = item.error || verdict || finished;
        resultSummary.dataset.status = item.status;
        resultSummary.classList.remove('hidden');
    } else resultSummary.classList.add('hidden');
    failureDetails?.classList.add('hidden');
    openReportBtn.classList.toggle('hidden', !item.reportId);
    document.getElementById('export-dit-report-btn')?.classList.toggle('hidden', !item.reportId || item.kind === 'compare');
}
function updateTransferFlowUI(item) {
    if (!flowCard) return;
    if (!item) {
        flowCard.classList.add('hidden');
        return;
    }
    flowCard.classList.remove('hidden');
    if (item.kind === 'compare') {
        const leftBase = item.leftRoot ? item.leftRoot.split(/[/\\]/).filter(Boolean).pop() || item.leftRoot : 'Sinistra';
        const rightBase = item.rightRoot ? item.rightRoot.split(/[/\\]/).filter(Boolean).pop() || item.rightRoot : 'Destra';
        if (flowSourceName) flowSourceName.textContent = leftBase;
        if (flowSourcePath) { flowSourcePath.textContent = item.leftRoot || ''; flowSourcePath.title = item.leftRoot || ''; }
        if (flowDestName) flowDestName.textContent = rightBase;
        if (flowDestPath) { flowDestPath.textContent = item.rightRoot || ''; flowDestPath.title = item.rightRoot || ''; }
        if (flowSpeedTag) flowSpeedTag.textContent = item.status === 'completed' ? 'Confronto verificato' : 'Analisi cartelle in corso';
    } else {
        const sources = item.sourceDirs || [];
        let srcName = 'Sorgente';
        let srcPath = '';
        if (sources.length === 1) {
            srcName = sources[0].split(/[/\\]/).filter(Boolean).pop() || sources[0];
            srcPath = sources[0];
        } else if (sources.length > 1) {
            srcName = `${sources.length} elementi`;
            srcPath = sources.map(s => s.split(/[/\\]/).filter(Boolean).pop() || s).join(', ');
        }
        const dest = item.destDir || '';
        const dstName = dest ? dest.split(/[/\\]/).filter(Boolean).pop() || dest : 'Destinazione';

        if (flowSourceName) flowSourceName.textContent = srcName;
        if (flowSourcePath) { flowSourcePath.textContent = srcPath; flowSourcePath.title = srcPath; }
        if (flowDestName) flowDestName.textContent = dstName;
        if (flowDestPath) { flowDestPath.textContent = dest; flowDestPath.title = dest; }
        if (flowSpeedTag) {
            const latest = latestProgress.get(item.id);
            if (latest?.averageSpeedBytesPerSec) {
                flowSpeedTag.textContent = `${formatBytes(latest.averageSpeedBytesPerSec)}/s · In trasferimento`;
            } else if (item.status === 'completed') {
                flowSpeedTag.textContent = 'Trasferimento completato e verificato';
            } else if (item.status === 'paused') {
                flowSpeedTag.textContent = 'In pausa';
            } else {
                flowSpeedTag.textContent = 'Flusso dati sicuro';
            }
        }
    }
}

function renderSelectedOperation(item) {
    document.getElementById('metadata-details').classList.add('hidden');
    resetProgressUI();
    updateTransferFlowUI(item);
    if (item.kind === 'compare') {
        renderComparisonProgress(item);
    } else {
        if (latestProgress.has(item.id)) {
            renderCopyProgress(latestProgress.get(item.id));
        } else if (item.status === 'processing' || item.status === 'pausing' || item.status === 'paused') {
            renderCopyProgress({
                percentage: item.progress || 0,
                filesProcessed: item.filesProcessed || 0,
                totalFiles: item.totalFiles || 0,
                phase: item.phase || 'copy',
                currentFile: item.current || item.currentFile || ''
            });
        }
        if (item.result) displayResult(item.result, item.id);
    }
}

// IPC Listeners
if (window.electronAPI) {
    window.electronAPI.onAppError((error) => {
        showError(error && error.message ? error.message : 'Errore interno dell\'applicazione');
    });

    window.electronAPI.onCopyLog((data) => {
        logMessage(data);
        if (data?.message?.includes('Dispositivo rimovibile rilevato')) {
            if (deviceInfoBanner) deviceInfoBanner.classList.remove('hidden');
            setTimeout(() => {
                if (deviceInfoBanner) deviceInfoBanner.classList.add('hidden');
            }, 10000);
        }
    });

    window.electronAPI.onCopyProgress((data) => {
        if (!data?.id) return;
        if (operations.find(item => item.id === data.id)?.result) return;
        latestProgress.set(data.id, data);
        if (data.id === focusedJobId) renderCopyProgress(data);
    });

    window.electronAPI.onCopyFinished((result = {}) => {
        if (printLogContainer) printLogContainer.classList.remove('hidden');
        if (result.id === focusedJobId) displayResult(result);
        updateBackButton();
    });

    window.electronAPI.onPlayCompletionSound((soundPath) => {
        if (soundPath) new Audio(soundPath).play().catch(console.error);
    });

    window.electronAPI.onQueueUpdated((queue) => {
        if (!Array.isArray(queue)) return;
        operations = queue;
        const currentComparison = queue.find(item => item.kind === 'compare' && item.status === 'processing');
        if (currentComparison && compareBusy && currentComparison.id !== trackedComparisonId) { focusedJobId = currentComparison.id; trackedComparisonId = currentComparison.id; }
        if (currentComparison) { comparePaused = !!currentComparison.paused; document.getElementById('compare-pause').textContent = comparePaused ? 'Riprendi' : 'Pausa dopo il file'; }
        copyQueue = queue.filter(item => item.kind !== 'compare');
        copyInProgress = copyQueue.some(item => ['processing', 'pausing', 'paused'].includes(item.status));
        if (!queue.some(item => item.id === focusedJobId)) {
            focusedJobId = queue.find(item => item.status === 'processing')?.id ||
                queue.find(item => item.status === 'pausing')?.id ||
                queue.find(item => item.status === 'paused')?.id ||
                queue.find(item => item.status === 'pending')?.id || queue[0]?.id || null;
        }
        updateQueueDisplay();
        updateQueueControls();
        updateCompareActions();
        const focused = operations.find(item => item.id === focusedJobId);
        if (focused) renderSelectedOperation(focused);
        else resetProgressUI();
        updateAnimation();
        updateBackButton();
    });
    window.electronAPI.onQueueItemStarted((item) => {
        if (!focusedJobId) focusedJobId = item.id;
        logMessage({ message: `Avvio: ${item.description}`, className: 'text-blue-400' });
        updateQueueControls();
    });
    window.electronAPI.onQueueItemCompleted((item) => {
        logMessage({ message: `${item.status === 'completed' ? 'Completata' : 'Terminata'}: ${item.description}`,
            className: item.status === 'completed' ? 'text-green-400' : 'text-orange-400' });
    });
    window.electronAPI.onQueueProgress((data) => {
        const item = operations.find(job => job.id === data?.id);
        if (item) {
            Object.assign(item, { progress: data.percentage, phase: data.phase,
                current: data.current, processedItems: data.processedItems,
                totalItems: data.totalItems, filesProcessed: data.filesProcessed,
                totalFiles: data.totalFiles });
            updateQueueItemState(item);
            if (item.id === focusedJobId) {
                if (item.kind === 'compare') renderComparisonProgress(item);
                else if (!item.result) {
                    const progressPayload = latestProgress.get(item.id) || {
                        ...data,
                        percentage: data.percentage ?? item.progress ?? 0,
                        filesProcessed: data.filesProcessed ?? item.filesProcessed ?? 0,
                        totalFiles: data.totalFiles ?? item.totalFiles ?? 0,
                        phase: data.phase || item.phase || 'copy',
                        currentFile: data.current || item.current || item.currentFile || ''
                    };
                    renderCopyProgress(progressPayload);
                }
            }
        }
    });
    window.electronAPI.onQueueEmpty(() => logMessage({ message: 'Coda completata', className: 'text-green-400' }));
    window.electronAPI.onQueuePaused(({ id }) => {
        logMessage({ message: `Pausa richiesta per ${id}`, className: 'text-orange-400' });
        updateAnimation();
    });
    window.electronAPI.onQueueResumed(() => {
        logMessage({ message: 'Copia ripresa', className: 'text-blue-400' });
        updateAnimation();
    });
    window.electronAPI.onQueueCleared(() => logMessage({ message: 'Coda svuotata', className: 'text-gray-400' }));
}

// UI Helpers
function renderCopyProgress(data) {
        const { percentage = 0, filesProcessed = 0, totalFiles = 0 } = data;
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            updateProgressBarColor(percentage);
        }
        if (progressPercentage) progressPercentage.textContent = `${percentage}%`;
        if (progressDetails) progressDetails.textContent = data.phase === 'scan'
            ? `${data.filesFound || 0} file trovati`
            : `${filesProcessed} di ${totalFiles} file esaminati`;
        currentFilePanel.classList.remove('hidden');
        currentFileTrack.classList.remove('hidden');
        currentFileLabel.textContent = 'File in corso';
        currentFileEl.textContent = data.currentFile || '';
        currentFileEl.title = data.currentFile || '';
        const reading = Boolean(data.currentFile) && data.phase !== 'copy' && data.readTotal > 0;
        const fileTotal = data.currentFile ? (reading ? data.readTotal : data.currentFileTotal || 0) : 0;
        const fileBytes = Math.min(fileTotal, reading ? data.readBytes || 0 : data.currentFileBytes || 0);
        const showFileProgress = (data.phase === 'copy' || reading) && fileTotal > 0;
        currentFileBar.style.transition = showFileProgress && fileBytes > 0 ? '' : 'none';
        currentFileBar.style.width = showFileProgress
            ? `${Math.min(100, Math.round(fileBytes / fileTotal * 100))}%` : '0%';
        currentFileProgress.textContent = showFileProgress
            ? `${reading ? (data.phase === 'verify' ? 'Verifica' : 'Controllo') + ' · ' : ''}${Math.min(100, Math.round(fileBytes / fileTotal * 100))}% · ${formatBytes(fileBytes)} / ${formatBytes(fileTotal)}`
            : data.phase === 'verify' ? 'Verifica' : data.phase === 'compare' ? 'Controllo' : '0%';
        updateAverageSpeed(data.averageSpeedBytesPerSec);
        const speedTag = document.getElementById('flow-speed-tag');
        if (speedTag) {
            if (data.averageSpeedBytesPerSec) speedTag.textContent = `${formatBytes(data.averageSpeedBytesPerSec)}/s · In trasferimento`;
            else if (data.phase === 'scan') speedTag.textContent = 'Scansione elementi…';
            else if (data.phase === 'verify') speedTag.textContent = 'Verifica SHA-256 e metadati…';
        }
        if (progressStatus) progressStatus.textContent = ({
            scan: 'Preparazione', compare: 'Controllo dei file',
            copy: 'Copia in corso', verify: 'Verifica in corso'
        })[data.phase] || 'In corso';
}

function logMessage(data) {
    if (!logContainer || !data?.message) return;

    const p = document.createElement('p');
    const timestamp = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const stamp = document.createElement('span');
    stamp.className = 'text-gray-600 mr-2';
    stamp.textContent = `[${timestamp}]`;
    p.append(stamp, document.createTextNode(` ${data.message}`));
    if (data.className) p.className = data.className;

    logContainer.appendChild(p);
    while (logContainer.children.length > 1000) logContainer.firstElementChild.remove();
    logContainer.scrollTop = logContainer.scrollHeight;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function updateProgressBarColor() {
    if (progressBar) progressBar.dataset.status = 'processing';
}

function updateStartButtonState() {
    const valid = sourcePaths.length > 0 && destPaths.length > 0 &&
        destPaths.every(dest => !sourcePaths.includes(dest));
    const activeCount = copyQueue.filter(item => ['processing', 'pausing', 'paused'].includes(item.status)).length +
        (operations.some(item => item.kind === 'compare' && item.status === 'processing') || compareBusy ? 1 : 0);
    if (startBtn) {
        startBtn.disabled = !valid || activeCount >= 10;
        startBtn.classList.toggle('btn-disabled', startBtn.disabled);
        startBtn.classList.toggle('btn-action-idle', startBtn.disabled);
        startBtn.classList.toggle('btn-start-ready', !startBtn.disabled);
        startBtn.textContent = activeCount >= 10 ? 'Dieci operazioni già in corso' :
            activeCount ? 'Avvia ora in parallelo' :
            destPaths.length > 1 ? `Avvia ${destPaths.length} copie` : 'Avvia copia';
    }
    if (addToQueueBtn) {
        addToQueueBtn.disabled = !valid;
        addToQueueBtn.classList.toggle('btn-disabled', !valid);
        addToQueueBtn.classList.toggle('btn-action-idle', !valid);
        addToQueueBtn.classList.toggle('btn-queue-ready', valid);
        addToQueueBtn.textContent = activeCount ? 'Avvia al termine delle operazioni' : 'Aggiungi alla coda';
    }
}
function renderSources() {
    sourcePathEl.textContent = sourcePaths.length
        ? `${sourcePaths.length} ${sourcePaths.length === 1 ? 'elemento selezionato' : 'elementi selezionati'}`
        : 'Nessuna sorgente selezionata';
    sourceList.replaceChildren();
    for (const source of sourcePaths) {
        const chip = document.createElement('div');
        chip.className = 'path-chip';
        chip.title = source;
        const label = document.createElement('span');
        label.textContent = source;
        const remove = document.createElement('button');
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Rimuovi ${source}`);
        remove.addEventListener('click', () => {
            sourcePaths = sourcePaths.filter(path => path !== source);
            renderSources();
            updateStartButtonState();
        });
        chip.append(label, remove);
        sourceList.append(chip);
    }
}
function renderDestinations() {
    if (destPathEl) destPathEl.textContent = destPaths.length
        ? `${destPaths.length} ${destPaths.length === 1 ? 'destinazione selezionata' : 'destinazioni selezionate'}` : 'Nessuna destinazione selezionata';
    if (!destList) return;
    destList.replaceChildren();
    destPaths.forEach(dest => {
        const chip = document.createElement('div');
        chip.className = 'destination-chip';
        chip.title = dest;
        const label = document.createElement('span');
        label.textContent = dest;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Rimuovi ${dest}`);
        remove.addEventListener('click', () => {
            destPaths = destPaths.filter(path => path !== dest);
            renderDestinations();
            updateStartButtonState();
        });
        chip.append(label, remove);
        destList.append(chip);
    });
}
function addDestination(dest) {
    if (!destPaths.includes(dest)) destPaths.push(dest);
    renderDestinations();
    updateStartButtonState();
}
function clearSelection() {
    sourcePaths = [];
    destPaths = [];
    if (sourceBtn) {
        sourceBtn.classList.remove('btn-source-active');
        sourceBtn.classList.add('btn-source-idle');
    }
    renderSources();
    renderDestinations();
    updateStartButtonState();
    updateAnimation();
}
function switchScreen(view) {
    currentScreen = view;
    window.SecureCopyAppearance?.setSection(view);
    const screens = { home: homeScreen, copy: setupScreen, monitor: monitorScreen, compare: compareScreen };
    for (const [name, element] of Object.entries(screens)) element.hidden = name !== view;
    compareScreen.style.display = view === 'compare' ? 'flex' : 'none';
    updateNavigation();
    updateAnimation();
}
function showHomeScreen() { switchScreen('home'); }
function showMonitorScreen() {
    const active = operations.find(item => ['processing','pausing','paused'].includes(item.status));
    if (active && !operations.some(item => item.id === focusedJobId && ['processing','pausing','paused'].includes(item.status))) focusedJobId = active.id;
    switchScreen('monitor');
    const focused = operations.find(item => item.id === focusedJobId);
    if (focused) renderSelectedOperation(focused);
    updateBackButton();
}
function showSetupScreen() {
    switchScreen('copy');
}
function updateNavigation() {
    const active = copyQueue.filter(item => ['processing', 'pausing', 'paused'].includes(item.status));
    const pending = copyQueue.filter(item => item.status === 'pending');
    const comparisonActive = operations.some(item => item.kind === 'compare' && item.status === 'processing') || compareBusy;
    const activeTotal = active.length + (comparisonActive ? 1 : 0);
    for (const [name, button] of Object.entries({ home: navHomeBtn, copy: navCopyBtn, monitor: navOperationsBtn, compare: navCompareBtn })) {
        button.classList.toggle('selected', currentScreen === name);
        if (currentScreen === name) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    }
    navCopyBtn.disabled = homeCopyBtn.disabled = false;
    navCopyBtn.title = homeCopyBtn.title = 'Copia sicura';
    navCompareBtn.disabled = compareNavBtn.disabled = false;
    navCompareBtn.title = compareNavBtn.title = 'Confronta cartelle';
    const count = document.getElementById('nav-job-count');
    count.textContent = activeTotal + pending.length;
    count.classList.toggle('hidden', activeTotal + pending.length === 0);
    homeActivity.classList.toggle('hidden', activeTotal + pending.length === 0);
    document.getElementById('home-activity-label').textContent =
        `${activeTotal} ${activeTotal === 1 ? 'operazione in corso' : 'operazioni in corso'} · ${pending.length} in attesa`;
}
navHomeBtn.addEventListener('click', showHomeScreen);
navCopyBtn.addEventListener('click', showSetupScreen);
homeCopyBtn.addEventListener('click', showSetupScreen);
navOperationsBtn.addEventListener('click', showMonitorScreen);
navCompareBtn.addEventListener('click', showCompareScreen);
document.getElementById('setup-home-btn').addEventListener('click', showHomeScreen);
homeActivity.addEventListener('click', showMonitorScreen);

function updateBackButton() {
    backToSetupBtn?.classList.toggle('finished', !copyInProgress);
    const isComparison = operations.find(item => item.id === focusedJobId)?.kind === 'compare';
    const textNode = [...backToSetupBtn.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (textNode) textNode.textContent = isComparison ? ' Nuovo confronto' : ' Nuova copia';
    backToSetupBtn.disabled = isComparison && (compareBusy || comparePreparing);
}
function updateQueueDisplay() {
    const empty = operations.length === 0;
    document.getElementById('operations-empty').hidden = !empty;
    progressSection.classList.toggle('hidden', empty);
    document.querySelector('.activity-details').hidden = empty;
    const pending = copyQueue.filter(item => item.status === 'pending');
    if (queueCountBadge) queueCountBadge.textContent = pending.length;
    queuePreviewSection?.classList.toggle('hidden', pending.length === 0);
    queueContainer?.classList.toggle('hidden', operations.length === 0);
    monitorLogPanel?.classList.toggle('expanded', operations.length === 0);
    if (queuePreviewList) {
        queuePreviewList.replaceChildren();
        pending.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'queue-preview-row';
            row.textContent = `${index + 1}. ${item.description}`;
            queuePreviewList.append(row);
        });
    }
    if (startQueueBtn) {
        const activeCount = operations.filter(item => ['processing', 'pausing', 'paused'].includes(item.status)).length;
        startQueueBtn.disabled = pending.length === 0 || activeCount >= 10;
        startQueueBtn.textContent = activeCount >= 10 ? 'In attesa di uno spazio' : 'Avvia coda';
    }
    renderQueueItems();
    updateStartButtonState();
}
function updateQueueSelectionUI() {
    if (!queueItems) return;
    for (const btn of queueItems.querySelectorAll('.job-select')) {
        btn.classList.toggle('selected', btn.dataset.id === focusedJobId);
    }
}

function updateQueueItemState(item) {
    if (!queueItems) return;
    const row = queueItems.querySelector(`[data-id="${item.id}"]`);
    if (!row) return;
    const badge = row.querySelector('.job-state');
    if (!badge) return;
    const state = item.paused ? 'In pausa dopo il file' : item.kind === 'compare' && item.status === 'completed'
        ? ({ perfect: item.mode === 'quick' ? 'Corrispondenza rapida' : 'Contenuti verificati', verify: 'Da verificare', missing: 'File mancanti' }[item.verdict] || 'Completato')
        : { pending: 'In attesa', pausing: 'Pausa dopo il file', paused: 'In pausa', completed: 'Completata',
        partial: 'Parziale', failed: 'Fallita', cancelled: 'Annullata' }[item.status] || `In corso ${item.progress || 0}%`;
    const statusAttr = item.kind === 'compare' && item.status === 'completed'
        ? item.verdict === 'missing' ? 'failed' : item.verdict === 'verify' ? 'partial' : 'completed'
        : item.status;
    if (badge.textContent !== state) badge.textContent = state;
    if (badge.dataset.status !== statusAttr) badge.dataset.status = statusAttr;
}

function renderQueueItems() {
    if (!queueItems) return;
    queueItems.replaceChildren();
    const pending = copyQueue.filter(item => item.status === 'pending');
    operations.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'queue-item';
        row.dataset.id = item.id;
        const select = document.createElement('button');
        select.type = 'button';
        select.dataset.id = item.id;
        select.className = `job-select ${item.id === focusedJobId ? 'selected' : ''}`;
        const state = item.paused ? 'In pausa dopo il file' : item.kind === 'compare' && item.status === 'completed'
            ? ({ perfect: item.mode === 'quick' ? 'Corrispondenza rapida' : 'Contenuti verificati', verify: 'Da verificare', missing: 'File mancanti' }[item.verdict] || 'Completato')
            : { pending: 'In attesa', pausing: 'Pausa dopo il file', paused: 'In pausa', completed: 'Completata',
            partial: 'Parziale', failed: 'Fallita', cancelled: 'Annullata' }[item.status] || `In corso ${item.progress || 0}%`;
        const label = document.createElement('span');
        label.className = 'job-label';
        label.textContent = `${index + 1}. ${item.recovered ? 'Ripresa disponibile · ' : ''}${item.description}`;
        const badge = document.createElement('span');
        badge.className = 'job-state';
        badge.dataset.status = item.kind === 'compare' && item.status === 'completed'
            ? item.verdict === 'missing' ? 'failed' : item.verdict === 'verify' ? 'partial' : 'completed'
            : item.status;
        badge.textContent = state;
        select.append(label, badge);
        select.title = item.description;
        select.addEventListener('click', () => {
            focusedJobId = item.id;
            renderSelectedOperation(item);
            updateQueueSelectionUI();
            updateQueueControls();
        });
        row.append(select);
        if (item.kind !== 'compare' && item.status === 'pending') {
            const position = pending.findIndex(entry => entry.id === item.id);
            for (const [label, dir, disabled] of [['↑', 'up', position === 0], ['↓', 'down', position === pending.length - 1]]) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = label;
                btn.title = dir === 'up' ? 'Sposta su' : 'Sposta giù';
                btn.disabled = disabled;
                btn.className = 'queue-icon-button';
                btn.addEventListener('click', () => window.electronAPI.reorderQueue(item.id, dir));
                row.append(btn);
            }
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '×';
            remove.title = 'Rimuovi dalla coda';
            remove.className = 'queue-icon-button danger-text';
            remove.addEventListener('click', () => window.electronAPI.removeFromQueue(item.id));
            row.append(remove);
        }
        queueItems.append(row);
    });
}
function updateQueueControls() {
    const pending = copyQueue.filter(item => item.status === 'pending');
    const active = copyQueue.filter(item => ['processing', 'pausing', 'paused'].includes(item.status));
    const selected = operations.find(item => item.id === focusedJobId && ['processing','pausing','paused'].includes(item.status));
    clearQueueBtn?.classList.toggle('hidden', pending.length === 0);
    clearCompletedBtn?.classList.toggle('hidden', !operations.some(item =>
        ['completed', 'partial', 'failed', 'cancelled'].includes(item.status)));
    if (copyStatusContainer) copyStatusContainer.classList.toggle('hidden', !selected);
    pauseQueueBtn?.classList.toggle('hidden', !selected || selected.status !== 'processing' || selected.paused);
    resumeQueueBtn?.classList.toggle('hidden', !selected || selected.status === 'processing' && !selected.paused);
    const activeTotal = operations.filter(item => ['processing', 'pausing', 'paused'].includes(item.status)).length;
    if (activeCopyCount) activeCopyCount.textContent = !operations.length ? '' : activeTotal
        ? `${activeTotal} in corso · ${pending.length} in attesa` : `${pending.length} in attesa`;
    monitorNavBtn?.classList.toggle('hidden', operations.length === 0);
    updateNavigation();
    updateStartButtonState();
}
function initializeQueueDisplay() {
    if (queueItems) {
        queueItems.addEventListener('click', (event) => {
            const select = event.target.closest('.job-select');
            if (select && select.dataset.id && select.dataset.id !== focusedJobId) {
                const item = operations.find(op => op.id === select.dataset.id);
                if (item) {
                    focusedJobId = item.id;
                    renderSelectedOperation(item);
                    updateQueueSelectionUI();
                    updateQueueControls();
                }
            }
        });
    }
    updateQueueDisplay();
}
const recoverCopyQueueBtn = document.getElementById('recover-copy-queue');
window.electronAPI?.getPendingCopyRecoveryCount?.().then(count => { recoverCopyQueueBtn.hidden = !count; }).catch(console.error);
recoverCopyQueueBtn.addEventListener('click', async () => {
    recoverCopyQueueBtn.disabled = true;
    try {
        await window.electronAPI.recoverPendingCopies();
        recoverCopyQueueBtn.hidden = true;
    } catch (error) { showError(error.message); }
    finally { recoverCopyQueueBtn.disabled = false; }
});

const headerContainer = document.getElementById('data-flow-track');
function initializeParticles() {
    if (!headerContainer) return;
    headerContainer.replaceChildren();
    for (let i = 0; i < 18; i++) {
        const particle = document.createElement('div');
        particle.className = 'file-particle';
        particle.style.top = `${8 + Math.random() * 84}%`;
        particle.style.left = '0';
        particle.style.setProperty('--duration', `${3.8 + Math.random() * 3.2}s`);
        particle.style.animationDelay = `${-Math.random() * 7}s`;
        headerContainer.append(particle);
    }
}
function updateAnimation() {
    if (!headerContainer) return;
    const isCopying = copyQueue.some(item => item.status === 'processing' || item.status === 'pausing');
    const isPaused = copyQueue.some(item => item.status === 'paused');
    const allowedScreen = currentScreen === 'monitor' || (currentScreen === 'copy' && (isCopying || isPaused));
    const shouldRun = allowedScreen && isCopying;
    const shouldPause = allowedScreen && isPaused;

    headerContainer.classList.toggle('running', shouldRun || shouldPause);
    headerContainer.classList.toggle('paused', shouldPause);
    headerContainer.classList.toggle('monitor-view', currentScreen === 'monitor');
}
function activateFileFlow() { updateAnimation(); }
function stopParticles() { updateAnimation(); }
function resetParticlesToIdle() { updateAnimation(); }

// Event Listeners for Buttons
if (monitorNavBtn) {
    monitorNavBtn.addEventListener('click', () => {
        showMonitorScreen();
    });
}

if (backToSetupBtn) {
    backToSetupBtn.addEventListener('click', startNewOperation);
}

// Logic for Source Button (Unified Single/Multiple)
if (sourceBtn) {
    sourceBtn.addEventListener('click', async () => {
        // Always use multiple folder selection
        const paths = await window.electronAPI.selectMultipleFolders();
        if (paths?.length > 0) {
            sourcePaths = paths;
            const text = paths.length === 1 ? `1 elemento selezionato: ${paths[0]}` : `${paths.length} elementi selezionati`;
            renderSources();
            logMessage({ message: `Sorgente: ${text}`, className: 'text-gray-400' });

            resetParticlesToIdle();
            updateStartButtonState();

            // Switch to Active Gradient
            sourceBtn.classList.remove('btn-source-idle');
            sourceBtn.classList.add('btn-source-active');
        }
    });
}

// Removed sourceMultiBtn listener as element was removed

if (destBtn) {
    destBtn.addEventListener('click', async () => {
        const path = await window.electronAPI.selectFolder();
        if (path) {
            addDestination(path);
            logMessage({ message: `Destinazione aggiunta: ${path}`, className: 'text-gray-400' });
        }
    });
}

if (startBtn) {
    startBtn.addEventListener('click', async () => {
        if (startBtn.disabled) return;
        try {
            const result = await window.electronAPI.startBatch(sourcePaths, destPaths, 'now', document.getElementById('copy-policy').value);
            focusedJobId = result.find(item => item.status === 'processing')?.id || result[0]?.id;
            resetProgressUI();
            clearSelection();
            showMonitorScreen();
            logMessage({ message: `${result.length} copia/e avviata/e o pianificata/e`, className: 'text-cyan-400' });
        } catch (error) {
            showError(error.message);
        }
    });
}
if (addToQueueBtn) {
    addToQueueBtn.addEventListener('click', async () => {
        if (addToQueueBtn.disabled) return;
        try {
            const result = await window.electronAPI.startBatch(sourcePaths, destPaths, 'after', document.getElementById('copy-policy').value);
            logMessage({ message: `${result.length} copia/e aggiunta/e alla coda`, className: 'text-green-400' });
            clearSelection();
        } catch (error) {
            showError(error.message);
        }
    });
}
if (startQueueBtn) {
    startQueueBtn.addEventListener('click', async () => {
        const started = await window.electronAPI.startQueue();
        if (started) showMonitorScreen();
    });
}
openReportBtn?.addEventListener('click', async () => {
    const item = operations.find(operation => operation.id === focusedJobId);
    const reportId = item?.kind === 'compare' ? item.reportId : focusedJobId;
    if (reportId) await window.electronAPI.openReport(reportId);
});
exportDITReportBtn?.addEventListener('click', async () => {
    const item = operations.find(operation => operation.id === focusedJobId);
    const reportId = item?.kind === 'compare' ? item.reportId : focusedJobId;
    if (!reportId) return;
    const originalText = exportDITReportBtn.innerHTML;
    exportDITReportBtn.disabled = true;
    exportDITReportBtn.textContent = 'Generazione PDF in corso...';
    try {
        await window.electronAPI.exportDITReport(reportId);
    } catch (error) {
        console.error('Errore esportazione PDF DIT:', error);
        alert('Impossibile generare il PDF DIT: ' + error.message);
    } finally {
        exportDITReportBtn.disabled = false;
        exportDITReportBtn.innerHTML = originalText;
    }
});
openCopyDestinationBtn?.addEventListener('click', async () => {
    const id = focusedJobId;
    if (!id) return;
    try {
        const opened = await window.electronAPI.openCopyDestination(id);
        if (!opened) showError('Destinazione non disponibile per questa operazione.');
    } catch (error) {
        showError(error.message);
    }
});
function startNewOperation() {
    if (operations.find(item => item.id === focusedJobId)?.kind === 'compare') startNewComparison();
    else { clearSelection(); showSetupScreen(); }
}
newCopyBtn?.addEventListener('click', startNewOperation);
openReportsFolderBtn?.addEventListener('click', () => window.electronAPI.openReportsFolder());
clearCompletedBtn?.addEventListener('click', async () => {
    await window.electronAPI.clearCompleted();
});

if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', async () => {
        await window.electronAPI.clearQueue();
    });
}

if (pauseQueueBtn) {
    pauseQueueBtn.addEventListener('click', async () => {
        if (focusedJobId) await window.electronAPI.pauseQueue(focusedJobId);
    });
}
if (resumeQueueBtn) {
    resumeQueueBtn.addEventListener('click', async () => {
        if (focusedJobId) await window.electronAPI.resumeQueue(focusedJobId);
    });
}

// Cancel and Dialogs
if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
        // Create simple dialog
        const confirmDialog = document.createElement('div');
        confirmDialog.className = 'modal-overlay';
        confirmDialog.setAttribute('role', 'dialog');
        confirmDialog.setAttribute('aria-modal', 'true');
        confirmDialog.innerHTML = `
            <div class="modal-card">
                <h2>Interrompi copia</h2>
                <p>Vuoi interrompere? I file già completati rimarranno; il file in corso non verrà salvato.</p>
                <div class="confirmation-actions">
                    <button id="confirm-cancel" class="button danger">Interrompi</button>
                    <button id="cancel-cancel" class="button secondary">Continua</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmDialog);

        document.getElementById('confirm-cancel').onclick = () => {
            window.electronAPI.cancelCopy(focusedJobId);
            document.body.removeChild(confirmDialog);
            // Keep the current state until the main process confirms cancellation.
        };

        document.getElementById('cancel-cancel').onclick = () => {
            document.body.removeChild(confirmDialog);
        };
    });
}

// Credits and Logs
let settingsReturnFocus = null;
function closeSettings() {
    creditsBox.style.display = 'none';
    settingsReturnFocus?.focus();
}
if (logoClick && creditsBox) {
    logoClick.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (creditsBox.style.display !== 'none') { closeSettings(); return; }
        settingsReturnFocus = document.activeElement;
        creditsBox.style.display = 'flex';
        creditsBox.classList.remove('hidden');
        document.getElementById('credits-close')?.focus({ preventScroll: true });
    });
}

if (creditsClose) {
    creditsClose.addEventListener('click', closeSettings);
}
creditsBox?.addEventListener('click', event => { if (event.target === creditsBox) closeSettings(); });
document.addEventListener('keydown', event => {
    if (!creditsBox || creditsBox.style.display === 'none') return;
    if (event.key === 'Escape') { event.preventDefault(); closeSettings(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...creditsBox.querySelectorAll('button, input, select, summary, a[href]')]
        .filter(element => !element.disabled && element.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || !creditsBox.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !creditsBox.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
    }
});

if (printLogBtn) {
    printLogBtn.addEventListener('click', generateHTMLLog);
}
document.getElementById('error-retry-btn')?.addEventListener('click', hideError);

async function generateHTMLLog() {
    if (!logContainer) return;
    printLogBtn.disabled = true;
    try {
        const messages = Array.from(logContainer.querySelectorAll('p')).map(p => p.textContent || '');
        await window.electronAPI.saveActivityLog(messages);
        logMessage({ message: '✓ Log salvato nella cartella dell’app (20 giorni)', className: 'text-green-400' });
    } catch (error) { showError(error.message); }
    finally { printLogBtn.disabled = false; }
}
function resetProgressUI() {
    if (typeof updateTransferFlowUI === 'function') updateTransferFlowUI(null);
    document.getElementById('metadata-details')?.classList.add('hidden');
    if (progressBar) { progressBar.style.width = '0%'; progressBar.dataset.status = 'processing'; }
    if (progressPercentage) progressPercentage.textContent = '0%';
    if (progressDetails) progressDetails.textContent = 'Inizializzazione...';
    if (progressStatus) progressStatus.textContent = 'In attesa...';
    if (progressSpeed) { progressSpeed.textContent = ''; progressSpeed.classList.add('hidden'); }
    if (currentFileEl) { currentFileEl.textContent = ''; currentFileEl.title = ''; }
    currentFilePanel?.classList.remove('hidden');
    currentFileTrack?.classList.remove('hidden');
    if (currentFileProgress) currentFileProgress.textContent = '0%';
    if (currentFileBar) { currentFileBar.style.transition = 'none'; currentFileBar.style.width = '0%'; }
    if (resultSummary) resultSummary.classList.add('hidden');
    failureDetails?.classList.add('hidden');
    openReportBtn?.classList.add('hidden');
    document.getElementById('export-dit-report-btn')?.classList.add('hidden');
    openCopyDestinationBtn?.classList.add('hidden');
    newCopyBtn?.classList.add('hidden');
}
function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
function updateAverageSpeed(speed) {
    if (progressSpeed) {
        progressSpeed.classList.toggle('hidden', !(speed > 0));
        progressSpeed.textContent = speed > 0 ? `Velocità media · ${formatBytes(speed)}/s` : '';
    }
}

// Drag & Drop Handlers
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

if (sourceBtn) {
    const sourceZone = sourceBtn.closest('.glass-panel') || sourceBtn.parentElement;

    sourceZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        sourceBtn.classList.add('border-teal-400', 'bg-teal-900/20');
        sourceZone.classList.add('drag-over'); // Highlight panel too
    });
    sourceZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        sourceBtn.classList.remove('border-teal-400', 'bg-teal-900/20');
        sourceZone.classList.remove('drag-over');
    });
    sourceZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        sourceBtn.classList.remove('border-teal-400', 'bg-teal-900/20');
        sourceZone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files).map(f => window.electronAPI.getPathForFile(f)).filter(Boolean);
        if (files.length > 0) {
            sourcePaths = files;
            const text = files.length === 1 ? `1 elemento: ${files[0]}` : `${files.length} elementi selezionati`;
            renderSources();
            logMessage({ message: `Sorgente (Drag): ${text}`, className: 'text-gray-400' });
            resetParticlesToIdle();
            updateStartButtonState();
            sourceBtn.classList.remove('btn-source-idle');
            sourceBtn.classList.add('btn-source-active');
        }
    });
}

if (destBtn) {
    const destZone = destBtn.closest('.glass-panel') || destBtn.parentElement;

    destZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        destBtn.classList.add('border-pink-400', 'bg-pink-900/20');
        destZone.classList.add('drag-over');
    });
    destZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        destBtn.classList.remove('border-pink-400', 'bg-pink-900/20');
        destZone.classList.remove('drag-over');
    });
    destZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        destBtn.classList.remove('border-pink-400', 'bg-pink-900/20');
        destZone.classList.remove('drag-over');

        const entries = Array.from(e.dataTransfer.items || []).map(item => item.webkitGetAsEntry?.()).filter(Boolean);
        if (entries.some(entry => !entry.isDirectory)) {
            logMessage({ message: 'La destinazione deve essere una cartella.', className: 'text-orange-400' });
            return;
        }
        const files = Array.from(e.dataTransfer.files).map(f => window.electronAPI.getPathForFile(f)).filter(Boolean);
        if (files.length > 0) {
            const path = files[0];
            addDestination(path);
            logMessage({ message: `Destinazione (Drag): ${path}`, className: 'text-gray-400' });
        }
    });
}

// Recursive folder comparison and selective, verified reconciliation.
const compareScreen = document.getElementById('compare-screen');
const compareNavBtn = document.getElementById('compare-nav-btn');
const compareBackBtn = document.getElementById('compare-back-btn');
const compareLeftBtn = document.getElementById('compare-left-btn');
const compareRightBtn = document.getElementById('compare-right-btn');
const compareLeftPath = document.getElementById('compare-left-path');
const compareRightPath = document.getElementById('compare-right-path');
const compareAnalyzeBtn = document.getElementById('compare-analyze-btn');
const compareActions = document.querySelector('.compare-actions');
const compareReconcileBtn = document.getElementById('compare-reconcile-btn');
const compareCancelBtn = document.getElementById('compare-cancel-btn');
const compareReportBtn = document.getElementById('compare-report-btn');
const compareProgressEl = document.getElementById('compare-progress');
const comparePercentageEl = document.getElementById('compare-percentage');
const compareProgressTrack = document.getElementById('compare-progress-track');
const compareProgressBar = document.getElementById('compare-progress-bar');
const compareVerdictEl = document.getElementById('compare-verdict');
const compareFilter = document.getElementById('compare-filter');
const compareList = document.getElementById('compare-list');
const compareSetupPanel = document.getElementById('compare-setup-panel');
const compareResultsPanel = document.getElementById('compare-results-panel');
const compareContinueBtn = document.getElementById('compare-continue-btn');
let compareStage = 'setup';
let compareLeft = '';
let compareRight = '';
let compareResult = null;
let compareBusy = false;
let comparePreparing = false;
let compareOperation = 'analysis';
let compareChoices = new Map();
let compareVisibleCount = 300;
const compareVerified = new Map();
const compareSelection = new Set();
const compareFileProgress = new Map();
const compareFinishedFiles = new Set();
let lastCompareDecisions = [];
let lastCompareSelectedOnly = false;
let comparePaused = false;
const compareCopyErrors = new Map();
let compareLiveSummary = null;
let compareEntryIndex = new Map();

function showCompareScreen() {
    if (currentScreen !== 'compare' && !compareBusy && !comparePreparing && compareResult) {
        startNewComparison();
        return;
    }
    switchScreen('compare');
    setCompareStage(compareBusy || comparePreparing ? 'results' : compareStage);
}
function startNewComparison() {
    if (compareBusy || comparePreparing) return;
    compareLeft = ''; compareRight = '';
    compareLeftPath.textContent = compareRightPath.textContent = 'Nessuna cartella selezionata';
    compareLeftPath.title = compareRightPath.title = '';
    compareFilter.value = '';
    document.getElementById('compare-status-filter').value = 'all';
    document.getElementById('compare-show-identical').checked = false;
    lastCompareDecisions = []; lastCompareSelectedOnly = false;
    comparePaused = false; compareLiveSummary = null; compareEntryIndex.clear();
    resetComparisonAfterSelection();
    switchScreen('compare');
    setCompareStage('setup');
    compareLeftBtn.focus();
}
document.getElementById('new-comparison-btn').addEventListener('click', startNewComparison);
function setCompareStage(stage) {
    compareStage = stage;
    compareSetupPanel.hidden = stage !== 'setup';
    compareResultsPanel.hidden = stage !== 'results';
    document.getElementById('compare-title').textContent = stage === 'setup' ? 'Scegli le cartelle' : 'Analisi e risultati';
    document.getElementById('compare-back-label').textContent = stage === 'setup' ? 'Panoramica' : 'Scelta cartelle';
    compareBackBtn.disabled = stage === 'results' && (compareBusy || comparePreparing);
    document.getElementById('new-comparison-btn').hidden = stage !== 'results' || compareBusy || comparePreparing;
}
function hideCompareScreen() {
    if (compareStage === 'results') {
        if (!compareBusy) setCompareStage('setup');
    } else showHomeScreen();
}
function updateCompareActions() {
    const missing = compareResult?.entries.filter(entry => entry.status === 'missing' && entry.copyable).length || 0;
    const choices = compareChoices.size;
    document.getElementById('new-comparison-btn').hidden = compareStage !== 'results' || compareBusy || comparePreparing;
    const activeCount = operations.filter(item => ['processing', 'pausing', 'paused'].includes(item.status)).length;
    compareActions.hidden = !compareResult;
    compareReconcileBtn.hidden = !compareResult;
    compareReconcileBtn.disabled = (compareBusy || comparePreparing) || activeCount >= 10 || missing + choices === 0;
    compareReconcileBtn.textContent = missing + choices
        ? `Copia tutti i mancanti (${missing})`
        : 'Copia e verifica i file mancanti';
    compareContinueBtn.disabled = (compareBusy || comparePreparing) || activeCount >= 10 || !compareLeft || !compareRight;
    compareAnalyzeBtn.hidden = (compareBusy || comparePreparing);
    compareBackBtn.disabled = compareStage === 'results' && (compareBusy || comparePreparing);
    compareAnalyzeBtn.disabled = (compareBusy || comparePreparing) || activeCount >= 10 || !compareLeft || !compareRight;
    compareAnalyzeBtn.textContent = (compareBusy || comparePreparing)
        ? (compareOperation === 'analysis' ? 'Analisi in corso…' : 'Copia in corso…')
        : compareResult ? 'Analizza di nuovo' : 'Avvia analisi cartelle';
    document.getElementById('compare-mode').disabled = (compareBusy || comparePreparing);
    document.getElementById('compare-exclusions').disabled = (compareBusy || comparePreparing);
    compareLeftBtn.disabled = (compareBusy || comparePreparing);
    compareRightBtn.disabled = (compareBusy || comparePreparing);
    compareCancelBtn.hidden = !compareBusy;
    document.getElementById('compare-pause').hidden = !(compareBusy || comparePreparing) || compareOperation !== 'reconcile';
    document.getElementById('compare-copy-policy').disabled = (compareBusy || comparePreparing);
    document.getElementById('compare-retry').hidden = (compareBusy || comparePreparing) || !compareCopyErrors.size;
    document.getElementById('compare-resume').hidden = (compareBusy || comparePreparing) || !['cancelled', 'partial'].includes(compareResult?.status);
    compareCancelBtn.textContent = compareOperation === 'analysis' ? 'Annulla analisi' : 'Annulla copia';
    for (const side of ['left', 'right']) document.getElementById(`compare-bulk-${side}`).disabled = (compareBusy || comparePreparing) || activeCount >= 10 || !compareResult?.entries.some(entry => entry.status !== 'identical' && entry.copyable && (side === 'left' ? entry.leftExists : entry.rightExists));
    renderCompareList();
    updateNavigation();
    updateStartButtonState();
    if (startQueueBtn) startQueueBtn.disabled = activeCount >= 10 || !copyQueue.some(item => item.status === 'pending');
}
function setCompareProgress(percentage, indeterminate = false) {
    compareProgressTrack.classList.toggle('indeterminate', indeterminate);
    comparePercentageEl.textContent = percentage == null ? '—' : `${percentage}%`;
    compareProgressBar.style.width = indeterminate ? '' : `${percentage ?? 0}%`;
    if (percentage == null) compareProgressTrack.removeAttribute('aria-valuenow');
    else compareProgressTrack.setAttribute('aria-valuenow', String(percentage));
}
function resetComparisonAfterSelection() {
    compareResult = null;
    document.getElementById('compare-operation-errors').hidden = true;
    compareChoices.clear();
    compareSelection.clear();
    compareVerified.clear();
    compareFileProgress.clear();
    compareFinishedFiles.clear();
    compareCopyErrors.clear();
    compareList.replaceChildren();
    compareReportBtn.classList.add('hidden');
    renderCompareVerdict();
    compareProgressEl.textContent = compareLeft && compareRight
        ? 'Cartelle pronte. Premi Avvia analisi cartelle.'
        : 'Seleziona due cartelle per iniziare.';
    setCompareProgress(null);
    updateCompareActions();
}
function renderCompareVerdict() {
    if (!compareResult) {
        compareVerdictEl.classList.add('hidden');
        return;
    }
    let { summary, verdict } = compareResult;
    if (compareBusy && compareOperation === 'reconcile' && compareLiveSummary) {
        summary = compareLiveSummary;
        verdict = summary.missing ? 'missing' : summary.different ? 'verify' : 'perfect';
    }
    compareVerdictEl.dataset.verdict = verdict;
    compareVerdictEl.textContent = verdict === 'perfect'
        ? (compareResult.mode === 'quick' ? `${summary.identical} elementi corrispondono per dimensione e data.` : `${summary.identical} elementi identici secondo l’analisi completa.`)
        : verdict === 'missing'
            ? `File mancanti — ${summary.missing} elementi assenti, ${summary.different} da verificare.`
            : `Copia da verificare — ${summary.different} elementi con differenze.`;
    if (compareResult.incremental) compareVerdictEl.textContent += ' · Esiti aggiornati per i file scelti; gli altri risalgono all’ultima analisi.';
    compareVerdictEl.classList.remove('hidden');
}
function liveCompareEntry(entry) {
    const verified = compareVerified.get(entry.relative);
    if (!verified) return entry;
    return { ...entry, status: 'identical', leftExists: true, rightExists: true,
        leftType: verified.type, rightType: verified.type, leftDetails: verified, rightDetails: verified, warnings: verified.warnings || entry.warnings, verified: true };
}
function makeCompareRow(entry) {
    const row = document.createElement('div');
    row.className = `compare-row ${entry.status}${entry.leftExists && entry.rightExists ? ' present' : ''}`;
    row.dataset.relative = entry.relative;
    row.dataset.presence = entry.leftExists && entry.rightExists ? 'both' : 'missing';
    const name = document.createElement('div');
    name.className = 'compare-name';
    const filename = document.createElement('span');
    filename.textContent = entry.relative;
    if (entry.copyable && entry.status !== 'identical') {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = compareSelection.has(entry.relative);
        checkbox.disabled = compareBusy || comparePreparing;
        checkbox.setAttribute('aria-label', `Seleziona ${entry.relative}`);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) compareSelection.add(entry.relative); else compareSelection.delete(entry.relative);
            updateCompareSelection();
        });
        name.append(checkbox);
    }
    name.append(filename);
    const label = document.createElement('span');
    label.className = 'compare-details';
    label.textContent = compareCopyErrors.has(entry.relative) ? 'Copia da controllare · apri Dettagli' : entry.verified ? 'Copiato e verificato' : entry.created ? 'Cartella creata' : entry.status === 'missing' ? (entry.leftExists ? 'Manca a destra' : 'Manca a sinistra') : entry.status === 'different' ? 'Diverso' : 'Corrispondente';
    if (compareCopyErrors.has(entry.relative)) label.classList.add('copy-warning');
    name.append(label);
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Dettagli';
    details.append(summary);
    const info = document.createElement('p');
    info.textContent = [compareCopyErrors.get(entry.relative), ...(entry.warnings || []), ...entry.issues].filter(Boolean).join(' · ') || 'Nessuna differenza rilevata';
    details.append(info);
    for (const [side, data] of [['Sinistra', entry.leftDetails], ['Destra', entry.rightDetails]]) {
        if (!data) continue;
        const paragraph = document.createElement('p');
        paragraph.textContent = `${side}: ${data.type} · ${data.size == null ? '—' : formatBytes(data.size)} · ${data.modified == null ? '—' : new Date(data.modified).toLocaleString()}${data.sha256 ? ` · SHA-256: ${data.sha256}` : ''}`;
        details.append(paragraph);
    }
    for (const [side, exists] of [['left', entry.leftExists], ['right', entry.rightExists]]) {
        if (!exists) continue;
        const versions = document.createElement('button');
        versions.className = 'button secondary';
        versions.textContent = side === 'left' ? 'Versioni sinistra' : 'Versioni destra';
        versions.addEventListener('click', async () => {
            try { if (!await window.electronAPI.openVersions(entry.relative, side)) showError('Nessuna versione precedente disponibile.'); }
            catch (error) { showError(error.message); }
        });
        details.append(versions);
    }
    details.className = 'compare-details';
    name.append(details);
    row.append(name);
    for (const exists of [entry.leftExists, entry.rightExists]) {
        const side = document.createElement('span');
        side.className = `compare-side ${exists ? 'present' : 'absent'}`;
        side.textContent = exists ? '✓' : '—';
        side.setAttribute('aria-label', exists ? 'Presente' : 'Mancante');
        row.append(side);
    }
    const action = document.createElement('div');
    action.className = 'compare-row-actions';
    if (entry.status !== 'identical' && entry.copyable) {
        for (const [keep, exists, text] of [['left', entry.leftExists, '→ Destra'], ['right', entry.rightExists, '← Sinistra']]) {
            if (!exists) continue;
            const button = document.createElement('button');
            button.className = 'button secondary';
            button.textContent = text;
            button.disabled = compareBusy || comparePreparing;
            button.title = `Copia ${entry.relative} ${keep === 'left' ? 'da sinistra a destra' : 'da destra a sinistra'}`;
            button.addEventListener('click', () => runComparisonCopy([{ relative: entry.relative, keep }], true));
            action.append(button);
        }
    } else action.textContent = entry.status === 'identical' ? (entry.verified ? '✓ Verificato' : 'Corrispondente') : 'Verifica manuale';
    row.append(action);
    row.addEventListener('contextmenu', event => {
        event.preventDefault();
        window.electronAPI.showCompareContextMenu(entry.relative);
    });
    const progress = compareFileProgress.get(entry.relative);
    if (progress && !entry.verified && !compareCopyErrors.has(entry.relative)) applyFileProgress(row, progress);
    return row;
}
function renderCompareList() {
    const scrollPosition = compareList.scrollTop;
    compareList.replaceChildren();
    if (!compareResult) return;
    const filter = compareFilter.value.trim().toLocaleLowerCase('it');
    const matching = compareResult.entries.map(liveCompareEntry).filter(entry =>
        (entry.status !== 'identical' || document.getElementById('compare-status-filter').value === 'errors' && compareCopyErrors.has(entry.relative) || entry.verified || entry.created || compareVerified.has(entry.relative) || document.getElementById('compare-show-identical').checked || document.getElementById('compare-status-filter').value === 'verified') &&
        (document.getElementById('compare-status-filter').value === 'all' || document.getElementById('compare-status-filter').value === entry.status || document.getElementById('compare-status-filter').value === 'verified' && (entry.verified || compareVerified.has(entry.relative)) || document.getElementById('compare-status-filter').value === 'errors' && (compareCopyErrors.has(entry.relative) || entry.leftType === 'error' || entry.rightType === 'error')) &&
        (!filter || entry.relative.toLocaleLowerCase('it').includes(filter)));
    if (!matching.length) {
        const empty = document.createElement('p');
        empty.className = 'compare-empty';
        empty.textContent = filter ? 'Nessun risultato per questa ricerca.' : 'Nessun file mancante o diverso.';
        compareList.append(empty);
    }
    const fragment = document.createDocumentFragment();
    for (const entry of matching.slice(0, compareVisibleCount)) fragment.append(makeCompareRow(entry));
    compareList.append(fragment);
    updateCompareSelection();
    if (matching.length > compareVisibleCount) {
        const more = document.createElement('button');
        more.className = 'queue-start-btn';
        more.textContent = `Mostra altri (${matching.length - compareVisibleCount})`;
        more.addEventListener('click', () => {
            compareVisibleCount += 300;
            renderCompareList();
        });
        compareList.append(more);
    }
    compareList.scrollTop = scrollPosition;
}
async function analyzeComparison() {
    if (!compareLeft || !compareRight || compareBusy) return;
    setCompareStage('results');
    compareBusy = true;
    compareOperation = 'analysis';
    compareResult = null;
    document.getElementById('compare-operation-errors').hidden = true;
    compareChoices.clear();
    compareSelection.clear();
    compareVerified.clear();
    compareFileProgress.clear();
    compareFinishedFiles.clear();
    compareCopyErrors.clear();
    compareReportBtn.classList.add('hidden');
    compareProgressEl.textContent = 'Censimento delle cartelle in corso…';
    setCompareProgress(null, true);
    compareList.replaceChildren();
    renderCompareVerdict();
    updateCompareActions();
    try {
        compareResult = JSON.parse(await window.electronAPI.compareFolders(compareLeft, compareRight, document.getElementById('compare-mode').value, document.getElementById('compare-exclusions').value.split(',').map(value => value.trim()).filter(Boolean)));
        compareProgressEl.textContent = `${compareResult.entries.length} elementi analizzati.`;
        setCompareProgress(100);
        compareVisibleCount = 300;
        renderCompareVerdict();
        renderCompareList();
        compareReportBtn.classList.toggle('hidden', !compareResult.reportPath);
    } catch (error) {
        compareProgressEl.textContent = cleanOperationError(error.message);
        showError(cleanOperationError(error.message));
    } finally {
        compareBusy = false;
        compareProgressTrack.classList.remove('indeterminate');
        updateCompareActions();
    }
}
compareNavBtn?.addEventListener('click', showCompareScreen);
compareBackBtn?.addEventListener('click', hideCompareScreen);
compareLeftBtn?.addEventListener('click', async () => {
    const selected = await window.electronAPI.selectFolder();
    if (!selected) return;
    compareLeft = selected;
    compareLeftPath.textContent = selected;
    compareLeftPath.title = selected;
    resetComparisonAfterSelection();
});
compareRightBtn?.addEventListener('click', async () => {
    const selected = await window.electronAPI.selectFolder();
    if (!selected) return;
    compareRight = selected;
    compareRightPath.textContent = selected;
    compareRightPath.title = selected;
    resetComparisonAfterSelection();
});
compareAnalyzeBtn?.addEventListener('click', analyzeComparison);
compareContinueBtn.addEventListener('click', analyzeComparison);
compareCancelBtn?.addEventListener('click', () => window.electronAPI.cancelCompare());
compareFilter?.addEventListener('input', () => {
    compareVisibleCount = 300;
    renderCompareList();
});
function cleanOperationError(message) {
    return String(message || '').replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
}
function confirmComparisonCopy({ decisions, bytes, policyMessage, preview, english }) {
    return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.className = 'copy-confirmation';
        const title = document.createElement('h2');
        title.id = 'copy-confirmation-title';
        title.textContent = english ? 'Confirm copy' : 'Conferma copia';
        dialog.setAttribute('aria-labelledby', title.id);
        const summary = document.createElement('p');
        summary.className = 'copy-confirmation-summary';
        summary.textContent = `${decisions.length} ${english ? 'items' : 'elementi'} · ${formatBytes(bytes)}`;
        dialog.append(title, summary);
        for (const from of ['left', 'right']) {
            const count = decisions.filter(choice => choice.keep === from).length;
            if (!count) continue;
            const row = document.createElement('div');
            row.className = 'copy-confirmation-direction';
            row.textContent = `${from === 'left' ? (english ? 'Left → Right' : 'Sinistra → Destra') : (english ? 'Right → Left' : 'Destra → Sinistra')} · ${count} ${english ? 'items' : 'elementi'}`;
            dialog.append(row);
        }
        const policy = document.createElement('p');
        policy.textContent = policyMessage;
        dialog.append(policy);
        const details = document.createElement('details');
        const label = document.createElement('summary');
        label.textContent = english ? 'Destination space' : 'Spazio nelle destinazioni';
        details.append(label);
        for (const item of preview || []) {
            const row = document.createElement('p');
            row.textContent = `${item.side === 'left' ? (english ? 'Left' : 'Sinistra') : (english ? 'Right' : 'Destra')} · ${item.volume}: ${formatBytes(item.bytes)} ${english ? 'required' : 'necessari'} / ${formatBytes(item.available)} ${english ? 'available' : 'disponibili'}`;
            details.append(row);
        }
        if (preview?.length) dialog.append(details);
        const actions = document.createElement('div');
        actions.className = 'confirmation-actions';
        const cancel = document.createElement('button'), start = document.createElement('button');
        cancel.className = 'button secondary'; start.className = 'button primary';
        cancel.textContent = english ? 'Cancel' : 'Annulla';
        start.textContent = english ? 'Start copy' : 'Avvia copia';
        const previousFocus = document.activeElement;
        const finish = accepted => { dialog.close(); dialog.remove(); previousFocus?.focus(); resolve(accepted); };
        cancel.onclick = () => finish(false); start.onclick = () => finish(true);
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
        actions.append(cancel, start); dialog.append(actions);
        document.body.append(dialog); dialog.showModal(); cancel.focus();
    });
}
async function runComparisonCopy(decisions = [], selectedOnly = false) {
    if (compareBusy || comparePreparing) return;
    comparePreparing = true;
    updateCompareActions();
    const policy = document.getElementById('compare-copy-policy').value;
    if (!decisions.length && !selectedOnly) decisions = compareResult.entries.filter(entry => entry.status === 'missing' && entry.copyable).map(entry => ({ relative: entry.relative, keep: entry.leftExists ? 'left' : 'right' }));
    const expanded = new Map(decisions.map(choice => [choice.relative, choice]));
    const entryLookup = new Map(compareResult.entries.map(entry => [entry.relative, entry]));
    const folders = new Map(decisions.filter(choice => entryLookup.get(choice.relative)?.[choice.keep === 'left' ? 'leftType' : 'rightType'] === 'directory').map(choice => [choice.relative, choice.keep]));
    for (const entry of compareResult.entries) {
        if (!entry.copyable || entry.status === 'identical') continue;
        const parts = entry.relative.split('/'); parts.pop();
        let keep;
        while (parts.length) {
            const direction = folders.get(parts.join('/'));
            if (direction) {
                if (keep && keep !== direction) { comparePreparing = false; updateCompareActions(); showError('La cartella e un suo file hanno direzioni di copia diverse. Scegli una sola direzione.'); return; }
                keep = direction;
            }
            parts.pop();
        }
        if (keep && entry[keep === 'left' ? 'leftExists' : 'rightExists']) {
            if (expanded.has(entry.relative) && expanded.get(entry.relative).keep !== keep) {
                comparePreparing = false; updateCompareActions(); showError('La cartella e un suo file hanno direzioni di copia diverse. Scegli una sola direzione.'); return;
            }
            expanded.set(entry.relative, { relative: entry.relative, keep });
        }
    }
    decisions = [...expanded.values()];
    selectedOnly = true;
    const replacementEntries = new Set(compareResult.entries.filter(entry => entry.status === 'different').map(entry => entry.relative));
    const overwrites = decisions.filter(choice => replacementEntries.has(choice.relative)).length;
    let preview = null;
    try { if (window.electronAPI.previewComparison) preview = await window.electronAPI.previewComparison(decisions, policy); }
    catch (error) { comparePreparing = false; updateCompareActions(); showError(error.message); return; }
    const previewEntries = new Map(compareResult.entries.map(entry => [entry.relative, entry]));
    const bytes = decisions.reduce((total, choice) => total + (previewEntries.get(choice.relative)?.[choice.keep === 'left' ? 'leftDetails' : 'rightDetails']?.size || 0), 0);
    const english = document.documentElement.lang === 'en';
    const policyMessage = policy === 'replace' ? (english ? `${overwrites} replacements; previous versions will be kept.` : `${overwrites} sostituzioni con versione precedente conservata.`) : policy === 'skip' ? (english ? 'Existing files will be skipped.' : 'I file presenti saranno saltati.') : (english ? 'Both versions of existing files will be kept.' : 'I file presenti saranno conservati entrambi.');
    if (!await confirmComparisonCopy({ decisions, bytes, policyMessage, preview, english })) { comparePreparing = false; updateCompareActions(); return; }
    comparePreparing = false;
    lastCompareDecisions = decisions;
    lastCompareSelectedOnly = selectedOnly;
    comparePaused = false;
    compareFileProgress.clear();
    compareFinishedFiles.clear();
    for (const choice of decisions) compareCopyErrors.delete(choice.relative);
    compareBusy = true;
    compareOperation = 'reconcile';
    compareLiveSummary = { ...compareResult.summary };
    compareEntryIndex = new Map(compareResult.entries.map(entry => [entry.relative, entry]));
    updateCompareActions();
    compareProgressEl.textContent = 'Controllo delle cartelle prima della copia…';
    setCompareProgress(null, true);
    try {
        const result = JSON.parse(await window.electronAPI.reconcileFolders(
            decisions, selectedOnly, document.getElementById('compare-copy-policy').value));
        compareResult = result;
        const remainingSelection = new Set(result.entries.filter(entry => entry.status !== 'identical' && entry.copyable).map(entry => entry.relative));
        for (const relative of compareSelection) if (!remainingSelection.has(relative)) compareSelection.delete(relative);
        for (const failure of result.failures || []) if (failure.path) compareCopyErrors.set(failure.path, failure.reason);
        const globalErrors = (result.failures || []).filter(failure => !failure.path).map(failure => failure.reason);
        document.getElementById('compare-operation-errors').textContent = globalErrors.join(' · ');
        document.getElementById('compare-operation-errors').hidden = !globalErrors.length;
        compareChoices.clear();
        renderCompareVerdict();
        renderCompareList();
        const remaining = result.summary.missing + result.summary.different;
        compareProgressEl.textContent = `${result.status === 'cancelled' ? 'Copia annullata · ' : ''}${result.copied.length} file copiati e verificati · ${result.failures.length} errori · ${remaining} elementi ancora da verificare.`;
        setCompareProgress(100);
        compareReportBtn.classList.toggle('hidden', !result.reportPath);
    } catch (error) {
        compareProgressEl.textContent = cleanOperationError(error.message);
        showError(cleanOperationError(error.message));
    } finally {
        compareBusy = false;
        compareFileProgress.clear();
        compareProgressTrack.classList.remove('indeterminate');
        updateCompareActions();
    }
}
compareReconcileBtn?.addEventListener('click', () => runComparisonCopy());

compareReportBtn?.addEventListener('click', () => {
    if (compareResult?.reportId) window.electronAPI.openReport(compareResult.reportId);
});
if (window.electronAPI) window.electronAPI.onCompareProgress(data => {
    if (!compareBusy) return;
    const side = data.side === 'left' ? 'sinistra' : 'destra';
    const stage = data.step === 'precheck' ? 'Controllo preliminare' :
        data.step === 'verify' ? 'Verifica finale' : 'Analisi';
    if (data.phase === 'inventory') {
        setCompareProgress(data.percentage ?? null, data.percentage == null);
        compareProgressEl.textContent = `${stage}: censimento cartella ${side} · ${data.count} elementi trovati · ${data.current || ''}`;
    } else if (data.phase === 'analyze') {
        setCompareProgress(data.percentage);
        const read = data.totalBytes ? ` · ${formatBytes(data.processedBytes)} di ${formatBytes(data.totalBytes)} letti` : '';
        compareProgressEl.textContent = `${stage} cartella ${side}: ${data.processedItems}/${data.totalItems} elementi${read} · ${data.current || ''}`;
    } else if (data.phase === 'file-copy') {
        if (compareFinishedFiles.has(data.current)) return;
        compareFileProgress.set(data.current, data);
        const row = Array.from(compareList.querySelectorAll('.compare-row')).find(item => item.dataset.relative === data.current);
        if (row) applyFileProgress(row, data);
        compareProgressEl.textContent = `${data.filePhase === 'verify' ? 'Verifica' : 'Copia'}: ${data.current}`;
        if (data.percentage != null) setCompareProgress(data.percentage);
    } else if (data.phase === 'reconcile') {
        compareFinishedFiles.add(data.current);
        compareFileProgress.delete(data.current);
        const entry = compareEntryIndex.get(data.current);
        // Apply actual presence immediately, including newly created parent folders.
        for (const changed of data.entries || []) {
            const previous = compareEntryIndex.get(changed.relative);
            if (previous) {
                const before = liveCompareEntry(previous).status;
                Object.assign(previous, changed);
                const after = liveCompareEntry(previous).status;
                if (compareLiveSummary && before !== after) { compareLiveSummary[before]--; compareLiveSummary[after]++; }
            }
        }
        if (data.outcome === 'verified' && data.details) {
            const before = entry && liveCompareEntry(entry).status;
            if (before && before !== 'identical' && compareLiveSummary) {
                compareLiveSummary[before]--;
                compareLiveSummary.identical++;
            }
            compareVerified.set(data.current, data.details);
            compareCopyErrors.delete(data.current);
        } else if (data.outcome === 'failed') {
            compareVerified.delete(data.current);
            if (entry) entry.verified = false;
            compareCopyErrors.set(data.current, data.error);
        }
        if (entry && ['verified', 'failed', 'created', 'kept'].includes(data.outcome)) {
            const row = Array.from(compareList.querySelectorAll('.compare-row')).find(item => item.dataset.relative === data.current);
            if (data.outcome === 'created' && entry.status === 'identical') entry.created = true;
            if (row) row.replaceWith(makeCompareRow(liveCompareEntry(entry)));
            for (const changed of data.entries || []) {
                if (changed.relative === data.current) continue;
                const parentRow = Array.from(compareList.querySelectorAll('.compare-row')).find(item => item.dataset.relative === changed.relative);
                if (parentRow) parentRow.replaceWith(makeCompareRow(liveCompareEntry(compareEntryIndex.get(changed.relative) || changed)));
            }
            renderCompareVerdict();
        }
        setCompareProgress(data.percentage ?? (data.total ? Math.min(99, Math.round(data.count / data.total * 100)) : 99));
        compareProgressEl.textContent = `Copia e verifica ${data.count} di ${data.total}: ${data.current}`;
    }
});

document.getElementById('compare-mode').addEventListener('change', resetComparisonAfterSelection);
document.getElementById('compare-exclusions').addEventListener('change', resetComparisonAfterSelection);
document.getElementById('compare-show-identical').addEventListener('change', renderCompareList);
for (const side of ['left', 'right']) {
    document.getElementById(`compare-bulk-${side}`).addEventListener('click', () => {
        if (!compareResult || compareBusy) return;
        const decisions = compareResult.entries.filter(entry => entry.status !== 'identical' && entry.copyable && (side === 'left' ? entry.leftExists : entry.rightExists)).map(entry => ({ relative: entry.relative, keep: side }));
        if (decisions.length) runComparisonCopy(decisions, true);
    });
}

function updateCompareSelection() {
    const controls = document.getElementById('compare-selection-actions');
    controls.hidden = !compareResult || !compareSelection.size;
    document.getElementById('compare-selection-count').textContent = `${compareSelection.size} selezionati`;
    for (const side of ['left', 'right']) document.getElementById(`compare-selected-${side}`).disabled = compareBusy || !compareResult?.entries.some(entry => compareSelection.has(entry.relative) && entry.copyable && entry.status !== 'identical' && (side === 'left' ? entry.leftExists : entry.rightExists));
    document.getElementById('compare-select-visible').disabled = compareBusy;
    document.getElementById('compare-clear-selection').disabled = compareBusy;
}
document.getElementById('compare-status-filter').addEventListener('change', renderCompareList);
document.getElementById('compare-select-visible').addEventListener('click', () => {
    for (const row of compareList.querySelectorAll('.compare-row')) if (row.querySelector('input[type="checkbox"]')) compareSelection.add(row.dataset.relative);
    renderCompareList();
});
document.getElementById('compare-clear-selection').addEventListener('click', () => { compareSelection.clear(); renderCompareList(); });
for (const side of ['left', 'right']) document.getElementById(`compare-selected-${side}`).addEventListener('click', () => {
    const choices = compareResult.entries.filter(entry => compareSelection.has(entry.relative) && entry.copyable && (side === 'left' ? entry.leftExists : entry.rightExists)).map(entry => ({ relative: entry.relative, keep: side }));
    if (choices.length) runComparisonCopy(choices, true);
});
document.getElementById('compare-retry').addEventListener('click', async () => {
    const choices = lastCompareDecisions.filter(choice => compareCopyErrors.has(choice.relative));
    await retryComparisonChoices(choices);
});
document.getElementById('compare-resume').addEventListener('click', async () => {
    const remaining = new Set(compareResult.entries.filter(entry => entry.status !== 'identical' && entry.copyable).map(entry => entry.relative));
    await retryComparisonChoices(lastCompareDecisions.filter(choice => remaining.has(choice.relative)));
});
async function retryComparisonChoices(choices) {
    if (!choices.length || compareBusy || comparePreparing) return;
    await analyzeComparison();
    if (!compareResult) return;
    const index = new Map(compareResult.entries.map(entry => [entry.relative, entry]));
    const pending = choices.filter(choice => index.get(choice.relative)?.copyable && index.get(choice.relative)?.status !== 'identical');
    if (pending.length) await runComparisonCopy(pending, true);
}

document.getElementById('compare-pause').addEventListener('click', async () => {
    comparePaused = !comparePaused;
    await window.electronAPI.pauseComparison(comparePaused);
    document.getElementById('compare-pause').textContent = comparePaused ? 'Riprendi' : 'Pausa dopo il file';
});

let comparisonRecovery = null;
let comparisonRecoveryRevision = 0;
function updateComparisonRecovery(recovery) {
    comparisonRecovery = recovery;
    document.getElementById('compare-recover').hidden = !recovery?.decisions?.length;
}
if (window.electronAPI?.onComparisonRecoveryUpdated) window.electronAPI.onComparisonRecoveryUpdated(recovery => {
    comparisonRecoveryRevision++;
    updateComparisonRecovery(recovery);
});
if (window.electronAPI?.getComparisonRecovery) {
    const revision = comparisonRecoveryRevision;
    window.electronAPI.getComparisonRecovery().then(recovery => {
        if (revision === comparisonRecoveryRevision) updateComparisonRecovery(recovery);
    }).catch(error => console.error(error));
}
document.getElementById('compare-recover').addEventListener('click', async () => {
    if (!comparisonRecovery || compareBusy || comparePreparing) return;
    const recovery = comparisonRecovery;
    compareLeft = recovery.leftRoot;
    compareRight = recovery.rightRoot;
    compareLeftPath.textContent = compareLeft;
    compareRightPath.textContent = compareRight;
    document.getElementById('compare-mode').value = recovery.mode;
    document.getElementById('compare-exclusions').value = (recovery.exclusions || []).join(', ');
    document.getElementById('compare-copy-policy').value = recovery.policy || 'replace';
    await analyzeComparison();
    if (!compareResult) return;
    const index = new Map(compareResult.entries.map(entry => [entry.relative, entry]));
    const choices = recovery.decisions.filter(choice => index.get(choice.relative)?.status !== 'identical' && index.get(choice.relative)?.copyable);
    if (choices.length) await runComparisonCopy(choices, true);
});

function applyFileProgress(row, data) {
    row.classList.add('copying');
    row.dataset.direction = data.from === 'right' ? 'left' : 'right';
    row.style.setProperty('--file-progress', `${data.filePercentage}%`);
    row.setAttribute('aria-label', `${data.current}: ${Math.round(data.filePercentage)}%`);
    const action = row.querySelector('.compare-row-actions');
    if (action) action.textContent = data.filePhase === 'verify' ? 'Verifica SHA-256…' : data.filePhase === 'compare' ? 'Controllo sorgente…' : `${Math.round(data.filePercentage)}% · ${formatBytes(data.bytes)} / ${formatBytes(data.totalBytes)}`;
}

document.getElementById('retry-copy-btn').addEventListener('click', async () => {
    try { focusedJobId = await window.electronAPI.retryCopy(focusedJobId); showMonitorScreen(); }
    catch (error) { showError(error.message); }
});

// Retention is fixed at 20 days. The settings text is translated with the UI.


// Background card workflow prepares a new draft; it never starts copying.
const loginStartupToggle = document.getElementById('login-startup');
const diskNoticesToggle = document.getElementById('disk-notices');
const loginStartupStatus = document.getElementById('login-startup-status');
function renderBackgroundSettings(settings) {
    loginStartupToggle.checked = !!settings.enabled;
    loginStartupToggle.disabled = !settings.supported;
    diskNoticesToggle.checked = !!settings.diskNotices;
    const approval = settings.status === 'requires-approval';
    loginStartupStatus.hidden = !approval && settings.supported;
    loginStartupStatus.textContent = approval
        ? 'Consenti SecureCopy in Impostazioni di Sistema → Generali → Elementi login.'
        : !settings.supported ? 'L’avvio automatico è disponibile su macOS.' : '';
}
window.electronAPI?.getBackgroundSettings?.().then(renderBackgroundSettings).catch(console.error);
window.electronAPI?.onBackgroundSettingsUpdated?.(renderBackgroundSettings);
loginStartupToggle.addEventListener('change', async () => {
    const enabled = loginStartupToggle.checked;
    loginStartupToggle.disabled = true;
    try { await window.electronAPI.setLoginStartup(enabled); renderBackgroundSettings(await window.electronAPI.getBackgroundSettings()); }
    catch (error) { loginStartupToggle.checked = !enabled; showError(error.message); }
    finally { loginStartupToggle.disabled = false; }
});
diskNoticesToggle.addEventListener('change', async () => {
    const enabled = diskNoticesToggle.checked;
    diskNoticesToggle.disabled = true;
    try { renderBackgroundSettings(await window.electronAPI.setDiskNotices(enabled)); }
    catch (error) { diskNoticesToggle.checked = !enabled; showError(error.message); }
    finally { diskNoticesToggle.disabled = false; }
});

const mediaSeparationToggle = document.getElementById('media-separation');
const soundAlertsToggle = document.getElementById('sound-alerts');
const autoEjectToggle = document.getElementById('auto-eject');
const telegramEnabledToggle = document.getElementById('telegram-enabled');
const telegramConfigPanel = document.getElementById('telegram-config-panel');
const telegramBotTokenInput = document.getElementById('telegram-bot-token');
const telegramChatIdInput = document.getElementById('telegram-chat-id');
const telegramDetectBtn = document.getElementById('telegram-detect-btn');
const telegramTestBtn = document.getElementById('telegram-test-btn');
const telegramStatusMsg = document.getElementById('telegram-status-msg');

async function renderMediaSettings(settings) {
    if (!settings) return;
    if (mediaSeparationToggle) mediaSeparationToggle.checked = !!settings.mediaSeparation;
    if (soundAlertsToggle) soundAlertsToggle.checked = settings.soundAlerts !== false;
    if (autoEjectToggle) autoEjectToggle.checked = !!settings.autoEject;
    if (telegramEnabledToggle) {
        telegramEnabledToggle.checked = !!settings.telegramEnabled;
        if (telegramConfigPanel) {
            telegramConfigPanel.style.display = settings.telegramEnabled ? 'flex' : 'none';
        }
    }
    if (telegramBotTokenInput && typeof settings.telegramBotToken === 'string') {
        telegramBotTokenInput.value = settings.telegramBotToken;
    }
    if (telegramChatIdInput && typeof settings.telegramChatId === 'string') {
        telegramChatIdInput.value = settings.telegramChatId;
    }
}

window.electronAPI?.getMediaSettings?.().then(renderMediaSettings).catch(console.error);

if (mediaSeparationToggle) {
    mediaSeparationToggle.addEventListener('change', async () => {
        try {
            await window.electronAPI?.setMediaSettings?.({ mediaSeparation: mediaSeparationToggle.checked });
        } catch (error) {
            mediaSeparationToggle.checked = !mediaSeparationToggle.checked;
            showError(error.message);
        }
    });
}
if (soundAlertsToggle) {
    soundAlertsToggle.addEventListener('change', async () => {
        try {
            await window.electronAPI?.setMediaSettings?.({ soundAlerts: soundAlertsToggle.checked });
        } catch (error) {
            soundAlertsToggle.checked = !soundAlertsToggle.checked;
            showError(error.message);
        }
    });
}
if (autoEjectToggle) {
    autoEjectToggle.addEventListener('change', async () => {
        try {
            await window.electronAPI?.setMediaSettings?.({ autoEject: autoEjectToggle.checked });
        } catch (error) {
            autoEjectToggle.checked = !autoEjectToggle.checked;
            showError(error.message);
        }
    });
}
if (telegramEnabledToggle) {
    telegramEnabledToggle.addEventListener('change', async () => {
        try {
            if (telegramConfigPanel) {
                telegramConfigPanel.style.display = telegramEnabledToggle.checked ? 'flex' : 'none';
            }
            await window.electronAPI?.setMediaSettings?.({ telegramEnabled: telegramEnabledToggle.checked });
        } catch (error) {
            telegramEnabledToggle.checked = !telegramEnabledToggle.checked;
            if (telegramConfigPanel) {
                telegramConfigPanel.style.display = telegramEnabledToggle.checked ? 'flex' : 'none';
            }
            showError(error.message);
        }
    });
}

function saveTelegramCredentials() {
    const botToken = telegramBotTokenInput?.value?.trim() || '';
    const chatId = telegramChatIdInput?.value?.trim() || '';
    window.electronAPI?.setMediaSettings?.({
        telegramBotToken: botToken,
        telegramChatId: chatId
    }).catch(console.error);
}

telegramBotTokenInput?.addEventListener('change', saveTelegramCredentials);
telegramBotTokenInput?.addEventListener('blur', saveTelegramCredentials);
telegramChatIdInput?.addEventListener('change', saveTelegramCredentials);
telegramChatIdInput?.addEventListener('blur', saveTelegramCredentials);

if (telegramDetectBtn) {
    telegramDetectBtn.addEventListener('click', async () => {
        const token = telegramBotTokenInput?.value?.trim();
        if (!token) {
            if (telegramStatusMsg) {
                telegramStatusMsg.hidden = false;
                telegramStatusMsg.textContent = 'Inserisci prima il Bot Token.';
            }
            telegramBotTokenInput?.focus();
            return;
        }
        telegramDetectBtn.disabled = true;
        if (telegramStatusMsg) {
            telegramStatusMsg.hidden = false;
            telegramStatusMsg.textContent = 'Ricerca messaggi recenti...';
        }
        try {
            const res = await window.electronAPI?.detectTelegramChatId?.(token);
            if (res && res.ok && res.chatId) {
                if (telegramChatIdInput) telegramChatIdInput.value = res.chatId;
                await window.electronAPI?.setMediaSettings?.({
                    telegramBotToken: token,
                    telegramChatId: res.chatId
                });
                if (telegramStatusMsg) {
                    telegramStatusMsg.hidden = false;
                    telegramStatusMsg.textContent = `✅ Chat trovata: ${res.title} (ID: ${res.chatId})`;
                }
            } else {
                if (telegramStatusMsg) {
                    telegramStatusMsg.hidden = false;
                    telegramStatusMsg.textContent = `⚠️ ${res?.error || 'Nessun messaggio trovato'}`;
                }
            }
        } catch (err) {
            if (telegramStatusMsg) {
                telegramStatusMsg.hidden = false;
                telegramStatusMsg.textContent = `⚠️ ${err.message}`;
            }
        } finally {
            telegramDetectBtn.disabled = false;
        }
    });
}

if (telegramTestBtn) {
    telegramTestBtn.addEventListener('click', async () => {
        const token = telegramBotTokenInput?.value?.trim();
        const chatId = telegramChatIdInput?.value?.trim();
        if (!token || !chatId) {
            if (telegramStatusMsg) {
                telegramStatusMsg.hidden = false;
                telegramStatusMsg.textContent = 'Inserisci sia il Bot Token sia il Chat ID.';
            }
            return;
        }
        telegramTestBtn.disabled = true;
        if (telegramStatusMsg) {
            telegramStatusMsg.hidden = false;
            telegramStatusMsg.textContent = 'Invio notifica in corso...';
        }
        try {
            await window.electronAPI?.setMediaSettings?.({
                telegramBotToken: token,
                telegramChatId: chatId
            });
            const res = await window.electronAPI?.testTelegramNotification?.(token, chatId);
            if (res && res.ok) {
                if (telegramStatusMsg) {
                    telegramStatusMsg.hidden = false;
                    telegramStatusMsg.textContent = '✅ Notifica inviata con successo! Controlla Telegram.';
                }
            } else {
                if (telegramStatusMsg) {
                    telegramStatusMsg.hidden = false;
                    telegramStatusMsg.textContent = `⚠️ ${res?.error || 'Errore invio'}`;
                }
            }
        } catch (err) {
            if (telegramStatusMsg) {
                telegramStatusMsg.hidden = false;
                telegramStatusMsg.textContent = `⚠️ ${err.message}`;
            }
        } finally {
            telegramTestBtn.disabled = false;
        }
    });
}
window.electronAPI?.onDiskImportRequested?.(request => {
    if (!request || typeof request.root !== 'string') return;
    if (creditsBox.style.display !== 'none') closeSettings();
    sourcePaths = [request.root]; destPaths = [];
    renderSources(); renderDestinations(); updateStartButtonState(); showSetupScreen();
    destBtn.focus({ preventScroll: true });
});

// Auto-updater integration
const updateBanner = document.getElementById('update-banner');
const updateBannerTitle = document.getElementById('update-banner-title');
const updateVersionTag = document.getElementById('update-version-tag');
const updateBannerDesc = document.getElementById('update-banner-desc');
const updateProgressWrap = document.getElementById('update-progress-bar-wrap');
const updateProgressBar = document.getElementById('update-progress-bar');
const updateActionBtn = document.getElementById('update-action-btn');
const updateDismissBtn = document.getElementById('update-dismiss-btn');
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const updateCheckStatus = document.getElementById('update-check-status');
const aboutAppVersion = document.getElementById('about-app-version');

if (aboutAppVersion) {
    aboutAppVersion.textContent = 'SecureCopy';
}

function handleUpdateStatus(status) {
    if (!status || !updateBanner) return;
    if (status.status === 'checking') {
        if (updateCheckStatus && !updateCheckStatus.hidden) {
            updateCheckStatus.textContent = 'Controllo aggiornamenti in corso...';
        }
    } else if (status.status === 'available') {
        updateBanner.classList.remove('hidden');
        if (updateBannerTitle) updateBannerTitle.textContent = 'Aggiornamento disponibile';
        if (updateVersionTag) updateVersionTag.textContent = '';
        if (updateBannerDesc) updateBannerDesc.textContent = status.notes || 'Download in background avviato...';
        if (updateProgressWrap) updateProgressWrap.classList.remove('hidden');
        if (updateProgressBar) updateProgressBar.style.width = '0%';
        if (updateActionBtn) updateActionBtn.classList.add('hidden');
        if (updateCheckStatus) {
            updateCheckStatus.hidden = false;
            updateCheckStatus.textContent = 'Nuovo aggiornamento rilevato. Download in corso...';
        }
    } else if (status.status === 'downloading') {
        updateBanner.classList.remove('hidden');
        if (updateBannerTitle) updateBannerTitle.textContent = 'Scaricamento aggiornamento...';
        if (updateVersionTag) updateVersionTag.textContent = '';
        const pct = Math.round((status.progress || 0) * 100);
        if (updateBannerDesc) updateBannerDesc.textContent = `${pct}% completato`;
        if (updateProgressWrap) updateProgressWrap.classList.remove('hidden');
        if (updateProgressBar) updateProgressBar.style.width = `${pct}%`;
        if (updateActionBtn) updateActionBtn.classList.add('hidden');
        if (updateCheckStatus) {
            updateCheckStatus.hidden = false;
            updateCheckStatus.textContent = `Scaricamento aggiornamento in corso: ${pct}%`;
        }
    } else if (status.status === 'installing') {
        updateBanner.classList.remove('hidden');
        if (updateBannerTitle) updateBannerTitle.textContent = 'Installazione in corso...';
        if (updateBannerDesc) updateBannerDesc.textContent = 'Preparazione e verifica dei file in corso...';
        if (updateProgressBar) updateProgressBar.style.width = '100%';
        if (updateActionBtn) updateActionBtn.classList.add('hidden');
    } else if (status.status === 'ready-to-restart') {
        updateBanner.classList.remove('hidden');
        if (updateBannerTitle) updateBannerTitle.textContent = 'Aggiornamento pronto!';
        if (updateVersionTag) updateVersionTag.textContent = '';
        if (updateBannerDesc) updateBannerDesc.textContent = 'Riavvia SecureCopy per completare l’installazione.';
        if (updateProgressWrap) updateProgressWrap.classList.add('hidden');
        if (updateActionBtn) {
            updateActionBtn.classList.remove('hidden');
            updateActionBtn.textContent = 'Riavvia ora';
        }
        if (updateCheckStatus) {
            updateCheckStatus.hidden = false;
            updateCheckStatus.textContent = 'Aggiornamento pronto! Riavvia per applicare.';
        }
    } else if (status.status === 'up-to-date') {
        if (!status.silent && updateCheckStatus) {
            updateCheckStatus.hidden = false;
            updateCheckStatus.textContent = 'SecureCopy è aggiornato all’ultima versione.';
        }
    } else if (status.status === 'error') {
        if (!status.silent && updateCheckStatus) {
            updateCheckStatus.hidden = false;
            updateCheckStatus.textContent = status.message || 'Errore durante la verifica degli aggiornamenti.';
        }
    }
}

window.electronAPI?.onUpdateStatusChanged?.(handleUpdateStatus);

updateDismissBtn?.addEventListener('click', () => {
    updateBanner?.classList.add('hidden');
});

updateActionBtn?.addEventListener('click', async () => {
    updateActionBtn.disabled = true;
    updateActionBtn.textContent = 'Riavvio in corso...';
    try {
        await window.electronAPI.relaunchApp();
    } catch (err) {
        showError(err.message);
        updateActionBtn.disabled = false;
        updateActionBtn.textContent = 'Riavvia ora';
    }
});

checkUpdatesBtn?.addEventListener('click', async () => {
    checkUpdatesBtn.disabled = true;
    if (updateCheckStatus) {
        updateCheckStatus.hidden = false;
        updateCheckStatus.textContent = 'Controllo aggiornamenti in corso...';
    }
    try {
        const res = await window.electronAPI.checkForUpdates();
        handleUpdateStatus(res);
    } catch (err) {
        if (updateCheckStatus) {
            updateCheckStatus.hidden = false;
            updateCheckStatus.textContent = err.message || 'Errore durante la verifica.';
        }
    } finally {
        checkUpdatesBtn.disabled = false;
    }
});
