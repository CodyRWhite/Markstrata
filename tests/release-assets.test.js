/**
 * .SYNOPSIS
 * Every Teams app the build writes is attached to a release.
 *
 * .DESCRIPTION
 * The release workflow named one Teams app, because when it was written there
 * was one. A second arrived beside it and nothing failed: the workflow kept
 * building both and publishing one, and the one it left out is the only one a
 * tenant can get from a release at all. The other is inside the .sppkg, where
 * Sync to Teams finds it; the HTML app is not, and has to be uploaded by hand
 * from wherever somebody can download it.
 *
 * So the list is not kept twice. The builder says what it writes and this
 * checks the workflow names each of them, which is what a third app would
 * need somebody to remember otherwise.
 *
 * .USAGE
 *   npm test                                   every test
 *   node --test tests/release-assets.test.js   this one
 *
 * .NOTES
 * Since:     0.0.23.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  scripts/build-teams-app.js, .github/workflows/release.yml
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { APPS } = require('../scripts/build-teams-app');
const WORKFLOW = fs.readFileSync(
  path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');

test('the builder writes more than one Teams app', () => {
  /* If this ever fails the test below proves nothing, so it is said out loud
     rather than left for somebody to notice a passing suite. */
  assert.ok(APPS.length >= 2, `only ${APPS.length} Teams app in the build`);
});

APPS.forEach((app) => {
  test(`the release attaches ${app.package}`, () => {
    assert.ok(WORKFLOW.indexOf(`teams/${app.package}`) !== -1,
      `${app.package} is built and never attached to a release. A tenant can `
      + 'only get it from one, because Sync to Teams deploys the app inside '
      + 'the .sppkg and nothing else.');
  });
});

APPS.forEach((app) => {
  test(`the release checks ${app.package} was built`, () => {
    assert.ok(WORKFLOW.indexOf(`test -f teams/${app.package}`) !== -1,
      `nothing fails the release when ${app.package} is missing, so an empty `
      + 'asset list would publish quietly.');
  });
});
