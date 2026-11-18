/**
 * .SYNOPSIS
 * What a web part writes into its page: no [[ or ]] anywhere, text that comes
 * back exactly as it went in, and a page SharePoint already damaged noticed.
 *
 * .USAGE
 *   npm test                                 every test
 *   node --test tests/persisted-text.test.js this one
 *
 * .NOTES
 * Since:     0.0.24.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { persistedText } = require('./helpers');

const {
  STORED_PREFIX, toStoredText, fromStoredText, isDamaged, cleanSearchText,
  storedProperties, recoverProperties
} = persistedText;

const NASTY = /\[\[|\]\]/;

const SAMPLES = [
  'Plain text with [a link](https://example.com) and no doubled brackets.',
  'See [[Minutes Template]] and [[2026-10-21 - Burlington JHSC Minutes|the October minutes]].',
  '[[[three]]] and [[a]][[b]] and ]] stray [[ opener',
  'unicode: [[Café – 日本語]] 😀 and a lone [[😀]]',
  `${STORED_PREFIX}looks encoded but is not`,
  `${STORED_PREFIX}[[and has a link]]`,
  '| a | b |\n|---|---|\n| [[x]] | [[y|z]] |\n',
  ''
];

test('text round-trips, whatever is in it', () => {
  SAMPLES.forEach((text) => {
    assert.equal(fromStoredText(toStoredText(text)), text);
  });
});

test('the stored form never contains a doubled bracket', () => {
  SAMPLES.forEach((text) => {
    assert.doesNotMatch(toStoredText(text), NASTY);
  });
});

test('text without doubled brackets is stored as it is, so old pages still load', () => {
  assert.equal(toStoredText(SAMPLES[0]), SAMPLES[0]);
  assert.equal(fromStoredText(SAMPLES[0]), SAMPLES[0]);
});

test('a long document is encoded without running into an argument limit', () => {
  const big = '[[Page]] and some text. '.repeat(40000);
  const stored = toStoredText(big);
  assert.doesNotMatch(stored, NASTY);
  assert.equal(fromStoredText(stored), big);
});

test('a marker followed by rubbish reads back as nothing rather than as a guess', () => {
  assert.equal(fromStoredText(`${STORED_PREFIX}***not base64***`), undefined);
});

test('the damage SharePoint does is recognised, as markup or as escaped text', () => {
  const damaged = '| 2026-10-21 | October 2026 JHSC Meeting | Teams | '
    + '<a id="4::2026-10-21 - Burlington JHSC Minutes|2026-10-21 - Burlington JHSC Minutes" '
    + 'class="ms-missinglink" href="/sites/x/SitePages/a.aspx">';
  assert.equal(isDamaged(damaged), true);
  assert.equal(isDamaged('| Teams | &lt;a id="4::x|x" class="ms-missinglink">'), true);
  assert.equal(isDamaged('<a id="12::Page|Page" href="/x">'), true);
  assert.equal(isDamaged('# A clean document\n\nWith [[a link]] and <a href="x">html</a>.'), false);
  assert.equal(isDamaged(toStoredText('[[a]] ms-missinglink')), false);
});

test('search text loses its brackets: links to their label, the rest broken up', () => {
  assert.equal(cleanSearchText('Go to [[Page|Alias]] now'), 'Go to Alias now');
  assert.equal(cleanSearchText('Go to [[Some Page]] now'), 'Go to Some Page now');
  assert.equal(cleanSearchText('code: x[[0]] and [[[y]]]'), 'code: x0 and [y]');
  assert.equal(cleanSearchText('a ]] b [[ c'), 'a ] ] b [ [ c');
  SAMPLES.forEach((text) => assert.doesNotMatch(cleanSearchText(text), NASTY));
});

/*
 * What SPFx writes is JSON.stringify of the property bag, and then the page's
 * server runs over the result. This is that, minus the server: the string has
 * to be free of what the server rewrites.
 */
function pageData(properties, rules) {
  const live = { ...properties };
  Object.assign(live, storedProperties(live, rules));
  return JSON.stringify(live);
}

const WIKI_DOC = '# Minutes\n\n[[2026-10-21 - Burlington JHSC Minutes]] and [[Minutes Template|template]]\n';

test('a page bound to a file persists none of the file, and no brackets', () => {
  const rules = { documentKey: 'markdownContent', textKeys: [], fileSource: true };
  const data = pageData({
    contentSource: 'library', selectedFile: '/sites/x/Shared Documents/Minutes Log.md',
    markdownContent: WIKI_DOC, searchablePlainText: 'Minutes [[Template]]'
  }, rules);
  assert.doesNotMatch(data, NASTY);
  assert.doesNotMatch(data, /Burlington/);
  assert.equal(JSON.parse(data).markdownContent, '');
  assert.match(data, /Minutes Log\.md/);
});

test('a page with typed text persists it encoded, and reads it back', () => {
  const rules = { documentKey: 'markdownContent', textKeys: [], fileSource: false };
  const data = pageData({
    contentSource: 'manual', markdownContent: WIKI_DOC, searchablePlainText: 'See [[Page|Alias]]'
  }, rules);
  assert.doesNotMatch(data, NASTY);

  const back = JSON.parse(data);
  assert.equal(back.searchablePlainText, 'See Alias');
  const outcome = recoverProperties(back, rules);
  assert.deepEqual(outcome.discarded, []);
  assert.equal(back.markdownContent, WIKI_DOC);
});

test('saving twice gives the same page', () => {
  const rules = { documentKey: 'markdownContent', textKeys: [], fileSource: false };
  const first = JSON.parse(pageData({ contentSource: 'manual', markdownContent: WIKI_DOC }, rules));
  recoverProperties(first, rules);
  const second = JSON.parse(pageData(first, rules));
  assert.equal(second.markdownContent, toStoredText(WIKI_DOC));
});

test('the HTML web part stores its stylesheet encoded as well', () => {
  const rules = { documentKey: 'htmlContent', textKeys: ['cssContent'], fileSource: false };
  const css = 'a[href^="[[x]]"] { color: red }';
  const data = pageData({ contentSource: 'manual', htmlContent: '<p>[[Page]]</p>', cssContent: css }, rules);
  assert.doesNotMatch(data, NASTY);
  const back = JSON.parse(data);
  recoverProperties(back, rules);
  assert.equal(back.htmlContent, '<p>[[Page]]</p>');
  assert.equal(back.cssContent, css);
});

test('a page saved before this release still loads, and a file-bound one is cleaned', () => {
  const manual = { markdownContent: WIKI_DOC };
  recoverProperties(manual, { documentKey: 'markdownContent', textKeys: [], fileSource: false });
  assert.equal(manual.markdownContent, WIKI_DOC);

  const bound = { markdownContent: WIKI_DOC, searchablePlainText: 'x' };
  recoverProperties(bound, { documentKey: 'markdownContent', textKeys: [], fileSource: true });
  assert.equal(bound.markdownContent, '');
});

test('damaged saved data is discarded and reported, never thrown', () => {
  const damaged = 'text <a id="4::A|A" class="ms-missinglink" href="/x">';
  const rules = { documentKey: 'markdownContent', textKeys: ['cssContent'], fileSource: false };
  const bag = { markdownContent: damaged, cssContent: `${STORED_PREFIX}@@@`, searchablePlainText: damaged };
  const outcome = recoverProperties(bag, rules);
  assert.deepEqual(outcome.discarded.sort(), ['cssContent', 'markdownContent']);
  assert.equal(bag.markdownContent, '');
  assert.equal(bag.searchablePlainText, '');

  /* For a file the document is not kept, so there is nothing to report. */
  const file = { markdownContent: damaged };
  const fileOutcome = recoverProperties(file, { ...rules, fileSource: true });
  assert.deepEqual(fileOutcome.discarded, []);
  assert.equal(file.markdownContent, '');
});

test('a bag with nothing in it, or the wrong things, is left alone', () => {
  const rules = { documentKey: 'markdownContent', textKeys: [], fileSource: false };
  assert.deepEqual(recoverProperties({}, rules), { discarded: [] });
  assert.deepEqual(recoverProperties({ markdownContent: 5 }, rules), { discarded: [] });
  assert.deepEqual(storedProperties({ markdownContent: undefined }, rules), {});
});
