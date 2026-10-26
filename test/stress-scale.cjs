const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { compareFolders, forRenderer } = require('../src/compare-engine');
(async () => {
  const count = Number(process.env.STRESS_FILES || 200000);
  assert.ok(Number.isSafeInteger(count) && count >= 1000 && count <= 1000000);
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-stress-scale-')));
  const left = path.join(root, 'left'), right = path.join(root, 'right');
  await Promise.all([fs.mkdir(left), fs.mkdir(right)]);
  const seed = path.join(root, 'fixture'); await fs.writeFile(seed, 'opaque camera fixture');
  await fs.writeFile('/tmp/securecopy-stress-scale-location.txt', root);
  const fixtureStart = performance.now();
  for (let offset = 0; offset < count; offset += 100) {
    const folder = `day-${String(offset / 100).padStart(5, '0')}`;
    await Promise.all([fs.mkdir(path.join(left, folder)), fs.mkdir(path.join(right, folder))]);
    for (let batch = offset; batch < Math.min(offset + 100, count); batch += 25) {
      await Promise.all(Array.from({ length: Math.min(25, offset + 100 - batch, count - batch) }, async (_, i) => {
        const name = `clip-${String(batch + i).padStart(7, '0')}.BRAW`;
        await Promise.all([fs.link(seed, path.join(left, folder, name)), fs.link(seed, path.join(right, folder, name))]);
      }));
    }
    if (offset % 20000 === 0) console.log(JSON.stringify({fixtureFilesPerSide:offset + 100}));
  }
  const fixtureSeconds = (performance.now() - fixtureStart) / 1000;
  const missing = path.join(right, 'day-00000', 'clip-0000000.BRAW'); await fs.unlink(missing);
  const different = path.join(right, 'day-00000', 'clip-0000001.BRAW'); await fs.unlink(different); await fs.writeFile(different, 'different size');
  const loop = monitorEventLoopDelay({ resolution:20 }); loop.enable();
  let peakRss = process.memoryUsage().rss, events = 0;
  const interval = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 20);
  const start = performance.now();
  const result = await compareFolders(left, right, {onProgress(){events++;}});
  const seconds = (performance.now() - start)/1000;
  clearInterval(interval); loop.disable();
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  assert.equal(result.entries.length, count + Math.ceil(count/100));
  assert.equal(result.summary.missing,1); assert.equal(result.summary.different,1);
  assert.equal(result.summary.identical, result.entries.length - 2);
  const serializeStart=performance.now(); const payload = JSON.stringify(forRenderer(result));
  const metrics={root,filesPerSide:count,physicalFileEntries:count*2-1,resultRows:result.entries.length,fixtureSeconds,seconds,entriesPerSecond:(count*2)/seconds,peakRssMiB:peakRss/2**20,eventLoopMaxMs:loop.max/1e6,progressEvents:events,payloadMiB:Buffer.byteLength(payload)/2**20,serializeMs:performance.now()-serializeStart,summary:result.summary,fixtureUsesHardLinks:true};
  await fs.writeFile(path.resolve('audit/2026-10-16/scale-baseline.json'),JSON.stringify(metrics,null,2));
  console.log(JSON.stringify(metrics));
  // Keep only this owned fixture for the subsequent real Electron/IPC test.
})().catch(error=>{console.error(error);process.exitCode=1;});
