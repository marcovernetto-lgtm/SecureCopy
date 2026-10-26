const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });

(async () => {
  const { extractFile } = await import('@electron/asar');
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const arch = process.argv[2] || 'arm64';
  if (!['arm64', 'x64'].includes(arch)) throw new Error('Architettura non valida: usa arm64 oppure x64.');
  const app = path.join(root, `dist/mac-${arch}/SecureCopy.app`);
  const executable = await fs.readFile(path.join(app, 'Contents/MacOS/SecureCopy'));
  if (executable.readUInt32LE(0) !== 0xfeedfacf || executable.readUInt32LE(4) !== (arch === 'x64' ? 0x01000007 : 0x0100000c)) throw new Error('Architettura del pacchetto diversa da quella richiesta.');
  const archive = path.join(app, 'Contents/Resources/app.asar');
  if (JSON.parse(extractFile(archive, 'package.json')).version !== metadata.version) throw new Error('Ricompila prima la versione corrente.');
  const srcDir = path.join(root, 'src');
  for (const file of (await fs.readdir(srcDir)).filter(name => /\.(js|css|html)$/.test(name))) {
    if (!extractFile(archive, path.join('src', file)).equals(await fs.readFile(path.join(srcDir, file)))) throw new Error(`Pacchetto non aggiornato: ${file}`);
  }
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-release-'));
  try {
    const volume = path.join(temp, 'volume'); await fs.mkdir(volume);
    run('/usr/bin/ditto', [app, path.join(volume, 'SecureCopy.app')]);
    await fs.symlink('/Applications', path.join(volume, 'Applications'));
    const name = `SecureCopy-${metadata.version}-${arch}`;
    const dmg = path.join(temp, `${name}.dmg`), zip = path.join(temp, `${name}.zip`);
    run('/usr/bin/hdiutil', ['create', '-volname', `SecureCopy ${metadata.version}`, '-srcfolder', volume, '-format', 'UDZO', dmg]);
    run('/usr/bin/hdiutil', ['verify', dmg]);
    run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
    run('/usr/bin/unzip', ['-tq', zip]);
    for (const file of [dmg, zip]) {
      const basename = path.basename(file);
      await fs.rename(file, path.join(root, 'dist', basename));
    }
    const checksums = [];
    for (const architecture of ['arm64', 'x64']) {
      for (const extension of ['dmg', 'zip']) {
        const basename = `SecureCopy-${metadata.version}-${architecture}.${extension}`;
        const file = path.join(root, 'dist', basename);
        if (await fs.stat(file).catch(() => null)) checksums.push(`${crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')}  ${basename}`);
      }
    }
    await fs.writeFile(path.join(root, `dist/SHA256SUMS-${metadata.version}.txt`), checksums.join('\n') + '\n');
    console.log(`Installabili verificati: ${name}.dmg e ${name}.zip`);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
