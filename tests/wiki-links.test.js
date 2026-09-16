/**
 * .SYNOPSIS
 * Wiki links: the four shapes, where each resolves to, and which ones are
 * worth asking SharePoint about.
 *
 * .USAGE
 *   npm test                               every test
 *   node --test tests/wiki-links.test.js   this one
 *
 * .NOTES
 * Since:     0.0.14.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { MarkdownProcessor, wikiLinks } = require('./helpers');

const { parseWikiLink, wikiHref, headingAnchor } = wikiLinks;

const BASE = '/sites/team/Shared Documents/runbooks';
const render = (source) =>
  new MarkdownProcessor({ enableWikiLinks: true, imageBasePath: BASE }).render(source);

test('a bare target is the page and its own label', () => {
  assert.deepEqual(parseWikiLink('Deploy runbook'),
    { page: 'Deploy runbook', heading: '', label: 'Deploy runbook' });
});

test('a label after a pipe is what the link reads as', () => {
  assert.deepEqual(parseWikiLink('Deploy runbook|how we ship'),
    { page: 'Deploy runbook', heading: '', label: 'how we ship' });
});

test('the label splits on the last pipe, so a page can contain one', () => {
  assert.equal(parseWikiLink('A|B|label').page, 'A|B');
  assert.equal(parseWikiLink('A|B|label').label, 'label');
});

test('a heading can be named, in another page or in this one', () => {
  assert.deepEqual(parseWikiLink('Runbook#Rollback'),
    { page: 'Runbook', heading: 'Rollback', label: 'Runbook › Rollback' });
  const here = parseWikiLink('#Rollback');
  assert.equal(here.page, '');
  assert.equal(here.label, 'Rollback');
});

test('empty brackets are not a link', () => {
  assert.equal(parseWikiLink(''), undefined);
  assert.equal(parseWikiLink('   '), undefined);
});

test('a page gets .md, and one that has an extension keeps it', () => {
  const resolve = (source) => `/base/${source}`;
  assert.equal(wikiHref(parseWikiLink('Runbook'), resolve), '/base/Runbook.md');
  assert.equal(wikiHref(parseWikiLink('notes.txt'), resolve), '/base/notes.txt');
});

test('a heading in this document is a fragment, with no file', () => {
  assert.equal(wikiHref(parseWikiLink('#Rollback steps'), () => undefined),
    `#${headingAnchor('Rollback steps')}`);
});

/*
 * resolveAgainst documents that its input is already percent-encoded, because
 * markdown-it encodes a link before any rule sees it. A wiki target never goes
 * through that, so an unencoded space would reach the href as a space.
 */
test('a page name is encoded on its way into the href', () => {
  const html = render('See [[Deploy runbook]].');
  assert.match(html, /href="[^"]*Deploy%20runbook\.md"/);
  assert.doesNotMatch(html, /href="[^"]*Deploy runbook/);
});

test('the href resolves against the folder the document is in', () => {
  assert.match(render('[[Runbook]]'),
    /href="\/sites\/team\/Shared%20Documents\/runbooks\/Runbook\.md"/);
});

test('nested brackets are not a link', () => {
  const html = render('An array like [[1,2],[3,4]] stays put.');
  assert.doesNotMatch(html, /<a /, 'the closing pair belongs to the inner array');
  assert.match(html, /\[\[1,2\],\[3,4\]\]/);
});

test('brackets spanning a line break are not a link', () => {
  assert.doesNotMatch(render('[[not\na link]]'), /strata-wiki-link/);
});

test('nothing happens with the setting off', () => {
  const html = new MarkdownProcessor({ enableWikiLinks: false }).render('See [[Runbook]].');
  assert.doesNotMatch(html, /<a /);
  assert.match(html, /\[\[Runbook\]\]/);
});

/*
 * Checking a link costs one folder listing rather than one request per link,
 * which is the whole reason it is worth doing at render time at all. These
 * cover the grouping that makes that true.
 */
const { folderOf, fileOf, byFolder } = wikiLinks;

test('the folder is what gets asked, and the file is what is looked for', () => {
  const href = '/sites/team/Shared%20Documents/runbooks/Deploy%20runbook.md';
  /* Both decoded. This test used to expect the folder encoded, which is what
     the code did and what made it wrong: the two halves are read together and
     compared against one listing from SharePoint, and SharePoint reports
     names decoded and encodes paths itself. A folder asked for as
     "Shared%20Documents" was asked for as "Shared%2520Documents" and found
     nothing, so every link in the library went unchecked in silence. */
  assert.equal(folderOf(href), '/sites/team/Shared Documents/runbooks');
  assert.equal(fileOf(href), 'Deploy runbook.md', 'compared against SharePoint names, so decoded');
});

test('a fragment has no folder to ask about', () => {
  assert.equal(folderOf('#rollback'), '');
  assert.equal(folderOf(''), '');
});

test('a heading on another page does not change the file asked for', () => {
  assert.equal(fileOf('/a/b/Runbook.md#rollback'), 'Runbook.md');
  assert.equal(folderOf('/a/b/Runbook.md#rollback'), '/a/b');
});

test('links to one folder are asked for once', () => {
  const groups = byFolder([
    '/a/b/One.md', '/a/b/Two.md', '/a/c/Three.md', '#here'
  ]);
  assert.deepEqual(Object.keys(groups).sort(), ['/a/b', '/a/c']);
  assert.deepEqual(groups['/a/b'], ['One.md', 'Two.md']);
  assert.equal(Object.keys(groups).length, 2, 'four links, two requests');
});

test('a name that is not valid encoding is compared as written', () => {
  assert.equal(fileOf('/a/b/100%.md'), '100%.md');
});

/*
 * A href is a URL and SharePoint wants a path.
 *
 * Every wiki link is written as a page name and turned into a href, which is
 * percent-encoded because a href has to be. What is then asked of SharePoint
 * is a server-relative path, and SharePoint encodes those itself - so an
 * already-encoded one is encoded twice and matches nothing.
 *
 * Nothing caught it because every document in the tests and in the harness had
 * an ASCII name: "deploy.md" is the same string encoded or not. "Deploy
 * notes.md" is not, and neither is "Shared Documents", which is the name of
 * the library in most tenants.
 */
test('the folder handed to SharePoint is a path, not a URL', () => {
  assert.equal(
    wikiLinks.folderOf('/sites/wiki/Shared%20Documents/Runbooks/Database%20setup/Server%20notes.md'),
    '/sites/wiki/Shared Documents/Runbooks/Database setup'
  );
  /* The name beside it has always been decoded; these two are read together
     and compared against one listing, so they have to agree. */
  assert.equal(
    wikiLinks.fileOf('/sites/wiki/Shared%20Documents/Runbooks/Database%20setup/Server%20notes.md'),
    'Server notes.md'
  );
});

test('a folder with nothing to decode is unchanged', () => {
  assert.equal(
    wikiLinks.folderOf('/sites/team/Docs/Runbooks/deploy.md'),
    '/sites/team/Docs/Runbooks'
  );
  assert.equal(wikiLinks.folderOf('deploy.md'), '');
  assert.equal(wikiLinks.folderOf('#heading'), '');
});

test('a stray per cent sign is not a reason to give up on a folder', () => {
  /* Not valid percent-encoding, so it was never encoded. Better to hand back
     what was written than to throw while rendering a document. */
  assert.equal(
    wikiLinks.folderOf('/sites/team/100%25 done/notes.md'),
    '/sites/team/100% done'
  );
  assert.equal(
    wikiLinks.folderOf('/sites/team/50% of it/notes.md'),
    '/sites/team/50% of it'
  );
});
