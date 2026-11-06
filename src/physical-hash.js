// SHA-256 read from the storage device instead of the system cache.
// Uses the bundled native helper (native/nocache-hash.c). Returns null when the
// helper is unavailable so callers can fall back to an ordinary read and say so.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HELPER_NAME = 'securecopy-hash';
let cachedHelper;

function candidates() {
  const list = [];
  if (process.env.SECURECOPY_HASH_HELPER) list.push(process.env.SECURECOPY_HASH_HELPER);
  // Packaged app: Contents/MacOS/securecopy-hash, next to the main executable.
  list.push(path.join(path.dirname(process.execPath), HELPER_NAME));
  // Development checkout: built by `npm run build:native`.
  list.push(path.join(__dirname, '..', 'build', 'native', HELPER_NAME));
  return list;
}

function helperPath() {
  if (process.env.SECURECOPY_HASH_HELPER === '') return null; // explicit opt-out (tests)
  if (cachedHelper !== undefined && !process.env.SECURECOPY_HASH_HELPER) return cachedHelper;
  if (process.platform !== 'darwin') return (cachedHelper = null);
  for (const candidate of candidates()) {
    try { fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return (cachedHelper = candidate); }
    catch { /* try the next location */ }
  }
  return (cachedHelper = null);
}

function physicalSha256(file, signal, onBytes) {
  const helper = helperPath();
  if (!helper) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error('Operazione annullata'); error.name = 'AbortError'; reject(error); return;
    }
    const child = spawn(helper, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffered = '', stderr = '', reported = 0, result = null;
    const abort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffered += chunk;
      let newline;
      while ((newline = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1);
        const parts = line.split(' ');
        if (parts[0] === 'P') {
          const total = Number(parts[1]);
          if (total > reported) { onBytes?.(total - reported); reported = total; }
        } else if (parts[0] === 'H' && /^[a-f0-9]{64}$/.test(parts[1])) {
          const bytes = Number(parts[2]), resident = Number(parts[5]);
          result = { hash: parts[1], bytes, flushed: parts[3] === '1', cacheBypassed: parts[4] === '1' && resident === 0, residentPages: resident };
          if (bytes > reported) { onBytes?.(bytes - reported); reported = bytes; }
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { signal?.removeEventListener('abort', abort); reject(error); });
    child.on('close', code => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) { const error = new Error('Operazione annullata'); error.name = 'AbortError'; reject(error); return; }
      if (code !== 0 || !result) { reject(new Error(`Lettura di verifica dal disco fallita: ${stderr.trim() || `codice ${code}`}`)); return; }
      result.physical = result.flushed && result.cacheBypassed;
      resolve(result);
    });
  });
}

module.exports = { physicalSha256, helperPath };
