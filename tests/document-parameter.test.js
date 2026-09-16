/**
 * .SYNOPSIS
 * The document a page's address names, and what is refused.
 *
 * .DESCRIPTION
 * A SharePoint menu can only point at a page, and a page shows one configured
 * document, so a wiki's navigation bar was useful exactly once. Naming the
 * document in the address is what makes the rest of the menu work.
 *
 * The value is written by whoever wrote the menu entry and arrives from the
 * address bar, so these are as much about what is refused as what is accepted.
 * SharePoint decides what a reader may open, because the fetch uses their own
 * session, but a renderer should not be pointed at arbitrary files either.
 *
 * .USAGE
 *   npm test                                    every test
 *   node --test tests/document-parameter.test.js  this one
 *
 * .NOTES
 * Since:     0.0.18.4
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { documentParameter } = require('./helpers');

const { documentFromAddress, addressForDocument, DOCUMENT_PARAMETER } = documentParameter;
const LIBRARY = '/sites/wiki/Shared Documents';

test('an address written out in full is taken as it is', () => {
  const wanted = documentFromAddress(
    '?strataDoc=%2Fsites%2Fwiki%2FShared%20Documents%2FRunbooks%2FDatabase%20setup.md', LIBRARY
  );
  assert.deepEqual(wanted, {
    path: '/sites/wiki/Shared Documents/Runbooks/Database setup.md',
    heading: ''
  });
});

test('a short one is relative to the configured document', () => {
  /* So a menu entry names the document rather than repeating the site and the
     library in all of them. */
  const wanted = documentFromAddress('?strataDoc=Runbooks%2FDatabase%20setup.md', LIBRARY);
  /* A path, not a URL: this is handed to SharePoint, which encodes its own.
     The first cut of this returned
     "/sites/wiki/Shared%20Documents/Runbooks/Database setup.md", half encoded
     and half not, which SharePoint would never find. */
  assert.equal(wanted.path, '/sites/wiki/Shared Documents/Runbooks/Database setup.md');
});

test('a heading travels inside the value, not as the page fragment', () => {
  /* The fragment belongs to the page and SharePoint uses it for its own
     purposes, so the heading rides in the parameter instead. */
  const wanted = documentFromAddress('?strataDoc=Runbook.md%23Backups', LIBRARY);
  assert.equal(wanted.heading, 'Backups');
  assert.ok(wanted.path.indexOf('Runbook.md') !== -1);
  assert.equal(wanted.path.indexOf('#'), -1, 'the heading is not left on the path');
});

test('it sits beside whatever else is in the address', () => {
  const wanted = documentFromAddress(
    '?env=Prod&strataDoc=%2Fsites%2Fa%2FDocs%2Fb.md&source=nav', undefined
  );
  assert.equal(wanted.path, '/sites/a/Docs/b.md');
});

test('anything that is not a markdown file is refused', () => {
  /* The web part renders markdown. Pointing it at anything else is either a
     mistake in a menu entry or somebody trying it on. */
  ['/sites/a/Docs/secrets.aspx', '/sites/a/Docs/payroll.xlsx', '/sites/a/Docs/',
   'https://example.com/evil.md'].forEach((value) => {
    const wanted = documentFromAddress(`?strataDoc=${encodeURIComponent(value)}`, LIBRARY);
    if (value.indexOf('https://') === 0) {
      /* An address off this site is not a path into the library, so it never
         resolves to one. */
      assert.ok(!wanted || wanted.path.indexOf('https://') !== 0, `accepted ${value}`);
      return;
    }
    assert.equal(wanted, undefined, `accepted ${value}`);
  });
});

test('an address that names nothing is nothing to do', () => {
  assert.equal(documentFromAddress('', LIBRARY), undefined);
  assert.equal(documentFromAddress('?other=1', LIBRARY), undefined);
  assert.equal(documentFromAddress('?strataDoc=', LIBRARY), undefined);
});

test('a relative address with no configured folder to resolve against is refused', () => {
  /* Rather than guessed at. A web part with no library behind it has no idea
     what "Runbooks/Database.md" is relative to. */
  assert.equal(documentFromAddress('?strataDoc=Runbooks%2FDatabase.md', undefined), undefined);
});

test('the address a menu entry needs is built by the same file that reads it', () => {
  const page = 'https://contoso.sharepoint.com/sites/wiki/SitePages/Wiki.aspx';
  const built = addressForDocument(page, '/sites/wiki/Shared Documents/Runbooks/Database setup.md');

  assert.ok(built.indexOf(`${DOCUMENT_PARAMETER}=`) !== -1);
  /* And reads back as what went in, which is the only thing that matters. */
  const wanted = documentFromAddress(built.slice(built.indexOf('?')), undefined);
  assert.equal(wanted.path, '/sites/wiki/Shared Documents/Runbooks/Database setup.md');

  const withHeading = addressForDocument(page + '?x=1', '/sites/a/Docs/b.md', 'Backups');
  assert.ok(withHeading.indexOf('&') !== -1, 'it did not join onto the existing query');
  assert.equal(documentFromAddress(withHeading.slice(withHeading.indexOf('?')), undefined).heading,
    'Backups');
});

/*
 * The address of the document on screen, for a reader who wants to send it to
 * somebody. A reader deep in a wiki is looking at something the page's own
 * address says nothing about: it still reads Wiki.aspx, so sending that sends
 * them to the front page.
 */
const { addressWithoutDocument } = documentParameter;

const PAGE = 'https://contoso.sharepoint.com/sites/wiki/SitePages/Wiki.aspx';

test('an address for a document is the page plus the document', () => {
  assert.equal(
    addressForDocument(PAGE, '/sites/wiki/Shared Documents/Runbooks/Deploy notes.md'),
    `${PAGE}?strataDoc=`
      + '%2Fsites%2Fwiki%2FShared%20Documents%2FRunbooks%2FDeploy%20notes.md'
  );
});

test('and it reads back as the document it named', () => {
  /* The two halves have to agree, which is the whole reason they live in one
     file. Every character that has to be encoded is in this name. */
  const path = '/sites/wiki/Shared Documents/Q&A/What is #1 + why.md';
  const address = addressForDocument(PAGE, path);
  const read = documentFromAddress(
    address.slice(address.indexOf('?')), '/sites/wiki/Shared Documents'
  );
  assert.equal(read.path, path);
});

test('a heading travels with it', () => {
  const address = addressForDocument(PAGE, '/sites/wiki/docs/a.md', 'backups');
  const read = documentFromAddress(
    address.slice(address.indexOf('?')), '/sites/wiki/docs'
  );
  assert.equal(read.heading, 'backups');
});

/*
 * A reader following links arrived at an address that already names a
 * document. Appending a second would leave two of the same parameter on one
 * address, with the browser free to read either.
 */
test('a document already on the address is replaced, not doubled', () => {
  const arrived = `${PAGE}?strataDoc=%2Fsites%2Fwiki%2Fdocs%2Fold.md`;
  const shared = addressForDocument(arrived, '/sites/wiki/docs/new.md');
  assert.equal(shared.split('strataDoc=').length - 1, 1, shared);
  assert.match(shared, /new\.md/);
  assert.doesNotMatch(shared, /old\.md/);
});

test('the page own address is the page with no document on it', () => {
  assert.equal(addressWithoutDocument(`${PAGE}?strataDoc=%2Fa%2Fb.md`), PAGE);
  assert.equal(addressWithoutDocument(PAGE), PAGE);
});

test('and a tenant own parameters are left exactly where they were', () => {
  /* A page carries whatever a tenant puts on it, and none of it is this
     code's to tidy up. */
  assert.equal(
    addressWithoutDocument(`${PAGE}?env=test&strataDoc=%2Fa.md&mode=wide`),
    `${PAGE}?env=test&mode=wide`
  );
  assert.equal(
    addressWithoutDocument(`${PAGE}?strataDoc=%2Fa.md#section`),
    `${PAGE}#section`
  );
});
