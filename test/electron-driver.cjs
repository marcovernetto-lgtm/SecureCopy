const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await fn(); if (result) return result; await delay(80); }
  throw new Error('Timeout verifica Electron');
}
async function launch(profile, architecture = 'arm64') {
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(path.join(profile, 'background-settings.json'), JSON.stringify({ diskNotices: false }));
  await fs.rm(path.join(profile, 'DevToolsActivePort'), { force: true });
  const executable = path.resolve(__dirname, `../dist/mac-${architecture}/SecureCopy.app/Contents/MacOS/SecureCopy`);
  const child = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--disable-background-timer-throttling'], { stdio: 'ignore' });
  let socket;
  const stop = async () => {
    socket?.close();
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve)); }
  };
  try {
    const port = await waitFor(async () => (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '')).split('\n')[0]);
    const page = await waitFor(async () => {
      try { const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })).json(); return targets.find(item => item.type === 'page' && item.url.includes('index.html')); }
      catch { return null; }
    });
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let id = 0; const pending = new Map();
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data), request = pending.get(data.id);
      if (request) { clearTimeout(request.timer); pending.delete(data.id); data.error ? request.reject(new Error(JSON.stringify(data.error))) : request.resolve(data.result); }
    });
    socket.addEventListener('close', () => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('App chiusa')); } pending.clear(); });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout ${method}`)); }, Number(process.env.SECURECOPY_TEST_TIMEOUT_MS || 20000));
      pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }));
    });
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await waitFor(() => evaluate('document.readyState === "complete" && typeof operations !== "undefined" && !!window.electronAPI'));
    return { child, evaluate, command, stop, async quit() {
      // Target only this test process, never the real installed app sharing its bundle ID.
      await exec('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `ObjC.import('AppKit'); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}).terminate;`]);
      await waitFor(() => child.exitCode !== null || child.signalCode !== null, 15000);
      socket?.close();
    } };
  } catch (error) { await stop(); throw error; }
}
module.exports = { launch, waitFor, delay };
