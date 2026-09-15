/**
 * .SYNOPSIS
 * The version has to be in step in package.json and in the solution
 * package, because that is the number a tenant compares.
 *
 * .USAGE
 *   npm test                               every test
 *   node --test tests/versioning.test.js   this one
 *
 * .NOTES
 * Since:     0.0.10.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  nothing else in this project
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');

function notesFor(version, changelog) {
  const file = path.join(root, 'CHANGELOG.md');
  const original = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, changelog);
  try {
    return execFileSync(process.execPath, [path.join(root, 'scripts', 'release-notes.js'), version],
      { encoding: 'utf8' });
  } finally {
    fs.writeFileSync(file, original);
  }
}

const CHANGELOG = '# Changelog\n\n## 0.0.10.0\n\n- ten\n\n## 0.0.1\n\n- one\n';

/*
 * The section was found with a substring test, so asking for 0.0.1 returned the
 * 0.0.10.0 notes: the wrong release, silently. Four-part versions make the
 * collision easy to hit, since every number is a prefix of a longer one.
 */
test('release notes match the whole version, not a prefix of it', () => {
  assert.match(notesFor('0.0.1', CHANGELOG), /- one/);
  assert.match(notesFor('0.0.10', CHANGELOG), /- ten/);
});

test('a release answers to both spellings of its version', () => {
  assert.match(notesFor('0.0.10.0', CHANGELOG), /- ten/);
  assert.match(notesFor('0.0.1.0', CHANGELOG), /- one/);
});

test('an unknown version falls back rather than picking a neighbour', () => {
  const notes = notesFor('9.9.9.0', CHANGELOG);
  assert.match(notes, /Markstrata 9\.9\.9\.0/);
  assert.doesNotMatch(notes, /- (one|ten)/);
});

/* SharePoint compares four-part versions, so that is what gets stamped. */
test('set-version writes four parts, from either spelling', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ver-'));
  for (const [given, expected] of [['1.2.3', '1.2.3.0'], ['1.2.3.4', '1.2.3.4']]) {
    const packageJson = path.join(work, 'package.json');
    const solutionConfig = path.join(work, 'config');
    fs.mkdirSync(solutionConfig, { recursive: true });
    fs.writeFileSync(packageJson, JSON.stringify({ name: 'x', version: '0.0.0.0' }));
    fs.writeFileSync(path.join(solutionConfig, 'package-solution.json'),
      JSON.stringify({ solution: { version: '0.0.0.0', features: [{ version: '0.0.0.0' }] } }));
    execFileSync(process.execPath, [path.join(root, 'scripts', 'set-version.js'), given],
      { env: { ...process.env, SET_VERSION_ROOT: work }, stdio: 'pipe' });
    const solution = JSON.parse(fs.readFileSync(path.join(solutionConfig, 'package-solution.json'), 'utf8'));
    assert.equal(JSON.parse(fs.readFileSync(packageJson, 'utf8')).version, expected, `package.json for ${given}`);
    assert.equal(solution.solution.version, expected, `solution for ${given}`);
    assert.equal(solution.solution.features[0].version, expected, `feature for ${given}`);
  }
});
