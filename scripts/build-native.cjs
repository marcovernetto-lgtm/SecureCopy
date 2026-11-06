// Builds the universal (arm64 + x86_64) cache-bypassing hash helper.
// Usage: node scripts/build-native.cjs [output path]
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(root, 'build', 'native', 'securecopy-hash');

function buildNative(output = DEFAULT_OUTPUT) {
  if (process.platform !== 'darwin') throw new Error('L’helper di verifica si compila solo su macOS.');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  execFileSync('/usr/bin/clang', ['-O2', '-Wall', '-Wextra', '-Werror', '-Wno-deprecated-declarations',
    '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=13.0',
    '-o', output, path.join(root, 'native', 'nocache-hash.c')], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime', output], { stdio: 'inherit' });
  return output;
}

if (require.main === module) {
  try { console.log(`Helper di verifica compilato: ${buildNative(process.argv[2] ? path.resolve(process.argv[2]) : undefined)}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { buildNative, DEFAULT_OUTPUT };
