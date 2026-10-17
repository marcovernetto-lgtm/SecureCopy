const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { sha256, copyFileVerified, readResourceFork, sameResourceFork, requireCreationDate } = require('./copy-engine');
const { visibleEntries } = require('./visible-files');
const { TIMESTAMP_TOLERANCE_MS, readMacMetadata } = require('./file-metadata');
const { snapshot, matches, statOrNull, captureDirectory, assertDirectory, overlap } = require('./fs-safety');

const execFileAsync = promisify(execFile);
const labels = {
  type: 'tipo', content: 'contenuto SHA-256', size: 'dimensione',
  birthtimeMs: 'data di creazione', mtimeMs: 'data di modifica',
  mode: 'permessi', uid: 'proprietario', gid: 'gruppo',
  flags: 'flag', acl: 'ACL', xattrs: 'attributi estesi', target: 'collegamento'
};
function check(signal) {
  if (signal?.aborted) throw new Error('Analisi annullata.');
}
function sameSnapshot(before, after) {
  return ['dev', 'ino', 'mode', 'size', 'mtimeMs', 'ctimeMs', 'birthtimeMs']
    .every(key => before[key] === after[key]);
}
async function inspect(fullPath, stats, signal, onBytes, mode, knownHash) {
  check(signal);
  const type = stats.isFile() ? 'file' : stats.isDirectory() ? 'directory' :
    stats.isSymbolicLink() ? 'link' : 'special';
  const entry = { path: fullPath, type, stats };
  if (type === 'file' && mode === 'quick') {
    entry.metadata = { size: stats.size, mtimeMs: stats.mtimeMs };
  } else if (type === 'file') {
    entry.metadata = {
      size: stats.size, birthtimeMs: stats.birthtimeMs, mtimeMs: stats.mtimeMs,
      mode: stats.mode & 0o7777, uid: stats.uid, gid: stats.gid,
      ...await readMacMetadata(fullPath, signal)
    };
    entry.hash = knownHash || await sha256(fullPath, signal, onBytes);
    if (!sameSnapshot(stats, await fsp.lstat(fullPath))) {
      throw new Error('Il file è cambiato durante l’analisi.');
    }
  } else if (type === 'link') {
    entry.target = await fsp.readlink(fullPath);
  }
  return entry;
}
async function inventory(root, signal, onProgress, side, exclusions = []) {
  const items = new Map();
  let lastProgress = 0;
  async function visit(relative, depth = 0) {
    check(signal);
    const directory = path.join(root, relative);
    let children;
    try {
      if (depth > 256 || await fsp.realpath(directory) !== directory) {
        throw new Error('Cartella cambiata o profondità oltre il limite di sicurezza.');
      }
      children = await fsp.readdir(directory, { withFileTypes: true });
    }
    catch (error) {
      if (relative) items.set(relative, { type: 'error', path: directory, error: error.message });
      else throw error;
      return;
    }
    children = children.filter(child => !child.name.startsWith('.') && !exclusions.some(pattern => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i').test(child.name)));
    children = await visibleEntries(directory, children, signal);
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      check(signal);
      const childRelative = path.join(relative, child.name);
      const fullPath = path.join(root, childRelative);
      let entry;
      try {
        const stats = await fsp.lstat(fullPath);
        entry = { path: fullPath, stats, type: stats.isDirectory() ? 'directory' : 'pending' };
      } catch (error) {
        if (signal?.aborted) throw error;
        entry = { type: 'error', path: fullPath, error: error.message };
      }
      items.set(childRelative, entry);
      if (Date.now() - lastProgress >= 120) { lastProgress = Date.now(); onProgress?.({ phase: 'inventory', side, count: items.size, current: childRelative }); }
      if (entry.type === 'directory') await visit(childRelative, depth + 1);
    }
  }
  await visit('');
  onProgress?.({ phase: 'inventory', side, count: items.size, current: '' });
  return items;
}
function entryIssues(left, right) {
  if (!left || !right) return [];
  if (left.verificationError || right.verificationError) return [left.verificationError || right.verificationError];
  if (left.type === 'error' || right.type === 'error') {
    return [`errore di lettura: ${left.error || right.error}`];
  }
  if (left.type !== right.type) return ['tipo'];
  if (left.type === 'link' || left.type === 'special') return ['elemento non supportato per la copia automatica'];
  if (left.type === 'directory') return [];
  const issues = [];
  if (left.hash !== right.hash) issues.push(labels.content);
  for (const key of Object.keys(left.metadata)) {
    const a = left.metadata[key], b = right.metadata[key];
    const same = key.endsWith('timeMs') ? Math.abs(a - b) <= (left.hash && right.hash ? TIMESTAMP_TOLERANCE_MS : 5) :
      JSON.stringify(a) === JSON.stringify(b);
    if (!same) issues.push(labels[key] || key);
  }
  return issues;
}
function publicEntry(relative, left, right) {
  if (!left && !right) return { relative, status: 'missing', issues: ['elemento assente in entrambe le cartelle'], leftExists: false, rightExists: false, leftType: null, rightType: null, copyable: false };
  if (!left || !right) {
    const existing = left || right;
    return {
      relative, status: 'missing', issues: [left ? 'manca nella cartella destra' : 'manca nella cartella sinistra'],
      leftExists: !!left, rightExists: !!right,
      leftType: left?.type || null, rightType: right?.type || null,
      copyable: existing.type === 'file' || existing.type === 'directory'
    };
  }
  const issues = entryIssues(left, right);
  return {
    relative, status: issues.length ? 'different' : 'identical', issues,
    leftExists: true, rightExists: true, leftType: left.type, rightType: right.type,
    copyable: left.type === 'file' && right.type === 'file'
  };
}
function entryDetails(entry) {
  return entry ? { type: entry.type, size: entry.stats?.size ?? null,
    modified: entry.stats?.mtimeMs ?? null, sha256: entry.hash || null,
    metadata: entry.metadata || null, error: entry.error || entry.verificationError || null } : null;
}
async function compareFolders(leftPath, rightPath, { signal, onProgress, mode = 'quick', exclusions = [] } = {}) {
  if (!Array.isArray(exclusions) || exclusions.length > 100 || exclusions.some(value => typeof value !== 'string' || value.length > 100)) throw new Error('Esclusioni non valide.');
  if (!['quick', 'deep'].includes(mode)) throw new Error('Modalità non valida.');
  const [leftRoot, rightRoot] = await Promise.all([fsp.realpath(leftPath), fsp.realpath(rightPath)]);
  const [leftStats, rightStats] = await Promise.all([fsp.stat(leftRoot), fsp.stat(rightRoot)]);
  if (!leftStats.isDirectory() || !rightStats.isDirectory()) throw new Error('Seleziona due cartelle.');
  if (overlap(leftRoot, rightRoot)) {
    throw new Error('Le cartelle da confrontare devono essere separate e non contenute una nell’altra.');
  }
  const guards = await Promise.all([captureDirectory(leftRoot), captureDirectory(rightRoot)]);
  const [leftInventory, rightInventory] = await Promise.all([
    inventory(leftRoot, signal, onProgress, 'left', exclusions),
    inventory(rightRoot, signal, onProgress, 'right', exclusions)
  ]);
  onProgress?.({ phase: 'inventory', side: 'left', count: leftInventory.size, current: '' });
  onProgress?.({ phase: 'inventory', side: 'right', count: rightInventory.size, current: '' });
  const totalItems = leftInventory.size + rightInventory.size;
  let totalBytes = 0;
  for (const found of [leftInventory, rightInventory]) {
    for (const item of found.values()) {
      if (mode === 'deep' && item.stats?.isFile()) totalBytes += item.stats.size;
    }
  }
  let processedItems = 0;
  let processedBytes = 0;
  let lastUpdate = 0;
  let current = '';
  let side = 'left';
  function report(force = false) {
    const now = Date.now();
    if (!force && now - lastUpdate < 100) return;
    lastUpdate = now;
    const itemFraction = totalItems ? processedItems / totalItems : 1;
    const byteFraction = totalBytes ? processedBytes / totalBytes : itemFraction;
    const percentage = Math.min(100, Math.floor((itemFraction + byteFraction) * 50));
    onProgress?.({ phase: 'analyze', side, current, processedItems, totalItems,
      processedBytes, totalBytes, percentage });
  }
  async function analyze(found, which) {
    const items = new Map();
    side = which;
    for (const [relative, raw] of found) {
      check(signal);
      current = relative;
      let entry = raw;
      if (raw.stats) {
        const bytesBefore = processedBytes;
        try {
          const freshStats = await fsp.lstat(raw.path);
          if (!(raw.stats.isDirectory() ? matches(raw.stats, freshStats, true) : sameSnapshot(raw.stats, freshStats))) {
            throw new Error('L’elemento è cambiato durante il censimento.');
          }
          entry = await inspect(raw.path, freshStats, signal, count => {
            processedBytes += count;
            report();
          }, mode);
        } catch (error) {
          if (signal?.aborted) throw error;
          entry = { type: 'error', path: raw.path, error: error.message };
        }
        if (mode === 'deep' && raw.stats.isFile()) processedBytes += Math.max(0, raw.stats.size - (processedBytes - bytesBefore));
      }
      items.set(relative, entry);
      found.delete(relative);
      processedItems++;
      report();
    }
    report(true);
    return items;
  }
  report(true);
  const left = await analyze(leftInventory, 'left');
  const right = await analyze(rightInventory, 'right');
  // Join spelling aliases only when the filesystem proves they refer to the same entry.
  // Case-sensitive volumes must keep distinct names distinct.
  const aliases = new Map();
  for (const name of right.keys()) {
    const key = name.normalize('NFC').toLowerCase();
    if (!aliases.has(key)) aliases.set(key, []);
    aliases.get(key).push(name);
  }
  for (const name of left.keys()) {
    if (right.has(name)) continue;
    const candidates = aliases.get(name.normalize('NFC').toLowerCase()) || [];
    if (candidates.length !== 1) continue;
    const candidate = candidates[0], entry = right.get(candidate);
    if (!entry?.stats || left.has(candidate)) continue;
    const resolved = await statOrNull(path.join(rightRoot, name));
    if (resolved && matches(entry.stats, resolved, entry.type === 'directory')) {
      right.set(name, entry);
      right.delete(candidate);
    }
  }
  for (const guard of guards) await assertDirectory(guard);
  return buildComparison({ mode, exclusions, analyzedAt: new Date().toISOString(), leftRoot, rightRoot, left, right,
    guards });
}
function buildComparison(base) {
  const { mode, leftRoot, rightRoot, left, right } = base;
  const names = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => a.localeCompare(b));
  const entries = names.map(relative => {
    const a = left.get(relative), b = right.get(relative), confirmed = base.confirmed?.get(relative);
    const valid = confirmed && a?.stats && b?.stats &&
      matches(confirmed.left, a.stats, a.type === 'directory') && matches(confirmed.right, b.stats, b.type === 'directory');
    return { ...publicEntry(relative, a, b), leftDetails: entryDetails(a), rightDetails: entryDetails(b),
      verified: Boolean(valid && confirmed.sha256), created: Boolean(valid && confirmed.directory), warnings: valid ? confirmed.warnings || [] : [] };
  });
  const summary = { identical: 0, different: 0, missing: 0 };
  for (const entry of entries) summary[entry.status]++;
  const verdict = summary.missing ? 'missing' : summary.different ? 'verify' : 'perfect';
  const compact = item => item ? [item.type, item.hash, item.metadata, item.target, item.error || item.verificationError,
    item.stats && (item.type === 'directory' ? [item.stats.dev, item.stats.ino, item.stats.mode] : snapshot(item.stats))] : null;
  // Hash the same JSON array incrementally instead of duplicating a huge inventory.
  const digest = crypto.createHash('sha256').update('[');
  for (let index = 0; index < names.length; index++) {
    const relative = names[index];
    if (index) digest.update(',');
    digest.update(JSON.stringify([relative, compact(left.get(relative)), compact(right.get(relative))]));
  }
  const fingerprint = digest.update(']').digest('hex');
  return { ...base, entries, summary, verdict, fingerprint };
}

function forRenderer(result) {
  const { mode, exclusions, analyzedAt, incremental, leftRoot, rightRoot, entries, summary, verdict, fingerprint } = result;
  return { mode, exclusions, analyzedAt, incremental, leftRoot, rightRoot, entries, summary, verdict, fingerprint };
}
async function ensureSafeParent(root, relative) {
  const realRoot = await fsp.realpath(root);
  if (realRoot !== root) throw new Error('La cartella radice è cambiata.');
  const parts = path.dirname(relative).split(path.sep).filter(part => part && part !== '.');
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try { await fsp.mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stats = await fsp.lstat(current);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Percorso di destinazione non sicuro.');
  }
}
function expandComparisonDecisions(session, decisions) {
  if (!Array.isArray(decisions)) throw new Error('Scelte non valide.');
  const index = new Map(session.entries.map(entry => [entry.relative, entry]));
  const choices = new Map();
  for (const decision of decisions) {
    if (typeof decision?.relative !== 'string' || !['left', 'right'].includes(decision.keep) || choices.has(decision.relative)) throw new Error('Scelte non valide.');
    const entry = index.get(decision.relative);
    if (!entry?.copyable || !['missing', 'different'].includes(entry.status) || !(decision.keep === 'left' ? entry.leftExists : entry.rightExists)) throw new Error('Scelta non autorizzata.');
    choices.set(decision.relative, decision.keep);
  }
  const folders = new Map(decisions.filter(decision => {
    const entry = index.get(decision.relative);
    return (decision.keep === 'left' ? entry.leftType : entry.rightType) === 'directory';
  }).map(decision => [decision.relative, decision.keep]));
  for (const child of session.entries) {
    if (!child.copyable || child.status === 'identical') continue;
    let parent = path.dirname(child.relative), keep;
    while (parent !== '.') {
      if (folders.has(parent)) {
        if (keep && keep !== folders.get(parent)) throw new Error('La cartella e un suo file hanno direzioni di copia diverse. Scegli una sola direzione.');
        keep = folders.get(parent);
      }
      parent = path.dirname(parent);
    }
    if (!keep || !(keep === 'left' ? child.leftExists : child.rightExists)) continue;
    if (choices.has(child.relative) && choices.get(child.relative) !== keep) throw new Error('La cartella e un suo file hanno direzioni di copia diverse. Scegli una sola direzione.');
    choices.set(child.relative, keep);
  }
  return [...choices].map(([relative, keep]) => ({ relative, keep }));
}
async function reconcileFolders(session, decisions, { signal, onProgress, selectedOnly = false, policy = 'replace', waitIfPaused } = {}) {
  for (const guard of session.guards || []) await assertDirectory(guard);
  const updated = { ...session, incremental: true, left: new Map(session.left), right: new Map(session.right), confirmed: new Map(session.confirmed || []) };
  const entryIndex = new Map(session.entries.map(entry => [entry.relative, entry]));
  const choices = new Map();
  decisions = expandComparisonDecisions(session, decisions);
  for (const decision of decisions) {
    if (typeof decision?.relative !== 'string' || !['left', 'right'].includes(decision.keep) ||
        choices.has(decision.relative)) throw new Error('Scelte non valide.');
    const entry = entryIndex.get(decision.relative);
    if (!entry || !['different', 'missing'].includes(entry.status) || !entry.copyable) throw new Error('Scelta non autorizzata.');
    if (!(decision.keep === 'left' ? entry.leftExists : entry.rightExists)) throw new Error('Sorgente assente.');
    choices.set(decision.relative, decision.keep);
  }
  const operations = session.entries.filter(item => item.status === 'missing' && item.copyable && !selectedOnly && !choices.has(item.relative))
    .concat(session.entries.filter(item => choices.has(item.relative)));
  operations.sort((a, b) => {
    const ad = (a.leftType || a.rightType) === 'directory' ? 0 : 1;
    const bd = (b.leftType || b.rightType) === 'directory' ? 0 : 1;
    return ad - bd || a.relative.localeCompare(b.relative);
  });
  // Validate only the selected files and their existing ancestors, never rehash unrelated files.
  for (const item of operations) {
    check(signal);
    for (const [root, found] of [[session.leftRoot, session.left], [session.rightRoot, session.right]]) {
      const before = found.get(item.relative);
      const now = await statOrNull(path.join(root, item.relative));
      if (!matches(before?.stats ? snapshot(before.stats) : null, snapshot(now), before?.type === 'directory')) {
        throw new Error(`Il file «${item.relative}» nella cartella ${root === session.leftRoot ? 'sinistra' : 'destra'} è cambiato dopo l’analisi. Nessun file è stato copiato. Esegui di nuovo il confronto.`);
      }
      let parent = path.dirname(item.relative);
      while (parent !== '.') {
        const expected = found.get(parent);
        if (expected?.stats && !matches(expected.stats, await statOrNull(path.join(root, parent)), true)) throw new Error('La cartella è cambiata dopo l’analisi.');
        parent = path.dirname(parent);
      }
    }
  }
  onProgress?.({ phase: 'analyze', step: 'precheck', percentage: 100 });
  const failures = [];
  const copied = [];
  const published = [];
  const createdDirectories = [];
  const directoryOwners = new Map();
  const blockedDirectories = [];
  async function refresh(root, found, relative, mode, knownHash) {
    const file = path.join(root, relative);
    try {
      const stats = await statOrNull(file);
      if (stats) found.set(relative, await inspect(file, stats, signal, undefined, mode, knownHash));
      else found.delete(relative);
    } catch (error) {
      check(signal);
      found.set(relative, { type: 'error', path: file, error: error.message });
    }
  }
  let status = 'completed';
  try {
  for (let index = 0; index < operations.length; index++) {
    check(signal);
    await waitIfPaused?.(signal);
    check(signal);
    const item = operations[index];
    const sourceSide = item.status === 'missing' ? (item.leftExists ? 'left' : 'right') : choices.get(item.relative);
    const source = sourceSide === 'left' ? session.left.get(item.relative) : session.right.get(item.relative);
    const targetRoot = sourceSide === 'left' ? session.rightRoot : session.leftRoot;
    const target = path.join(targetRoot, item.relative);
    let completed = null;
    let failure = null;
    const metadataWarnings = new Set();
    try {
      if (blockedDirectories.some(blocked => blocked.root === targetRoot && (item.relative === blocked.relative || item.relative.startsWith(blocked.relative + path.sep)))) throw new Error('Cartella in conflitto di nomi sul disco di destinazione: il file non è stato copiato.');
      await ensureSafeParent(targetRoot, item.relative);
      if (source.type === 'directory') {
        try { await fsp.mkdir(target); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        const stats = await fsp.lstat(target);
        if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Cartella di destinazione non sicura.');
        const key = `${stats.dev}:${stats.ino}:${target.normalize('NFC').toLowerCase()}`;
        const owner = directoryOwners.get(key);
        if (owner && owner !== item.relative) {
          blockedDirectories.push({ root: targetRoot, relative: item.relative });
          throw new Error(`Conflitto di nomi tra «${owner}» e «${item.relative}»: le cartelle non possono essere distinte su questo disco.`);
        }
        directoryOwners.set(key, item.relative);
        createdDirectories.push({ relative: item.relative, from: sourceSide, targetRoot, source });
      } else {
        if (item.status === 'missing') {
          try { await fsp.lstat(target); throw new Error('Il file di destinazione è apparso dopo l’analisi.'); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        let verifiedHash;
        let verifiedFork;
        let finalDestination = target;
        let previousVersion = null;
        let lastByteReport = 0;
        const fileProgress = (phase, bytes = 0) => {
          const now = Date.now();
          if (phase === 'copy' && now - lastByteReport < 120 && bytes < source.stats.size) return;
          lastByteReport = now;
          onProgress?.({ phase: 'file-copy', filePhase: phase, current: item.relative, from: sourceSide,
            bytes, totalBytes: source.stats.size, count: index, total: operations.length,
            filePercentage: phase === 'verify' ? 95 : phase === 'compare' ? 0 : Math.min(95, source.stats.size ? bytes / source.stats.size * 95 : 95) });
        };
        const result = await copyFileVerified({ path: source.path, stats: source.stats }, target,
          { signal, policy, allowMetadataDifferences: true, onMetadataWarning: warning => metadataWarnings.add(warning), expectedTarget: snapshot((sourceSide === 'left' ? session.right : session.left).get(item.relative)?.stats),
            directoryGuard: session.guards?.[sourceSide === 'left' ? 1 : 0],
            onVersion: file => { previousVersion = file; }, onDestination: file => { finalDestination = file; },
            onPhase: phase => fileProgress(phase), onBytes: bytes => fileProgress('copy', bytes),
            onVerified: (hash, fork) => { verifiedHash = hash; verifiedFork = fork; } });
        if (verifiedHash) {
          const record = { path: item.relative, destination: finalDestination, previousVersion, from: sourceSide, result, sha256: verifiedHash, resourceFork: verifiedFork, warnings: [...metadataWarnings] };
          copied.push(record);
          published.push({ record, source, targetRoot, stats: snapshot(await fsp.lstat(finalDestination)) });
        }
        if (finalDestination !== target) {
          const newRelative = path.relative(targetRoot, finalDestination);
          const stats = await fsp.lstat(finalDestination);
          (sourceSide === 'left' ? updated.right : updated.left).set(newRelative, await inspect(finalDestination, stats, undefined, undefined, session.mode, verifiedHash));
        }
        if (verifiedHash && finalDestination === target) completed = { ...entryDetails(source), sha256: verifiedHash, warnings: [...metadataWarnings] };
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      failure = error.message;
      failures.push({ path: item.relative, reason: failure });
    }
    const changedEntries = [];
    {
      let relative = item.relative;
      while (relative !== '.') {
        for (const [root, found] of [[session.leftRoot, updated.left], [session.rightRoot, updated.right]]) {
          await refresh(root, found, relative, failure ? 'quick' : session.mode,
            completed && relative === item.relative ? completed.sha256 : undefined);
        }
        const a = updated.left.get(relative), b = updated.right.get(relative);
        changedEntries.push({ ...publicEntry(relative, a, b), leftDetails: entryDetails(a), rightDetails: entryDetails(b) });
        relative = path.dirname(relative);
      }
      if (!failure && (completed || source.type === 'directory')) {
        updated.confirmed.set(item.relative, { left: snapshot(updated.left.get(item.relative)?.stats),
          right: snapshot(updated.right.get(item.relative)?.stats), sha256: completed?.sha256, directory: source.type === 'directory', warnings: [...metadataWarnings] });
      }
    }
    onProgress?.({ phase: 'reconcile', count: index + 1, total: operations.length, current: item.relative,
      outcome: failure ? 'failed' : completed ? 'verified' : source.type === 'directory' ? 'created' : 'kept',
      from: sourceSide, details: completed, entries: changedEntries, error: failure });
  }
  // Final coverage is necessary here too: earlier copied files may disappear or
  // change while the rest of a comparison is still being reconciled.
  for (const publication of published) {
    check(signal);
    const { record, source, targetRoot, stats: expected } = publication;
    const relative = path.relative(targetRoot, record.destination);
    let error = null;
    try {
      if (!matches(source.stats, await fsp.lstat(source.path))) throw new Error('La sorgente è cambiata dopo la copia.');
      const actual = await fsp.lstat(record.destination);
      if (!actual.isFile() || actual.isSymbolicLink() || actual.size !== source.stats.size || await fsp.realpath(path.dirname(record.destination)) !== path.dirname(record.destination)) throw new Error('Il file copiato è mancante, incompleto o sostituito.');
      if (!matches(expected, snapshot(actual))) {
        if (await sha256(record.destination, signal) !== record.sha256 || !sameResourceFork(record.resourceFork, await readResourceFork(record.destination, signal)) || !matches(actual, await fsp.lstat(record.destination))) throw new Error('Il contenuto copiato è cambiato dopo la verifica.');
      }
      await requireCreationDate(record.destination, source.stats, record.sha256, signal);
    } catch (failure) {
      check(signal);
      error = failure.message;
      failures.push({ path: record.path, reason: error, metadataOnly: !!failure.verifiedContent });
      updated.confirmed.delete(record.path);
      if (!failure.verifiedContent) copied.splice(copied.indexOf(record), 1);
    }
    const targetMap = record.from === 'left' ? updated.right : updated.left;
    const sourceMap = record.from === 'left' ? updated.left : updated.right;
    await refresh(record.from === 'left' ? session.leftRoot : session.rightRoot, sourceMap, record.path, error ? 'quick' : session.mode, error ? undefined : record.sha256);
    await refresh(targetRoot, targetMap, relative, error ? 'quick' : session.mode, error ? undefined : record.sha256);
    if (error) {
      const failedEntry = targetMap.get(relative);
      if (failedEntry) failedEntry.verificationError = error;
      const a = updated.left.get(record.path), b = updated.right.get(record.path);
      onProgress?.({ phase: 'reconcile', count: operations.length, total: operations.length, current: record.path, outcome: 'failed', from: record.from,
        entries: [{ ...publicEntry(record.path, a, b), leftDetails: entryDetails(a), rightDetails: entryDetails(b) }], error });
    } else if (relative === record.path) {
      updated.confirmed.set(record.path, { left: snapshot(updated.left.get(record.path)?.stats), right: snapshot(updated.right.get(record.path)?.stats), sha256: record.sha256, warnings: record.warnings });
    }
  }
  for (const directory of createdDirectories) {
    check(signal);
    const { relative, from, targetRoot, source } = directory;
    try {
      const stats = await fsp.lstat(path.join(targetRoot, relative));
      if (!stats.isDirectory() || stats.isSymbolicLink() || !matches(source.stats, await fsp.lstat(source.path), true)) throw new Error('La cartella creata o la sorgente è cambiata dopo la copia.');
    } catch (error) {
      check(signal);
      failures.push({ path: relative, reason: error.message }); updated.confirmed.delete(relative);
      await refresh(targetRoot, from === 'left' ? updated.right : updated.left, relative, 'quick');
      const a = updated.left.get(relative), b = updated.right.get(relative);
      onProgress?.({ phase: 'reconcile', count: operations.length, total: operations.length, current: relative, outcome: 'failed', from,
        entries: [{ ...publicEntry(relative, a, b), leftDetails: entryDetails(a), rightDetails: entryDetails(b) }], error: error.message });
    }
  }
  } catch (error) {
    status = signal?.aborted ? 'cancelled' : 'partial';
    failures.push({ path: '', reason: error.message });
  }
  onProgress?.({ phase: 'analyze', step: 'verify', percentage: 100 });
  return { comparison: buildComparison(updated), copied, failures, status: failures.length && status === 'completed' ? 'partial' : status };
}

module.exports = { compareFolders, reconcileFolders, forRenderer, expandComparisonDecisions };
