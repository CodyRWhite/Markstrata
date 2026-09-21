/**
 * .SYNOPSIS
 * Walking out of a shadow root to find what is really scrolling.
 *
 * .DESCRIPTION
 * Everything the web parts measure - how much room the fill-height setting
 * has, which container the reading position is read against, where the visible
 * area ends - starts by walking up from an element looking for the thing that
 * scrolls. On a SharePoint page that is never the window; it is an inner
 * container under the header and the command bar.
 *
 * The walk was written with parentElement, and the HTML web part can render a
 * document inside a shadow root, where the topmost element's parentElement is
 * null although something plainly encloses it. The walk stopped at the
 * boundary, found no container, and answered as though the window scrolled:
 * the wrong answer, arrived at silently.
 *
 * The first test below is the one that fails against parentElement. The rest
 * are the cases that must not change because of the fix.
 *
 * .USAGE
 *   npm test                                npm test
 *   node --test tests/shadow-walk.test.js   this one
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js, jsdom
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { scrolling } = require('./helpers');

const { enclosing } = scrolling;

test('the walk steps out of a shadow root through its host', () => {
  /* The failing case. parentElement is null here, so the old walk ended one
     step inside the boundary and never saw the scrolling container. */
  const dom = new JSDOM('<div id="scroller"><div id="host"></div></div>');
  const host = dom.window.document.getElementById('host');
  const root = host.attachShadow({ mode: 'open' });
  const article = dom.window.document.createElement('div');
  root.appendChild(article);

  assert.equal(article.parentElement, null, 'the premise: no parentElement');
  assert.equal(enclosing(article), host, 'the shadow host is what encloses it');
});

test('and keeps walking once it is out', () => {
  /* One step out is not enough: the container that scrolls is above the host,
     so the walk has to carry on in the page's own DOM. */
  const dom = new JSDOM('<div id="scroller"><div id="host"></div></div>');
  const document = dom.window.document;
  const host = document.getElementById('host');
  const article = document.createElement('div');
  host.attachShadow({ mode: 'open' }).appendChild(article);

  const seen = [];
  let step = enclosing(article);
  while (step) {
    seen.push(step.id || step.tagName.toLowerCase());
    step = enclosing(step);
  }

  assert.deepEqual(seen, ['host', 'scroller', 'body', 'html']);
});

test('in the page\'s own DOM it is parentElement and nothing more', () => {
  const dom = new JSDOM('<div id="outer"><p id="inner">hi</p></div>');
  const inner = dom.window.document.getElementById('inner');
  assert.equal(enclosing(inner), dom.window.document.getElementById('outer'));
});

test('the walk ends at the top of the document', () => {
  /* html has no enclosing element, and the answer has to be falsy rather than
     a Document: every caller uses it as the loop condition. */
  const dom = new JSDOM('<p>hi</p>');
  const html = dom.window.document.documentElement;
  assert.equal(enclosing(html), undefined);
});

test('a detached element encloses nothing', () => {
  /* A document built to be measured before it is put on the page. Its
     getRootNode is a DocumentFragment or itself, and neither has a host. */
  const dom = new JSDOM('');
  const loose = dom.window.document.createElement('div');
  assert.equal(enclosing(loose), undefined);
});

test('a closed shadow root is walked out of as well as an open one', () => {
  /* The mode decides who may look in from outside, not what an element inside
     can see on its way out. */
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.getElementById('host');
  const article = dom.window.document.createElement('div');
  host.attachShadow({ mode: 'closed' }).appendChild(article);

  assert.equal(enclosing(article), host);
});

test('a nested shadow root is walked out of one boundary at a time', () => {
  const dom = new JSDOM('<div id="outerHost"></div>');
  const document = dom.window.document;
  const outerHost = document.getElementById('outerHost');
  const innerHost = document.createElement('div');
  innerHost.id = 'innerHost';
  outerHost.attachShadow({ mode: 'open' }).appendChild(innerHost);
  const article = document.createElement('div');
  innerHost.attachShadow({ mode: 'open' }).appendChild(article);

  assert.equal(enclosing(article), innerHost);
  assert.equal(enclosing(innerHost), outerHost);
});
