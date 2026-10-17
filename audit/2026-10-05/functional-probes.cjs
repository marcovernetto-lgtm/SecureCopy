const fs=require('node:fs/promises'); const path=require('node:path');const os=require('node:os');
const base=process.cwd();const {runCopy}=require(path.join(base,'copy-engine'));const {compareFolders,reconcileFolders}=require(path.join(base,'compare-engine'));
(async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'securecopy-audit-fixtures-')));const results={};
 async function pair(name){const s=path.join(root,name,'SD'),d=path.join(root,name,'dest');await fs.mkdir(s,{recursive:true});await fs.mkdir(d,{recursive:true});return [s,d];}
 try {
  {const [s,d]=await pair('long');const name='A'.repeat(220)+'.MOV';await fs.writeFile(path.join(s,name),'video');const r=await runCopy({sourceDirs:[s],destDir:d});results.longFilename={length:name.length,status:r.status,failures:r.failures.map(x=>x.reason)};}
  {const [s,d]=await pair('retry');await fs.mkdir(path.join(s,'unrelated'));await fs.writeFile(path.join(s,'unrelated','other.mov'),'safe');const r=await runCopy({sourceDirs:[s],destDir:d,onlyPaths:['SD/deleted.mov']});results.missingRetry={status:r.status,files:r.totalFiles,failures:r.failures,unrelatedDirectoryCreated:!!await fs.stat(path.join(d,'SD','unrelated')).catch(()=>null)};}
  {const [s,d]=await pair('folder');await fs.mkdir(path.join(s,'DAY1'));await fs.writeFile(path.join(s,'DAY1','clip.mov'),'video');const c=await compareFolders(s,d);const r=await reconcileFolders(c,[{relative:'DAY1',keep:'left'}],{selectedOnly:true});results.folderButton={status:r.status,destinationFiles:await fs.readdir(path.join(d,'DAY1')),entries:r.comparison.entries.map(x=>({path:x.relative,status:x.status,created:x.created}))};}
  {const [s,d]=await pair('progress');await fs.writeFile(path.join(s,'video.mov'),Buffer.alloc(8*1024*1024,1));const events=[];const r=await runCopy({sourceDirs:[s],destDir:d,onProgress:p=>{if(p.phase!=='scan')events.push({phase:p.phase,processed:p.filesProcessed,percentage:p.totalBytes?Math.min(100,Math.round((p.bytesProcessed||0)/p.totalBytes*100)):100});}});results.progress={status:r.status,events};}
  {const [s,d]=await pair('mode');const f=path.join(s,'special.sh');await fs.writeFile(f,'data');await fs.chmod(f,0o2755);const r=await runCopy({sourceDirs:[s],destDir:d});results.specialPermissions={sourceMode:((await fs.stat(f)).mode&0o7777).toString(8),status:r.status,failures:r.failures.map(x=>x.reason)};}
  {const [s,d]=await pair('skip');await fs.writeFile(path.join(s,'clip.mov'),'new');await fs.mkdir(path.join(d,'SD'));await fs.writeFile(path.join(d,'SD','clip.mov'),'old');const r=await runCopy({sourceDirs:[s],destDir:d,policy:'skip'});results.skip={status:r.status,copied:r.copied,kept:r.kept,verified:r.verifiedFiles.length};}
  console.log(JSON.stringify(results,null,2));await fs.writeFile('/tmp/securecopy-audit-20261005-results.json',JSON.stringify(results,null,2));
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
