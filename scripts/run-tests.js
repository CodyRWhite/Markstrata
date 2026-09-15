/*
 * Compiles the SharePoint-free half of the web part and runs the unit tests
 * against it.
 *
 * The markdown pipeline, the code block renderer and the theme resolution have
 * no SPFx imports precisely so they can be tested in plain Node - everything
 * that talks to SharePoint or the DOM sits behind them.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const executable = (name) => path.join(root, 'node_modules', '.bin', name);

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit', cwd: root });
}

console.log('Compiling test build...');
run(executable('tsc'), ['-p', 'tsconfig.test.json']);

console.log('Running tests...');
run(process.execPath, ['--test', 'tests/**/*.test.js']);
