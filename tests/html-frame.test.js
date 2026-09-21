/**
 * .SYNOPSIS
 * What the HTML web part's frame is allowed to do, and where a click inside it
 * lands.
 *
 * .DESCRIPTION
 * The sandbox attribute is the whole of the safety in frame mode, so the tests
 * that matter most here are the ones that would fail if it were ever loosened.
 * allow-same-origin together with allow-scripts is not a sandbox at all - a
 * script granted both can read the reader's SharePoint session and remove its
 * own sandbox - so that pair is checked directly, in both modes, rather than
 * left to a reading of the code.
 *
 * The rest is about not stranding a reader. A frame has no address bar, no back
 * button and none of the web part's toolbar, so every link that leaves the
 * document has to leave the frame too.
 *
 * .USAGE
 *   npm test                              every test
 *   node --test tests/html-frame.test.js  this one
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js, jsdom
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { htmlFrame } = require('./helpers');

const { frameDocument, frameSandbox } = htmlFrame;

const HTML_DOCUMENTS = /\.(html?)$/i;

/* frameDocument assembles through DOMParser, which Node does not have. jsdom's
   is inert in the same way a browser's is, which is the property the whole
   module rests on. */
const window = new JSDOM('').window;
global.DOMParser = window.DOMParser;

/** The assembled frame document, read back as a DOM so it can be asked about. */
function parsed(raw, options) {
  return new JSDOM(frameDocument(raw, Object.assign({
    scripts: false,
    documentExtensions: HTML_DOCUMENTS
  }, options || {}))).window.document;
}

function flags(scripts) {
  return frameSandbox(scripts).split(/\s+/);
}

// ------------------------------------------------------------------- sandbox

test('a frame is never granted same origin and scripts together', () => {
  /* The one combination that is not a sandbox. Checked in both modes, because
     this is the assertion that has to survive every later change to the
     flags. */
  [true, false].forEach((scripts) => {
    const granted = flags(scripts);
    const both = granted.indexOf('allow-same-origin') !== -1
      && granted.indexOf('allow-scripts') !== -1;
    assert.equal(both, false, `both granted with scripts ${scripts}: ${granted.join(' ')}`);
  });
});

test('with scripts off the frame may be read, so a height can be measured', () => {
  /* There is no script in the frame to make any use of same origin, and it is
     what "fit content" needs. */
  assert.ok(flags(false).indexOf('allow-same-origin') !== -1);
  assert.ok(flags(false).indexOf('allow-scripts') === -1);
});

test('with scripts on the frame is an opaque origin', () => {
  assert.ok(flags(true).indexOf('allow-scripts') !== -1);
  assert.ok(flags(true).indexOf('allow-same-origin') === -1);
});

test('top navigation is granted only where no script could redirect a click', () => {
  assert.ok(flags(false).indexOf('allow-top-navigation-by-user-activation') !== -1);
  assert.ok(flags(true).indexOf('allow-top-navigation-by-user-activation') === -1);
});

test('unconditional top navigation is never granted', () => {
  /* The flag without "by user activation" lets the frame carry the reader off
     with no click at all. */
  [true, false].forEach((scripts) => {
    assert.ok(flags(scripts).indexOf('allow-top-navigation') === -1,
      `granted with scripts ${scripts}`);
  });
});

test('a link that leaves can open a real tab in either mode', () => {
  /* Without allow-popups-to-escape-sandbox the new tab inherits the frame's
     sandbox and the reader gets a broken window instead of the page. */
  [true, false].forEach((scripts) => {
    assert.ok(flags(scripts).indexOf('allow-popups') !== -1);
    assert.ok(flags(scripts).indexOf('allow-popups-to-escape-sandbox') !== -1);
  });
});

// ------------------------------------------------------------------ the base

test('the folder the document came from is the base for its relative links', () => {
  const html = parsed('<p>hi</p>', { base: '/sites/team/Docs/guides/' });
  const base = html.querySelector('base');
  assert.ok(base, 'no base element');
  assert.equal(base.getAttribute('href'), '/sites/team/Docs/guides/');
});

test('the base is the first thing in the head', () => {
  /* Anything before it resolves against the page instead, which is the bug it
     exists to prevent. */
  const html = parsed('<head><link rel="icon" href="fav.png"></head><p>hi</p>',
    { base: '/sites/team/Docs/' });
  assert.equal(html.head.firstElementChild.tagName.toLowerCase(), 'base');
});

test('no folder means no base element invented', () => {
  assert.equal(parsed('<p>hi</p>').querySelector('base'), null);
});

// ----------------------------------------------------------------- the styles

test('the shared stylesheet goes in front of the author\'s own', () => {
  /* In front, so an author's rule wins where the two disagree. The document
     is theirs. */
  const html = parsed('<style>p{color:red}</style><p>hi</p>', { css: 'p{color:blue}' });
  const sheets = Array.prototype.slice.call(html.querySelectorAll('style'))
    .map((style) => style.textContent);
  assert.deepEqual(sheets, ['p{color:blue}', 'p{color:red}']);
});

test('and after the base, so its own relative addresses resolve', () => {
  const html = parsed('<p>hi</p>', { base: '/sites/team/Docs/', css: 'p{color:blue}' });
  const head = Array.prototype.slice.call(html.head.children)
    .map((child) => child.tagName.toLowerCase());
  assert.deepEqual(head.slice(0, 2), ['base', 'style']);
});

// ------------------------------------------------------------------- the links

test('a link to a neighbouring document opens in the window, not the frame', () => {
  const html = parsed('<a href="rollback.html">Rolling back</a>', {
    documentAddress: (path) => `?strataDoc=${encodeURIComponent(path)}`
  });
  const link = html.querySelector('a');
  assert.equal(link.getAttribute('href'), '?strataDoc=rollback.html');
  assert.equal(link.getAttribute('target'), '_parent');
});

test('with scripts on it opens a tab instead', () => {
  /* A script in the frame could have rewritten the address after it was set,
     and a click on it would then have replaced the reader's page. */
  const html = parsed('<a href="rollback.html">Rolling back</a>', {
    scripts: true,
    documentAddress: (path) => `?strataDoc=${encodeURIComponent(path)}`
  });
  const link = html.querySelector('a');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
});

test('a fragment is left alone, because the frame itself should handle it', () => {
  const html = parsed('<a href="#rolling-back">Rolling back</a><h2 id="rolling-back">x</h2>');
  const link = html.querySelector('a');
  assert.equal(link.getAttribute('href'), '#rolling-back');
  assert.equal(link.getAttribute('target'), null);
});

test('an address that names a server is not a neighbouring document', () => {
  /* Opening somebody else's document inside this web part would present it as
     this library's. */
  const html = parsed('<a href="https://example.com/a/rollback.html">Elsewhere</a>', {
    documentAddress: (path) => `?strataDoc=${encodeURIComponent(path)}`
  });
  const link = html.querySelector('a');
  assert.equal(link.getAttribute('href'), 'https://example.com/a/rollback.html');
  assert.equal(link.getAttribute('target'), '_blank');
});

test('nor is a server relative one', () => {
  const html = parsed('<a href="/sites/other/Docs/rollback.html">Elsewhere</a>', {
    documentAddress: (path) => `?strataDoc=${encodeURIComponent(path)}`
  });
  assert.equal(html.querySelector('a').getAttribute('href'),
    '/sites/other/Docs/rollback.html');
});

test('a relative link to something that is not a document opens in a tab', () => {
  /* A PDF replacing the frame would strand the reader: no toolbar, no back. */
  const html = parsed('<a href="runbook.pdf">Runbook</a>', {
    documentAddress: (path) => `?strataDoc=${encodeURIComponent(path)}`
  });
  const link = html.querySelector('a');
  assert.equal(link.getAttribute('href'), 'runbook.pdf');
  assert.equal(link.getAttribute('target'), '_blank');
});

test('every link that leaves carries noopener', () => {
  const html = parsed('<a href="https://example.com/">Out</a>');
  assert.equal(html.querySelector('a').getAttribute('rel'), 'noopener noreferrer');
});

test('a document link is left as written when the page would not honour one', () => {
  /* No documentAddress means following is off, and a link rewritten to an
     address nothing reads is a link to nothing. */
  const html = parsed('<a href="rollback.html">Rolling back</a>');
  const link = html.querySelector('a');
  assert.equal(link.getAttribute('href'), 'rollback.html');
  assert.equal(link.getAttribute('target'), '_blank');
});

test('a mailto link opens in a tab rather than in the frame', () => {
  const html = parsed('<a href="mailto:someone@example.com">Mail</a>');
  assert.equal(html.querySelector('a').getAttribute('target'), '_blank');
});

// ---------------------------------------------------------------- the contents

test('the contents list goes inside the frame, at the top', () => {
  /* Nothing outside a frame can scroll a heading inside one, so a sidebar in
     the page would be a list of links that do nothing. */
  const html = parsed('<h2>Rolling back</h2>', {
    contents: '<nav class="strata-toc"><ul><li><a href="#rolling-back">Rolling back</a></li></ul></nav>'
  });
  const first = html.body.firstElementChild;
  assert.ok(first.querySelector('nav.strata-toc'), `the contents are not first: ${html.body.innerHTML}`);
});

test('and its links are left pointing inside the frame', () => {
  const html = parsed('<h2 id="rolling-back">Rolling back</h2>', {
    contents: '<nav class="strata-toc"><ul><li><a href="#rolling-back">Rolling back</a></li></ul></nav>'
  });
  const entry = html.querySelector('nav.strata-toc a');
  assert.equal(entry.getAttribute('href'), '#rolling-back');
  assert.equal(entry.getAttribute('target'), null);
});

// ------------------------------------------------------------------- headings

test('headings are given ids, so the contents have something to reach', () => {
  const html = parsed('<h2>Rolling back</h2>');
  assert.equal(html.querySelector('h2').id, 'rolling-back');
});

// ------------------------------------------------------------- what it produces

test('the result is a whole document, with a doctype', () => {
  const written = frameDocument('<p>hi</p>', {
    scripts: false, documentExtensions: HTML_DOCUMENTS
  });
  assert.ok(/^<!doctype html>/i.test(written), written.substring(0, 40));
  assert.ok(written.indexOf('<html') !== -1);
  assert.ok(written.indexOf('<p>hi</p>') !== -1);
});

test('an empty document is a document, not a crash', () => {
  const written = frameDocument('', { scripts: false, documentExtensions: HTML_DOCUMENTS });
  assert.ok(written.indexOf('<html') !== -1);
});

test('an author\'s script is kept, because that mode is what it is for', () => {
  /* The caller sanitises for every other mode. Here the sandbox is the
     safety, and removing the scripts would leave the setting doing nothing. */
  const written = frameDocument('<script>window.ran=1</script><p>hi</p>', {
    scripts: true, documentExtensions: HTML_DOCUMENTS
  });
  assert.ok(written.indexOf('window.ran=1') !== -1, written);
});
