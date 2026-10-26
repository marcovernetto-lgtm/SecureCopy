const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const systemNames = new Set(['system volume information', '$recycle.bin', 'recycler', 'recycled']);

// Visibility is independent of extension: unknown camera formats and sidecars belong to the copy.
async function visibleEntries(directory, entries, signal) {
  signal?.throwIfAborted();
  const candidates = entries.filter(entry => !entry.name.startsWith('.') && !systemNames.has(entry.name.toLowerCase()));
  if (process.platform === 'darwin') {
    const visible = [];
    for (let offset = 0; offset < candidates.length; offset += 128) {
      signal?.throwIfAborted();
      const batch = candidates.slice(offset, offset + 128);
      try {
        const { stdout } = await exec('/usr/bin/stat', ['-f', '%f', ...batch.map(entry => path.join(directory, entry.name))], { signal, timeout: 10000 });
        const flags = stdout.trim().split('\n');
        if (flags.length !== batch.length || flags.some(flag => !/^\d+$/.test(flag))) throw new Error('Flag di visibilità non disponibili.');
        batch.forEach((entry, index) => { if (!(Number(flags[index]) & 0x8000)) visible.push(entry); });
      } catch {
        signal?.throwIfAborted();
        for (const entry of batch) {
          try {
            const { stdout } = await exec('/usr/bin/stat', ['-f', '%f', path.join(directory, entry.name)], { signal, timeout: 10000 });
            if (!(Number(stdout.trim()) & 0x8000)) visible.push(entry);
          } catch { signal?.throwIfAborted(); visible.push(entry); }
        }
      }
    }
    return visible;
  }
  if (process.platform === 'win32' && candidates.length) {
    const script = '$items=Get-ChildItem -LiteralPath $env:SC_DIRECTORY -Force; @($items | Where-Object { ($_.Attributes -band 6) -ne 0 } | ForEach-Object { $_.Name }) | ConvertTo-Json -Compress';
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, SC_DIRECTORY: directory }, signal });
    const hidden = new Set([].concat(JSON.parse(stdout.trim() || '[]')));
    return candidates.filter(entry => !hidden.has(entry.name));
  }
  return candidates;
}
module.exports = { visibleEntries };
