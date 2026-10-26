const test = require('node:test');
const assert = require('node:assert/strict');
const { VolumeMonitor, eligibleVolume } = require('../src/volume-monitor');
const { createLoginStartup, launchAgentPlist } = require('../src/login-startup');

test('volume monitor ignores existing mounts and announces a new card only once', async () => {
  let mounts = [{ root: '/Volumes/existing', signature: '1:1' }]; const arrivals = [];
  const monitor = new VolumeMonitor({ list: async () => mounts, describe: async volume => volume, onArrival: item => arrivals.push(item) });
  await monitor.scan(); assert.equal(arrivals.length, 0);
  mounts = [...mounts, { root: '/Volumes/card', signature: '2:2' }];
  await monitor.scan(); await monitor.scan(); assert.equal(arrivals.length, 1); assert.equal(arrivals[0].root, '/Volumes/card');
});
test('replacement at the same mount point is removed and then treated as a new card', async () => {
  let mounts = [{ root: '/Volumes/card', signature: '1:1' }]; const arrivals = [], removals = [];
  const monitor = new VolumeMonitor({ list: async () => mounts, describe: async volume => volume, onArrival: item => arrivals.push(item), onRemoval: root => removals.push(root) });
  await monitor.scan(); mounts = [{ root: '/Volumes/card', signature: '3:9' }]; await monitor.scan();
  assert.deepEqual(removals, ['/Volumes/card']); assert.equal(arrivals[0].signature, '3:9');
});
test('card removed during inspection is never announced', async () => {
  let mounts = []; const arrivals = [];
  const monitor = new VolumeMonitor({ list: async () => mounts, describe: async volume => { mounts = []; return volume; }, onArrival: item => arrivals.push(item) });
  await monitor.scan(); mounts = [{ root: '/Volumes/card', signature: '2:2' }]; await monitor.scan();
  assert.equal(arrivals.length, 0);
});
test('volume inspection failures retry at most three times and stop cleanly', async () => {
  let mounts = [], attempts = 0; const errors = [];
  const monitor = new VolumeMonitor({ list: async () => mounts, describe: async () => { attempts++; throw new Error('disconnected'); }, onArrival: () => assert.fail(), onError: error => errors.push(error) });
  await monitor.scan(); mounts = [{ root: '/Volumes/card', signature: '2:2' }];
  for (let n = 0; n < 5; n++) await monitor.scan();
  assert.equal(attempts, 3); assert.equal(errors.length, 3);
  monitor.stop(); await monitor.scan(); assert.equal(attempts, 3);
});
test('only external non-network non-image volumes are eligible for import', () => {
  const info = { Internal: false, MountPoint: '/Volumes/Card', BusProtocol: 'USB' };
  assert.equal(eligibleVolume(info), true);
  for (const extra of [{ Internal: true }, { DiskImage: true }, { Network: true }, { BusProtocol: 'Disk Image' }, { MountPoint: '/' }]) assert.equal(eligibleVolume({ ...info, ...extra }), false);
});
test('login settings honor approval requirements without touching OS settings in tests', async () => {
  let enabled = false; const calls = [];
  const app = { isPackaged: true, getAppPath: () => '/test', getPath: () => '/test', getLoginItemSettings: () => ({ openAtLogin: enabled, status: 'enabled' }), setLoginItemSettings: value => { calls.push(value); enabled = value.openAtLogin; } };
  const login = createLoginStartup({ app, platform: 'darwin' });
  assert.equal((await login.set(true)).enabled, true); assert.equal((await login.set(false)).enabled, false);
  assert.deepEqual(calls, [{ openAtLogin: true }, { openAtLogin: false }]);
  await assert.rejects(login.set('true'), /non disponibile/);
  app.getLoginItemSettings = () => ({ openAtLogin: false, status: 'requires-approval' });
  assert.equal((await login.set(true)).status, 'requires-approval');
  assert.ok(launchAgentPlist('/App & "test"', '/Project <safe>').includes('&amp;'));
});
