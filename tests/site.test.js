/**
 * .SYNOPSIS
 * The shape of the documentation site: its pages, the links between them,
 * and the header and footer every page carries.
 *
 * .USAGE
 *   npm test                         every test
 *   node --test tests/site.test.js   this one
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it runs at test time only
 * Requires:  site.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PAGES, page, linkTo } = require('../scripts/site');

const root = path.join(__dirname, '..');

test('every page declares a source that exists, or is the demo', () => {
  for (const entry of PAGES) {
    if (!entry.source) {
      assert.equal(entry.id, 'demo', `${entry.id} has no source but is not the demo`);
      continue;
    }
    assert.ok(fs.existsSync(path.join(root, entry.source)),
      `${entry.id} is built from ${entry.source}, which does not exist`);
  }
});

test('every page has a title and a description for link previews', () => {
  for (const entry of PAGES) {
    assert.ok(entry.title && entry.title.length > 3, `${entry.id} needs a title`);
    assert.ok(entry.description && entry.description.length > 30, `${entry.id} needs a description`);
  }
});

/*
 * The site is published under a repository path, so a root-relative link would
 * land on the domain root instead of the site.
 */
test('links between pages are relative', () => {
  for (const from of PAGES) {
    for (const target of PAGES) {
      const href = linkTo(from.id, target.id);
      assert.ok(!href.startsWith('/'), `${from.id} -> ${target.id} is root-relative: ${href}`);
      assert.ok(href.length > 0, `${from.id} -> ${target.id} is empty`);
    }
  }
});

test('the header marks the current page and links to all of them', () => {
  for (const entry of PAGES) {
    const html = require('../scripts/site').header(entry.id);
    assert.equal((html.match(/class="site-nav-link/g) || []).length, PAGES.length);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1, `${entry.id}`);
  }
});

/*
 * House style for every word this project ships: no em dashes. They are easy to
 * reintroduce by habit and invisible in review, and they surface in places that
 * are awkward to correct later - the app's own description in the SharePoint
 * store, a published release note, the rendered site.
 *
 * The list is explicit rather than a directory walk: the brand package under
 * assets/ is delivered artwork and documentation that is not ours to restyle,
 * and sharepoint/solution/ is build output full of third-party bundles.
 */
const PROSE = [
  'README.md', 'CONTRIBUTING.md', 'THEMES.md', 'CHANGELOG.md',
  'scripts/site.js', 'harness/build.js',
  'samples/welcome.md', 'samples/kitchen-sink.md',
  'src/webparts/markstrata/loc/en-us.js',
  'src/webparts/markstrata/MarkstrataWebPart.manifest.json',
  'config/package-solution.json'
];

test('no em dashes in the prose this project ships', () => {
  const sources = PAGES.filter((entry) => entry.source).map((entry) => entry.source)
    .concat(PROSE);
  for (const file of sources) {
    const body = fs.readFileSync(path.join(root, file), 'utf8');
    const found = /—|&mdash;|&#8212;/.exec(body);
    assert.equal(found, null,
      `${file} contains an em dash: ...${body.slice(Math.max(0, found ? found.index - 40 : 0), (found ? found.index : 0) + 40)}...`);
  }
});

test('an unknown page id fails loudly', () => {
  assert.throws(() => page('nope'), /no site page called/);
});
