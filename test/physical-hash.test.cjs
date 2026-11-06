const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const sync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const darwin = process.platform === 'darwin';
let helper = null;
if (darwin) {
  try { helper = require('../scripts/build-native.cjs').buildNative(path.join(os.tmpdir(), `securecopy-hash-test-${process.pid}`)); }
  catch { helper = null; }
}
const skip = !helper && 'native helper not buildable on this machine';

function residentPages(file) {
  // Count cached pages with the helper's own mechanism, via a tiny probe.
  const probe = path.join(os.tmpdir(), `securecopy-probe-${process.pid}`);
  if (!sync.existsSync(probe)) {
    const source = `${probe}.c`;
    sync.writeFileSync(source, '#include <stdio.h>\n#include <stdlib.h>\n#include <fcntl.h>\n#include <sys/mman.h>\n#include <sys/stat.h>\n#include <unistd.h>\nint main(int c,char**v){int fd=open(v[1],O_RDONLY);struct stat st;fstat(fd,&st);void*m=mmap(0,st.st_size,PROT_READ,MAP_SHARED,fd,0);size_t p=getpagesize(),n=(st.st_size+p-1)/p;char*vec=malloc(n);mincore(m,st.st_size,vec);long r=0;for(size_t i=0;i<n;i++)if(vec[i]&MINCORE_INCORE)r++;printf("%ld\\n",r);return 0;}\n');
    execFileSync('/usr/bin/clang', ['-o', probe, source]);
  }
  return Number(execFileSync(probe, [file], { encoding: 'utf8' }).trim());
}

async function tempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-physical-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('physical hash matches SHA-256 and reads a freshly written file from disk, not cache', { skip }, async t => {
  process.env.SECURECOPY_HASH_HELPER = helper;
  t.after(() => { delete process.env.SECURECOPY_HASH_HELPER; });
  const { physicalSha256 } = require('../src/physical-hash');
  const dir = await tempDir(t);
  const file = path.join(dir, 'clip.mov');
  const data = crypto.randomBytes(24 * 1024 * 1024 + 123);
  await fs.writeFile(file, data);
  assert.ok(residentPages(file) > 0, 'a freshly written file should start in the cache');
  let progress = 0;
  const result = await physicalSha256(file, undefined, bytes => { progress += bytes; });
  assert.equal(result.hash, crypto.createHash('sha256').update(data).digest('hex'));
  assert.equal(result.bytes, data.length);
  assert.equal(progress, data.length);
  assert.equal(result.physical, true);
  assert.equal(residentPages(file), 0, 'verification must neither use nor refill the cache');
});

test('physical hash handles empty files and rejects non-regular paths', { skip }, async t => {
  process.env.SECURECOPY_HASH_HELPER = helper;
  t.after(() => { delete process.env.SECURECOPY_HASH_HELPER; });
  const { physicalSha256 } = require('../src/physical-hash');
  const dir = await tempDir(t);
  const empty = path.join(dir, 'empty');
  await fs.writeFile(empty, '');
  const result = await physicalSha256(empty);
  assert.equal(result.hash, crypto.createHash('sha256').digest('hex'));
  await assert.rejects(physicalSha256(dir), /disco/);
  await fs.symlink(empty, path.join(dir, 'link'));
  await assert.rejects(physicalSha256(path.join(dir, 'link')), /disco/);
});

test('physical hash can be cancelled', { skip }, async t => {
  process.env.SECURECOPY_HASH_HELPER = helper;
  t.after(() => { delete process.env.SECURECOPY_HASH_HELPER; });
  const { physicalSha256 } = require('../src/physical-hash');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(physicalSha256(__filename, controller.signal), { name: 'AbortError' });
});

test('copies are marked physically verified and corruption at verify time is caught', { skip }, async t => {
  process.env.SECURECOPY_HASH_HELPER = helper;
  t.after(() => { delete process.env.SECURECOPY_HASH_HELPER; });
  const { runCopy } = require('../src/copy-engine');
  const dir = await tempDir(t);
  const source = path.join(dir, 'CARD'), destDir = path.join(dir, 'dest');
  await fs.mkdir(source); await fs.mkdir(destDir);
  await fs.writeFile(path.join(source, 'good.MOV'), crypto.randomBytes(512 * 1024));
  const ok = await runCopy({ sourceDirs: [source], destDir });
  assert.equal(ok.status, 'completed');
  assert.equal(ok.verifiedFiles[0].physicalVerification, true);
  assert.deepEqual(ok.physicalVerification, { files: 1, cached: 0 });
  assert.equal(ok.warnings.length, 0);

  await fs.writeFile(path.join(source, 'bad.MOV'), crypto.randomBytes(512 * 1024));
  let corrupted = false;
  const bad = await runCopy({ sourceDirs: [source], destDir, onlyPaths: ['CARD/bad.MOV'], onProgress: event => {
    if (event.phase !== 'verify' || corrupted) return;
    const target = path.join(destDir, 'CARD');
    const part = sync.readdirSync(target).find(name => name.endsWith('.part'));
    if (part) { corrupted = true; sync.writeFileSync(path.join(target, part), crypto.randomBytes(512 * 1024)); }
  } });
  assert.ok(corrupted);
  assert.equal(bad.status, 'partial');
  assert.equal(bad.copied, 0);
  assert.equal(bad.verifiedFiles.length, 0);
  await assert.rejects(fs.stat(path.join(destDir, 'CARD', 'bad.MOV')), { code: 'ENOENT' });
});

test('without the helper the copy still verifies but warns that the check was not physical', async t => {
  process.env.SECURECOPY_HASH_HELPER = '';
  t.after(() => { delete process.env.SECURECOPY_HASH_HELPER; });
  const { runCopy } = require('../src/copy-engine');
  const dir = await tempDir(t);
  const source = path.join(dir, 'CARD'), destDir = path.join(dir, 'dest');
  await fs.mkdir(source); await fs.mkdir(destDir);
  await fs.writeFile(path.join(source, 'a.jpg'), 'photo');
  const report = await runCopy({ sourceDirs: [source], destDir });
  assert.equal(report.status, 'completed');
  assert.equal(report.verifiedFiles[0].physicalVerification, false);
  assert.deepEqual(report.physicalVerification, { files: 0, cached: 1 });
  assert.match(report.warnings.at(-1).reason, /^Verifica fisica non garantita per 1 file/);
});
