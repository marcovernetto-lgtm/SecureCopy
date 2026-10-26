const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const rendererCode = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');

function createDOMMock() {
  const elements = {};
  const createElement = (id) => ({
    id,
    hidden: true,
    classList: {
      _classes: new Set(['hidden']),
      toggle(cls, force) {
        if (force === undefined) {
          if (this._classes.has(cls)) this._classes.delete(cls);
          else this._classes.add(cls);
        } else if (force) {
          this._classes.add(cls);
        } else {
          this._classes.delete(cls);
        }
      },
      contains(cls) {
        return this._classes.has(cls);
      }
    },
    textContent: '',
    disabled: false,
    addEventListener: () => {}
  });

  const ids = [
    'recover-copy-wrap',
    'recover-copy-queue',
    'dismiss-copy-recovery',
    'recover-copy-text',
    'home-recover-copy-wrap',
    'home-recover-copy-btn',
    'home-dismiss-copy-recovery',
    'home-recover-copy-text',
    'compare-recover-wrap',
    'compare-recover',
    'dismiss-compare-recovery'
  ];

  for (const id of ids) {
    elements[id] = createElement(id);
  }

  return {
    document: {
      getElementById: (id) => elements[id] || null
    },
    elements
  };
}

test('updateCopyRecoveryUI toggles visibility and labels for interrupted copies', () => {
  const match = rendererCode.match(/function updateCopyRecoveryUI\([\s\S]*?\n\}/);
  assert.ok(match, 'updateCopyRecoveryUI function found in renderer.js');

  const { document, elements } = createDOMMock();
  const sandbox = {
    document,
    recoverCopyWrap: elements['recover-copy-wrap'],
    recoverCopyQueueBtn: elements['recover-copy-queue'],
    dismissCopyRecoveryBtn: elements['dismiss-copy-recovery'],
    recoverCopyText: elements['recover-copy-text'],
    homeRecoverCopyWrap: elements['home-recover-copy-wrap'],
    homeRecoverCopyBtn: elements['home-recover-copy-btn'],
    homeDismissCopyRecoveryBtn: elements['home-dismiss-copy-recovery'],
    homeRecoverCopyText: elements['home-recover-copy-text'],
    pendingCopyCount: 0
  };

  vm.runInNewContext(match[0], sandbox);
  const updateCopyRecoveryUI = sandbox.updateCopyRecoveryUI;

  // 1. Initially 0 pending copies
  updateCopyRecoveryUI(0);
  assert.equal(elements['recover-copy-wrap'].hidden, true);
  assert.equal(elements['home-recover-copy-wrap'].hidden, true);
  assert.equal(elements['recover-copy-queue'].hidden, true);

  // 2. Single pending copy
  updateCopyRecoveryUI(1);
  assert.equal(elements['recover-copy-wrap'].hidden, false);
  assert.equal(elements['home-recover-copy-wrap'].hidden, false);
  assert.equal(elements['recover-copy-queue'].hidden, false);
  assert.equal(elements['recover-copy-text'].textContent, 'Copia interrotta in sospeso');
  assert.equal(elements['recover-copy-queue'].textContent, 'Riprendi copia');
  assert.equal(elements['home-recover-copy-btn'].textContent, 'Riprendi copia');

  // 3. Multiple pending copies
  updateCopyRecoveryUI(4);
  assert.equal(elements['recover-copy-wrap'].hidden, false);
  assert.equal(elements['recover-copy-text'].textContent, '4 copie interrotte in sospeso');
  assert.equal(elements['recover-copy-queue'].textContent, 'Riprendi 4 copie');
  assert.equal(elements['home-recover-copy-btn'].textContent, 'Riprendi 4 copie');

  // 4. Dismissed back to 0
  updateCopyRecoveryUI(0);
  assert.equal(elements['recover-copy-wrap'].hidden, true);
  assert.equal(elements['home-recover-copy-wrap'].hidden, true);
  assert.equal(elements['recover-copy-queue'].hidden, true);
});

test('updateComparisonRecovery toggles visibility of comparison recovery banner', () => {
  const match = rendererCode.match(/function updateComparisonRecovery\([\s\S]*?\n\}/);
  assert.ok(match, 'updateComparisonRecovery function found in renderer.js');

  const { document, elements } = createDOMMock();
  const sandbox = {
    document,
    comparisonRecovery: null
  };

  vm.runInNewContext(match[0], sandbox);
  const updateComparisonRecovery = sandbox.updateComparisonRecovery;

  // 1. Null recovery
  updateComparisonRecovery(null);
  assert.equal(elements['compare-recover'].hidden, true);
  assert.equal(elements['compare-recover-wrap'].hidden, true);

  // 2. Recovery with empty decisions
  updateComparisonRecovery({ decisions: [] });
  assert.equal(elements['compare-recover'].hidden, true);
  assert.equal(elements['compare-recover-wrap'].hidden, true);

  // 3. Recovery with decisions
  updateComparisonRecovery({ decisions: [{ relative: 'clip.mov', keep: 'left' }] });
  assert.equal(elements['compare-recover'].hidden, false);
  assert.equal(elements['compare-recover-wrap'].hidden, false);

  // 4. Dismissed
  updateComparisonRecovery(null);
  assert.equal(elements['compare-recover'].hidden, true);
  assert.equal(elements['compare-recover-wrap'].hidden, true);
});
