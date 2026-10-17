// Recoverable build path using the installed, verified Electron runtime.
// This builds the runtime's architecture only; it never changes /Applications.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const base = process.argv[2] || '/Applications/SecureCopy.app';
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
const entitlement = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/><key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/><key>com.apple.security.cs.disable-library-validation</key><true/><key>com.apple.security.files.desktop.read-write</key><true/><key>com.apple.security.files.documents.read-write</key><true/><key>com.apple.security.files.downloads.read-write</key><true/><key>com.apple.security.files.user-selected.read-write</key><true/></dict></plist>`;

(async () => {
  if (process.platform !== 'darwin') throw new Error('Build disponibile su macOS.');
  const { createPackage, getRawHeader, extractFile } = await import('@electron/asar');
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const baseInfo = path.join(base, 'Contents', 'Info.plist');
  const bundleName = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', baseInfo], { encoding: 'utf8' }).trim();
  if (bundleName !== 'SecureCopy') throw new Error('Il runtime non appartiene a SecureCopy.');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', base]);
  const executable = await fs.readFile(path.join(base, 'Contents', 'MacOS', 'SecureCopy'));
  const cpu = executable.readUInt32LE(0) === 0xfeedfacf ? executable.readUInt32LE(4) : null;
  const arch = cpu === 0x0100000c ? 'arm64' : cpu === 0x01000007 ? 'x64' : null;
  if (!arch) throw new Error('Architettura runtime non riconosciuta.');
  const output = path.join(root, 'dist', `mac-${arch}`);
  await fs.mkdir(output, { recursive: true });
  const target = path.join(output, 'SecureCopy.app');
  if (await fs.stat(target).catch(() => null)) throw new Error(`Pacchetto già presente: ${target}`);
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-package-'));
  try {
    const source = path.join(staging, 'source'); await fs.mkdir(source);
    for (const file of await fs.readdir(root)) {
      if (/\.(?:js|css|html)$/.test(file) || file === 'Assets') await fs.cp(path.join(root, file), path.join(source, file), { recursive: true });
    }
    const { devDependencies, scripts, ...appMetadata } = metadata;
    await fs.writeFile(path.join(source, 'package.json'), JSON.stringify(appMetadata, null, 2));
    run('/usr/bin/ditto', [base, target]);
    const archive = path.join(target, 'Contents', 'Resources', 'app.asar');
    await fs.rm(archive);
    await createPackage(source, archive);
    for (const file of ['copy-engine.js', 'mac-metadata.js', 'renderer.js', 'i18n.js', 'index.html']) {
      if (!extractFile(archive, file).equals(await fs.readFile(path.join(source, file)))) throw new Error(`Archivio diverso dai sorgenti: ${file}`);
    }
    const hash = crypto.createHash('sha256').update(getRawHeader(archive).headerString).digest('hex');
    const info = path.join(target, 'Contents', 'Info.plist');
    const plist = [
      '-c', 'Set :CFBundleIdentifier com.unshapedstudio.securecopy',
      '-c', 'Set :NSHumanReadableCopyright Copyright © 2026 Unshaped Studio',
      '-c', `Set :CFBundleShortVersionString ${metadata.version}`,
      '-c', `Set :CFBundleVersion ${metadata.version}`,
      '-c', `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${hash}`,
      info
    ];
    run('/usr/libexec/PlistBuddy', plist);
    for (const [suffix, helperSuffix] of [['', 'helper'], [' (GPU)', 'helper.GPU'], [' (Renderer)', 'helper.Renderer'], [' (Plugin)', 'helper.Plugin']]) {
      const helperInfo = path.join(target, 'Contents', 'Frameworks', `SecureCopy Helper${suffix}.app`, 'Contents', 'Info.plist');
      run('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleIdentifier com.unshapedstudio.securecopy.${helperSuffix}`, helperInfo]);
    }
    const entitlements = path.join(staging, 'entitlements.plist'); await fs.writeFile(entitlements, entitlement);
    run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--options', 'runtime', '--entitlements', entitlements, target]);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', target]);
    console.log(`Build verificata ${metadata.version} ${arch}: ${target}`);
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
