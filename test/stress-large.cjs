const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');const crypto=require('node:crypto');const {performance}=require('node:perf_hooks');const {runCopy,sha256}=require('../copy-engine');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'securecopy-stress-large-')));let sample;
 try{
  const source=path.join(root,'CARD');await fs.mkdir(source);const file=path.join(source,'over-4GiB.unknown');const size=4*2**30+65537;
  const handle=await fs.open(file,'wx');try{await handle.truncate(size);for(let offset=0;offset<size;offset+=256*2**20){const data=crypto.randomBytes(Math.min(65536,size-offset));await handle.write(data,0,data.length,offset);}await handle.write(Buffer.from('end-marker'),0,10,size-10);}finally{await handle.close();}
  let peakRss=0,events=0,last=0,maximum=0;const start=performance.now();sample=setInterval(()=>peakRss=Math.max(peakRss,process.memoryUsage().rss),20);
  const result=await runCopy({sourceDirs:[source],destDir:path.join(root,'backup'),onProgress:e=>{events++;if(e.percentage!==undefined){assert.ok(e.percentage>=last);assert.ok(e.percentage<100);last=e.percentage;}maximum=Math.max(maximum,e.currentFileBytes||0);}});
  assert.equal(result.status,'completed',JSON.stringify(result.failures));assert.equal(result.transferredBytes,size);assert.equal((await fs.stat(path.join(root,'backup','CARD',path.basename(file)))).size,size);assert.equal(await sha256(file),await sha256(path.join(root,'backup','CARD',path.basename(file))));assert.equal(maximum,size);
  const metrics={bytes:size,over4GiB:true,sourceSparseWithRandomMarkers:true,fullStreamCopiedAndHashed:true,seconds:(performance.now()-start)/1000,peakRssMiB:peakRss/2**20,progressEvents:events,monotonicBelow100:true};await fs.writeFile(path.resolve('audit/2026-10-16/large-file.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics));
 }finally{clearInterval(sample);await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
