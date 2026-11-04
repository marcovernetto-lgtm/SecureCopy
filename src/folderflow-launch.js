const path = require('path');
const fs = require('fs');

function folderFlowDestination(args) {
  if (!Array.isArray(args) || !args.includes('--from-folderflow')) return null;
  const index = args.indexOf('--destination');
  const destination = index >= 0 ? args[index + 1] : null;
  if (typeof destination !== 'string' || !path.isAbsolute(destination) || destination.includes('\0')) return null;
  try {
    if (!fs.statSync(destination).isDirectory()) return null;
    fs.accessSync(destination, fs.constants.R_OK | fs.constants.W_OK);
    return path.resolve(destination);
  } catch { return null; }
}
module.exports = { folderFlowDestination };
