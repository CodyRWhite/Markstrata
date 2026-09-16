/**
 * .SYNOPSIS
 * Opening a document that lives on another server: which address actually
 * holds the markdown, and what a reader is told when it cannot be read.
 *
 * .USAGE
 *   npm test                                     every test
 *   node --test tests/remote-documents.test.js   this one
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { remoteDocuments, documentParameter, imagePaths, MarkdownProcessor } = require('./helpers');

const { isRemote, fetchableUrl, remoteFailure } = remoteDocuments;

test('an address of its own is told apart from a path in this tenant', () => {
  assert.equal(isRemote('https://raw.githubusercontent.com/org/repo/main/a.md'), true);
  assert.equal(isRemote('http://example.com/a.md'), true);
  assert.equal(isRemote('/sites/team/Shared Documents/a.md'), false);
  assert.equal(isRemote('a.md'), false);
  assert.equal(isRemote(''), false);
});

/*
 * The GitHub address anybody copies is the blob page, which is HTML with the
 * document inside it. Fetched as written it returns a page, not markdown, and
 * GitHub does not let another site read it anyway. The file itself is on the
 * raw host, which returns the markdown and allows the read.
 */
test('a GitHub blob address becomes the raw one that holds the file', () => {
  assert.equal(
    fetchableUrl('https://github.com/contoso/wiki/blob/main/docs/Runbook.md'),
    'https://raw.githubusercontent.com/contoso/wiki/main/docs/Runbook.md'
  );
});

test('with www in front of it, and over http, and on any branch', () => {
  assert.equal(
    fetchableUrl('https://www.github.com/contoso/wiki/blob/release-2/a.md'),
    'https://raw.githubusercontent.com/contoso/wiki/release-2/a.md'
  );
  assert.equal(
    fetchableUrl('http://github.com/contoso/wiki/blob/main/a.md'),
    'http://raw.githubusercontent.com/contoso/wiki/main/a.md'
  );
});

test('?raw=1 and a line number are GitHub page furniture, not part of the file', () => {
  assert.equal(
    fetchableUrl('https://github.com/contoso/wiki/blob/main/a.md?raw=1'),
    'https://raw.githubusercontent.com/contoso/wiki/main/a.md'
  );
  assert.equal(
    fetchableUrl('https://github.com/contoso/wiki/blob/main/a.md#L14'),
    'https://raw.githubusercontent.com/contoso/wiki/main/a.md'
  );
});

test('an address already on the raw host is left alone', () => {
  const raw = 'https://raw.githubusercontent.com/contoso/wiki/main/a.md';
  assert.equal(fetchableUrl(raw), raw);
});

test('every other host is used exactly as written', () => {
  /* Guessing at another host's URL shapes is how a fetch ends up pointed at a
     page nobody wrote. */
  for (const url of [
    'https://example.com/docs/a.md',
    'https://contoso.sharepoint.com/sites/wiki/Shared%20Documents/a.md',
    'https://gitlab.com/contoso/wiki/-/blob/main/a.md'
  ]) {
    assert.equal(fetchableUrl(url), url);
  }
});

test('a GitHub address that is not a blob is not rewritten', () => {
  const tree = 'https://github.com/contoso/wiki/tree/main/docs';
  assert.equal(fetchableUrl(tree), tree);
});

/*
 * A browser reports a blocked cross-origin read as a bare failure and says no
 * more, deliberately. So the two cases cannot be told apart, and the message
 * has to name both rather than pick one and be wrong half the time. What it
 * must never say is "not found", which sends somebody looking for a file that
 * is sitting exactly where they put it.
 */
test('a refused read says it may be permission, not only absence', () => {
  const message = remoteFailure(
    'https://github.com/contoso/wiki/blob/main/a.md', new TypeError('Failed to fetch')
  );
  assert.match(message, /raw\.githubusercontent\.com/, 'names the host actually asked');
  assert.match(message, /allow/i);
  assert.doesNotMatch(message, /not found/i);
});

test('but a server that answered gets to speak for itself', () => {
  const message = remoteFailure(
    'https://example.com/a.md', new Error('Could not load https://example.com/a.md (HTTP 404)')
  );
  assert.match(message, /HTTP 404/);
});

test('and an address with no host to name still reads as a sentence', () => {
  const message = remoteFailure('', new TypeError('Failed to fetch'));
  assert.match(message, /that server/);
});

// ------------------------------------------------- the rest of the way there

/*
 * A wiki link inside a document fetched from a URL resolves against that URL,
 * so the href it produces is a whole address. That is what gets handed over to
 * be opened.
 */
test('a wiki link in a remote document names an address on that server', () => {
  const base = 'https://raw.githubusercontent.com/contoso/wiki/main/docs';
  const html = new MarkdownProcessor({ enableWikiLinks: true, imageBasePath: base })
    .render('See [[Deploy runbook]].');
  assert.match(html, /href="https:\/\/raw\.githubusercontent\.com\/contoso\/wiki\/main\/docs\/Deploy%20runbook\.md"/);
  assert.equal(isRemote(imagePaths.resolveAgainst(base, 'Deploy%20runbook.md')), true);
});

/*
 * A menu entry may name a whole address, but only where the page is already
 * reading from one. Otherwise the parameter is a way to point a SharePoint
 * page at any server on the internet, written by whoever wrote the link.
 */
test('the address parameter takes a URL when the page is already on a URL', () => {
  const wanted = documentParameter.documentFromAddress(
    '?strataDoc=https%3A%2F%2Fraw.githubusercontent.com%2Fcontoso%2Fwiki%2Fmain%2Fa.md',
    'https://raw.githubusercontent.com/contoso/wiki/main'
  );
  assert.deepEqual(wanted, {
    path: 'https://raw.githubusercontent.com/contoso/wiki/main/a.md',
    heading: ''
  });
});

test('and refuses one when the page reads from a library', () => {
  const wanted = documentParameter.documentFromAddress(
    '?strataDoc=https%3A%2F%2Fevil.example%2Fa.md',
    '/sites/team/Shared Documents'
  );
  assert.equal(wanted, undefined);
});

test('a heading still travels with a remote document', () => {
  const wanted = documentParameter.documentFromAddress(
    '?strataDoc=https%3A%2F%2Fraw.githubusercontent.com%2Fc%2Fw%2Fmain%2Fa.md%23backups',
    'https://raw.githubusercontent.com/c/w/main'
  );
  assert.equal(wanted.heading, 'backups');
});

test('and a relative entry still works on a page reading from a URL', () => {
  const wanted = documentParameter.documentFromAddress(
    '?strataDoc=sub%2Fa.md', 'https://raw.githubusercontent.com/c/w/main/docs'
  );
  assert.equal(wanted.path, 'https://raw.githubusercontent.com/c/w/main/docs/sub/a.md');
});
