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
  storedProperties, recoverProperties, plainText, decodeStoredInPlace
} = persistedText;

const NASTY = /\[\[|\]\]/;

const SAMPLES = [
  'Plain text with [a link](https://example.com) and no doubled brackets.',
  'See [[Project Plan]] and [[2026-01-15 - Team Meeting|the January notes]].',
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
  const damaged = '| 2026-01-15 | January Team Meeting | Teams | '
    + '<a id="4::2026-01-15 - Team Meeting|2026-01-15 - Team Meeting" '
    + 'class="ms-missinglink" href="/sites/example/SitePages/a.aspx">';
  assert.equal(isDamaged(damaged), true);
  assert.equal(isDamaged('| Teams | &lt;a id="4::x|x" class="ms-missinglink">'), true);
  assert.equal(isDamaged('<a id="12::Page|Page" class="ms-missinglink" href="/x">'), true);
  assert.equal(isDamaged('{"a":"<a id=\\"4::x|x\\" class=\\"ms-missinglink\\" href=\\"/x\\">"}'), true);
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

const WIKI_DOC = '# Notes\n\n[[2026-01-15 - Team Meeting]] and [[Project Plan|the plan]]\n';

test('a page bound to a file persists none of the file, and no brackets', () => {
  const rules = { documentKey: 'markdownContent', fileSource: true };
  const data = pageData({
    contentSource: 'library', selectedFile: '/sites/example/Shared Documents/Notes.md',
    markdownContent: WIKI_DOC, searchablePlainText: 'Notes [[Plan]]'
  }, rules);
  assert.doesNotMatch(data, NASTY);
  assert.doesNotMatch(data, /Team Meeting/);
  assert.equal(JSON.parse(data).markdownContent, '');
  assert.match(data, /Notes\.md/);
});

test('a page with typed text persists it encoded, and reads it back', () => {
  const rules = { documentKey: 'markdownContent', fileSource: false };
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
  const rules = { documentKey: 'markdownContent', fileSource: false };
  const first = JSON.parse(pageData({ contentSource: 'manual', markdownContent: WIKI_DOC }, rules));
  recoverProperties(first, rules);
  const second = JSON.parse(pageData(first, rules));
  assert.equal(second.markdownContent, toStoredText(WIKI_DOC));
});

test('the HTML web part stores its stylesheet encoded as well', () => {
  const rules = { documentKey: 'htmlContent', fileSource: false };
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
  recoverProperties(manual, { documentKey: 'markdownContent', fileSource: false });
  assert.equal(manual.markdownContent, WIKI_DOC);

  const bound = { markdownContent: WIKI_DOC, searchablePlainText: 'x' };
  recoverProperties(bound, { documentKey: 'markdownContent', fileSource: true });
  assert.equal(bound.markdownContent, '');
});

test('damaged saved data is discarded and reported, never thrown', () => {
  const damaged = 'text <a id="4::A|A" class="ms-missinglink" href="/x">';
  const rules = { documentKey: 'markdownContent', fileSource: false };
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
  const rules = { documentKey: 'markdownContent', fileSource: false };
  assert.deepEqual(recoverProperties({}, rules), { discarded: [] });
  assert.deepEqual(recoverProperties({ markdownContent: 5 }, rules), { discarded: [] });
  assert.deepEqual(storedProperties({ markdownContent: undefined }, rules), {});
});

/*
 * Damage is the processor's own signature - its anchor and its class together -
 * and not a mention of either.
 */
test('plain content that only mentions the class is not damage, and round-trips', () => {
  const rules = { documentKey: 'htmlContent', fileSource: false };
  const css = '.ms-missinglink { color: red }\na::before { content: "4::x" }';
  const note = 'The class ms-missinglink is what SharePoint puts on a link to a page that does not exist.';
  const anchor = '<a id="4::not a link" href="/x">an anchor with a numeric id</a>';
  [css, note, anchor].forEach((text) => assert.equal(isDamaged(text), false));

  const bag = { htmlContent: note, cssContent: css, notes: anchor };
  const outcome = recoverProperties(bag, rules);
  assert.deepEqual(outcome.discarded, []);
  assert.deepEqual(bag, { htmlContent: note, cssContent: css, notes: anchor });

  const data = JSON.parse(pageData({ htmlContent: note, cssContent: css }, rules));
  assert.equal(data.cssContent, css);
});

test('a real rewritten anchor is still found, in the document or the stylesheet', () => {
  const rewritten = 'a { color: red } <a id="7::Draft|Draft" class="ms-missinglink" href="/sites/example/SitePages/Draft.aspx">';
  const rules = { documentKey: 'htmlContent', fileSource: false };
  const bag = { htmlContent: '<p>ok</p>', cssContent: rewritten };
  assert.deepEqual(recoverProperties(bag, rules).discarded, ['cssContent']);
  assert.equal(bag.cssContent, '');
  assert.equal(bag.htmlContent, '<p>ok</p>');
});

/*
 * A file called "[[Draft]] plan.md" puts [[ into more than the document.
 */
test('every string is stored without brackets, nested ones too, and reads back exactly', () => {
  const rules = { documentKey: 'markdownContent', fileSource: true };
  const properties = {
    contentSource: 'library',
    selectedLibrary: '/sites/example/[[Drafts]]',
    selectedFolder: '/sites/example/[[Drafts]]/2026',
    selectedFile: '/sites/example/[[Drafts]]/[[Draft]] plan.md',
    fileUrl: 'https://example.com/[[x]].md',
    cssFileUrl: 'https://example.com/[[x]].css',
    selectedStyleFile: '/sites/example/Styles/[[a]].css',
    fileMetadata: {
      name: '[[Draft]] plan.md',
      path: '/sites/example/[[Drafts]]/[[Draft]] plan.md',
      versions: [{ label: '[[1]]' }, { label: 'plain' }],
      size: 12,
      locked: false
    },
    toolbarVisibility: 'always',
    markdownContent: 'kept nowhere [[x]]',
    searchablePlainText: 'Draft [[Plan]]',
    plainFile: 'Notes.md',
    startsLikeTheMarker: `${STORED_PREFIX}oops`
  };
  const before = JSON.stringify(properties);

  const data = pageData(properties, rules);
  assert.doesNotMatch(data, NASTY);
  assert.equal(JSON.stringify(properties), before, 'the live properties are not touched');

  const back = JSON.parse(data);
  assert.equal(back.plainFile, 'Notes.md');
  assert.equal(back.markdownContent, '');
  assert.notEqual(back.selectedFile, properties.selectedFile);

  const outcome = recoverProperties(back, rules);
  assert.deepEqual(outcome.discarded, []);
  const expected = { ...properties, markdownContent: '', searchablePlainText: 'Draft Plan' };
  assert.deepEqual(back, expected);
});

test('values that need no encoding are left as they are, objects included', () => {
  const rules = { documentKey: 'markdownContent', fileSource: false };
  const meta = { name: 'Notes.md', versions: ['a', 'b'] };
  const write = storedProperties({ markdownContent: 'plain', fileMetadata: meta, count: 3 }, rules);
  assert.deepEqual(write, {});
});

/*
 * The live properties hold a stored form for a moment while SharePoint copies
 * them. Reading through the guard must never give that back as the document.
 */
test('an encoded value read from live properties is decoded, never taken as the document', () => {
  const rules = { documentKey: 'markdownContent', fileSource: false };
  const live = { markdownContent: WIKI_DOC, fileMetadata: { name: '[[Draft]].md' } };
  const swapped = { ...live, ...storedProperties(live, rules) };
  assert.match(swapped.markdownContent, new RegExp(`^${STORED_PREFIX}`));

  assert.equal(plainText(swapped.markdownContent), WIKI_DOC);
  assert.equal(plainText('plain text'), 'plain text');
  assert.equal(plainText(`${STORED_PREFIX}***`), '');

  decodeStoredInPlace(swapped);
  assert.deepEqual(swapped, live);
  decodeStoredInPlace(swapped);
  assert.deepEqual(swapped, live, 'decoding twice changes nothing');
});

/*
 * dataVersion moved from 1.0 to 1.1. SPFx hands the stored version to
 * onAfterDeserialize and does nothing else with it, so the web part does not
 * branch on it: both formats are told apart by looking at each value.
 */
test('a 1.0 page and a 1.1 page both load, whatever version they say', () => {
  const rules = { documentKey: 'markdownContent', fileSource: false };
  const v10 = { markdownContent: WIKI_DOC, cssContent: 'a { color: red }', fileMetadata: { name: 'Notes.md' } };
  const v11 = JSON.parse(pageData({ markdownContent: WIKI_DOC, fileMetadata: { name: '[[Draft]].md' } }, rules));

  const a = JSON.parse(JSON.stringify(v10));
  assert.deepEqual(recoverProperties(a, rules), { discarded: [] });
  assert.deepEqual(a, v10);

  assert.deepEqual(recoverProperties(v11, rules), { discarded: [] });
  assert.deepEqual(v11, { markdownContent: WIKI_DOC, fileMetadata: { name: '[[Draft]].md' } });
});
