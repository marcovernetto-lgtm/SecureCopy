const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');const {launch}=require('./electron-driver.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'securecopy-stress-ui-'));let app;
 try{
  app=await launch(path.join(root,'profile'));
  const metrics=await app.evaluate(`(()=>{
   switchScreen('compare');setCompareStage('results');
   const count=500000;compareResult={mode:'quick',summary:{missing:count,different:0,identical:0},verdict:'missing',entries:Array.from({length:count},(_,i)=>({relative:'DCIM/clip-'+String(i).padStart(7,'0')+'.BRAW',status:'missing',leftExists:true,rightExists:false,leftType:'file',rightType:null,copyable:true,issues:['manca a destra']}))};
   compareVisibleCount=300;
   const start=performance.now();renderCompareVerdict();renderCompareList();const initialMs=performance.now()-start;
   const rows=document.querySelectorAll('.compare-row').length;
   const filterStart=performance.now();compareFilter.value='0499999';renderCompareList();const searchMs=performance.now()-filterStart;
   const matchedRows=[...document.querySelectorAll('.compare-row')].map(row=>row.dataset.relative);
   compareFilter.value='';renderCompareList();document.getElementById('compare-select-visible').click();const selected=compareSelection.size;
   document.getElementById('compare-clear-selection').click();
   return {syntheticRows:count,initialMs,searchMs,rows,matchedRows,selected,heapMiB:performance.memory?.usedJSHeapSize/2**20};
  })()`);
  assert.equal(metrics.rows,300);assert.equal(metrics.selected,300);assert.deepEqual(metrics.matchedRows,['DCIM/clip-0499999.BRAW']);
  await fs.writeFile(path.resolve('audit/2026-10-16/ui-baseline.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics));
 }finally{await app?.stop();await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
