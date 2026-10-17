const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const sync=require('node:fs');const path=require('node:path');const os=require('node:os');const {runCopy,copyFileVerified,sha256}=require('../copy-engine');const {compareFolders,reconcileFolders}=require('../compare-engine');
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'securecopy-stress-fault-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const source=path.join(root,'CARD'),target=path.join(root,'backup');await fs.mkdir(source);await fs.mkdir(target);return{root,source,target};}
for(const operation of ['copy','compare'])test(`${operation}: unreadable files are reported, never silently omitted`,async t=>{
 const{source,target}=await fixture(t);const bad=path.join(source,'unreadable.RAW');await fs.writeFile(bad,'camera bytes');await fs.writeFile(path.join(source,'valid.MOV'),'valid');await fs.chmod(bad,0);t.after(()=>fs.chmod(bad,0o600).catch(()=>{}));
 if(operation==='copy'){const result=await runCopy({sourceDirs:[source],destDir:target});assert.notEqual(result.status,'completed');assert.ok(result.failures.some(e=>e.path.includes('unreadable')));assert.equal(await fs.readFile(path.join(target,'CARD','valid.MOV'),'utf8'),'valid');}
 else{const result=await compareFolders(source,target,{mode:'deep'});const row=result.entries.find(e=>e.relative==='unreadable.RAW');assert.equal(row.leftType,'error');assert.notEqual(result.verdict,'perfect');}
});
for(const change of ['source-disappears','destination-parent-replaced'])test(`copy: ${change} after scanning cannot overwrite a foreign file`,async t=>{
 const{root,source,target}=await fixture(t);const file=path.join(source,'clip.RAW');await fs.writeFile(file,'camera bytes');const old=path.join(target,'clip.RAW');await fs.writeFile(old,'original target');const original=await sha256(old);const stats=await fs.stat(file);let changed=false;
 await assert.rejects(copyFileVerified({path:file,stats},old,{onPhase:phase=>{if(phase==='compare'&&!changed){changed=true;if(change==='source-disappears')sync.renameSync(source,path.join(root,'disconnected'));else{sync.renameSync(target,path.join(root,'old-backup'));sync.symlinkSync(source,target);}}}}));
 assert.ok(changed);const preserved=change==='source-disappears'?old:path.join(root,'old-backup','clip.RAW');assert.equal(await sha256(preserved),original);assert.equal(await fs.readFile(change==='source-disappears'?path.join(root,'disconnected','clip.RAW'):file,'utf8'),'camera bytes');
});
test('comparison cancellation during inventory stops promptly',async t=>{
 const{source,target}=await fixture(t);for(let i=0;i<300;i++)await fs.writeFile(path.join(source,`file-${i}.RAW`),'x');const controller=new AbortController();let requested;const start=Date.now();await assert.rejects(compareFolders(source,target,{signal:controller.signal,onProgress(){if(!requested){requested=Date.now();controller.abort();}}}));assert.ok(requested);assert.ok(Date.now()-start<3000);
});
test('changed destination after comparison is rejected before any copying',async t=>{
 const{source,target}=await fixture(t);await fs.writeFile(path.join(source,'clip.MOV'),'source');const result=await compareFolders(source,target);await fs.writeFile(path.join(target,'clip.MOV'),'foreign');await assert.rejects(reconcileFolders(result,[]),/cambiato/);assert.equal(await fs.readFile(path.join(target,'clip.MOV'),'utf8'),'foreign');
});
test('incremental comparison fingerprint matches the original complete JSON exactly',async t=>{
 const{source,target}=await fixture(t);await fs.writeFile(path.join(source,'quote\"\n日本語.RAW'),'data');await fs.mkdir(path.join(source,'empty'));await fs.writeFile(path.join(target,'right.CR3'),'other');const result=await compareFolders(source,target);const {snapshot}=require('../fs-safety');const crypto=require('node:crypto');
 const compact=item=>item?[item.type,item.hash,item.metadata,item.target,item.error||item.verificationError,item.stats&&(item.type==='directory'?[item.stats.dev,item.stats.ino,item.stats.mode]:snapshot(item.stats))]:null;
 const expected=crypto.createHash('sha256').update(JSON.stringify(result.entries.map(e=>[e.relative,compact(result.left.get(e.relative)),compact(result.right.get(e.relative))]))).digest('hex');assert.equal(result.fingerprint,expected);
});
