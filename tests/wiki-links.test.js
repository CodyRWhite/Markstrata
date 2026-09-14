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
  const resolve = (src) => `/base/${src}`;
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
