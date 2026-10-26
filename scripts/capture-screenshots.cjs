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

    // Set high-DPI retina viewport (1200x820 @ 2x)
    await command('Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 820,
      deviceScaleFactor: 2,
      mobile: false
    });

    console.log('App pronta. Cattura screenshot in corso...');

    // 1. HOME SCREEN
    await evaluate(`switchScreen('home')`);
    await delay(600);
    let snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '01-home.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 01-home.png catturato');

    // 2. COPIA SICURA (Offload set-up for Videomakers / Photographers)
    await evaluate(`
      showSetupScreen();
      sourcePaths = [
        '/Volumes/SONY_FX3_A01/CLIP/A001_C001_1026E8_001.MOV',
        '/Volumes/SONY_FX3_A01/CLIP/A001_C002_102641_001.MOV',
        '/Volumes/SONY_FX3_A01/DCIM/100MSDCF'
      ];
      destPaths = [
        '/Volumes/RAID_MASTER/PROGETTO_CINEMA_2026/GIORNO_01',
        '/Volumes/BACKUP_PORTABLE_01/PROGETTO_CINEMA_2026/GIORNO_01'
      ];
      renderSources();
      renderDestinations();
      updateStartButtonState();
    `);
    await delay(600);
    snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '02-copia-sicura.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 02-copia-sicura.png catturato');

    // 3. OPERAZIONI (Live data transfer flow, real-time SHA-256 verification)
    await evaluate(`(() => {
      switchScreen('monitor');
      const mockJob = {
        id: 'mock-offload-job',
        description: 'Offload Scheda SONY FX3 · Master RAID + Backup SSD',
        status: 'copying',
        sources: ['/Volumes/SONY_FX3_A01/CLIP'],
        destinations: ['/Volumes/RAID_MASTER/PROGETTO_CINEMA_2026/GIORNO_01'],
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
      if (flowDestPath) flowDestPath.textContent = '/Volumes/RAID_MASTER/PROGETTO_CINEMA_2026/GIORNO_01';
      const spdTag = document.getElementById('flow-speed-tag');
      if (spdTag) spdTag.textContent = '685 MB/s · SHA-256 Verificato in tempo reale';

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

      // Animate background flow particles
      const flowTrack = document.getElementById('data-flow-track');
      if (flowTrack) {
        flowTrack.classList.add('running', 'monitor-view');
        flowTrack.style.opacity = '0.35';
      }

      // Hide empty operations note
      const opEmpty = document.getElementById('operations-empty');
      if (opEmpty) opEmpty.classList.add('hidden');
    })()`);
    await delay(700);
    snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '03-operazioni-live.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 03-operazioni-live.png catturato');

    // 4. CONFRONTA CARTELLE (Folder Comparison & Difference Analysis)
    await evaluate(`(() => {
      switchScreen('compare');
      compareLeft = '/Volumes/SONY_FX3_A01/CLIP';
      compareRight = '/Volumes/RAID_MASTER/PROGETTO_CINEMA_2026/GIORNO_01';
      document.getElementById('compare-left-path').textContent = compareLeft;
      document.getElementById('compare-right-path').textContent = compareRight;

      // Show results panel
      document.getElementById('compare-setup-panel').hidden = true;
      const resPanel = document.getElementById('compare-results-panel');
      resPanel.hidden = false;
      document.getElementById('compare-progress').textContent = 'Analisi completata · 4 verificati corrispondenti, 1 mancante';
      document.getElementById('compare-percentage').textContent = '100%';
      document.getElementById('compare-progress-bar').style.width = '100%';

      const list = document.getElementById('compare-list');
      list.innerHTML = \`
        <div class="compare-row identical" data-presence="both">
          <div class="compare-name"><strong>A001_C001_1026E8_001.MOV</strong><span class="compare-details">6.42 GB · SHA-256 identico · Creazione identica</span></div>
          <span class="compare-side">✓</span><span class="compare-side">✓</span>
          <span class="compare-side">Verificato</span>
        </div>
        <div class="compare-row identical" data-presence="both">
          <div class="compare-name"><strong>A001_C002_102641_001.MOV</strong><span class="compare-details">5.81 GB · SHA-256 identico · Creazione identica</span></div>
          <span class="compare-side">✓</span><span class="compare-side">✓</span>
          <span class="compare-side">Verificato</span>
        </div>
        <div class="compare-row identical" data-presence="both">
          <div class="compare-name"><strong>A001_C003_102692_001.MOV</strong><span class="compare-details">7.15 GB · SHA-256 identico · Creazione identica</span></div>
          <span class="compare-side">✓</span><span class="compare-side">✓</span>
          <span class="compare-side">Verificato</span>
        </div>
        <div class="compare-row missing" data-presence="left">
          <div class="compare-name"><strong>A001_C004_1026N3_001.MOV</strong><span class="compare-details">8.34 GB · Presente solo nella sorgente</span></div>
          <span class="compare-side">✓</span><span class="compare-side">-</span>
          <button class="button picker-button" style="padding:4px 8px;font-size:11px;">Copia → Destra</button>
        </div>
        <div class="compare-row different" data-presence="both">
          <div class="compare-name"><strong>LUT/Creative_FilmLook.cube</strong><span class="compare-details">1.2 MB · Metadati o data di modifica aggiornata</span></div>
          <span class="compare-side">✓</span><span class="compare-side">✓</span>
          <button class="button picker-button" style="padding:4px 8px;font-size:11px;">Aggiorna</button>
        </div>
      \`;
      document.querySelector('.compare-actions').hidden = false;
      document.getElementById('compare-reconcile-btn').disabled = false;
      document.getElementById('new-comparison-btn').hidden = false;
    })()`);
    await delay(600);
    snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '04-confronta-cartelle.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 04-confronta-cartelle.png catturato');

    // 5. Impostazioni
    await evaluate(`(() => {
      const box = document.getElementById('credits-box');
      box.style.display = 'flex';
      box.classList.remove('hidden');
      const tgToggle = document.getElementById('telegram-enabled');
      if (tgToggle) {
        tgToggle.checked = true;
        const panel = document.getElementById('telegram-config-panel');
        if (panel) panel.style.display = 'flex';
      }
    })()`);
    await delay(500);
    snap = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, '05-impostazioni.png'), Buffer.from(snap.data, 'base64'));
    console.log('✓ 05-impostazioni.png catturato');

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
