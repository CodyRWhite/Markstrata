/**
 * .SYNOPSIS
 * The pane's strings live in three files that have to agree.
 *
 * .USAGE
 *   npm test                            every test
 *   node --test tests/strings.test.js   this one
 *
 * .NOTES
 * Since:     0.0.12.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  nothing else in this project
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
 * The pane's strings live in three files that have to agree.
 *
 * scripts/build-strings.js holds the text, loc/en-us.js is generated from it,
 * and loc/mystrings.d.ts is the interface the web part reads them through.
 * Only the last of those is checked by the compiler, so the first two had
 * drifted: nine strings had been added straight to en-us.js and never to the
 * generator, and running the generator would have deleted all nine and left a
 * pane full of blank labels. Nothing would have failed until someone opened
 * it in SharePoint.
 */
const ROOT = path.join(__dirname, '..');

function keys(file, pattern) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

/* The generator's table ends where the file's output does. */
const generator = fs.readFileSync(path.join(ROOT, 'scripts/build-strings.js'), 'utf8')
  .split('const banner')[0];

const fromGenerator = [...generator.matchAll(/^ {2}([A-Za-z]+):/gm)].map((match) => match[1]);
const fromLoc = keys('src/webparts/markstrata/loc/en-us.js', /^ {4}"([A-Za-z]+)":/gm);
const fromTypes = keys('src/webparts/markstrata/loc/mystrings.d.ts', /^ {2}([A-Za-z]+): string;/gm);

test('every generated string is declared in the typings', () => {
  assert.deepEqual(fromLoc.filter((key) => fromTypes.indexOf(key) === -1), [],
    'in loc/en-us.js but missing from loc/mystrings.d.ts');
});

test('the typings declare nothing the strings do not carry', () => {
  assert.deepEqual(fromTypes.filter((key) => fromLoc.indexOf(key) === -1), [],
    'declared in loc/mystrings.d.ts but missing from loc/en-us.js');
});

test('loc/en-us.js is what the generator would write', () => {
  assert.deepEqual(fromLoc.filter((key) => fromGenerator.indexOf(key) === -1), [],
    'in loc/en-us.js but not in scripts/build-strings.js: running the '
    + 'generator would delete it. Add it to the generator, not to en-us.js.');
  assert.deepEqual(fromGenerator.filter((key) => fromLoc.indexOf(key) === -1), [],
    'in scripts/build-strings.js but not in loc/en-us.js: run '
    + '`node scripts/build-strings.js`.');
});

/* Every .ts under the web part, rather than the one file that used to hold
   them all: this check read MarkstrataWebPart.ts, and when the property pane
   moved out it went on passing while guarding almost nothing. */
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) { return sources(full); }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/* A string the pane asks for but nothing defines renders as blank. */
test('every strings.X the web part reads exists', () => {
  const files = sources(path.join(ROOT, 'src/webparts/markstrata'));
  const used = [...new Set(files.flatMap((file) =>
    [...fs.readFileSync(file, 'utf8').matchAll(/\bstrings\.([A-Za-z]+)/g)].map((match) => match[1])))];

  /* If this ever reads as a handful, something that reads strings has moved
     out from under it again. */
  assert.ok(used.length > 40, `only ${used.length} strings are read at all`);
  assert.deepEqual(used.filter((key) => fromLoc.indexOf(key) === -1), [],
    'the web part reads a string that is not defined');
});
