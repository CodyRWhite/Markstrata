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
    for (const to of PAGES) {
      const href = linkTo(from.id, to.id);
      assert.ok(!href.startsWith('/'), `${from.id} -> ${to.id} is root-relative: ${href}`);
      assert.ok(href.length > 0, `${from.id} -> ${to.id} is empty`);
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
 * House style for the site's prose: no em dashes. They are easy to reintroduce
 * by habit, and the only place it shows is the published page.
 */
test('no em dashes in anything the site renders', () => {
  const sources = PAGES.filter((entry) => entry.source).map((entry) => entry.source)
    .concat(['scripts/site.js', 'harness/build.js']);
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
