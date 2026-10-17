const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');const {runCopy,sha256}=require('../copy-engine');
(async()=>{
 const base=(await fs.readFile('/tmp/securecopy-stress-device-location.txt','utf8')).trim();assert.ok(path.basename(base).startsWith('securecopy-stress-device-'));const mount=path.join(base,'mount');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'securecopy-stress-device-fixture-')));const source=path.join(root,'CARD');await fs.mkdir(source);await fs.writeFile(path.join(source,'clip.BRAW'),Buffer.alloc(8*2**20,17));
 
 try{
  const dest=path.join(mount,'backup');await fs.mkdir(path.join(dest,'CARD'),{recursive:true});const old=path.join(dest,'CARD','clip.BRAW');await fs.writeFile(old,'previous version');const hash=await sha256(old);
  const filler=await fs.open(path.join(mount,'owned-filler'),'wx');try{for(;;){const stat=await fs.statfs(mount);if(stat.bavail*stat.bsize<3*2**20)break;await filler.write(Buffer.alloc(2**20));}}finally{await filler.close();}
  const full=await runCopy({sourceDirs:[source],destDir:dest});assert.equal(full.status,'partial');assert.ok(full.failures.some(e=>/Spazio|ENOSPC/i.test(e.reason)));assert.equal(await sha256(old),hash);
  await fs.unlink(path.join(mount,'owned-filler'));
  execFileSync('/usr/bin/hdiutil',['detach',mount],{stdio:'pipe'});execFileSync('/usr/bin/hdiutil',['attach',path.join(base,'exfat.dmg'),'-readonly','-nobrowse','-mountpoint',mount],{stdio:'pipe'});assert.ok(execFileSync('/usr/bin/hdiutil',['info','-plist'],{encoding:'utf8'}).includes('<key>writeable</key>')); 
  await assert.rejects(runCopy({sourceDirs:[source],destDir:path.join(mount,'readonly-target')}),/EROFS|read.only|EACCES|ENOENT/i);assert.equal(await sha256(old),hash);assert.equal((await fs.stat(path.join(source,'clip.BRAW'))).size,8*2**20);
  const result={realExfatImage:true,fullDiskReported:true,previousDestinationPreserved:true,readOnlyDiskRejected:true,sourceUntouched:true};await fs.writeFile(path.resolve('audit/2026-10-16/device-faults.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
