/**
 * .SYNOPSIS
 * A crumb in the document trail reads as a page, and only the web part's own
 * extension comes off it.
 *
 * .DESCRIPTION
 * This used to be a markdown-only regular expression inside the view renderer.
 * Both web parts draw the trail now, and they disagree about which extension is
 * theirs, so the caller says which one it owns. The tests that matter are the
 * ones about what is left alone: a linked .pdf in a markdown trail still reads
 * as a .pdf, because there the extension is the only thing marking that entry
 * out, and an HTML part must not quietly eat a .md crumb either.
 *
 * .USAGE
 *   npm test                                   every test
 *   node --test tests/document-naming.test.js  this one
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { documentNaming } = require('./helpers');
const { withoutExtension } = documentNaming;

/* The two web parts' own sets, spelled out here rather than imported: these
   are the shapes the callers pass, and a test that took them from the same
   place the code does would agree with any change to them. */
const MARKDOWN = /\.(md|markdown)$/i;
const HTML = /\.(html?)$/i;

test('the markdown extension comes off a markdown crumb', () => {
  assert.equal(withoutExtension('Deploy notes.md', MARKDOWN), 'Deploy notes');
  assert.equal(withoutExtension('Deploy notes.markdown', MARKDOWN), 'Deploy notes');
});

test('whatever case it was written in', () => {
  assert.equal(withoutExtension('README.MD', MARKDOWN), 'README');
  assert.equal(withoutExtension('Index.HtMl', HTML), 'Index');
});

test('the html extension comes off an html crumb, either spelling', () => {
  assert.equal(withoutExtension('Index.html', HTML), 'Index');
  assert.equal(withoutExtension('Index.htm', HTML), 'Index');
});

test('a linked file of another kind keeps its extension', () => {
  /* The point of the whole function. Every document in one part's trail has
     the same extension, which is why it tells a reader nothing and can come
     off; a .pdf among them is the one entry the extension describes. */
  assert.equal(withoutExtension('Runbook.pdf', MARKDOWN), 'Runbook.pdf');
  assert.equal(withoutExtension('Notes.txt', MARKDOWN), 'Notes.txt');
});

test('neither part eats the other part\'s extension', () => {
  assert.equal(withoutExtension('Page.html', MARKDOWN), 'Page.html');
  assert.equal(withoutExtension('Page.md', HTML), 'Page.md');
});

test('the extension has to be at the end', () => {
  /* A folder named after a file, or a name with a version in it. Stripping
     mid-name would rewrite the crumb into something that is not the file. */
  assert.equal(withoutExtension('notes.md.bak', MARKDOWN), 'notes.md.bak');
  assert.equal(withoutExtension('v1.md.old.md', MARKDOWN), 'v1.md.old');
});

test('a name that is nothing but an extension survives whole', () => {
  /* An empty crumb is a button with no label, which is worse than a blunt
     one, so the name is handed back rather than stripped to nothing. */
  assert.equal(withoutExtension('.md', MARKDOWN), '.md');
  assert.equal(withoutExtension('.html', HTML), '.html');
});

test('an empty or missing name does not throw', () => {
  /* The trail is built from file names the host handed over, and a document
     opened from an address can arrive before its metadata does. */
  assert.equal(withoutExtension('', MARKDOWN), '');
  assert.equal(withoutExtension(undefined, MARKDOWN), undefined);
});

test('a dotted name keeps the rest of its dots', () => {
  assert.equal(withoutExtension('ADR.0004.rollback.md', MARKDOWN), 'ADR.0004.rollback');
});

test('nothing else in the name is touched', () => {
  /* Spaces, punctuation and case are the author's; only the extension is
     ours to take. */
  assert.equal(
    withoutExtension('Q3 review (draft) - v2.md', MARKDOWN),
    'Q3 review (draft) - v2'
  );
});
