const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const rendererCode = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');

function createDOMFixture() {
    const elements = new Map();
    function createMockElement(id = '') {
        const classes = new Set();
        const children = [];
        const listeners = new Map();
        const el = {
            id,
            style: {},
            dataset: {},
            textContent: '',
            title: '',
            children,
            classList: {
                add: name => classes.add(name),
                remove: name => classes.delete(name),
                contains: name => classes.has(name),
                toggle: (name, force) => {
                    if (force === undefined) {
                        if (classes.has(name)) classes.delete(name);
                        else classes.add(name);
                    } else if (force) {
                        classes.add(name);
                    } else {
                        classes.delete(name);
                    }
                }
            },
            addEventListener(evt, fn) {
                if (!listeners.has(evt)) listeners.set(evt, []);
                listeners.get(evt).push(fn);
            },
            dispatchEvent(evt) {
                const list = listeners.get(evt.type || evt) || [];
                for (const fn of list) fn(evt);
            },
            click() {
                this.dispatchEvent({ type: 'click' });
            },
            setAttribute(k, v) { this[k] = v; },
            getAttribute(k) { return this[k]; },
            replaceChildren(...nodes) {
                children.length = 0;
                for (const n of nodes) children.push(n);
            },
            append(...nodes) {
                for (const n of nodes) children.push(n);
            },
            closest(selector) {
                if (selector.includes('compare-picker')) return el._pickerParent || el;
                return null;
            },
            focus() {}
        };
        return el;
    }

    function getElementById(id) {
        if (!elements.has(id)) {
            elements.set(id, createMockElement(id));
        }
        return elements.get(id);
    }

    const leftPicker = createMockElement('left-picker');
    const rightPicker = createMockElement('right-picker');
    const leftBtn = getElementById('compare-left-btn');
    const rightBtn = getElementById('compare-right-btn');
    leftBtn._pickerParent = leftPicker;
    rightBtn._pickerParent = rightPicker;

    const context = {
        document: {
            getElementById,
            createElement: (tag) => createMockElement(tag),
            addEventListener: () => {}
        },
        window: {
            addEventListener: () => {},
            electronAPI: {
                selectFolder: async () => '/mock/folder'
            },
            SecureCopyAppearance: { setSection: () => {} }
        },
        console,
        Map,
        Set,
        Boolean,
        resetComparisonAfterSelection: () => {}
    };

    return { context, elements, leftPicker, rightPicker };
}

test('renderCompareSelections displays chips with remove button and clears on click', () => {
    const { context, elements, leftPicker, rightPicker } = createDOMFixture();

    const script = `
        var compareLeft = '';
        var compareRight = '';
        const compareLeftBtn = document.getElementById('compare-left-btn');
        const compareRightBtn = document.getElementById('compare-right-btn');
        const compareLeftPath = document.getElementById('compare-left-path');
        const compareRightPath = document.getElementById('compare-right-path');
        const compareLeftList = document.getElementById('compare-left-list');
        const compareRightList = document.getElementById('compare-right-list');

        ${rendererCode.slice(
            rendererCode.indexOf('function renderCompareSelections()'),
            rendererCode.indexOf('\nfunction showCompareScreen()')
        )}
    `;

    vm.createContext(context);
    vm.runInContext(script, context);

    // Initial state: empty
    context.renderCompareSelections();
    assert.equal(elements.get('compare-left-path').textContent, 'Nessuna cartella scelta');
    assert.equal(elements.get('compare-right-path').textContent, 'Nessuna cartella scelta');
    assert.equal(leftPicker.classList.contains('has-selection'), false);
    assert.equal(rightPicker.classList.contains('has-selection'), false);
    assert.equal(elements.get('compare-left-list').children.length, 0);

    // Select left folder
    context.compareLeft = '/Volumes/CardA/DCIM';
    context.renderCompareSelections();
    assert.equal(elements.get('compare-left-path').textContent, '1 cartella selezionata');
    assert.equal(leftPicker.classList.contains('has-selection'), true);
    assert.equal(elements.get('compare-left-list').children.length, 1);

    const leftChip = elements.get('compare-left-list').children[0];
    assert.equal(leftChip.title, '/Volumes/CardA/DCIM');
    assert.equal(leftChip.children.length, 2); // span and button
    assert.equal(leftChip.children[0].textContent, '/Volumes/CardA/DCIM');
    assert.equal(leftChip.children[1].textContent, '×');

    // Select right folder
    context.compareRight = '/Volumes/Backup/DCIM';
    context.renderCompareSelections();
    assert.equal(elements.get('compare-right-path').textContent, '1 cartella selezionata');
    assert.equal(rightPicker.classList.contains('has-selection'), true);
    assert.equal(elements.get('compare-right-list').children.length, 1);

    const rightChip = elements.get('compare-right-list').children[0];
    assert.equal(rightChip.title, '/Volumes/Backup/DCIM');
    assert.equal(rightChip.children[1].textContent, '×');

    // Click '×' button on left chip to clear selection
    const leftRemoveBtn = leftChip.children[1];
    leftRemoveBtn.click();

    // Verify left selection is cleared
    assert.equal(context.compareLeft, '');
    assert.equal(elements.get('compare-left-path').textContent, 'Nessuna cartella scelta');
    assert.equal(leftPicker.classList.contains('has-selection'), false);
    assert.equal(elements.get('compare-left-list').children.length, 0);

    // Right selection should still be preserved
    assert.equal(context.compareRight, '/Volumes/Backup/DCIM');
    assert.equal(elements.get('compare-right-path').textContent, '1 cartella selezionata');
    assert.equal(rightPicker.classList.contains('has-selection'), true);
    assert.equal(elements.get('compare-right-list').children.length, 1);

    // Click '×' button on right chip to clear selection
    const rightRemoveBtn = rightChip.children[1];
    rightRemoveBtn.click();

    // Verify right selection is cleared
    assert.equal(context.compareRight, '');
    assert.equal(elements.get('compare-right-path').textContent, 'Nessuna cartella scelta');
    assert.equal(rightPicker.classList.contains('has-selection'), false);
    assert.equal(elements.get('compare-right-list').children.length, 0);
});
