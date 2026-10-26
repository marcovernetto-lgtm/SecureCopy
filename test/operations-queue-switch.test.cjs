const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const rendererCode = fs.readFileSync(require.resolve('../src/renderer.js'), 'utf8');

test('clicking between operations updates focusedJobId and does not wipe DOM during progress updates', () => {
  const elements = new Map();
  function makeElement(tag = 'div') {
    let classes = new Set();
    const children = [];
    const listeners = {};
    const dataset = {};
    const el = {
      tagName: tag.toUpperCase(),
      style: {},
      dataset,
      textContent: '',
      title: '',
      children,
      classList: {
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        contains: name => classes.has(name),
        toggle(name, force) {
          if (force ?? !classes.has(name)) classes.add(name);
          else classes.delete(name);
        }
      },
      appendChild(c) { children.push(c); return c; },
      append(...items) { children.push(...items); },
      replaceChildren(...items) { children.length = 0; children.push(...items); },
      addEventListener(evt, fn) {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(fn);
      },
      dispatchEvent(evt) {
        for (const fn of listeners[evt.type] || []) fn(evt);
      },
      querySelector(sel) {
        function search(node) {
          for (const c of node.children) {
            if (sel.startsWith('[data-id="')) {
              const id = sel.slice(10, -2);
              if (c.dataset?.id === id) return c;
            }
            if (sel === '.job-state' && c.classList?.contains('job-state')) return c;
            const found = search(c);
            if (found) return found;
          }
          return null;
        }
        return search(this);
      },
      querySelectorAll(sel) {
        const res = [];
        function search(node) {
          for (const c of node.children) {
            if (sel === '.job-select' && c.classList?.contains('job-select')) res.push(c);
            search(c);
          }
        }
        search(this);
        return res;
      }
    };
    Object.defineProperty(el, 'className', {
      get: () => [...classes].join(' '),
      set: val => { classes = new Set(String(val).split(' ').filter(Boolean)); }
    });
    return el;
  }

  const queueItemsEl = makeElement('div');
  const context = {
    document: {
      getElementById: id => elements.get(id) || makeElement(),
      createElement: tag => makeElement(tag)
    },
    queueItems: queueItemsEl,
    operations: [
      { id: 'job-1', description: 'Copia A', status: 'processing', progress: 10, filesProcessed: 1, totalFiles: 10 },
      { id: 'job-2', description: 'Copia B', status: 'processing', progress: 5, filesProcessed: 0, totalFiles: 10 }
    ],
    copyQueue: [],
    latestProgress: new Map(),
    resetProgressUI: () => {},
    renderCopyProgress: () => {},
    displayResult: () => {},
    renderComparisonProgress: () => {},
    renderSelectedOperation: () => {},
    updateQueueControls: () => {},
    updateStartButtonState: () => {},
    crypto: { randomUUID: () => 'uuid' }
  };

  vm.createContext(context);
  vm.runInContext('var focusedJobId = "job-1";', context);

  // Extract functions
  for (const fnName of ['updateQueueSelectionUI', 'updateQueueItemState', 'renderQueueItems']) {
    const start = rendererCode.indexOf(`function ${fnName}(`);
    assert.ok(start >= 0, `Function ${fnName} should be in renderer.js`);
    const end = rendererCode.indexOf('\nfunction ', start + 1);
    assert.ok(end > start, `Function ${fnName} end boundary`);
    vm.runInContext(rendererCode.slice(start, end), context);
  }

  // Initial render
  context.renderQueueItems();
  assert.equal(queueItemsEl.children.length, 2);

  const initialButton1 = queueItemsEl.children[0].children[0];
  const initialButton2 = queueItemsEl.children[1].children[0];

  assert.equal(initialButton1.classList.contains('selected'), true);
  assert.equal(initialButton2.classList.contains('selected'), false);

  // Simulate progress update on job-2: MUST NOT recreate buttons
  context.operations[1].progress = 50;
  context.updateQueueItemState(context.operations[1]);

  // Check buttons are strictly the SAME objects in memory (not replaced/destroyed)
  assert.equal(queueItemsEl.children[0].children[0], initialButton1);
  assert.equal(queueItemsEl.children[1].children[0], initialButton2);

  // Check badge text updated
  const badge2 = queueItemsEl.children[1].children[0].children[1];
  assert.equal(badge2.textContent, 'In corso 50%');

  // Simulate clicking job-2
  initialButton2.dispatchEvent({ type: 'click' });
  assert.equal(vm.runInContext('focusedJobId', context), 'job-2');
  assert.equal(initialButton1.classList.contains('selected'), false);
  assert.equal(initialButton2.classList.contains('selected'), true);
});
