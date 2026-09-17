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
const { findHeading, landOnHeading } = headingLanding;

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
  assert.deepEqual(scrolled, { block: 'start' });
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
