/**
 * .SYNOPSIS
 * Showing a Word, Excel or PowerPoint file from the library inside a document:
 * which files count, and what address the preview is built from.
 *
 * .USAGE
 *   npm test                                  every test
 *   node --test tests/office-embeds.test.js   this one
 *
 * .NOTES
 * Since:     0.0.18.8
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { officeEmbeds, MarkdownProcessor } = require('./helpers');

const { isOfficeDocument, officeKind, embedAddress, nameFromHref } = officeEmbeds;

test('a file is named by the application that opens it', () => {
  assert.equal(officeKind('/sites/x/docs/Report.docx'), 'Word');
  assert.equal(officeKind('/sites/x/docs/Budget.xlsx'), 'Excel');
  assert.equal(officeKind('/sites/x/docs/Deck.pptx'), 'PowerPoint');
  assert.equal(officeKind('/sites/x/docs/Old.doc'), 'Word');
  assert.equal(officeKind('/sites/x/docs/Macro.xlsm'), 'Excel');
});

test('and anything else is not one of these', () => {
  for (const href of ['/a/b.md', '/a/b.pdf', '/a/b.png', '/a/b', '']) {
    assert.equal(isOfficeDocument(href), false, href);
  }
});

test('the extension is read past a query and a fragment', () => {
  assert.equal(officeKind('/sites/x/docs/Report.docx?web=1'), 'Word');
  assert.equal(officeKind('/sites/x/docs/Report.docx#page=2'), 'Word');
});

/*
 * The preview frame is addressed by the file's unique id rather than by its
 * path, and the braces round the id are part of the format rather than
 * decoration. This is the address SharePoint's own File, Share, Embed dialog
 * produces.
 */
test('the preview address is built from the site and the file id', () => {
  assert.equal(
    embedAddress('/sites/wiki', '6f1c2b8e-1111-2222-3333-444455556666'),
    '/sites/wiki/_layouts/15/Doc.aspx'
      + '?sourcedoc=%7B6f1c2b8e-1111-2222-3333-444455556666%7D&action=embedview'
  );
});

test('an id that already carries its braces is not given a second pair', () => {
  const once = embedAddress('/sites/wiki', '{6f1c2b8e-1111-2222-3333-444455556666}');
  assert.equal(once.indexOf('%7B%7B'), -1, once);
  assert.match(once, /%7B6f1c2b8e/);
});

test('a trailing slash on the site does not double up', () => {
  assert.match(embedAddress('/sites/wiki/', 'abc'), /^\/sites\/wiki\/_layouts\//);
});

test('with no id there is no address, which is the signal to draw no frame', () => {
  /* Rather than a frame pointing nowhere, which renders as a document that is
     empty instead of as a document nobody could look up. */
  assert.equal(embedAddress('/sites/wiki', ''), '');
  assert.equal(embedAddress('', 'abc'), '');
});

test('a file name is shown decoded, because a href is not a name', () => {
  assert.equal(nameFromHref('/sites/x/docs/Quarterly%20report.docx'), 'Quarterly report.docx');
  assert.equal(nameFromHref('/sites/x/docs/Plain.docx'), 'Plain.docx');
  /* Not valid encoding, so it was never encoded. */
  assert.equal(nameFromHref('/sites/x/docs/100%.docx'), '100%.docx');
});

/*
 * The markdown side of it. An embed of something that is not a picture renders
 * as a marked link, and that link is what the card is built from, so the two
 * have to keep agreeing about the shape.
 */
test('an embed of an Office file renders as the link the card is built from', () => {
  const html = new MarkdownProcessor({
    enableWikiLinks: true, imageBasePath: '/sites/team/Shared Documents'
  }).render('![[Quarterly report.docx]]');

  assert.match(html, /class="strata-wiki-link strata-wiki-embed"/);
  assert.match(html, /data-embed="true"/);
  assert.match(html, /href="\/sites\/team\/Shared%20Documents\/Quarterly%20report\.docx"/);
});

test('and a label after a pipe is what the card is titled', () => {
  const html = new MarkdownProcessor({
    enableWikiLinks: true, imageBasePath: '/sites/team/docs'
  }).render('![[Budget.xlsx|This quarter]]');
  assert.match(html, />This quarter</);
});
