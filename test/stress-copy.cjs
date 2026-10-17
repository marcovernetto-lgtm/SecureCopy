const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { runCopy, sha256 } = require('../copy-engine');
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'securecopy-stress-copy-')));
 const source=path.join(root,'CARD'),destination=path.join(root,'backup'); await fs.mkdir(source);
 const extensions=['MOV','MP4','MXF','BRAW','R3D','CRM','ARI','DNG','CR3','NEF','ARW','RAF','ORF','RW2','HEIC','AVIF','JPG','TIFF','PSD','EXR','WAV','FLAC','XML','XMP','SRT','unknown',''];
 const sizes=[0,1,63,64,65,65535,65536,65537,1048575,1048576,1048577];
 const files=[]; const started=performance.now();
 try {
  for(let i=0;i<81;i++){
   const name=`file-${String(i).padStart(3,'0')}${extensions[i%extensions.length]?'.'+extensions[i%extensions.length]:''}`,data=crypto.randomBytes(sizes[i%sizes.length]);
   await fs.writeFile(path.join(source,name),data); files.push(name);
  }
  for(const name of ['video con spazi.MOV','quote\'"$`;.raw','riga\nnuova.CR3','emoji 🎥 🌈.NEF','日本語 한국어 العربية.RAW','é-è-café.dng','e\u0301-combining.dng','x'.repeat(245)+'.MOV']){
   await fs.writeFile(path.join(source,name),crypto.randomBytes(131073)); files.push(name);
  }
  const nested=path.join(...Array.from({length:40},(_,i)=>'day'+i),'deep.RAW'); await fs.mkdir(path.dirname(path.join(source,nested)),{recursive:true}); await fs.writeFile(path.join(source,nested),'deep'); files.push(nested);
  await fs.writeFile(path.join(source,'.DS_Store'),'ignored'); await fs.mkdir(path.join(source,'.hidden')); await fs.writeFile(path.join(source,'.hidden','secret.MOV'),'ignored');
  let peakRss=0; const interval=setInterval(()=>peakRss=Math.max(peakRss,process.memoryUsage().rss),25);
  let result;
  try {result=await runCopy({sourceDirs:[source],destDir:destination});}finally{clearInterval(interval);}
  assert.equal(result.status,'completed',JSON.stringify(result.failures)); assert.equal(result.copied,files.length);
  const inodes=new Map();
  for(const name of files){
   const from=path.join(source,name),to=path.join(destination,'CARD',name);
   assert.equal(await sha256(from),await sha256(to));
   const a=await fs.stat(from),b=await fs.stat(to); assert.ok(Math.abs(a.birthtimeMs-b.birthtimeMs)<=1); inodes.set(name,b.ino);
  }
  await assert.rejects(fs.stat(path.join(destination,'CARD','.DS_Store')),{code:'ENOENT'});
  const skip=await runCopy({sourceDirs:[source],destDir:destination});
  assert.equal(skip.status,'completed'); assert.equal(skip.skipped,files.length); assert.equal(skip.transferredBytes,0);
  for(const [name,ino]of inodes)assert.equal((await fs.stat(path.join(destination,'CARD',name))).ino,ino);
  const metrics={files:files.length,opaqueExtensions:extensions.length,boundarySizes:sizes,unicodeAndNewlineAndShellCharacters:true,nameBytes:249,depth:40,hiddenExcluded:true,identicalSkippedWithoutRewriting:true,allSha256AndCreationDates:true,seconds:(performance.now()-started)/1000,peakRssMiB:peakRss/2**20};
  await fs.writeFile(path.resolve('audit/2026-10-16/copy-matrix.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics));
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
