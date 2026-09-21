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
const { PAGES, SECTIONS, page, linkTo } = require('../scripts/site');
const { MarkdownProcessor } = require('./helpers');

const root = path.join(__dirname, '..');

test('every page declares a source that exists, or names a builder', () => {
  /* Two pages have no markdown behind them: the markdown demo and the HTML
     web part, each of which is a web part running rather than a document. Both
     are built by the harness, and the second names which entry point - so a
     third page added without either a source or a builder fails here rather
     than silently coming out as a copy of the markdown demo. */
  const BUILT_BY_THE_HARNESS = { demo: undefined, html: 'html' };

  for (const entry of PAGES) {
    if (!entry.source) {
      assert.ok(entry.id in BUILT_BY_THE_HARNESS,
        `${entry.id} has no source and is not built by the harness`);
      assert.equal(entry.builder, BUILT_BY_THE_HARNESS[entry.id],
        `${entry.id} names the wrong builder`);
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

/*
 * Two kinds of page. Most are in the navigation, and the one being read is
 * marked there. A hidden page is one that exists because something else points
 * at it - the privacy policy and the terms of use are named in the web part's
 * package, and Teams and the app catalog show them to everyone who installs
 * it - rather than because a reader is looking for it. Those are left out of
 * the navigation and linked from the footer instead.
 */
const SHOWN = PAGES.filter((entry) => !entry.hidden);
const HIDDEN = PAGES.filter((entry) => entry.hidden);

test('the header links every page that belongs in the navigation', () => {
  for (const entry of PAGES) {
    const html = require('../scripts/site').header(entry.id);
    assert.equal((html.match(/class="site-nav-link/g) || []).length, SHOWN.length,
      `on ${entry.id}`);
  }
});

test('and marks the one being read, when it is one of them', () => {
  for (const entry of SHOWN) {
    const html = require('../scripts/site').header(entry.id);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1, `${entry.id}`);
  }
  for (const entry of HIDDEN) {
    const html = require('../scripts/site').header(entry.id);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 0,
      `${entry.id} is not in the navigation, so nothing there is current`);
  }
});

/*
 * The site serves two readers. An administrator deciding whether to install it
 * wants a different set of pages from somebody who has to write a document in
 * it, and running all of them together as one bar told neither of them which
 * half was theirs. So each page in the navigation names the half it belongs to,
 * and both halves are drawn on every page.
 */
test('every page in the navigation belongs to a section', () => {
  const known = SECTIONS.map((section) => section.id);
  for (const entry of SHOWN) {
    assert.ok(known.indexOf(entry.section) !== -1,
      `${entry.id} is in the navigation with section ${JSON.stringify(entry.section)}`);
  }
});

test('a page kept out of the navigation has no section to be in', () => {
  for (const entry of HIDDEN) {
    assert.equal(entry.section, undefined,
      `${entry.id} is hidden, so it is in no section of the navigation`);
  }
});

test('neither section is empty, and both are drawn on every page', () => {
  for (const section of SECTIONS) {
    const inIt = SHOWN.filter((entry) => entry.section === section.id);
    assert.ok(inIt.length >= 2, `${section.id} has ${inIt.length} pages in it`);
  }

  for (const entry of PAGES) {
    const html = require('../scripts/site').header(entry.id);
    for (const section of SECTIONS) {
      assert.ok(html.indexOf(`>${section.label}</span>`) !== -1,
        `${entry.id} does not draw the ${section.label} section`);
    }
  }
});

test('a page kept out of the navigation is still reachable', () => {
  /* Otherwise hidden means orphaned, and the addresses in the web part's
     package would be the only way to it. */
  assert.ok(HIDDEN.length > 0, 'no hidden pages to check');

  const footer = require('../scripts/site').footer('home');
  for (const entry of HIDDEN) {
    assert.ok(
      footer.indexOf(`${entry.folder}/`) !== -1,
      `${entry.id} is in no navigation and not in the footer either`
    );
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
  'scripts/site.js', 'scripts/specimens.js', 'harness/build.js',
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

/*
 * The themes page renders the sample document, and part of what that document
 * demonstrates is a wiki link: `[[deploy]]` resolves to `deploy.md` beside the
 * page it is on. In a library that opens inside the web part. On a website
 * there is no library, so a reader clicking the feature being demonstrated got
 * GitHub Pages' 404 - on the page whose job is showing the thing working.
 *
 * The documents it links to are published beside it. This checks the sample
 * and the stubs have not drifted apart, in either direction: a new wiki link in
 * the sample needs a document, and a stub nobody links to is dead weight.
 */
test('every wiki link on the themes page has somewhere to land', () => {
  const stubs = path.join(root, 'docs', 'site', 'stubs');
  const themes = PAGES.filter((entry) => entry.id === 'themes')[0];
  assert.ok(themes && themes.source, 'the themes page no longer renders a document');

  /*
   * Rendered rather than read. Three shapes in the sample wear the same
   * brackets and none of them is a link to a document: `[[toc]]` is consumed
   * by the contents plugin, `[[Another page]]` inside a code span is an
   * example of the syntax, and `![[brand/mark.svg]]` is a picture. Reading the
   * markdown means reasoning about all three and getting one wrong; rendering
   * it with the settings the page really uses means asking the code what it
   * actually produced.
   */
  const html = new MarkdownProcessor(
    Object.assign({ enableToc: true }, themes.render || {})
  ).render(fs.readFileSync(path.join(root, themes.source), 'utf8'));

  const linked = new Set();
  const anchors = /<a [^>]*class="[^"]*strata-wiki-link[^"]*"[^>]*>/g;
  let tag;
  while ((tag = anchors.exec(html)) !== null) {
    const href = /href="([^"]*)"/.exec(tag[0]);
    if (!href || href[1].charAt(0) === '#') { continue; }
    linked.add(decodeURIComponent(href[1].split('#')[0]).replace(/\.md$/, ''));
  }
  assert.ok(linked.size > 0, 'the sample no longer links to any document');

  const published = new Set(fs.readdirSync(stubs).map((name) => name.replace(/\.md$/, '')));

  for (const target of linked) {
    assert.ok(published.has(target),
      `the themes page links to ${target}.md and docs/site/stubs has no such file, `
      + 'so a click on the page demonstrating wiki links is a 404');
  }
  for (const stub of published) {
    assert.ok(linked.has(stub),
      `docs/site/stubs/${stub}.md is published beside the themes page and nothing links to it`);
  }
});
