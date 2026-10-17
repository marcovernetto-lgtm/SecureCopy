const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

function parsePlist(xml) {
  return new Promise((resolve, reject) => {
    const child = execFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(error);
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(xml);
  });
}
async function listMountedVolumes(directory = '/Volumes') {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const volumes = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const root = path.join(directory, entry.name);
    const stat = await fs.promises.lstat(root).catch(() => null);
    if (stat?.isDirectory() && !stat.isSymbolicLink()) volumes.push({ root, signature: `${stat.dev}:${stat.ino}` });
  }
  return volumes;
}
function eligibleVolume(info) {
  return info.Internal === false && typeof info.MountPoint === 'string' && info.MountPoint.startsWith('/Volumes/') &&
    info.DiskImage !== true && info.BusProtocol !== 'Disk Image' && info.Network !== true;
}
async function describeVolume(volume) {
  const { stdout } = await exec('/usr/sbin/diskutil', ['info', '-plist', volume.root], { timeout: 5000, maxBuffer: 1024 * 1024 });
  const info = await parsePlist(stdout);
  if (!eligibleVolume(info) || info.MountPoint !== volume.root) return null;
  const cameraFolder = await fs.promises.stat(path.join(volume.root, 'DCIM')).catch(() => null);
  return { ...volume, name: info.VolumeName || path.basename(volume.root), card: !!cameraFolder?.isDirectory() || info.BusProtocol === 'Secure Digital' };
}
class VolumeMonitor {
  constructor({ list = listMountedVolumes, describe = describeVolume, onArrival, onRemoval = () => {}, onError = () => {} }) {
    this.list = list; this.describe = describe; this.onArrival = onArrival; this.onRemoval = onRemoval; this.onError = onError;
    this.known = new Map(); this.pending = new Map(); this.initialized = false; this.scanning = false; this.stopped = false;
  }
  async scan() {
    if (this.stopped || this.scanning) return;
    this.scanning = true;
    try {
      const mounts = await this.list();
      const current = new Map(mounts.map(volume => [volume.root, volume.signature]));
      if (!this.initialized) { this.known = current; this.initialized = true; return; }
      const arrivals = mounts.filter(volume => this.known.get(volume.root) !== volume.signature);
      for (const [root, signature] of this.known) if (current.get(root) !== signature) { this.pending.delete(root); this.onRemoval(root); }
      this.known = current;
      for (const volume of arrivals) this.pending.set(volume.root, { volume, attempts: 0 });
      for (const [root, pending] of this.pending) {
        const { volume } = pending;
        if (current.get(root) !== volume.signature) { this.pending.delete(root); continue; }
        try {
          const described = await this.describe(volume);
          const stillMounted = (await this.list()).some(item => item.root === volume.root && item.signature === volume.signature);
          this.pending.delete(root);
          if (!this.stopped && described && stillMounted) this.onArrival(described);
        } catch (error) {
          if (++pending.attempts >= 3) this.pending.delete(root);
          this.onError(error);
        }
      }
    } catch (error) { this.onError(error); }
    finally { this.scanning = false; }
  }
  async start() {
    await this.scan();
    if (!this.stopped) { this.timer = setInterval(() => this.scan(), 2500); this.timer.unref?.(); }
  }
  stop() { this.stopped = true; clearInterval(this.timer); }
}
module.exports = { VolumeMonitor, listMountedVolumes, describeVolume, eligibleVolume, parsePlist };
