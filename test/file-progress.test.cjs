const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const renderer = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');
function fixture() {
  const elements = new Map();
  function element(name) {
    if (!elements.has(name)) {
      const classes = new Set(['hidden']);
      elements.set(name, { style: {}, dataset: {}, textContent: '', title: '',
        classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
          toggle(name, force) { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); } },
        replaceChildren() {}, append() {} });
    }
    return elements.get(name);
  }
  const context = { document: { getElementById: element, createElement: () => element(Symbol()) },
    focusedJobId: 'copy', latestProgress: new Map(), updateAverageSpeed() {}, updateProgressBarColor() {}, formatBytes: value => `${value} B` };
  for (const name of ['progressBar','progressPercentage','progressDetails','progressStatus','progressSpeed','currentFilePanel','currentFileTrack','currentFileBar','currentFileLabel','currentFileProgress','currentFileEl','resultSummary','newCopyBtn','failureDetails','failureSummary','failureList','openReportBtn','openCopyDestinationBtn']) context[name] = element(name);
  vm.createContext(context);
  for (const name of ['renderCopyProgress','resetProgressUI','displayResult','renderComparisonProgress']) {
    const start = renderer.indexOf(`function ${name}(`);
    const end = renderer.indexOf('\nfunction ', start + 1);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(renderer.slice(start, end), context);
  }
  return context;
}
test('single-file track remains visible through scan, hash, copy, verification and the next file', () => {
  const ui = fixture();
  const states = [
    { phase:'scan' },
    { phase:'compare', currentFile:'first.MOV' },
    { phase:'compare', currentFile:'first.MOV', readBytes:50, readTotal:100 },
    { phase:'copy', currentFile:'first.MOV' },
    { phase:'copy', currentFile:'first.MOV', currentFileBytes:0, currentFileTotal:100 },
    { phase:'copy', currentFile:'first.MOV', currentFileBytes:50, currentFileTotal:100 },
    { phase:'copy', currentFile:'first.MOV', currentFileBytes:100, currentFileTotal:100 },
    { phase:'verify', currentFile:'first.MOV' },
    { phase:'verify', currentFile:'first.MOV', readBytes:25, readTotal:100 },
    { phase:'copy', currentFile:'first.MOV', filesProcessed:1 },
    { phase:'compare', currentFile:'second.CR3' },
    { phase:'copy', currentFile:'second.CR3', currentFileBytes:0, currentFileTotal:0 },
    { phase:'scan' }
  ];
  const expected = ['0%','0%','50%','0%','0%','50%','100%','0%','25%','0%','0%','0%','0%'];
  states.forEach((state, index) => {
    ui.renderCopyProgress(state);
    assert.equal(ui.currentFilePanel.classList.contains('hidden'), false, `panel phase ${index}`);
    assert.equal(ui.currentFileTrack.classList.contains('hidden'), false, `track phase ${index}`);
    assert.equal(ui.currentFileBar.style.width, expected[index]);
    if (expected[index] === '0%') assert.equal(ui.currentFileBar.style.transition, 'none');
  });
  assert.equal(ui.currentFileEl.textContent, '');
  assert.equal(ui.currentFileEl.title, '');
});
test('reset and completion leave an empty track, without stale progress from the previous file', () => {
  const ui = fixture();
  for (const finish of [() => ui.resetProgressUI(), () => ui.displayResult({ status:'completed', copied:1, totalFiles:1, failures:[] })]) {
    ui.renderCopyProgress({ phase:'copy', currentFile:'first.MOV', currentFileBytes:100, currentFileTotal:100 });
    finish();
    assert.equal(ui.currentFilePanel.classList.contains('hidden'), false);
    assert.equal(ui.currentFileTrack.classList.contains('hidden'), false);
    assert.equal(ui.currentFileBar.style.width, '0%');
    assert.equal(ui.currentFileBar.style.transition, 'none');
    assert.equal(ui.currentFileEl.textContent, '');
  }
});
test('comparison monitor also reserves the track between elements and at completion', () => {
  const ui = fixture();
  for (const item of [{ status:'processing', phase:'inventory' }, { status:'processing', current:'first.MOV' }, { status:'completed', current:'first.MOV', mode:'quick' }]) {
    ui.renderComparisonProgress(item);
    assert.equal(ui.currentFilePanel.classList.contains('hidden'), false);
    assert.equal(ui.currentFileTrack.classList.contains('hidden'), false);
    assert.equal(ui.currentFileBar.style.width, '0%');
  }
});
