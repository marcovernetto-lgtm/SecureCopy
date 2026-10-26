const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-screens-')));
  const profile = path.join(root, 'profile');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'background-settings.json'), JSON.stringify({ diskNotices: false }));
  await fs.writeFile(path.join(profile, 'report-retention.json'), JSON.stringify({ days: 20 }));

  const outDir = path.resolve(__dirname, '../docs/screenshots');
  await fs.mkdir(outDir, { recursive: true });

  const architecture = process.arch === 'arm64' ? 'arm64' : 'x64';
  const executable = path.resolve(__dirname, `../dist/mac-${architecture}/SecureCopy.app/Contents/MacOS/SecureCopy`);

  console.log(`Avvio SecureCopy per cattura screenshot (${architecture})...`);
  const child = spawn(executable, [
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    '--disable-background-timer-throttling'
  ], { stdio: 'ignore' });

  let socket = null;
  try {
    async function waitFor(fn, timeout = 30000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const result = await fn();
        if (result) return result;
        await delay(100);
      }
      throw new Error('Timeout in attesa dell\'app');
    }

    const port = await waitFor(async () => {
      const content = await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
      return content.split('\n')[0] || null;
    });

    const page = await waitFor(async () => {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
      return targets.find(t => t.type === 'page' && t.url.includes('index.html'));
    });

    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    let id = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      const request = pending.get(data.id);
      if (request) {
        clearTimeout(request.timer);
        pending.delete(data.id);
        data.error ? request.reject(new Error(JSON.stringify(data.error))) : request.resolve(data.result);
      }
    });

    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(new Error(`Timeout ${method}`));
      }, 20000);
      pending.set(key, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: key, method, params }));
    });

    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };

    await waitFor(() => evaluate('document.readyState === "complete" && !!window.electronAPI'));

    // High-DPI retina viewport (1240x840 @ 2x)
    await command('Emulation.setDeviceMetricsOverride', {
      width: 1240,
      height: 840,
      deviceScaleFactor: 2,
      mobile: false
    });

    console.log('App pronta. Cattura screenshot in corso...');

    // 1. HOME SCREEN
    await evaluate(`switchScreen('home')`);
    await delay(500);
    let snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '01-home.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 01-home.png catturato');

    // 2. COPIA SICURA - Setup con destinazioni multiple
    await evaluate(`
      showSetupScreen();
      sourcePaths = [
        '/Volumes/SONY_FX3_A01/CLIP/A001_C001_1026E8_001.MOV',
        '/Volumes/SONY_FX3_A01/CLIP/A001_C002_102641_001.MOV',
        '/Volumes/SONY_FX3_A01/DCIM/100MSDCF'
      ];
      destPaths = [
        '/Volumes/RAID_MASTER/PROGETTO_CINEMA/GIORNO_01',
        '/Volumes/SSD_BACKUP_01/PROGETTO_CINEMA/GIORNO_01'
      ];
      renderSources();
      renderDestinations();
      updateStartButtonState();
      updateCopyRecoveryUI(0);
    `);
    await delay(500);
    snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '02-copia-sicura.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 02-copia-sicura.png catturato');

    // 3. COPIA SICURA - Con Banner Ripresa o Cancellazione (X)
    await evaluate(`
      updateCopyRecoveryUI(1);
    `);
    await delay(400);
    snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '03-riprendi-copia.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 03-riprendi-copia.png catturato');

    // 4. OPERAZIONI LIVE - Trasferimento dati e verifica SHA-256
    await evaluate(`(() => {
      switchScreen('monitor');
      const mockJob = {
        id: 'mock-offload-job',
        description: 'Scarico Scheda SONY FX3 · Master RAID + Backup SSD',
        status: 'copying',
        sources: ['/Volumes/SONY_FX3_A01/CLIP'],
        destinations: ['/Volumes/RAID_MASTER/PROGETTO_CINEMA/GIORNO_01'],
        totalFiles: 24,
        copied: 16,
        progress: 68,
        speed: '685 MB/s',
        currentFile: 'A001_C017_1026H4_001.MOV',
        currentFileProgress: 72,
        currentFileTransferred: '5.2 GB',
        currentFileTotal: '7.2 GB'
      };

      operations = [mockJob];
      focusedJobId = mockJob.id;

      // Update transfer flow card in UI
      const fCard = document.getElementById('transfer-flow-card');
      if (fCard) fCard.classList.remove('hidden');
      const flowSrc = document.getElementById('flow-source-name');
      if (flowSrc) flowSrc.textContent = 'SONY_FX3_A01 / CLIP';
      const flowSrcPath = document.getElementById('flow-source-path');
      if (flowSrcPath) flowSrcPath.textContent = '/Volumes/SONY_FX3_A01/CLIP (CFexpress)';
      const flowDest = document.getElementById('flow-dest-name');
      if (flowDest) flowDest.textContent = 'RAID_MASTER / GIORNO_01';
      const flowDestPath = document.getElementById('flow-dest-path');
      if (flowDestPath) flowDestPath.textContent = '/Volumes/RAID_MASTER/PROGETTO_CINEMA/GIORNO_01';

      // Update progress card
      const progSection = document.getElementById('progress-section');
      if (progSection) progSection.classList.remove('hidden');
      const progStatus = document.getElementById('progress-status');
      if (progStatus) progStatus.textContent = 'Copia e verifica in corso';
      const progDetails = document.getElementById('progress-details');
      if (progDetails) progDetails.textContent = '16 di 24 file verificati byte per byte';
      const progPct = document.getElementById('progress-percentage');
      if (progPct) progPct.textContent = '68%';
      const progBar = document.getElementById('progress-bar');
      if (progBar) progBar.style.width = '68%';

      // Update current file panel
      const curFile = document.getElementById('progress-current');
      if (curFile) curFile.textContent = 'A001_C017_1026H4_001.MOV';
      const curProg = document.getElementById('current-file-progress');
      if (curProg) curProg.textContent = '5.2 GB di 7.2 GB (72%)';
      const curBar = document.getElementById('current-file-bar');
      if (curBar) curBar.style.width = '72%';

      // Speed metrics
      const speedSpan = document.getElementById('progress-speed');
      if (speedSpan) {
        speedSpan.textContent = '685 MB/s · Verifica SHA-256 in tempo reale';
        speedSpan.classList.remove('hidden');
      }

      // Animate background flow particles
      const flowTrack = document.getElementById('data-flow-track');
      if (flowTrack) {
        flowTrack.classList.add('running', 'monitor-view');
        flowTrack.style.opacity = '0.35';
      }

      const opEmpty = document.getElementById('operations-empty');
      if (opEmpty) opEmpty.classList.add('hidden');
      document.getElementById('result-summary').classList.add('hidden');
      document.getElementById('open-copy-destination-btn').classList.add('hidden');
      document.getElementById('export-dit-report-btn').classList.add('hidden');
    })()`);
    await delay(700);
    snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '04-operazioni-live.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 04-operazioni-live.png catturato');

    // 5. RISULTATI COPIA - Completata al 100% con report DIT pronto
    await evaluate(`(() => {
      switchScreen('monitor');
      const mockJob = {
        id: 'mock-offload-job',
        description: 'Scarico Scheda SONY FX3 · Master RAID + Backup SSD',
        status: 'completed',
        totalFiles: 24,
        copied: 24,
        progress: 100
      };
      operations = [mockJob];
      focusedJobId = mockJob.id;

      const progStatus = document.getElementById('progress-status');
      if (progStatus) progStatus.textContent = 'Copia completata e certificata';
      const progDetails = document.getElementById('progress-details');
      if (progDetails) progDetails.textContent = 'Tutti i 24 file verificati byte per byte (0 errori)';
      const progPct = document.getElementById('progress-percentage');
      if (progPct) progPct.textContent = '100%';
      const progBar = document.getElementById('progress-bar');
      if (progBar) progBar.style.width = '100%';

      const curPanel = document.getElementById('current-file-panel');
      if (curPanel) curPanel.classList.add('hidden');
      const speedSpan = document.getElementById('progress-speed');
      if (speedSpan) speedSpan.classList.add('hidden');

      const resSummary = document.getElementById('result-summary');
      if (resSummary) {
        resSummary.textContent = 'Completata — 24 copiati · 0 già validi · 0 problemi';
        resSummary.classList.remove('hidden');
      }
      const openDest = document.getElementById('open-copy-destination-btn');
      if (openDest) openDest.classList.remove('hidden');
      const expReport = document.getElementById('export-dit-report-btn');
      if (expReport) expReport.classList.remove('hidden');
      const newCopy = document.getElementById('new-copy-btn');
      if (newCopy) newCopy.classList.remove('hidden');
    })()`);
    await delay(600);
    snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '05-risultati-copia.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 05-risultati-copia.png catturato');

    // 6. CONFRONTA CARTELLE - Setup
    await evaluate(`(() => {
      switchScreen('compare');
      setCompareStage('setup');
      compareLeft = '/Volumes/SONY_FX3_A01/CLIP';
      compareRight = '/Volumes/RAID_MASTER/PROGETTO_CINEMA/GIORNO_01';
      renderCompareSelections();
      resetComparisonAfterSelection();
    })()`);
    await delay(500);
    snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '06-confronta-cartelle-setup.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 06-confronta-cartelle-setup.png catturato');

    // 7. CONFRONTA CARTELLE - Risultati con barra proporzionale, filtri e tabella
    await evaluate(`(() => {
      setCompareStage('results');
      compareResult = {
        mode: 'deep',
        summary: { total: 6, identical: 3, relocated: 1, different: 1, missing: 1, errors: 0 },
        entries: [
          { relative: 'A001_C001_1026E8_001.MOV', status: 'identical', leftExists: true, rightExists: true, leftType: 'file', rightType: 'file', leftDetails: { size: 6891000000, modified: Date.now() }, rightDetails: { size: 6891000000, modified: Date.now() }, copyable: false, issues: [] },
          { relative: 'A001_C002_102641_001.MOV', status: 'identical', leftExists: true, rightExists: true, leftType: 'file', rightType: 'file', leftDetails: { size: 6241000000, modified: Date.now() }, rightDetails: { size: 6241000000, modified: Date.now() }, copyable: false, issues: [] },
          { relative: 'CARD_A/A001_C003_102692_001.MOV', status: 'relocated', relocatedPath: 'ARCHIVE/A001_C003_102692_001.MOV', relocatedSide: 'right', leftExists: true, rightExists: false, leftType: 'file', leftDetails: { size: 7680000000, modified: Date.now() }, copyable: false, issues: [] },
          { relative: 'A001_C004_1026N3_001.MOV', status: 'missing', leftExists: true, rightExists: false, leftType: 'file', leftDetails: { size: 8950000000, modified: Date.now() }, copyable: true, issues: [] },
          { relative: 'LUT/FilmStock_Rec709.cube', status: 'different', leftExists: true, rightExists: true, leftType: 'file', rightType: 'file', leftDetails: { size: 1250000, modified: Date.now() }, rightDetails: { size: 1250000, modified: Date.now() - 3600000 }, copyable: true, issues: ['Data di modifica differente'] },
          { relative: 'A001_C005_1026K9_001.MOV', status: 'identical', leftExists: true, rightExists: true, leftType: 'file', rightType: 'file', leftDetails: { size: 5410000000, modified: Date.now() }, rightDetails: { size: 5410000000, modified: Date.now() }, copyable: false, issues: [] }
        ]
      };
      document.getElementById('compare-progress').textContent = 'Analisi completata · 6 elementi analizzati';
      setCompareProgress(100);
      renderCompareVerdict();
      renderCompareList();
      updateCompareActions();
    })()`);
    await delay(600);
    snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '07-confronta-cartelle-risultati.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 07-confronta-cartelle-risultati.png catturato');

    // 8. IMPOSTAZIONI - Desktop Pro, pallino Apple verde, guida Telegram a scomparsa, selettore conservazione
    await evaluate(`(() => {
      const box = document.getElementById('credits-box');
      box.style.display = 'flex';
      box.classList.remove('hidden');
      const tgToggle = document.getElementById('telegram-enabled');
      if (tgToggle) {
        tgToggle.checked = true;
        const panel = document.getElementById('telegram-config-panel');
        if (panel) panel.style.display = 'flex';
        const tokenInput = document.getElementById('telegram-bot-token');
        if (tokenInput) tokenInput.value = '718429182:AAHq_1234567890abcdefghijklmnopqrstuvw';
        const chatInput = document.getElementById('telegram-chat-id');
        if (chatInput) chatInput.value = '842877845';
        if (typeof updateTelegramTutorialVisibility === 'function') {
          updateTelegramTutorialVisibility();
        }
      }
      const retSelect = document.getElementById('report-retention-select');
      if (retSelect) retSelect.value = '20';
    })()`);
    await delay(500);
    snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '08-impostazioni.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 08-impostazioni.png catturato');

    // 9. REPORT DIT PDF - Mantieni il file di certificazione
    const existingDit = path.join(outDir, '06-report-dit.png');
    const targetDit = path.join(outDir, '09-report-dit.png');
    try {
      await fs.copyFile(existingDit, targetDit);
      console.log('✓ 09-report-dit.png sincronizzato');
    } catch (e) {
      console.log('Nota DIT report:', e.message);
    }

    console.log('Tutti gli screenshot sono stati salvati con successo in docs/screenshots/');
  } finally {
    socket?.close();
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(err => {
  console.error('Errore:', err);
  process.exitCode = 1;
});
