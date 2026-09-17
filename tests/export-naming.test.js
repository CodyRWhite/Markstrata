/**
 * .SYNOPSIS
 * What an exported document calls itself, and where it says it came from.
 *
 * .DESCRIPTION
 * The cover of an export carries a title and a source line, and both are
 * easier to get subtly wrong than they look: a title that is the file name
 * when the document has a perfectly good heading, or a source line repeating
 * the site name that every document in the wiki shares.
 *
 * The DOM here is jsdom rather than a browser, because none of this needs
 * laying out: it reads a heading and rewrites a path.
 *
 * .USAGE
 *   npm test                                every test
 *   node --test tests/export-naming.test.js   this one
 *
 * .NOTES
 * Since:     0.0.20.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js, jsdom
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { exportNaming } = require('./helpers');

const { documentTitle, sourceLabel, exportDate } = exportNaming;

const article = (html) =>
  new JSDOM(`<article>${html}</article>`).window.document.querySelector('article');

test('a document is called what its first heading calls it', () => {
  assert.equal(
    documentTitle(article('<h1>Deploying the service</h1><h2>Rollback</h2>'), 'deploy.md'),
    'Deploying the service'
  );
});

test('a document that opens at h2 is still opening with its title', () => {
  assert.equal(documentTitle(article('<h2>Rollback</h2>'), 'deploy.md'), 'Rollback');
});

test('the anchor this web part adds is not part of the title', () => {
  /* The `#` beside a heading is a control, not a character the author wrote. */
  const title = documentTitle(
    article('<h1>Rollback<a class="strata-anchor" href="#rollback">#</a></h1>'), 'x.md');
  assert.equal(title, 'Rollback');
});

test('a heading broken across lines is one line of title', () => {
  assert.equal(
    documentTitle(article('<h1>Deploying\n   the\n   service</h1>'), 'x.md'),
    'Deploying the service'
  );
});

test('with no heading at all the file name stands in, without its extension', () => {
  assert.equal(documentTitle(article('<p>No heading here.</p>'), 'deploy.md'), 'deploy');
  assert.equal(documentTitle(article('<p>x</p>'), 'Q3 review.markdown'), 'Q3 review');
});

test('with neither a heading nor a name it is still called something', () => {
  assert.equal(documentTitle(article('<p>x</p>'), ''), 'Document');
  assert.equal(documentTitle(undefined, ''), 'Document');
});

test('the source drops the managed path and the site name', () => {
  /* Every document in the wiki is under /sites/it-wiki, so saying it
     distinguishes none of them. */
  assert.equal(
    sourceLabel('/sites/it-wiki/Documents/Runbooks/deploy.md'),
    'Documents / Runbooks / deploy.md'
  );
  assert.equal(sourceLabel('/teams/ops/Shared Documents/x.md'), 'Shared Documents / x.md');
});

test('a path that is not under a managed path keeps all of it', () => {
  assert.equal(sourceLabel('/Documents/Runbooks/deploy.md'), 'Documents / Runbooks / deploy.md');
});

test('a path with nothing left after the site keeps what it has', () => {
  /* Dropping two segments here would leave an empty cover line. */
  assert.equal(sourceLabel('/sites/it-wiki'), 'sites / it-wiki');
});

test('an encoded path is read the way a person wrote it', () => {
  assert.equal(
    sourceLabel('/sites/wiki/Shared%20Documents/Deploy%20notes.md'),
    'Shared Documents / Deploy notes.md'
  );
});

test('a name that is not valid encoding is shown as written', () => {
  assert.equal(sourceLabel('/sites/wiki/Docs/100% done.md'), 'Docs / 100% done.md');
});

test('an address keeps the host, which is whose document it is', () => {
  assert.equal(
    sourceLabel('https://raw.githubusercontent.invalid/contoso/wiki/main/docs/a.md'),
    'raw.githubusercontent.invalid / contoso / wiki / main / docs / a.md'
  );
});

test('nothing to say about nothing', () => {
  assert.equal(sourceLabel(''), '');
});

test('the date an export was taken is a date', () => {
  const taken = exportDate(new Date(Date.UTC(2026, 8, 16)));
  assert.match(taken, /2026/);
  assert.ok(taken.length > 4, 'it says more than the year');
});
