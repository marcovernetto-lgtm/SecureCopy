const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { pipeline } = require('stream/promises');
const { snapshot, matches, statOrNull, captureDirectory, assertDirectory } = require('./fs-safety');
const { setCreationTime } = require('./mac-metadata');
const { TIMESTAMP_TOLERANCE_MS, sameTimestamp, readMacMetadata, macMetadataDifferences } = require('./file-metadata');
const { visibleEntries } = require('./visible-files');
const { pathSelection } = require('./path-selection');

const execFileAsync = promisify(execFile);

function cancelled(signal) {
  if (signal?.aborted) {
    const error = new Error('Operazione annullata');
    error.name = 'AbortError';
    throw error;
  }
}

function isInside(candidate, parent) {
  const normalize = value => process.platform === 'win32' || process.platform === 'darwin'
    ? value.toLowerCase() : value;
  const relative = path.relative(normalize(parent), normalize(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function realPathForNewPath(target) {
  const absolute = path.resolve(target);
  try {
    return await fsp.realpath(absolute);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(await realPathForNewPath(parent), path.basename(absolute));
  }
}

async function preparePaths(sourceDirs, destination) {
  if (!Array.isArray(sourceDirs) || sourceDirs.length === 0 || !sourceDirs.every(p => typeof p === 'string' && p.length)) {
    throw new Error('Seleziona almeno una cartella sorgente valida.');
  }
  if (typeof destination !== 'string' || !destination.length) {
    throw new Error('Seleziona una cartella di destinazione valida.');
  }

  const sources = [];
  const names = new Set();
  for (const input of sourceDirs) {
    const source = await fsp.realpath(input);
    const stats = await fsp.stat(source);
    if (!stats.isDirectory() && !stats.isFile()) {
      throw new Error(`La sorgente non è un file o una cartella valida: ${input}`);
    }
    const name = path.basename(source);
    const nameKey = (process.platform === 'win32' || process.platform === 'darwin') ? name.toLowerCase() : name;
    if (names.has(nameKey)) throw new Error(`Due sorgenti hanno lo stesso nome finale: ${name}`);
    names.add(nameKey);
    sources.push({ root: source, name, isFile: stats.isFile(), stats });
  }

  const destRoot = await realPathForNewPath(destination);
  for (const source of sources) {
    const target = path.join(destRoot, source.name);
    if (isInside(destRoot, source.root) || isInside(target, source.root) || isInside(source.root, target)) {
      throw new Error(`Sorgente e destinazione si sovrappongono: ${source.root}`);
    }
  }
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      if (isInside(sources[i].root, sources[j].root) || isInside(sources[j].root, sources[i].root)) {
        throw new Error('Le cartelle sorgente non devono contenersi a vicenda.');
      }
    }
  }
  await fsp.mkdir(destRoot, { recursive: true });
  const destStats = await fsp.stat(destRoot);
  if (!destStats.isDirectory()) throw new Error('La destinazione non è una cartella.');
  await fsp.access(destRoot, fs.constants.W_OK);
  return { sources, destRoot };
}

async function scanSources(sources, { signal, onLog, onProgress } = {}) {
  const files = [];
  const directories = [];
  const failures = [];
  let totalBytes = 0;

  async function visit(source, current, relative = '', depth = 0) {
    cancelled(signal);
    if (depth > 256) {
      failures.push({ path: current, reason: 'Profondità della cartella oltre il limite di sicurezza' });
      return;
    }
    let stats;
    let entries;
    try {
      stats = await fsp.lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink() || await fsp.realpath(current) !== current) {
        throw new Error('La cartella sorgente è cambiata o non è sicura.');
      }
      entries = await visibleEntries(current, await fsp.readdir(current, { withFileTypes: true }), signal);
    } catch (error) {
      cancelled(signal);
      failures.push({ path: current, reason: error.message });
      return;
    }
    directories.push({ source, relative, stats });
    for (const entry of entries) {
      cancelled(signal);
      if (entry.name === '.securecopy-versions' || /^\.(?:.*\.)?securecopy-[a-f0-9-]+\.part$/.test(entry.name)) continue;
      const child = path.join(current, entry.name);
      const childRelative = path.join(relative, entry.name);
      try {
        const childStats = await fsp.lstat(child);
        if (childStats.isSymbolicLink()) {
          failures.push({ path: child, reason: 'Link simbolico non copiato per sicurezza' });
        } else if (childStats.isDirectory()) {
          await visit(source, child, childRelative, depth + 1);
        } else if (childStats.isFile()) {
          files.push({ source, path: child, relative: childRelative, stats: childStats });
          totalBytes += childStats.size;
        } else {
          failures.push({ path: child, reason: 'Tipo di file non supportato' });
        }
      } catch (error) {
        failures.push({ path: child, reason: error.message });
      }
    }
    onProgress?.({ phase: 'scan', filesFound: files.length, totalBytes });
  }

  for (const source of sources) {
    if (source.isFile) {
      cancelled(signal);
      const lstats = await fsp.lstat(source.root);
      if (lstats.isSymbolicLink()) {
        failures.push({ path: source.root, reason: 'Link simbolico non copiato per sicurezza' });
      } else if (lstats.isFile()) {
        files.push({ source, path: source.root, relative: '', stats: lstats });
        totalBytes += lstats.size;
        onProgress?.({ phase: 'scan', filesFound: files.length, totalBytes });
      } else {
        failures.push({ path: source.root, reason: 'Tipo di file non supportato' });
      }
    } else {
      await visit(source, source.root);
    }
  }
  failures.forEach(item => onLog?.('WARNING', `${item.path}: ${item.reason}`));
  return { files, directories, failures, totalBytes };
}

async function ensureSafeDirectory(root, relative = '') {
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stats = await fsp.lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Percorso di destinazione non sicuro: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fsp.mkdir(current);
    }
  }
  return current;
}

async function sha256(file, signal, onBytes) {
  cancelled(signal);
  const hash = crypto.createHash('sha256');
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  const handle = await fsp.open(file, flags);
  const stats = await handle.stat();
  if (!stats.isFile()) {
    await handle.close();
    throw new Error('Il percorso non è un file normale.');
  }
  const stream = handle.createReadStream({ autoClose: false, highWaterMark: 256 * 1024 });
  const abort = () => stream.destroy(new Error('Operazione annullata'));
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for await (const chunk of stream) {
      cancelled(signal);
      hash.update(chunk);
      onBytes?.(chunk.length);
    }
    return hash.digest('hex');
  } finally {
    signal?.removeEventListener('abort', abort);
    stream.destroy();
    await handle.close();
  }
}

function metadataDifferences(source, dest) {
  const differences = [];
  if (!sameTimestamp(source.mtimeMs, dest.mtimeMs)) differences.push('data di modifica');
  if (process.platform === 'darwin' || process.platform === 'win32') {
    if (!sameTimestamp(source.birthtimeMs, dest.birthtimeMs)) differences.push('data di creazione');
  }
  if (process.platform !== 'win32') {
    if ((source.mode & 0o7777) !== (dest.mode & 0o7777)) differences.push('permessi');
    if (source.uid !== dest.uid) differences.push('proprietario');
    if (source.gid !== dest.gid) differences.push('gruppo');
  }
  return differences;
}

function sameMetadata(source, dest) {
  return metadataDifferences(source, dest).length === 0;
}

async function preserveMetadata(action, warning, signal, allow, onWarning) {
  try { return await action(); }
  catch (error) {
    cancelled(signal);
    if (!allow) throw error;
    onWarning?.(warning);
    return null;
  }
}

async function optionalMacMetadata(file, signal, allow, onWarning) {
  return preserveMetadata(() => readMacMetadata(file, signal), 'Attributi del filesystem non leggibili; il contenuto viene comunque verificato.', signal, allow, onWarning);
}

async function copyBytes(source, temp, signal, onBytes, flags = 'wx') {
  let copied = 0;
  const reader = fs.createReadStream(source, { flags: fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0), highWaterMark: 256 * 1024 });
  reader.on('data', chunk => { copied += chunk.length; onBytes?.(copied); });
  let writer;
  try { writer = fs.createWriteStream(temp, { flags }); await pipeline(reader, writer, { signal }); }
  finally { reader.destroy(); writer?.destroy(); }
}

async function readResourceFork(file, signal) {
  if (process.platform !== 'darwin') return null;
  const fork = `${file}/..namedfork/rsrc`;
  let stats;
  try { stats = await fsp.lstat(fork); }
  catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null; throw error; }
  if (!stats.size) return null;
  const hash = await sha256(fork, signal);
  if (!matches(stats, await fsp.lstat(fork))) throw new Error('Il resource fork è cambiato durante la verifica.');
  return { bytes: stats.size, sha256: hash };
}

function sameResourceFork(a, b) {
  return a?.bytes === b?.bytes && a?.sha256 === b?.sha256;
}

async function preserveResourceFork(source, target, signal) {
  const expected = await readResourceFork(source, signal);
  const current = await readResourceFork(target, signal);
  if (sameResourceFork(expected, current)) return;
  if (!expected) throw new Error('Resource fork inatteso nella copia.');
  const before = await fsp.lstat(target);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Destinazione del resource fork non sicura.');
  try {
    await copyBytes(`${source}/..namedfork/rsrc`, `${target}/..namedfork/rsrc`, signal, undefined,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW || 0));
  } catch (error) {
    cancelled(signal);
    throw new Error(`Il disco non consente di conservare il resource fork, che contiene dati aggiuntivi del file. La copia non viene dichiarata completa (${error.code || error.message}).`, { cause: error });
  }
  const after = await fsp.lstat(target);
  if (!after.isFile() || !['dev', 'ino', 'size'].every(key => before[key] === after[key])) throw new Error('Il file è cambiato durante la copia del resource fork.');
  if (!sameResourceFork(expected, await readResourceFork(target, signal))) throw new Error('Resource fork copiato in modo incompleto.');
}

async function requireCreationDate(destination, sourceStats, hash, signal) {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return;
  const stats = await fsp.lstat(destination);
  if (sameTimestamp(stats.birthtimeMs, sourceStats.birthtimeMs)) return;
  try {
    if (process.platform === 'darwin') await setCreationTime(destination, sourceStats.birthtimeMs, { signal });
    else throw new Error('Il disco non conserva la data di creazione richiesta.');
  } catch (cause) {
    cancelled(signal);
    const error = new Error('Contenuto copiato integralmente e verificato, ma la data di creazione non è conservata. Il file resta nella destinazione; riprova per correggere solo la data.', { cause });
    error.code = 'CREATION_DATE_MISMATCH'; error.verifiedContent = true; error.sha256 = hash; error.destination = destination;
    error.expectedCreationDate = new Date(sourceStats.birthtimeMs).toISOString();
    error.actualCreationDate = new Date((await fsp.lstat(destination)).birthtimeMs).toISOString();
    throw error;
  }
}

function shortCopyName(destination) {
  const originalExtension = path.extname(destination);
  let extension = '';
  for (const character of originalExtension) { if (Buffer.byteLength(extension + character) > 80) break; extension += character; }
  const suffix = ` (copia ${crypto.randomUUID().slice(0, 8)})`;
  const budget = 240 - Buffer.byteLength(extension + suffix);
  let stem = '';
  for (const character of path.basename(destination, originalExtension)) {
    if (Buffer.byteLength(stem + character) > budget) break;
    stem += character;
  }
  return path.join(path.dirname(destination), `${stem}${suffix}${extension}`);
}

async function versionDirectory(parent, guard) {
  await assertDirectory(guard);
  const directory = path.join(parent, '.securecopy-versions');
  try { await fsp.mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stats = await fsp.lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Cartella delle versioni non sicura.');
  const versionsGuard = await captureDirectory(directory);
  if (versionsGuard.root !== path.join(guard.root, '.securecopy-versions')) throw new Error('Cartella delle versioni cambiata.');
  await assertDirectory(versionsGuard);
  return { directory, guard: versionsGuard };
}

// An exclusive handle identifies our publication even if writing fails halfway.
// Never write through an existing path or discard a failed published file.
async function publishExclusive(temp, destination, { signal, stats, onOwned, allowMetadataDifferences = false, onMetadataWarning, useLinks = true }) {
  if (useLinks) {
    try {
      await fsp.link(temp, destination);
      onOwned(stats);
      return;
    } catch (error) {
      if (!['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV'].includes(error.code)) throw error;
    }
  }
  await ensureSpace(path.dirname(destination), stats.size);
  const handle = await fsp.open(destination, 'wx', 0o600);
  let owned;
  try {
    owned = await handle.stat();
    onOwned(owned);
    const reader = fs.createReadStream(temp, { flags: fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0), highWaterMark: 256 * 1024 });
    const abort = () => reader.destroy(new Error('Operazione annullata'));
    signal?.addEventListener('abort', abort, { once: true });
    try {
      for await (const chunk of reader) {
        let offset = 0;
        while (offset < chunk.length) {
          cancelled(signal);
          const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
          if (!bytesWritten) throw new Error('Scrittura della destinazione interrotta.');
          offset += bytesWritten;
        }
      }
    } finally { signal?.removeEventListener('abort', abort); reader.destroy(); }
    await handle.sync();
  } finally {
    // ExFAT assigns a real inode only when the first cluster is allocated.
    // Refresh ownership from our still-open descriptor, including failed writes;
    // a competing pathname never becomes our owned file this way.
    try { owned = await handle.stat(); onOwned(owned); }
    finally { await handle.close(); }
  }
  const now = await fsp.lstat(destination);
  if (!now.isFile() || now.dev !== owned.dev || now.ino !== owned.ino) throw new Error('La pubblicazione è cambiata.');
  await preserveResourceFork(temp, destination, signal);
  await preserveMetadata(() => fsp.chmod(destination, stats.mode & 0o7777), 'Permessi non conservati dal disco.', signal, allowMetadataDifferences, onMetadataWarning);
  await preserveMetadata(() => fsp.utimes(destination, stats.atimeMs / 1000, stats.mtimeMs / 1000), 'Date non conservate dal disco.', signal, allowMetadataDifferences, onMetadataWarning);
  if (process.platform === 'darwin') {
    try { await setCreationTime(destination, stats.birthtimeMs, { signal }); }
    catch (error) { cancelled(signal); if (!allowMetadataDifferences) throw error; onMetadataWarning?.('Data di creazione non conservata dal disco.'); }
  }
}

async function copyToTemp(source, temp, sourceStats, signal, onBytes, allowMetadataDifferences = true, onMetadataWarning) {
  cancelled(signal);
  if (process.platform === 'darwin') {
    let polling = true;
    const timer = setInterval(async () => {
      try { const stats = await fsp.stat(temp); if (polling) onBytes?.(stats.size); } catch { /* ditto is still creating it */ }
    }, 150);
    try {
      // ditto preserves macOS creation time, resource forks and extended attributes.
      try { await execFileAsync('/usr/bin/ditto', [source, temp], { signal }); }
      catch (error) {
        cancelled(signal);
        if (!allowMetadataDifferences) throw error;
        // ditto can fail solely on ACLs, flags or resource forks unsupported by the disk.
        // A data-only fallback must still pass every size/hash/source-stability check below.
        onMetadataWarning?.('Copia dei metadati non disponibile; verifica integrale del contenuto con copia diretta.');
        await copyBytes(source, temp, signal, onBytes, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW || 0));
      }
    } finally {
      polling = false;
      clearInterval(timer);
    }
  } else {
    await copyBytes(source, temp, signal, onBytes);
  }

  await preserveResourceFork(source, temp, signal);
  await preserveMetadata(() => fsp.chmod(temp, sourceStats.mode & 0o777), 'Permessi non conservati dal disco.', signal, allowMetadataDifferences, onMetadataWarning);
  await preserveMetadata(() => fsp.utimes(temp, sourceStats.atimeMs / 1000, sourceStats.mtimeMs / 1000), 'Date non conservate dal disco.', signal, allowMetadataDifferences, onMetadataWarning);
  if (process.platform === 'darwin') {
    const copiedStats = await fsp.stat(temp);
    if (Math.abs(sourceStats.birthtimeMs - copiedStats.birthtimeMs) > 0.01) {
      // ditto can clamp creation time to modification time when the source has a later creation date.
      try {
        await setCreationTime(temp, sourceStats.birthtimeMs, { signal });
      } catch (error) {
        cancelled(signal);
        if (allowMetadataDifferences) onMetadataWarning?.('Data di creazione non conservata dal disco.');
        else {
          throw error;
        }
      }
    }
  }
  if (process.platform === 'win32') {
    const script = '$s=[System.IO.File]::GetCreationTimeUtc($env:SC_SOURCE);' +
      '[System.IO.File]::SetCreationTimeUtc($env:SC_TEMP,$s)';
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      signal, env: { ...process.env, SC_SOURCE: source, SC_TEMP: temp }
    });
  }
}

async function ensureSpace(directory, bytes) {
  if (typeof fsp.statfs !== 'function') return;
  const stats = await fsp.statfs(directory);
  const available = stats.bavail * stats.bsize;
  if (Number.isFinite(available) && available < bytes + Math.min(bytes * 0.05, 512 * 1024 * 1024)) {
    throw new Error('Spazio disponibile insufficiente per la copia temporanea.');
  }
}

async function copyFileVerified(item, destination, { signal, onBytes, onPhase, onRead, onVerified, expectedTarget, directoryGuard, onDestination, onVersion, policy = 'replace', allowMetadataDifferences = true, onMetadataWarning } = {}) {
  cancelled(signal);
  const sourceGuard = await captureDirectory(path.dirname(item.path));
  const targetGuard = directoryGuard || await captureDirectory(path.dirname(destination));
  const parentGuard = await captureDirectory(path.dirname(destination));
  await assertDirectory(targetGuard);
  const current = await fsp.lstat(item.path);
  if (!current.isFile() || !matches(item.stats, current)) {
    throw new Error('Il file sorgente è cambiato durante la scansione.');
  }
  onPhase?.('compare');
  const sourceMetadata = await optionalMacMetadata(item.path, signal, allowMetadataDifferences, onMetadataWarning);
  const sourceFork = await readResourceFork(item.path, signal);
  const sourceHash = await sha256(item.path, signal, bytes => onRead?.('source', bytes, current.size));
  let existing;
  try {
    existing = await fsp.lstat(destination);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('La destinazione esistente non è un file normale.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  if (expectedTarget !== undefined && !matches(expectedTarget, snapshot(existing))) throw new Error('La destinazione è cambiata dopo l’analisi.');
  if (existing && existing.size === current.size) {
    const existingHash = await sha256(destination, signal, bytes => onRead?.('destination', bytes, existing.size));
    if (existingHash === sourceHash && sameResourceFork(sourceFork, await readResourceFork(destination, signal)) && (allowMetadataDifferences || sameMetadata(current, existing))) {
      const destinationMetadata = await optionalMacMetadata(destination, signal, allowMetadataDifferences, onMetadataWarning);
      const differences = [...metadataDifferences(current, existing), ...(sourceMetadata && destinationMetadata ? macMetadataDifferences(sourceMetadata, destinationMetadata) : [])];
      if (allowMetadataDifferences || !differences.length) {
        for (const difference of differences) onMetadataWarning?.(`Contenuto già identico; differenza nei metadati: ${difference}.`);
        cancelled(signal);
        await assertDirectory(sourceGuard);
        await assertDirectory(targetGuard);
        await assertDirectory(parentGuard);
        if (!matches(current, await fsp.lstat(item.path))) throw new Error('La sorgente è cambiata durante la verifica.');
        if (!matches(existing, await fsp.lstat(destination))) throw new Error('La destinazione è cambiata durante la verifica.');
        try { await requireCreationDate(destination, current, sourceHash, signal); }
        catch (error) { error.resourceFork = sourceFork; throw error; }
        onVerified?.(sourceHash, sourceFork);
        return 'skipped';
      }
    }
  }
  if (existing && policy === 'skip') return 'kept';

  if (existing && policy === 'both') {
    destination = shortCopyName(destination);
    existing = null;
  }
  await assertDirectory(sourceGuard);
  await assertDirectory(targetGuard);
  await ensureSpace(path.dirname(destination), current.size);
  const temp = path.join(path.dirname(destination), `.securecopy-${crypto.randomUUID()}.part`);
  try {
    onPhase?.('copy');
    await copyToTemp(item.path, temp, item.stats, signal, onBytes, allowMetadataDifferences, onMetadataWarning);
    onBytes?.(current.size);
    const tempStats = await fsp.stat(temp);
    if (tempStats.size !== current.size) throw new Error('Dimensione della copia diversa dalla sorgente.');
    onPhase?.('verify');
    const copiedHash = await sha256(temp, signal, bytes => onRead?.('copy', bytes, current.size));
    const sourceHashAfter = await sha256(item.path, signal, bytes => onRead?.('source-after', bytes, current.size));
    if (copiedHash !== sourceHash || sourceHashAfter !== sourceHash) {
      throw new Error('Checksum diverso o sorgente modificata durante la copia.');
    }
    if (!sameResourceFork(sourceFork, await readResourceFork(temp, signal)) || !sameResourceFork(sourceFork, await readResourceFork(item.path, signal))) throw new Error('Resource fork diverso o sorgente modificata durante la copia.');
    const copiedMetadata = await optionalMacMetadata(temp, signal, allowMetadataDifferences, onMetadataWarning);
    const differences = [...metadataDifferences(item.stats, tempStats), ...(sourceMetadata && copiedMetadata ? macMetadataDifferences(sourceMetadata, copiedMetadata) : [])].filter(difference => {
      if (allowMetadataDifferences) { onMetadataWarning?.(`Metadati non conservati dal disco: ${difference}.`); return false; }
      return true;
    });
    if (differences.length) throw new Error(`Metadati non conservati: ${differences.join(', ')}.`);
    const handle = await fsp.open(temp, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
    cancelled(signal);
    await assertDirectory(sourceGuard);
    await assertDirectory(targetGuard);
    await assertDirectory(parentGuard);
    if (!matches(current, await fsp.lstat(item.path))) throw new Error('La sorgente è cambiata durante la copia.');
    if (!matches(snapshot(existing), snapshot(await statOrNull(destination)))) throw new Error('Conflitto: la destinazione è cambiata durante la copia.');
    const probe = path.join(path.dirname(destination), `.securecopy-${crypto.randomUUID()}.part`);
    let useLinks = true, linked = false;
    try { await fsp.link(temp, probe); linked = true; }
    catch (error) { if (!['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV'].includes(error.code)) throw error; useLinks = false; }
    finally {
      if (linked) {
        await assertDirectory(parentGuard);
        const probeStats = await fsp.lstat(probe);
        if (probeStats.dev !== tempStats.dev || probeStats.ino !== tempStats.ino) throw new Error('Il temporaneo di pubblicazione è cambiato.');
        await fsp.unlink(probe);
      }
    }
    // A fallback needs another full file while the verified temporary exists.
    // Check before moving the previous version out of its original location.
    if (!useLinks) await ensureSpace(path.dirname(destination), current.size);
    let backup = null;
    if (existing) {
      const versions = await versionDirectory(path.dirname(destination), parentGuard);
      await assertDirectory(targetGuard);
      backup = path.join(versions.directory, `version-${crypto.randomUUID()}`);
      await fsp.rename(destination, backup);
      onVersion?.(backup);
      const movedStats = await fsp.lstat(backup);
      if (!['dev', 'ino', 'size', 'mtimeMs', 'mode'].every(key => existing[key] === movedStats[key])) {
        // Preserve the competing version and never overwrite a newly appeared destination.
        if (!await statOrNull(destination)) await fsp.link(backup, destination).catch(() => {});
        throw new Error(`Conflitto: versione precedente conservata in ${backup}`);
      }
    }
    let owned = null;
    try {
      await assertDirectory(targetGuard);
      await assertDirectory(parentGuard);
      await publishExclusive(temp, destination, { signal, stats: tempStats, useLinks, allowMetadataDifferences, onMetadataWarning, onOwned: stats => { owned = stats; } });
      if (owned.ino !== tempStats.ino || owned.dev !== tempStats.dev) {
        // Verify published contents even on filesystems without hard links.
        if (await sha256(destination, signal) !== sourceHash || !sameResourceFork(sourceFork, await readResourceFork(destination, signal))) throw new Error('Verifica finale della destinazione fallita.');
        const finalStats = await fsp.stat(destination);
        const finalMetadata = await optionalMacMetadata(destination, signal, allowMetadataDifferences, onMetadataWarning);
        const finalDifferences = [...metadataDifferences(item.stats, finalStats), ...(sourceMetadata && finalMetadata ? macMetadataDifferences(sourceMetadata, finalMetadata) : [])].filter(difference => {
          if (allowMetadataDifferences) { onMetadataWarning?.(`Metadati non conservati dal disco: ${difference}.`); return false; }
          return true;
        });
        if (finalDifferences.length) throw new Error(`Il filesystem non conserva i metadati richiesti: ${finalDifferences.join(', ')}. Versione precedente conservata.`);
      }
      const committed = await fsp.open(destination, 'r');
      try { await committed.sync(); } finally { await committed.close(); }
    } catch (error) {
      if (backup) error.previousVersion = backup;
      try {
        await assertDirectory(targetGuard);
        await assertDirectory(parentGuard);
        const failed = await statOrNull(destination);
        if (owned && failed?.isFile() && owned.dev === failed.dev && owned.ino === failed.ino) {
          const versions = await versionDirectory(path.dirname(destination), parentGuard);
          const quarantine = path.join(versions.directory, `incomplete-${crypto.randomUUID()}`);
          await fsp.rename(destination, quarantine);
          error.incompletePath = quarantine;
          error.message += ` Copia incompleta conservata in ${quarantine}.`;
        }
        if (backup && !await statOrNull(destination)) {
          const backupStats = await fsp.lstat(backup);
          let restored;
          await publishExclusive(backup, destination, { stats: backupStats, allowMetadataDifferences: true, onMetadataWarning, onOwned: stats => { restored = stats; } });
          if (!restored || await sha256(backup) !== await sha256(destination)) throw new Error('Ripristino della versione precedente non verificato.');
        }
      } catch (recoveryError) {
        error.message += ` Ripristino da controllare: ${recoveryError.message}${backup ? ` Versione precedente conservata in ${backup}.` : ''}`;
      }
      throw error;
    }
    onDestination?.(destination);
    try { await requireCreationDate(destination, current, sourceHash, signal); }
    catch (error) { error.copyResult = 'copied'; error.previousVersion = backup; error.resourceFork = sourceFork; throw error; }
    onVerified?.(sourceHash, sourceFork);
    if (process.platform !== 'win32') {
      try {
        const directory = await fsp.open(path.dirname(destination), 'r');
        try { await directory.sync(); } finally { await directory.close(); }
      } catch { /* some filesystems do not permit directory sync */ }
    }
    return 'copied';
  } finally {
    await fsp.rm(temp, { force: true }).catch(() => {});
  }
}

async function runCopy({ sourceDirs, destDir, signal, waitIfPaused, onLog, onProgress, policy = 'replace', onlyPaths, allowMetadataDifferences = true }) {
  const selection = onlyPaths === undefined ? null : pathSelection(onlyPaths);
  const { sources, destRoot } = await preparePaths(sourceDirs, destDir);
  const rootGuard = await captureDirectory(destRoot);
  const plan = await scanSources(sources, { signal, onLog, onProgress });
  if (selection) {
    plan.failures = plan.failures.filter(failure => {
      if (!path.isAbsolute(failure.path)) return true;
      const source = sources.find(source => isInside(failure.path, source.root));
      return source && selection.related(path.join(source.name, path.relative(source.root, failure.path)));
    });
    const keyFor = item => path.join(item.source.name, item.relative);
    const available = new Set([...plan.files.map(keyFor), ...plan.directories.map(keyFor)]);
    for (const relative of selection.paths) {
      if (!available.has(relative)) plan.failures.push({ path: relative, reason: 'Il percorso richiesto per la ripresa è assente dalla sorgente. Seleziona di nuovo il materiale.' });
    }
    plan.files = plan.files.filter(item => selection.contains(keyFor(item)));
    const neededDirectories = new Set();
    for (const item of [...plan.files, ...plan.directories.filter(item => selection.contains(keyFor(item)))]) {
      for (let key = keyFor(item); key !== '.'; key = path.dirname(key)) neededDirectories.add(key);
    }
    plan.directories = plan.directories.filter(item => neededDirectories.has(keyFor(item)));
    if (!selection.paths.length) plan.failures.push({ path: '', reason: 'Nessun percorso disponibile per la ripresa.' });
    plan.totalBytes = plan.files.reduce((total,item) => total + item.stats.size,0);
  }
  const report = { status: 'completed', totalFiles: plan.files.length, totalBytes: plan.totalBytes,
    copied: 0, skipped: 0, kept: 0, failures: [...plan.failures], filesProcessed: 0, bytesProcessed: 0,
    transferredBytes: 0, verifiedFiles: [], warnings: [] };
  const verifiedSnapshots = new Map();
  const destinationOwners = new Map();
  const blockedDirectories = [];
  async function claimDestination(relative) {
    const target = path.join(destRoot, relative), stats = await statOrNull(target);
    if (!stats) return;
    const key = `${stats.dev}:${stats.ino}:${target.normalize('NFC').toLowerCase()}`;
    const owner = destinationOwners.get(key);
    if (owner && owner !== relative) throw new Error(`Conflitto di nomi: «${owner}» e «${relative}» indicano lo stesso elemento sul disco di destinazione. Il file precedente non viene sostituito. Usa un disco che distingua questi nomi o rinominali.`);
    destinationOwners.set(key, relative);
  }
  const warning = (file, reason) => {
    if (!report.warnings.some(item => item.path === file && item.reason === reason)) {
      report.warnings.push({ path: file, reason });
      onLog?.('WARNING', `${file}: ${reason}`);
    }
  };
  let createdDirectories = false;

  try {
    for (const directory of plan.directories) {
      cancelled(signal);
      const targetRoot = path.join(destRoot, directory.source.name);
      try {
        const key = path.join(directory.source.name, directory.relative);
        if (blockedDirectories.some(parent => key === parent || key.startsWith(parent + path.sep))) continue;
        await assertDirectory(rootGuard);
        if (!await statOrNull(path.join(targetRoot, directory.relative))) createdDirectories = true;
        await ensureSafeDirectory(destRoot, path.join(directory.source.name, directory.relative));
        await claimDestination(key);
      }
      catch (error) { blockedDirectories.push(path.join(directory.source.name, directory.relative)); report.failures.push({ path: path.join(directory.source.root, directory.relative), reason: error.message }); }
    }

    for (const item of plan.files) {
      cancelled(signal);
      await waitIfPaused?.(signal);
      cancelled(signal);
      const relative = path.join(item.source.name, item.relative);
      const destination = path.join(destRoot, relative);
      let currentTransferred = 0;
      let verifiedHash = null;
      let verifiedFork = null;
      let finalDestination = destination;
      let previousVersion = null;
      let fraction = 0;
      const reads = new Map();
      const emit = (phase, extra = {}) => {
        const completedFraction = report.totalBytes ? (report.bytesProcessed + item.stats.size * fraction) / report.totalBytes : (report.filesProcessed + fraction) / Math.max(1, report.totalFiles);
        onProgress?.({ phase, currentFile: relative, filesProcessed: report.filesProcessed, totalFiles: report.totalFiles,
          bytesProcessed: report.bytesProcessed, totalBytes: report.totalBytes,
          percentage: Math.min(99, Math.floor(completedFraction * 99)),
          transferredBytes: report.transferredBytes + currentTransferred, ...extra });
      };
      try {
        if (blockedDirectories.some(parent => relative === parent || relative.startsWith(parent + path.sep))) throw new Error('Cartella di destinazione non disponibile o in conflitto di nomi: il file non è stato copiato.');
        await assertDirectory(rootGuard);
        await ensureSafeDirectory(destRoot, path.dirname(relative));
        await claimDestination(relative);
        onLog?.('INFO', `Controllo completo: ${relative}`);
      const result = await copyFileVerified(item, destination, {
        signal, policy, allowMetadataDifferences, onMetadataWarning: reason => warning(item.path, reason), directoryGuard: rootGuard, onVersion: file => { previousVersion = file; }, onDestination: file => { finalDestination = file; },
        onPhase: phase => { if (phase === 'copy') fraction = Math.max(fraction, 0.15); if (phase === 'verify') fraction = Math.max(fraction, 0.8); emit(phase); },
        onRead: (pass, bytes, total) => {
          const read = (reads.get(pass) || 0) + bytes; reads.set(pass, read);
          const part = total ? Math.min(1, read / total) : 1;
          fraction = Math.max(fraction, pass === 'source' ? part * 0.1 : pass === 'destination' ? 0.1 + part * 0.05 : pass === 'copy' ? 0.8 + part * 0.09 : 0.89 + part * 0.1);
          emit(pass === 'source' || pass === 'destination' ? 'compare' : 'verify', { readPass: pass, readBytes: read, readTotal: total });
        },
        onBytes: bytes => {
          currentTransferred = Math.max(currentTransferred, bytes);
          fraction = Math.max(fraction, 0.15 + (item.stats.size ? Math.min(1, bytes / item.stats.size) : 1) * 0.65);
          emit('copy', { currentFileBytes: bytes, currentFileTotal: item.stats.size });
        },
        onVerified: (hash, fork) => { verifiedHash = hash; verifiedFork = fork; }
        });
        if (verifiedHash) { verifiedSnapshots.set(relative, snapshot(await fsp.lstat(finalDestination))); await claimDestination(path.relative(destRoot, finalDestination)); }
        report[result]++;
        if (result === 'kept') report.failures.push({ path: item.path, reason: 'Saltato per scelta: il file di destinazione ha un contenuto diverso e non è stato sostituito.' });
        if (verifiedHash) report.verifiedFiles.push({ path: path.relative(destRoot, finalDestination), sourceRelative: relative, sha256: verifiedHash, resourceFork: verifiedFork, bytes: item.stats.size,
          createdAt: item.stats.birthtime.toISOString(), modifiedAt: item.stats.mtime.toISOString(), previousVersion, status: result });
        if (result === 'copied') report.transferredBytes += item.stats.size;
        onLog?.('SUCCESS', `${result === 'copied' ? 'Verificato' : result === 'kept' ? 'Saltato per scelta' : 'Già valido'}: ${relative}`);
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') throw error;
        if (error.verifiedContent) {
          const result = error.copyResult || 'skipped';
          report[result]++;
          if (result === 'copied') report.transferredBytes += item.stats.size;
          verifiedSnapshots.set(relative, snapshot(await fsp.lstat(error.destination)));
          report.verifiedFiles.push({ path: path.relative(destRoot, error.destination), sourceRelative: relative, sha256: error.sha256, resourceFork: error.resourceFork || null, bytes: item.stats.size,
            createdAt: item.stats.birthtime.toISOString(), modifiedAt: item.stats.mtime.toISOString(), previousVersion: error.previousVersion || previousVersion,
            status: result, creationDatePreserved: false });
        }
        report.failures.push({ path: item.path, reason: error.message, metadataOnly: !!error.verifiedContent,
          expectedCreationDate: error.expectedCreationDate, actualCreationDate: error.actualCreationDate,
          previousVersion: error.previousVersion || previousVersion, incompletePath: error.incompletePath || null });
        onLog?.('ERROR', `${relative}: ${error.message}`);
      }
      report.filesProcessed++;
      report.bytesProcessed += item.stats.size;
      onProgress?.({ phase: 'copy', currentFile: relative, filesProcessed: report.filesProcessed,
        totalFiles: report.totalFiles, bytesProcessed: report.bytesProcessed, totalBytes: report.totalBytes,
        percentage: Math.min(99, Math.floor((report.totalBytes ? report.bytesProcessed / report.totalBytes : report.filesProcessed / Math.max(1, report.totalFiles)) * 99)),
        transferredBytes: report.transferredBytes });
    }

    // Writing children changes directory modification times; restore them last.
    for (const directory of (report.copied || createdDirectories ? plan.directories.reverse() : [])) {
      const target = path.join(destRoot, directory.source.name, directory.relative);
      try {
        const key = path.join(directory.source.name, directory.relative);
        if (blockedDirectories.some(parent => key === parent || key.startsWith(parent + path.sep))) continue;
        await assertDirectory(rootGuard);
        const stats = await fsp.lstat(target);
        if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('La directory di destinazione è cambiata.');
        await preserveMetadata(() => fsp.chmod(target, directory.stats.mode & 0o777), 'Permessi della cartella non conservati dal disco.', signal, allowMetadataDifferences, reason => warning(target, reason));
        await preserveMetadata(() => fsp.utimes(target, directory.stats.atime, directory.stats.mtime), 'Date della cartella non conservate dal disco.', signal, allowMetadataDifferences, reason => warning(target, reason));
      } catch (error) {
        cancelled(signal);
        report.failures.push({ path: path.join(directory.source.root, directory.relative), reason: `Cartella da controllare: ${error.message}` });
      }
    }
    // Confirm coverage at the end too: cards can gain files and destinations can
    // disappear while later files are being copied. Never label such a run complete.
    onProgress?.({ phase: 'verify', currentFile: 'Controllo finale dei file e delle cartelle', percentage: 99,
      filesProcessed: report.filesProcessed, totalFiles: report.totalFiles, transferredBytes: report.transferredBytes });
    await assertDirectory(rootGuard);
    const finalPlan = await scanSources(sources, { signal });
    const inScope = item => !selection || selection.contains(path.join(item.source.name, item.relative));
    const originals = new Map(plan.files.map(item => [path.join(item.source.name, item.relative), item]));
    const finalSources = new Map(finalPlan.files.filter(inScope).map(item => [path.join(item.source.name, item.relative), item]));
    const failed = new Set(report.failures.map(item => item.path));
    const fail = (file, reason, extra = {}) => { if (!failed.has(file)) { failed.add(file); report.failures.push({ path: file, reason, ...extra }); } };
    for (const [key, item] of finalSources) {
      if (!originals.has(key)) {
        report.totalFiles++;
        fail(item.path, 'File aggiunto alla sorgente durante la copia: non è ancora stato copiato. Riprova solo questo elemento.');
      }
    }
    const directoryKeys = new Set(plan.directories.map(item => path.join(item.source.name, item.relative)));
    for (const directory of finalPlan.directories.filter(inScope)) {
      const key = path.join(directory.source.name, directory.relative);
      if (!directoryKeys.has(key)) fail(path.join(directory.source.root, directory.relative), 'Cartella aggiunta alla sorgente durante la copia: riprova questo elemento.');
    }
    for (const failure of finalPlan.failures) {
      const belongs = !selection || sources.some(source => {
        const key = path.join(source.name, path.relative(source.root, failure.path));
        return selection.related(key);
      });
      if (belongs) fail(failure.path, failure.reason);
    }
    const valid = [];
    for (const record of report.verifiedFiles) {
      cancelled(signal);
      const sourceKey = record.sourceRelative;
      const original = originals.get(sourceKey);
      try {
        if (!original || !finalSources.has(sourceKey) || !matches(original.stats, finalSources.get(sourceKey).stats)) throw new Error('La sorgente è cambiata o non è più presente dopo la copia.');
        const target = path.join(destRoot, record.path), stats = await fsp.lstat(target);
        if (await fsp.realpath(path.dirname(target)) !== path.dirname(target)) throw new Error('La cartella di destinazione è cambiata dopo la copia.');
        if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== record.bytes) throw new Error('File di destinazione mancante, incompleto o sostituito dopo la copia.');
        if (!matches(verifiedSnapshots.get(sourceKey), snapshot(stats))) {
          if (await sha256(target, signal) !== record.sha256 || !sameResourceFork(record.resourceFork, await readResourceFork(target, signal)) || !matches(stats, await fsp.lstat(target))) throw new Error('Il contenuto di destinazione è cambiato dopo la verifica.');
        }
        if (!matches(original.stats, await fsp.lstat(original.path))) throw new Error('La sorgente è cambiata durante il controllo finale.');
        if (record.creationDatePreserved !== false) await requireCreationDate(target, original.stats, record.sha256, signal);
        valid.push(record);
      } catch (error) {
        cancelled(signal);
        if (error.verifiedContent) { record.creationDatePreserved = false; valid.push(record); }
        else report[record.status]--;
        fail(original?.path || record.sourceRelative || record.path, error.message, { metadataOnly: !!error.verifiedContent,
          expectedCreationDate: error.expectedCreationDate, actualCreationDate: error.actualCreationDate });
      }
    }
    report.verifiedFiles = valid;
    for (const directory of plan.directories) {
      try {
        const stats = await fsp.lstat(path.join(destRoot, directory.source.name, directory.relative));
        if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Cartella di destinazione mancante o sostituita.');
      } catch (error) { fail(path.join(directory.source.root, directory.relative), error.message); }
    }
    if (report.failures.length) report.status = 'partial';
    return report;
  } catch (error) {
    error.report = report;
    throw error;
  }
}

module.exports = { runCopy, preparePaths, scanSources, copyFileVerified, sha256, readResourceFork, sameResourceFork, requireCreationDate };
