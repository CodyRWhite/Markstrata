/**
 * .SYNOPSIS
 * Finding the heading a link named, in every spelling that name arrives in.
 *
 * .DESCRIPTION
 * A heading was looked up by exactly the text the link carried. A wiki link
 * has already been through the slug rule, so `[[Runbook#Rollback]]` asked for
 * `rollback` and found it. A heading named on the page's own address has not
 * been through anything, so `?strataDoc=Runbook.md%23Rollback` asked for
 * `Rollback`, which is the id of nothing, and the reader was left at the top
 * of the right document with the anchor apparently ignored.
 *
 * The harness covers the address case with `handbook.md#tables`, which is
 * already lower case and already the id, so it passed throughout. These are
 * written the way a person writes a heading.
 *
 * .USAGE
 *   npm test                                  every test
 *   node --test tests/heading-landing.test.js   this one
 *
 * .NOTES
 * Since:     0.0.19.4
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js, jsdom
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { wikiLinks, headingLanding } = require('./helpers');

const { headingTargets } = wikiLinks;
const { findHeading, landOnHeading, heldHeading } = headingLanding;

/** A rendered document, as the headings the markdown pipeline would give it. */
function document(html) {
  return new JSDOM(`<div id="article">${html}</div>`).window.document
    .getElementById('article');
}

const HEADINGS = `
  <h2 id="rollback">Rollback</h2>
  <h2 id="step-1-install">Step 1: Install</h2>
  <h2 id="whats-new">What's new?</h2>
  <h2 id="custom">Something else</h2>
`;

test('a heading named as a person writes it is tried as a slug too', () => {
  const tried = headingTargets('Rollback');
  assert.ok(tried.indexOf('Rollback') !== -1, 'the name as written');
  assert.ok(tried.indexOf('rollback') !== -1, 'and the id it would have');
});

test('the name as written is tried first, so an authored id still wins', () => {
  assert.equal(headingTargets('Custom')[0], 'Custom');
});

test('a name that is already an id gives just that id', () => {
  assert.deepEqual(headingTargets('rollback'), ['rollback']);
});

test('punctuation is dropped the way the heading ids drop it', () => {
  assert.ok(headingTargets('Step 1: Install').indexOf('step-1-install') !== -1);
  assert.ok(headingTargets("What's new?").indexOf('whats-new') !== -1);
});

test('a name still percent encoded is decoded before it is slugged', () => {
  assert.ok(headingTargets('Step%201%3A%20Install').indexOf('step-1-install') !== -1);
});

test('a name that is not valid encoding is used as written', () => {
  /* A heading with a per cent sign in it is a heading, not a mistake, and
     throwing while working out where to scroll would lose the document. */
  const tried = headingTargets('100% done');
  assert.ok(tried.indexOf('100% done') !== -1);
  assert.ok(tried.indexOf('100-done') !== -1);
});

test('nothing named is nothing to try', () => {
  assert.deepEqual(headingTargets(''), []);
  assert.deepEqual(headingTargets('   '), []);
});

test('a capitalised name finds the heading it names', () => {
  /* The reported fault: the address names Rollback, the id is rollback, and
     nothing matched. */
  const found = findHeading(document(HEADINGS), 'Rollback');
  assert.ok(found, 'no heading found');
  assert.equal(found.id, 'rollback');
});

test('a name with punctuation finds the heading it names', () => {
  assert.equal(findHeading(document(HEADINGS), 'Step 1: Install').id, 'step-1-install');
  assert.equal(findHeading(document(HEADINGS), "What's new?").id, 'whats-new');
});

test('a name already written as the id still finds it', () => {
  assert.equal(findHeading(document(HEADINGS), 'rollback').id, 'rollback');
});

test('an id an author gave a heading themselves is matched as written', () => {
  const article = document('<h2 id="Deploy-Runbook">Deploy</h2>');
  assert.equal(findHeading(article, 'Deploy-Runbook').id, 'Deploy-Runbook');
});

test('a heading that is not in this document is not found', () => {
  assert.equal(findHeading(document(HEADINGS), 'Nowhere'), undefined);
});

test('a name that will not parse as a selector is not a crash', () => {
  assert.equal(findHeading(document(HEADINGS), '<<>>'), undefined);
  assert.equal(findHeading(document(HEADINGS), ']]'), undefined);
});

test('landing on a heading scrolls to it and says so', () => {
  const article = document(HEADINGS);
  const heading = article.querySelector('#rollback');
  let scrolled;
  heading.scrollIntoView = (options) => { scrolled = options; };

  assert.equal(landOnHeading(article, 'Rollback'), true);
  assert.deepEqual(scrolled, { behavior: 'instant', block: 'start' });
});

test('landing smoothly is what a click in the text asks for', () => {
  const article = document(HEADINGS);
  const heading = article.querySelector('#rollback');
  let scrolled;
  heading.scrollIntoView = (options) => { scrolled = options; };

  landOnHeading(article, 'Rollback', true);
  assert.deepEqual(scrolled, { behavior: 'smooth', block: 'start' });
});

test('landing on a heading that is not there scrolls nothing', () => {
  assert.equal(landOnHeading(document(HEADINGS), 'Nowhere'), false);
});

/**
 * A stand-in window that keeps its listeners and its one timer, so a landing
 * can be held, disturbed and released without a browser.
 */
function fakeWindow() {
  const listeners = {};
  const fake = {
    listeners,
    timers: [],
    addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
    removeEventListener: (name, fn) => {
      listeners[name] = (listeners[name] || []).filter((f) => f !== fn);
    },
    setTimeout: (fn) => { fake.timers.push(fn); return fake.timers.length; },
    clearTimeout: () => {}
  };
  return fake;
}

/** Runs a body with the stand-in installed as the global window. */
function withWindow(body) {
  const fake = fakeWindow();
  globalThis.window = fake;
  try { body(fake); } finally { delete globalThis.window; }
}

/** A heading that reports where it sits, and counts the times it is scrolled to. */
function trackedHeading(article) {
  const heading = article.querySelector('#rollback');
  const state = { top: 0, scrolls: 0 };
  heading.getBoundingClientRect = () => ({ top: state.top });
  heading.scrollIntoView = () => { state.scrolls++; state.top = 0; };
  return { heading, state };
}

test('a picture loading above the heading puts the heading back where it landed', () => {
  withWindow(() => {
    const article = document(HEADINGS);
    const { state } = trackedHeading(article);

    landOnHeading(article, 'Rollback');
    assert.equal(state.scrolls, 1);

    /* The picture arrives and pushes the heading a screen down the page. */
    state.top = 990;
    article.dispatchEvent(new (new JSDOM('').window.Event)('load'));
    assert.equal(state.scrolls, 2, 'the heading was left where the picture pushed it');
    assert.equal(state.top, 0);
  });
});

test('a heading that has not moved is not scrolled again', () => {
  withWindow(() => {
    const article = document(HEADINGS);
    const { state } = trackedHeading(article);

    landOnHeading(article, 'Rollback');
    article.dispatchEvent(new (new JSDOM('').window.Event)('load'));
    assert.equal(state.scrolls, 1);
  });
});

test('a reader who scrolls takes the page back from the hold', () => {
  withWindow((fake) => {
    const article = document(HEADINGS);
    const { state } = trackedHeading(article);

    landOnHeading(article, 'Rollback');
    fake.listeners.wheel.forEach((fn) => fn());

    state.top = 990;
    article.dispatchEvent(new (new JSDOM('').window.Event)('load'));
    assert.equal(state.scrolls, 1, 'the page was pulled back after the reader moved it');
  });
});

test('the hold ends when its time is up', () => {
  withWindow((fake) => {
    const article = document(HEADINGS);
    const { state } = trackedHeading(article);

    landOnHeading(article, 'Rollback');
    fake.timers.forEach((fn) => fn());

    state.top = 990;
    article.dispatchEvent(new (new JSDOM('').window.Event)('load'));
    assert.equal(state.scrolls, 1);
    assert.equal((fake.listeners.wheel || []).length, 0, 'listeners left behind');
  });
});

test('a smooth landing, which is a click, is not held', () => {
  withWindow((fake) => {
    const article = document(HEADINGS);
    const { state } = trackedHeading(article);

    landOnHeading(article, 'Rollback', true);
    state.top = 990;
    article.dispatchEvent(new (new JSDOM('').window.Event)('load'));
    assert.equal(state.scrolls, 1);
    assert.equal((fake.listeners.wheel || []).length, 0);
  });
});

test('a landing is held by name until the reader takes the page back', () => {
  /* So a second draw of the same document, which replaces the elements the
     first landed on, can land on the same heading again. */
  withWindow((fake) => {
    const article = document(HEADINGS);
    trackedHeading(article);

    assert.equal(heldHeading(), undefined);
    landOnHeading(article, 'Rollback');
    assert.equal(heldHeading(), 'Rollback');

    fake.listeners.keydown.forEach((fn) => fn());
    assert.equal(heldHeading(), undefined);
  });
});

test('a landing that is not held is not offered again', () => {
  withWindow(() => {
    landOnHeading(document(HEADINGS), 'Nowhere');
    assert.equal(heldHeading(), undefined);
  });
});
