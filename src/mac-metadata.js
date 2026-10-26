const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { TIMESTAMP_TOLERANCE_MS, sameTimestamp } = require('./file-metadata');

const execFileAsync = promisify(execFile);
// Use the system Foundation bridge: no developer tools, license, shell or
// locale-dependent date strings. Paths and fractional UTC seconds are arguments.
const CREATION_DATE_SCRIPT = `ObjC.import('Foundation');
function run(argv) {
  var attributes = $.NSMutableDictionary.alloc.init;
  attributes.setObjectForKey($.NSDate.dateWithTimeIntervalSince1970(Number(argv[1])), $.NSFileCreationDate);
  var error = Ref();
  if (!$.NSFileManager.defaultManager.setAttributesOfItemAtPathError(attributes, argv[0], error)) {
    throw new Error(error[0] ? ObjC.unwrap(error[0].localizedDescription) : 'Data di creazione non modificabile');
  }
}`;

async function setCreationTime(file, milliseconds, { signal } = {}) {
  signal?.throwIfAborted();
  if (!path.isAbsolute(file) || !Number.isFinite(milliseconds)) throw new Error('Data di creazione o percorso non valido.');
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Il file dei metadati non è sicuro.');
  try {
    await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', CREATION_DATE_SCRIPT, file, String(milliseconds / 1000)],
      { signal, timeout: 15000, maxBuffer: 64 * 1024 });
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error('Impossibile conservare la data di creazione sul disco di destinazione.', { cause: error });
  }
  signal?.throwIfAborted();
  const after = await fs.lstat(file);
  if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size) {
    throw new Error('Il file è cambiato durante il ripristino dei metadati.');
  }
  if (!sameTimestamp(after.birthtimeMs, milliseconds)) throw new Error('Il disco di destinazione non conserva la data di creazione richiesta.');
}

module.exports = { setCreationTime };
