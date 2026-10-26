const path = require('node:path');

// Prefix lookups depend on folder depth, not on the number of selected files.
function pathSelection(paths) {
  if (!Array.isArray(paths) || paths.some(value => typeof value !== 'string' || !value || value.includes('\0') || path.isAbsolute(value) || value.split(path.sep).includes('..'))) throw new Error('Percorsi di ripresa non validi.');
  const selected = new Set(paths.map(value => path.normalize(value)));
  const parents = new Set();
  for (const value of selected) {
    for (let parent = path.dirname(value); parent !== '.'; parent = path.dirname(parent)) parents.add(parent);
  }
  function contains(value) {
    let current = path.normalize(value);
    for (;;) {
      if (selected.has(current)) return true;
      const parent = path.dirname(current);
      if (parent === '.' || parent === current) return false;
      current = parent;
    }
  }
  return { paths: [...selected], contains, related: value => contains(value) || parents.has(path.normalize(value)) };
}
module.exports = { pathSelection };
