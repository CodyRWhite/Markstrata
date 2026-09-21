/**
 * .SYNOPSIS
 * Compiles the SharePoint-free half of the web part and runs the unit tests
 * against it.
 *
 * .DESCRIPTION
 * The markdown pipeline, the code block renderer and the theme resolution have
 * no SPFx imports precisely so they can be tested in plain Node - everything
 * that talks to SharePoint or the DOM sits behind them.
 *
 * .USAGE
 *   npm test
 *
 *   Compiles the SharePoint-free half of the web part into temp/test-lib, then
 *   runs node's test runner over tests/. A module missing from tsconfig.test.json
 *   shows up here as a missing file rather than as a confusing failure.
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  nothing else in this project
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const executable = (name) => path.join(root, 'node_modules', '.bin', name);

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit', cwd: root });
}

/*
 * Emptied before compiling, and that is not tidiness.
 *
 * The tests load these classes with require, which finds whatever is on disk.
 * The build spans two folders now, so its layout moves whenever an import
 * crosses one - and a previous build left behind a copy at the old path, which
 * every require went on finding. A check that passes against code that is no
 * longer the source is worse than one that fails.
 */
console.log('Compiling test build...');
fs.rmSync(path.join(root, 'temp', 'test-lib'), { recursive: true, force: true });
run(executable('tsc'), ['-p', 'tsconfig.test.json']);

console.log('Running tests...');
run(process.execPath, ['--test', 'tests/**/*.test.js']);
