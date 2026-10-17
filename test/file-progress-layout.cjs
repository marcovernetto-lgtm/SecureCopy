const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { launch } = require('./electron-driver.cjs');
(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'securecopy-file-layout-')));
  let app;
  try {
    app = await launch(path.join(root, 'profile'));
    await app.evaluate(`switchScreen('monitor');document.getElementById('operations-empty').classList.add('hidden');document.getElementById('progress-section').classList.remove('hidden');`);
    const states = [
      { phase:'scan', filesFound:2 },
      { phase:'compare', currentFile:'Lumix/first.MOV' },
      { phase:'compare', currentFile:'Lumix/first.MOV',readTotal:1000,readBytes:100 },
      { phase:'copy', currentFile:'Lumix/first.MOV' },
      { phase:'copy', currentFile:'Lumix/first.MOV',currentFileTotal:1000,currentFileBytes:0 },
      { phase:'copy', currentFile:'Lumix/first.MOV',currentFileTotal:1000,currentFileBytes:500 },
      { phase:'copy', currentFile:'Lumix/first.MOV',currentFileTotal:1000,currentFileBytes:1000 },
      { phase:'verify', currentFile:'Lumix/first.MOV' },
      { phase:'verify', currentFile:'Lumix/first.MOV',readTotal:1000,readBytes:500 },
      { phase:'copy', currentFile:'Lumix/first.MOV',filesProcessed:1 },
      { phase:'compare', currentFile:'Lumix/second.CR3' },
      { phase:'copy', currentFile:'Lumix/second.CR3',currentFileTotal:0,currentFileBytes:0 }
    ];
    const samples=[];
    for (let i=0;i<states.length;i++) {
      samples.push(await app.evaluate(`(()=>{renderCopyProgress(${JSON.stringify(states[i])});const panel=currentFilePanel.getBoundingClientRect(),track=currentFileTrack.getBoundingClientRect();return {index:${i},panelHeight:panel.height,trackHeight:track.height,trackTop:track.top,cardHeight:document.getElementById('progress-section').getBoundingClientRect().height,bar:currentFileBar.style.width};})()`));
      if (i===1 || i===5) {
        const screenshot=await app.command('Page.captureScreenshot',{format:'png'});
        await fs.mkdir(path.resolve('audit/2026-10-16/screenshots'),{recursive:true});
        await fs.writeFile(path.resolve(`audit/2026-10-16/screenshots/file-progress-fixed-${i}.png`),Buffer.from(screenshot.data,'base64'));
      }
    }
    await app.evaluate(`displayResult({status:'completed',copied:2,skipped:0,totalFiles:2,failures:[]},'layout');`);
    const finished=await app.evaluate('({panelHeight:currentFilePanel.getBoundingClientRect().height,trackHeight:currentFileTrack.getBoundingClientRect().height,bar:currentFileBar.style.width})');
    await fs.writeFile(path.resolve('audit/2026-10-16/file-progress-layout.json'),JSON.stringify({samples,finished},null,2));
    assert.ok(samples.every(item=>item.trackHeight>0 && item.panelHeight>0));
    assert.ok(samples.every(item=>Math.abs(item.cardHeight-samples[0].cardHeight)<0.1));
    assert.ok(samples.every(item=>Math.abs(item.trackTop-samples[0].trackTop)<0.1));
    for(const index of [0,1,3,4,7,9,10,11])assert.equal(samples[index].bar,'0%');
    assert.equal(samples[5].bar,'50%');assert.equal(samples[6].bar,'100%');
    assert.equal(finished.trackHeight,samples[0].trackHeight);assert.equal(finished.panelHeight,samples[0].panelHeight);assert.equal(finished.bar,'0%');
    console.log(JSON.stringify({stableAcrossAllPhases:true,samples,finished}));
  } finally { await app?.stop();await fs.rm(root,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
