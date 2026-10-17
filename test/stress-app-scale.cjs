const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');const {launch,waitFor,delay}=require('./electron-driver.cjs');
(async()=>{
 const fixture=(await fs.readFile('/tmp/securecopy-stress-scale-location.txt','utf8')).trim();assert.ok(path.basename(fixture).startsWith('securecopy-stress-scale-'));
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'securecopy-stress-app-scale-')));let app;
 try{
  app=await launch(path.join(root,'profile'));const started=Date.now();let peakMainRssKiB=0,maxPingMs=0,lastLog=0;
  await app.evaluate(`compareLeft=${JSON.stringify(path.join(fixture,'left'))};compareRight=${JSON.stringify(path.join(fixture,'right'))};window.__stressDone=false;analyzeComparison().finally(()=>window.__stressDone=true);true;`);
  await waitFor(async()=>{const start=Date.now();const done=await app.evaluate('window.__stressDone');maxPingMs=Math.max(maxPingMs,Date.now()-start);peakMainRssKiB=Math.max(peakMainRssKiB,Number(execFileSync('/bin/ps',['-o','rss=','-p',String(app.child.pid)],{encoding:'utf8'}).trim()));if(Date.now()-lastLog>10000){lastLog=Date.now();console.log(JSON.stringify({elapsedSeconds:(Date.now()-started)/1000,progress:await app.evaluate('compareProgressEl.textContent')}));}if(!done)await delay(500);return done;},180000);
  const state=await app.evaluate('({rows:compareResult?.entries.length,summary:compareResult?.summary,rendered:document.querySelectorAll(".compare-row").length,error:compareProgressEl.textContent,report:compareResult?.reportPath,heapMiB:performance.memory?.usedJSHeapSize/2**20})');
  assert.equal(state.rows,202000,JSON.stringify(state));assert.equal(state.summary.missing,1);assert.equal(state.summary.different,1);assert.equal(state.rendered,2);assert.ok(state.report);
  const report=JSON.parse(await fs.readFile(state.report,'utf8'));assert.equal(report.entries.length,202000);assert.deepEqual(report.summary,state.summary);assert.equal(report.schema,'SecureCopy comparison report v1');
  const metrics={...state,reportParsedRows:report.entries.length,seconds:(Date.now()-started)/1000,peakMainRssMiB:peakMainRssKiB/1024,maxPingMs,reportMiB:(await fs.stat(state.report)).size/2**20};
  await fs.writeFile(path.resolve(`audit/2026-10-16/app-scale-${process.env.STRESS_LABEL||'baseline'}.json`),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics));
 }finally{await app?.stop();await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
