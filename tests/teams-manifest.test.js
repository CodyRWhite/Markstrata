/**
 * .SYNOPSIS
 * The hand-written Teams manifest says what Teams needs, within the limits
 * Teams sets.
 *
 * .DESCRIPTION
 * This file is written by hand because the generated one could not be. Sync to
 * Teams produced an app whose short and full descriptions were both the word
 * "Markstrata", whose documentation link had nothing behind it because SPFx has
 * no field that maps to one, and whose tab configuration page - the way anybody
 * chooses which document a tab shows - was a placeholder.
 *
 * Written by hand means nothing checks it, which is the trade. So the limits
 * are checked here: a short name over 30 characters or a short description over
 * 80 is refused by Teams on upload, and finding that out from the admin centre
 * is a slow way to learn it.
 *
 * What cannot be checked here is whether the addresses work, because they are
 * SharePoint pages in a tenant. The manual check list in CONTRIBUTING covers
 * that, and it is the only thing that can.
 *
 * .USAGE
 *   npm test                                  every test
 *   node --test tests/teams-manifest.test.js  this one
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it runs at test time only
 * Requires:  teams/manifest.json
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'teams', 'manifest.json'), 'utf8')
);
const webPart = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'src', 'webparts', 'markstrata', 'MarkstrataWebPart.manifest.json'), 'utf8'
));

/* Straight out of the v1.17 schema, which is also what $schema points at. */
const REQUIRED = [
  'manifestVersion', 'version', 'id', 'developer', 'name', 'description',
  'icons', 'accentColor'
];
const LIMITS = [
  [['name', 'short'], 30],
  [['name', 'full'], 100],
  [['description', 'short'], 80],
  [['description', 'full'], 4000]
];

test('it has everything the schema demands', () => {
  const missing = REQUIRED.filter((field) => manifest[field] === undefined);
  assert.deepEqual(missing, [], 'Teams refuses a manifest without these');
  assert.equal(manifest.manifestVersion, '1.17');
  assert.match(manifest.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.match(manifest.accentColor, /^#[0-9A-Fa-f]{6}$/);
});

test('nothing is longer than Teams will take', () => {
  LIMITS.forEach(([keys, limit]) => {
    const value = keys.reduce((node, key) => node[key], manifest);
    assert.ok(value, `${keys.join('.')} is empty`);
    assert.ok(
      value.length <= limit,
      `${keys.join('.')} is ${value.length} characters; Teams allows ${limit}`
    );
  });
});

test('the descriptions describe rather than repeat the name', () => {
  /* The fault being fixed: both of them were the app's own name, which tells
     an administrator deciding whether to allow it precisely nothing. */
  ['short', 'full'].forEach((which) => {
    const text = manifest.description[which];
    assert.notEqual(text.trim(), manifest.name.short, `the ${which} description is just the name`);
    assert.ok(text.length > 40, `the ${which} description is ${text.length} characters`);
  });
});

test('the admin-facing links are all real and all different', () => {
  const links = [
    manifest.developer.websiteUrl,
    manifest.developer.privacyUrl,
    manifest.developer.termsOfUseUrl,
    manifest.publisherDocsUrl
  ];
  links.forEach((url) => {
    assert.ok(url, 'an admin-facing link is empty');
    assert.match(url, /^https:\/\//, `not https: ${url}`);
  });
  assert.equal(new Set(links).size, 4, 'two of the four links are the same page');

  /* The one Sync to Teams could never fill, and the reason this file exists. */
  assert.ok(manifest.publisherDocsUrl, 'no documentation link');
});

test('the tab points at the web part that is actually deployed', () => {
  const tabs = manifest.configurableTabs;
  assert.ok(Array.isArray(tabs) && tabs.length === 1, 'Teams allows exactly one configurable tab');

  const url = tabs[0].configurationUrl;
  assert.ok(
    url.indexOf(webPart.id) !== -1,
    'the configuration page names a different component than the web part manifest does'
  );
  /* Teams substitutes this at load time; a tenant hostname written in here
     would work in one tenant and nowhere else. */
  assert.ok(url.indexOf('{teamSiteDomain}') !== -1, 'the address is not tenant-neutral');
  /* Without this the configuration page renders the web part with no way to
     configure it, which is the placeholder everybody saw. */
  assert.ok(url.indexOf('openPropertyPane=true') !== -1, 'the pane would not open');

  assert.deepEqual(tabs[0].scopes, ['team', 'groupChat']);
});

test('the domains the tab loads from are allowed', () => {
  assert.ok(
    manifest.validDomains.some((domain) => domain.indexOf('sharepoint.com') !== -1),
    'the tab loads from SharePoint and SharePoint is not in validDomains'
  );
});

test('the icons it names are the ones the package carries', () => {
  assert.equal(manifest.icons.color, 'color.png');
  assert.equal(manifest.icons.outline, 'outline.png');

  /* Built under the component id, renamed on the way into the zip: both names
     have to keep agreeing with the builder. */
  ['color', 'outline'].forEach((which) => {
    const source = path.join(ROOT, 'teams', `${webPart.id}_${which}.png`);
    assert.ok(fs.existsSync(source), `teams/${webPart.id}_${which}.png is missing`);
  });
});
