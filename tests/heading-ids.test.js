/**
 * .SYNOPSIS
 * An HTML document arrives with no heading ids, and the contents list needs
 * them.
 *
 * .DESCRIPTION
 * The markdown web part never had this problem: markdown-it gives every
 * heading an id as it renders. Hand-written HTML usually has none, and
 * collectHeadings only takes a heading that has one, so an HTML document would
 * have come out with an empty sidebar and no way for any link to reach a
 * section of it.
 *
 * The tests that matter most here are the ones about restraint. An id the
 * author wrote is theirs - their stylesheet may select on it and their own
 * links point at it - so it is never rewritten, only counted. And an id this
 * invents must not collide with anything already in the document, including
 * ids on elements that are not headings at all.
 *
 * .USAGE
 *   npm test                               every test
 *   node --test tests/heading-ids.test.js  this one
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js, jsdom
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { headingIds, wikiLinks } = require('./helpers');

const { ensureHeadingIds } = headingIds;
const { headingSlug } = wikiLinks;

/** A document as an author's HTML file arrives: markup, not markdown output. */
function article(html) {
  return new JSDOM(`<article>${html}</article>`).window.document.querySelector('article');
}

function ids(container) {
  return Array.prototype.slice
    .call(container.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    .map((heading) => heading.id);
}

test('a heading with no id gets one made from its text', () => {
  const content = article('<h1>Release notes</h1><h2>Rolling back</h2>');
  assert.equal(ensureHeadingIds(content), 2);
  assert.deepEqual(ids(content), ['release-notes', 'rolling-back']);
});

test('the id is the same one the markdown web part would have made', () => {
  /* The point of sharing the slug function rather than writing a second one.
     A reader following a link from a markdown document into an HTML one finds
     the same heading under the same name. */
  const content = article('<h2>Step 1: Install</h2><h2>What\'s new?</h2>');
  ensureHeadingIds(content);
  assert.deepEqual(ids(content), [headingSlug('Step 1: Install'), headingSlug('What\'s new?')]);
});

test('an id the author wrote is left exactly as it is', () => {
  /* Their stylesheet may select on it and their own links point at it. */
  const content = article('<h2 id="Rollback-Procedure">Rolling back</h2>');
  assert.equal(ensureHeadingIds(content), 0, 'nothing should have been given an id');
  assert.deepEqual(ids(content), ['Rollback-Procedure']);
});

test('and is counted, so nothing else is given the same one', () => {
  const content = article('<h2 id="notes">First</h2><h2>Notes</h2>');
  ensureHeadingIds(content);
  assert.deepEqual(ids(content), ['notes', 'notes-1']);
});

test('an id anywhere in the document is counted, not just a heading\'s', () => {
  /* An author's own div would have collided just as surely, and the collision
     would have been silent: two elements with one id, and a link landing on
     whichever the browser found first. */
  const content = article('<div id="summary">...</div><h2>Summary</h2>');
  ensureHeadingIds(content);
  assert.deepEqual(ids(content), ['summary-1']);
});

test('repeated headings are numbered from one, as markdown numbers them', () => {
  const content = article('<h3>Notes</h3><h3>Notes</h3><h3>Notes</h3>');
  ensureHeadingIds(content);
  assert.deepEqual(ids(content), ['notes', 'notes-1', 'notes-2']);
});

test('a heading with nothing to slug still gets an id', () => {
  /* A document that names its sections with pictures is still a document
     somebody links into, and the sidebar drops an entry with no text anyway -
     but the heading must not be left unreachable on that account. */
  const content = article('<h2><img src="logo.png" alt=""></h2><h2>After</h2>');
  ensureHeadingIds(content);
  assert.deepEqual(ids(content), ['section-1', 'after']);
});

test('two headings with nothing to slug do not collide', () => {
  const content = article('<h2><img src="a.png" alt=""></h2><h2><img src="b.png" alt=""></h2>');
  ensureHeadingIds(content);
  const given = ids(content);
  assert.equal(given.length, 2);
  assert.notEqual(given[0], given[1], `both headings got ${given[0]}`);
});

test('a document with every heading already named is left untouched', () => {
  const content = article('<h1 id="a">A</h1><h2 id="b">B</h2>');
  assert.equal(ensureHeadingIds(content), 0);
  assert.deepEqual(ids(content), ['a', 'b']);
});

test('a document with no headings at all is not an error', () => {
  const content = article('<p>Just a paragraph.</p>');
  assert.equal(ensureHeadingIds(content), 0);
});

test('every level is given an id, not only the top few', () => {
  /* An id costs nothing, and a heading without one cannot be reached by
     anything: not a fragment, not the contents, not a shared address. */
  const content = article(
    '<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>'
  );
  assert.equal(ensureHeadingIds(content), 6);
  assert.deepEqual(ids(content), ['one', 'two', 'three', 'four', 'five', 'six']);
});

test('the heading text is read through the markup inside it', () => {
  const content = article('<h2>Rolling <em>back</em> a <code>release</code></h2>');
  ensureHeadingIds(content);
  assert.deepEqual(ids(content), ['rolling-back-a-release']);
});
