const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const rendererCode = fs.readFileSync(require.resolve('../src/renderer.js'), 'utf8');

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
            querySelector: () => null,
            querySelectorAll: () => [],
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

test('compareFolders identifies files present in different subfolder locations as relocated', async () => {
    const os = require('node:os');
    const path = require('node:path');
    const fsp = require('node:fs/promises');
    const { compareFolders } = require('../src/compare-engine');

    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'securecopy-relocated-test-'));
    try {
        const leftDir = path.join(tempDir, 'left');
        const rightDir = path.join(tempDir, 'right');
        await fsp.mkdir(path.join(leftDir, 'CARD_A'), { recursive: true });
        await fsp.mkdir(path.join(rightDir, 'ARCHIVE_2026', 'DAY_01'), { recursive: true });

        // Identical content at different relative paths:
        // Left: CARD_A/clip_001.mov
        // Right: ARCHIVE_2026/DAY_01/clip_001.mov
        const clipContent = Buffer.from('VIDEO_PAYLOAD_SAMPLE_12345');
        await fsp.writeFile(path.join(leftDir, 'CARD_A', 'clip_001.mov'), clipContent);
        await fsp.writeFile(path.join(rightDir, 'ARCHIVE_2026', 'DAY_01', 'clip_001.mov'), clipContent);

        // Also add one truly missing file on left:
        await fsp.writeFile(path.join(leftDir, 'CARD_A', 'missing_clip.mov'), Buffer.from('UNSAVED_CLIP_XYZ'));

        const result = await compareFolders(leftDir, rightDir, { mode: 'deep' });

        assert.equal(result.summary.relocated, 2);
        const missingFiles = result.entries.filter(e => e.status === 'missing' && (e.leftType === 'file' || e.rightType === 'file'));
        assert.equal(missingFiles.length, 1);
        assert.equal(missingFiles[0].relative, path.join('CARD_A', 'missing_clip.mov'));

        const relocatedRow = result.entries.find(e => e.relative === path.join('CARD_A', 'clip_001.mov'));
        assert.ok(relocatedRow);
        assert.equal(relocatedRow.status, 'relocated');
        assert.equal(relocatedRow.relocatedPath, path.join('ARCHIVE_2026', 'DAY_01', 'clip_001.mov'));

        const quickResult = await compareFolders(leftDir, rightDir, { mode: 'quick' });
        assert.equal(quickResult.summary.relocated, 2);
        const quickRelocated = quickResult.entries.find(e => e.relative === path.join('CARD_A', 'clip_001.mov'));
        assert.ok(quickRelocated);
        assert.equal(quickRelocated.status, 'relocated');
    } finally {
        await fsp.rm(tempDir, { recursive: true, force: true });
    }
});

test('renderCompareVerdict populates dashboard gauge, distribution graph and metric cards', () => {
    const { context, elements } = createDOMFixture();

    const script = `
        var compareResult = {
            summary: { total: 4, identical: 2, relocated: 1, different: 0, missing: 1, errors: 0 },
            entries: [
                { relative: 'clip1.mov', status: 'identical', leftExists: true, rightExists: true, leftType: 'file', rightType: 'file', leftDetails: { size: 1000 }, rightDetails: { size: 1000 }, copyable: false },
                { relative: 'clip2.mov', status: 'identical', leftExists: true, rightExists: true, leftType: 'file', rightType: 'file', leftDetails: { size: 1000 }, rightDetails: { size: 1000 }, copyable: false },
                { relative: 'A/clip3.mov', status: 'relocated', relocatedPath: 'B/clip3.mov', relocatedSide: 'right', leftExists: true, rightExists: false, leftType: 'file', leftDetails: { size: 1000 }, copyable: false },
                { relative: 'missing.mov', status: 'missing', leftExists: true, rightExists: false, leftType: 'file', leftDetails: { size: 1000 }, copyable: true }
            ]
        };
        var compareVerdictEl = document.getElementById('compare-verdict');
        var compareVerified = new Map();
        function liveCompareEntry(e) { return e; }
        function formatBytes(bytes) { return bytes + ' B'; }

        ${rendererCode.slice(
            rendererCode.indexOf('function renderCompareVerdict()'),
            rendererCode.indexOf('\nfunction liveCompareEntry(')
        )}
    `;

    vm.createContext(context);
    vm.runInContext(script, context);

    context.renderCompareVerdict();

    // Gauge presence: 3 out of 4 source files are present (2 identical + 1 relocated) = 75%
    assert.equal(elements.get('compare-coverage-pct').textContent, '75%');
    assert.equal(elements.get('count-all').textContent, '4');
    assert.equal(elements.get('count-identical').textContent, '2');
    assert.equal(elements.get('count-relocated').textContent, '1');
    assert.equal(elements.get('count-missing').textContent, '1');
    assert.equal(elements.get('count-different').textContent, '0');

    // Distribution bar segments
    assert.equal(elements.get('dist-seg-identical').style.width, '50%');
    assert.equal(elements.get('dist-seg-relocated').style.width, '25%');
    assert.equal(elements.get('dist-seg-missing').style.width, '25%');
});
