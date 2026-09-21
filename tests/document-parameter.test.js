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

const { documentFromAddress, addressForDocument, DOCUMENT_PARAMETER,
        guardedEncode, relativeToFolder } = documentParameter;
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

/*
 * Which extensions count is the caller's to say, and it used to be md and
 * markdown written into the pattern that splits the value. That refused every
 * HTML document a menu entry could name: ?strataDoc=folder/page.html matched
 * nothing and came back as an address the web part could not understand.
 *
 * The split has to be made at the extension rather than at the first #,
 * because once the value is decoded a # in a file name looks exactly like the
 * one that starts the heading. So the awkward names are checked for both kinds
 * of document, not just the kind that had them written down.
 */
test('an HTML document named on the address is opened', () => {
  const wanted = documentFromAddress(
    '?strataDoc=Runbooks%2Fpage.html', LIBRARY, ['.html', '.htm']);
  assert.deepEqual(wanted, { path: `${LIBRARY}/Runbooks/page.html`, heading: '' });
});

test('and the short spelling of it', () => {
  const wanted = documentFromAddress('?strataDoc=page.htm', LIBRARY, ['.html', '.htm']);
  assert.deepEqual(wanted, { path: `${LIBRARY}/page.htm`, heading: '' });
});

test('with a heading, which is still split at the extension', () => {
  const wanted = documentFromAddress(
    '?strataDoc=Runbooks%2Fpage.html%23undo-the-swap', LIBRARY, ['.html', '.htm']);
  assert.deepEqual(wanted,
    { path: `${LIBRARY}/Runbooks/page.html`, heading: 'undo-the-swap' });
});

test('a hash in the file name is part of the name, not a heading', () => {
  /* The case the split at the extension exists for. Checked for both kinds,
     because the old pattern only knew about one. */
  for (const [name, extensions] of [
    ['What is #1 + why.md', ['.md', '.markdown']],
    ['What is #1 + why.html', ['.html', '.htm']]
  ]) {
    const wanted = documentFromAddress(
      `?strataDoc=${encodeURIComponent(name)}`, LIBRARY, extensions);
    assert.equal(wanted.heading, '', `${name} lost its name to a heading`);
    assert.ok(wanted.path.indexOf(name) !== -1, `${name} came back as ${wanted.path}`);
  }
});

test('the first extension that ends the value wins, not the last', () => {
  /* notes.md#see-a.md is one document and a heading, not one long name. */
  const markdown = documentFromAddress(
    '?strataDoc=notes.md%23see-a.md', LIBRARY, ['.md', '.markdown']);
  assert.equal(markdown.path, `${LIBRARY}/notes.md`);
  assert.equal(markdown.heading, 'see-a.md');

  const html = documentFromAddress(
    '?strataDoc=notes.html%23see-a.html', LIBRARY, ['.html', '.htm']);
  assert.equal(html.path, `${LIBRARY}/notes.html`);
  assert.equal(html.heading, 'see-a.html');
});

test('a folder that ends in an extension is still a folder', () => {
  for (const [value, extensions, expected] of [
    ['archive.md/page.md', ['.md', '.markdown'], 'archive.md/page.md'],
    ['archive.html/page.html', ['.html', '.htm'], 'archive.html/page.html']
  ]) {
    const wanted = documentFromAddress(
      `?strataDoc=${encodeURIComponent(value)}`, LIBRARY, extensions);
    assert.equal(wanted.path, `${LIBRARY}/${expected}`);
    assert.equal(wanted.heading, '');
  }
});

test('each web part refuses the other one\'s documents', () => {
  /* Not pedantry: the HTML web part cannot render markdown and the markdown
     one cannot render HTML, so opening the wrong kind would draw a document
     of tag names or a page of escaped angle brackets. */
  assert.equal(
    documentFromAddress('?strataDoc=page.html', LIBRARY, ['.md', '.markdown']),
    undefined, 'the markdown web part accepted an HTML document');
  assert.equal(
    documentFromAddress('?strataDoc=page.md', LIBRARY, ['.html', '.htm']),
    undefined, 'the HTML web part accepted a markdown document');
});

test('markdown is what it opens when nobody says otherwise', () => {
  /* The default keeps every menu entry written before this change working. */
  assert.equal(
    documentFromAddress('?strataDoc=page.md', LIBRARY).path, `${LIBRARY}/page.md`);
  assert.equal(documentFromAddress('?strataDoc=page.html', LIBRARY), undefined);
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
  /* Escaped only where it has to be. The slashes were %2F when the whole
     value went through encodeURIComponent, which said nothing to anybody the
     link was sent to. Told no folder to name it against, the path is written
     out in full; the short form is the test below. */
  assert.equal(
    addressForDocument(PAGE, '/sites/wiki/Shared Documents/Runbooks/Deploy notes.md'),
    `${PAGE}?strataDoc=/sites/wiki/Shared%20Documents/Runbooks/Deploy%20notes.md`
  );
});

test('and the short form when it is told which folder the page reads from', () => {
  assert.equal(
    addressForDocument(PAGE, '/sites/wiki/Shared Documents/Runbooks/Deploy notes.md',
      undefined, '/sites/wiki/Shared Documents'),
    `${PAGE}?strataDoc=Runbooks/Deploy%20notes.md`
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

/*
 * What a shared address looks like.
 *
 * The Share button ran the whole value through encodeURIComponent and wrote
 * the full server-relative path, so a link to a document three folders down
 * was a wall of escapes carrying the site and the library whether or not they
 * said anything. It is the short form now, escaped only where it has to be.
 */

test('only the characters that would be misread are escaped', () => {
  assert.equal(guardedEncode('Deploy&rollback.md'), 'Deploy%26rollback.md');
  assert.equal(guardedEncode('What is #1.md'), 'What%20is%20%231.md');
  assert.equal(guardedEncode('a+b.md'), 'a%2Bb.md');
  assert.equal(guardedEncode('100% done.md'), '100%25%20done.md');
});

test('a slash, a bracket and an accent survive as written', () => {
  assert.equal(guardedEncode('Runbooks/Déployer (v2)/notes.md'),
    'Runbooks/D\u00e9ployer%20(v2)/notes.md');
});

test('the per cent sign is escaped before the escapes are written', () => {
  /* Escaped last, it would escape the per cent signs of the escapes above it
     and a reader would get %2526 where they wanted an ampersand. */
  assert.equal(guardedEncode('%&'), '%25%26');
  assert.doesNotMatch(guardedEncode('a&b'), /%2526/);
});

test('a space is escaped, because a raw one ends the link', () => {
  /* Not one of the four that have to be, but Teams and Outlook stop
     autolinking at a space and what arrives is half an address. */
  assert.equal(guardedEncode('Deploy notes.md'), 'Deploy%20notes.md');
});

test('a document in the folder the page reads from is just its name', () => {
  assert.equal(
    relativeToFolder('/sites/wiki/Shared Documents', '/sites/wiki/Shared Documents/deploy.md'),
    'deploy.md'
  );
});

test('a document below it keeps the folders between', () => {
  assert.equal(
    relativeToFolder('/sites/wiki/Shared Documents', '/sites/wiki/Shared Documents/Runbooks/db.md'),
    'Runbooks/db.md'
  );
});

test('a document in the folder beside it climbs once', () => {
  assert.equal(
    relativeToFolder('/sites/wiki/Shared Documents', '/sites/wiki/Other Library/x.md'),
    '../Other Library/x.md'
  );
});

test('anything further up is left as the path it is', () => {
  /* ../../other/Docs/page.md tells a reader less than the path it stands for. */
  assert.equal(
    relativeToFolder('/sites/wiki/Shared Documents', '/sites/other/Docs/page.md'),
    '/sites/other/Docs/page.md'
  );
});

test('a file whose name matches its folder is still a file', () => {
  assert.equal(
    relativeToFolder('/sites/wiki/Runbooks', '/sites/wiki/Runbooks/Runbooks'),
    'Runbooks'
  );
});

test('a document read from an address is shared as one', () => {
  /* The folder is a URL, so there is no relative form to fall back to. */
  assert.equal(
    relativeToFolder('https://example.invalid/docs', 'https://example.invalid/docs/a.md'),
    'https://example.invalid/docs/a.md'
  );
});

test('a shared address reads back as the document it names', () => {
  const folder = '/sites/wiki/Shared Documents';
  const wanted = '/sites/wiki/Shared Documents/Runbooks/Deploy notes.md';

  const address = addressForDocument('https://contoso.invalid/sites/wiki/SitePages/Wiki.aspx',
    wanted, undefined, folder);

  assert.match(address, /strataDoc=Runbooks\/Deploy%20notes\.md$/);
  assert.doesNotMatch(address, /%2F/);

  const search = address.slice(address.indexOf('?'));
  assert.deepEqual(documentFromAddress(search, folder), { path: wanted, heading: '' });
});

test('a name full of guarded characters still reads back whole', () => {
  const folder = '/sites/wiki/Shared Documents';
  const wanted = '/sites/wiki/Shared Documents/What is #1 & why + how.md';

  const address = addressForDocument('https://contoso.invalid/x.aspx', wanted, undefined, folder);
  const search = address.slice(address.indexOf('?'));

  assert.deepEqual(documentFromAddress(search, folder), { path: wanted, heading: '' });
});

test('a heading rides through the short form too', () => {
  const folder = '/sites/wiki/Shared Documents';
  const wanted = '/sites/wiki/Shared Documents/Runbooks/deploy.md';

  const address = addressForDocument('https://contoso.invalid/x.aspx', wanted, 'rollback', folder);
  const search = address.slice(address.indexOf('?'));

  assert.deepEqual(documentFromAddress(search, folder), { path: wanted, heading: 'rollback' });
});
