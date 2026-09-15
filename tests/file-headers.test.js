/**
 * .SYNOPSIS
 * Every code file opens with a header block, and every script actually parses.
 *
 * .DESCRIPTION
 * The header convention is worth nothing if the next file added quietly skips
 * it, so it is checked rather than remembered: a block comment at the top with
 * .SYNOPSIS, .USAGE and .NOTES, and a Since line in the notes.
 *
 * The parse check is here because of a real escape. A string in
 * scripts/build-strings.js carried an unescaped apostrophe, so the generator
 * had not run since the day it was added - and nothing noticed, because the
 * test that reads it reads it as text rather than running it. Nothing in this
 * project executes every script, so this at least makes the compiler look at
 * them.
 *
 * .USAGE
 *   npm test                                every test
 *   node --test tests/file-headers.test.js  this one
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  nothing else in this project
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const ROOTS = ['src', 'harness', 'demo', 'scripts', 'tests'];
const SKIP = /node_modules|[\\/]dist[\\/]|[\\/]lib[\\/]|temp|\.min\./;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (SKIP.test(full)) { return []; }
    if (entry.isDirectory()) { return walk(full); }
    return /\.(ts|js|css)$/.test(entry.name) ? [full] : [];
  });
}

const files = ROOTS
  .map((name) => path.join(ROOT, name))
  .filter((directory) => fs.existsSync(directory))
  .flatMap(walk)
  .map((full) => path.relative(ROOT, full))
  .sort();

test('there are files to check at all', () => {
  assert.ok(files.length > 50, `only found ${files.length} code files`);
});

test('every code file opens with a header block', () => {
  const missing = files.filter((file) => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').trimStart();
    return !text.startsWith('/*');
  });
  assert.deepEqual(missing, [], 'these files do not open with a comment');
});

test('every header says what the file is, how it is used and where it came from', () => {
  const sections = ['.SYNOPSIS', '.USAGE', '.NOTES'];
  const wrong = [];

  files.forEach((file) => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').trimStart();
    const header = text.slice(0, text.indexOf('*/') + 2);
    const absent = sections.filter((section) => header.indexOf(section) === -1);
    if (absent.length) {
      wrong.push(`${file}: no ${absent.join(', ')}`);
    } else if (!/^ \* Since: {5}\S+/m.test(header)) {
      wrong.push(`${file}: the notes do not say which release it dates from`);
    }
  });

  assert.deepEqual(wrong, []);
});

/* A file that does not parse is a file nobody has run. */
test('every JavaScript file parses', () => {
  const broken = [];
  files.filter((file) => file.endsWith('.js')).forEach((file) => {
    try {
      execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'pipe' });
    } catch (error) {
      broken.push(`${file}: ${String(error.stderr).split('\n')[1] || 'did not parse'}`);
    }
  });
  assert.deepEqual(broken, []);
});
