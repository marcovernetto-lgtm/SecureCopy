const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
// Ten microseconds only covers rounding in Node/macOS timestamp bridges, rather
// than treating files with genuinely different millisecond dates as identical.
const TIMESTAMP_TOLERANCE_MS = 0.01;

// These values describe preservable file metadata, not inode/ctime/access time.
// macOS adds provenance itself; it is not camera/media metadata.
async function readMacMetadata(file, signal) {
  if (process.platform !== 'darwin') return { flags: null, acl: '', xattrs: {} };
  const options = { signal, timeout: 15000 };
  const [flags, acl, names] = await Promise.all([
    execFileAsync('/usr/bin/stat', ['-f', '%f', file], options),
    execFileAsync('/bin/ls', ['-led', file], options),
    execFileAsync('/usr/bin/xattr', [file], options)
  ]);
  const xattrs = {};
  for (const name of names.stdout.split('\n').map(value => value.trim()).filter(value => value && value !== 'com.apple.provenance').sort()) {
    const { stdout } = await execFileAsync('/usr/bin/xattr', ['-p', '-x', name, file], { ...options, maxBuffer: 64 * 1024 * 1024 });
    xattrs[name] = crypto.createHash('sha256').update(stdout.replace(/\s/g, '').toLowerCase()).digest('hex');
  }
  return { flags: Number(flags.stdout.trim()), acl: acl.stdout.split('\n').filter(line => /^\s*\d+:/.test(line)).map(line => line.trim()).join('\n'), xattrs };
}

function macMetadataDifferences(source, destination) {
  return [['flags', 'flag'], ['acl', 'ACL'], ['xattrs', 'attributi estesi']]
    .filter(([key]) => JSON.stringify(source[key]) !== JSON.stringify(destination[key])).map(([, label]) => label);
}

module.exports = { TIMESTAMP_TOLERANCE_MS, readMacMetadata, macMetadataDifferences };
