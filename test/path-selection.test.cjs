const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {pathSelection}=require('../path-selection');
test('selection matches the former prefix rules, including directory ancestors and similar names',()=>{
 const choices=['CARD/day','CARD/other/clip.RAW','CARD/empty','CARD/day'];const selection=pathSelection(choices);
 for(const value of ['CARD','CARD/day','CARD/day/clip.MOV','CARD/day2/clip.MOV','CARD/other','CARD/other/clip.RAW','CARD/other/clip.RAWx','CARD/empty','OTHER/day','absent']){
  const inside=(a,b)=>a===b||a.startsWith(b+path.sep);
  assert.equal(selection.contains(value),choices.some(p=>inside(value,p)),value);
  assert.equal(selection.related(value),choices.some(p=>inside(value,p)||inside(p,value)),value);
 }
 assert.equal(selection.paths.length,3);
});
test('selection rejects invalid and unsafe paths',()=>{for(const value of [null,'CARD',42,[''],['/CARD'],['CARD/../other'],['CARD/\0bad']])assert.throws(()=>pathSelection(value),/non validi/);});
test('large selection keeps sparse matches exact',()=>{
 const selected=Array.from({length:50000},(_,i)=>`CARD/day-${i}/clip.RAW`);const selection=pathSelection(selected);
 let found=0;for(let i=0;i<200000;i++)if(selection.contains(`CARD/day-${i}/clip.RAW`))found++;
 assert.equal(found,50000);assert.equal(selection.related('CARD'),true);assert.equal(selection.contains('CARD/day-50000/clip.RAW'),false);
});
