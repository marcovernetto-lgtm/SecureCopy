const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
function snapshot(stats) {
  return stats ? Object.fromEntries(['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode'].map(key => [key, stats[key]])) : null;
}
function matches(a, b, directory = false) {
  if (!a || !b) return a === b;
  return (directory ? ['dev', 'ino', 'mode'] : ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode']).every(key => a[key] === b[key]);
}
async function statOrNull(file) {
  try { return await fsp.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function captureDirectory(directory) {
  const requested = path.resolve(directory);
  const absolute = await fsp.realpath(requested);
  const chain = [];
  let current = absolute;
  while (true) {
    const stats = await fsp.lstat(current);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Percorso della cartella non sicuro.');
    chain.push({ path: current, stats: snapshot(stats) });
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return { root: absolute, requested, chain };
}
async function assertDirectory(guard) {
  if (await fsp.realpath(guard.requested) !== guard.root) throw new Error('La cartella o il disco è cambiato. Operazione fermata.');
  for (const entry of guard.chain) {
    const stats = await statOrNull(entry.path);
    if (!stats || !stats.isDirectory() || stats.isSymbolicLink() || !matches(entry.stats, stats, true)) {
      throw new Error('La cartella o il disco è cambiato. Operazione fermata.');
    }
  }
}
async function canonicalPath(input) {
  const absolute = path.resolve(input);
  try { return await fsp.realpath(absolute); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(await canonicalPath(parent), path.basename(absolute));
  }
}
function overlap(a, b) {
  const normalize = value => process.platform === 'win32' || process.platform === 'darwin' ? path.resolve(value).toLowerCase() : path.resolve(value);
  const left = normalize(a), right = normalize(b);
  return left === right || left.startsWith(right + path.sep) || right.startsWith(left + path.sep);
}
module.exports = { snapshot, matches, statOrNull, captureDirectory, assertDirectory, canonicalPath, overlap };
