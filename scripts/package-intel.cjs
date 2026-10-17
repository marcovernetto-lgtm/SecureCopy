// Reuse the verified application resources with the same official Electron release for Intel.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
const readPlist = (file, key) => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, file], { encoding: 'utf8' }).trim();

(async () => {
  if (process.platform !== 'darwin' || !process.argv[2] || !process.argv[3]) throw new Error('Indica lo ZIP Intel ufficiale Electron e il relativo SHASUMS256.txt.');
  const zip = path.resolve(process.argv[2]);
  const checksumLines = (await fs.readFile(path.resolve(process.argv[3]), 'utf8')).split('\n');
  const checksum = checksumLines.map(line => line.trim().split(/\s+/)).find(parts => parts[1]?.replace(/^\*/, '') === path.basename(zip))?.[0];
  if (!checksum || crypto.createHash('sha256').update(await fs.readFile(zip)).digest('hex') !== checksum) throw new Error('Checksum SHA-256 del runtime ufficiale non valido.');
  const base = path.join(root, 'dist/mac-arm64/SecureCopy.app');
  const target = path.join(root, 'dist/mac-x64/SecureCopy.app');
  const frameworkInfo = app => path.join(app, 'Contents/Frameworks/Electron Framework.framework/Resources/Info.plist');
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (readPlist(path.join(base, 'Contents/Info.plist'), 'CFBundleShortVersionString') !== metadata.version) throw new Error('Ricompila prima la build Apple Silicon corrente.');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', base]);
  if (await fs.stat(target).catch(() => null)) throw new Error(`Pacchetto già presente: ${target}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-intel-build-'));
  try {
    const runtime = path.join(temp, 'runtime/Electron.app');
    run('/usr/bin/ditto', ['-x', '-k', zip, path.dirname(runtime)]);
    if (readPlist(frameworkInfo(base), 'CFBundleVersion') !== readPlist(frameworkInfo(runtime), 'CFBundleVersion')) throw new Error('I runtime Electron devono avere la stessa versione.');
    const executable = await fs.readFile(path.join(runtime, 'Contents/MacOS/Electron'));
    if (executable.readUInt32LE(0) !== 0xfeedfacf || executable.readUInt32LE(4) !== 0x01000007) throw new Error('Il runtime fornito non è Intel x64.');
    const app = path.join(temp, 'SecureCopy.app');
    run('/usr/bin/ditto', [base, app]);
    const frameworks = path.join(app, 'Contents/Frameworks');
    await fs.rm(frameworks, { recursive: true });
    run('/usr/bin/ditto', [path.join(runtime, 'Contents/Frameworks'), frameworks]);
    await fs.copyFile(path.join(runtime, 'Contents/MacOS/Electron'), path.join(app, 'Contents/MacOS/SecureCopy'));
    for (const suffix of ['', ' (GPU)', ' (Renderer)', ' (Plugin)']) {
      const original = `Electron Helper${suffix}`, renamed = `SecureCopy Helper${suffix}`;
      const helper = path.join(frameworks, `${renamed}.app`);
      await fs.rename(path.join(frameworks, `${original}.app`), helper);
      await fs.rename(path.join(helper, 'Contents/MacOS', original), path.join(helper, 'Contents/MacOS', renamed));
      await fs.copyFile(path.join(base, 'Contents/Frameworks', `${renamed}.app/Contents/Info.plist`), path.join(helper, 'Contents/Info.plist'));
    }
    const entitlements = path.join(temp, 'entitlements.plist');
    const signedEntitlements = execFileSync('/usr/bin/codesign', ['-d', '--entitlements', ':-', base], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (!signedEntitlements.includes('<plist')) throw new Error('Entitlements della build di base non disponibili.');
    await fs.writeFile(entitlements, signedEntitlements);
    run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--options', 'runtime', '--entitlements', entitlements, app]);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    await fs.rename(app, target);
    console.log(`Build Intel verificata ${metadata.version}: ${target}`);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
