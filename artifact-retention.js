const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { captureDirectory, assertDirectory } = require('./fs-safety');

const RETENTION_DAYS = 20;
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const REPORT_NAME = new RegExp(`^SecureCopy-(verifica|confronto)-(${UUID})\\.json$`);
const LOG_NAME = new RegExp(`^SecureCopy-log-(${UUID})\\.html$`);

// The cleaner never receives source/destination paths, report contents as paths,
// download locations, or version folders. Only these two direct children exist.
async function managedDirectory(userData, kind, { create = false } = {}) {
  if (!['reports', 'logs'].includes(kind)) throw new Error('Cartella di artefatti non valida.');
  const root = path.resolve(userData);
  const rootStats = await fsp.lstat(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink() || await fsp.realpath(root) !== root) {
    throw new Error('Cartella dati dell’app non sicura: pulizia disattivata.');
  }
  const rootGuard = await captureDirectory(root);
  const directory = path.join(root, kind);
  if (create) {
    await assertDirectory(rootGuard);
    try { await fsp.mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const stats = await fsp.lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink() || await fsp.realpath(directory) !== directory) {
    throw new Error('Cartella di report/log non sicura: pulizia disattivata.');
  }
  await assertDirectory(rootGuard);
  return { directory, guard: await captureDirectory(directory) };
}

function generatedAt(name, content) {
  const report = name.match(REPORT_NAME);
  if (report) {
    let data;
    try { data = JSON.parse(content); } catch { return null; }
    const schema = report[1] === 'verifica' ? 'SecureCopy verification report v1' : 'SecureCopy comparison report v1';
    if (data.schema !== schema || data.id !== report[2]) return null;
    return Date.parse(data.completedAt);
  }
  const log = name.match(LOG_NAME);
  if (!log) return null;
  const marker = content.match(/^<!-- SecureCopy activity log v1; id=([a-f0-9-]+); createdAt=([^ ]+) -->\n/);
  return marker && marker[1] === log[1] ? Date.parse(marker[2]) : null;
}

async function cleanupArtifacts(userData, { now = Date.now() } = {}) {
  const removed = [];
  const cutoff = now - RETENTION_DAYS * 86400000;
  for (const kind of ['reports', 'logs']) {
    let managed;
    try { managed = await managedDirectory(userData, kind); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const { directory, guard } = managed;
    for (const name of await fsp.readdir(directory)) {
      if (!(kind === 'reports' ? REPORT_NAME : LOG_NAME).test(name)) continue;
      await assertDirectory(guard);
      const file = path.join(directory, name);
      let handle;
      try {
        const before = await fsp.lstat(file);
        if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.mtimeMs > cutoff) continue;
        handle = await fsp.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        const opened = await handle.stat();
        if (before.dev !== opened.dev || before.ino !== opened.ino || !opened.isFile() || opened.nlink !== 1) continue;
        const date = generatedAt(name, await handle.readFile('utf8'));
        if (!Number.isFinite(date) || date > cutoff) continue;
        await assertDirectory(guard);
        const current = await fsp.lstat(file);
        if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 ||
            ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => current[key] !== opened[key])) continue;
        // Unlink this validated regular file only. Never recurse or follow links.
        await fsp.unlink(file);
        removed.push(file);
      } catch (error) {
        if (!['ENOENT', 'ELOOP'].includes(error.code)) throw error;
      } finally { await handle?.close(); }
    }
  }
  return removed;
}

const escapeHTML = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
async function saveActivityLog(userData, messages) {
  if (!Array.isArray(messages) || messages.length > 1000 || messages.some(message => typeof message !== 'string' || message.length > 10000)) {
    throw new Error('Registro attività non valido o troppo grande.');
  }
  const { directory, guard } = await managedDirectory(userData, 'logs', { create: true });
  const id = crypto.randomUUID(), createdAt = new Date().toISOString();
  const html = `<!-- SecureCopy activity log v1; id=${id}; createdAt=${createdAt} -->\n<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><title>SecureCopy Log · ${createdAt}</title>
<style>body{font-family:'Avenir Next',sans-serif;background:#0f172a;color:#e2e8f0;padding:24px}p{padding:10px 0;border-bottom:1px solid #263b42;overflow-wrap:anywhere}</style>
</head><body><h1>SecureCopy Log</h1>${messages.map(message => `<p>${escapeHTML(message)}</p>`).join('')}</body></html>`;
  const file = path.join(directory, `SecureCopy-log-${id}.html`);
  await assertDirectory(guard);
  await fsp.writeFile(file, html, { flag: 'wx', mode: 0o600 });
  return file;
}

module.exports = { RETENTION_DAYS, managedDirectory, cleanupArtifacts, saveActivityLog };
