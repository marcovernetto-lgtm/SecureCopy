const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { folderFlowDestination } = require('../src/folderflow-launch');

test('only explicit FolderFlow launches accept an existing destination directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'folderflow-launch-'));
  try {
    const destination = path.join(root, 'Progetto è #1');
    fs.mkdirSync(destination);
    assert.equal(folderFlowDestination(['--from-folderflow', '--destination', destination]), destination);
    assert.equal(folderFlowDestination(['--destination', destination]), null);
    for (const value of [undefined, 'relative', path.join(root, 'missing'), __filename, '/tmp/invalid\0']) {
      assert.equal(folderFlowDestination(['--from-folderflow', '--destination', value]), null);
    }
    assert.equal(folderFlowDestination([]), null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('FolderFlow prepares the next copy and leaves active operations intact', () => {
  const vm = require('node:vm');
  const renderer = fs.readFileSync(require.resolve('../src/renderer.js'), 'utf8');
  const start = renderer.indexOf('function prepareFolderFlowCopy(');
  const end = renderer.indexOf('\nwindow.electronAPI', start);
  const operations = [{ id: 'active', destDir: '/existing/target', status: 'processing' }];
  const copyQueue = [{ id: 'queued', destDir: '/queued/target', status: 'pending' }];
  const before = JSON.stringify({ operations, copyQueue });
  const context = {
    operations, copyQueue, creditsBox: { style: { display: 'none' } }, sourcePaths: ['/old/source'], destPaths: ['/old/target'],
    clearSelection() { this.sourcePaths = []; this.destPaths = []; },
    addDestination(value) { this.destPaths.push(value); },
    showSetupScreen() { this.currentScreen = 'copy'; },
    sourceBtn: { focus() {} }
  };
  // Use functions created in the sandbox so they share renderer globals.
  vm.createContext(context);
  vm.runInContext(`
    function clearSelection() { sourcePaths = []; destPaths = []; }
    function addDestination(value) { destPaths.push(value); }
    function showSetupScreen() { currentScreen = 'copy'; }
  `, context);
  vm.runInContext(renderer.slice(start, end), context);
  context.prepareFolderFlowCopy({ destination: '/new/project è #1' });
  assert.equal(context.currentScreen, 'copy');
  assert.equal(JSON.stringify(context.destPaths), JSON.stringify(['/new/project è #1']));
  assert.equal(context.sourcePaths.length, 0);
  assert.equal(JSON.stringify({ operations, copyQueue }), before);
  context.prepareFolderFlowCopy(null);
  assert.equal(context.destPaths[0], '/new/project è #1');
});
