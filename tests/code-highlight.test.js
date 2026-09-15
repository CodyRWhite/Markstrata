/**
 * .SYNOPSIS
 * Calling out named lines in a fence, written {2,4-6} after the language.
 *
 * .USAGE
 *   npm test                                   every test
 *   node --test tests/code-highlight.test.js   this one
 *
 * .NOTES
 * Since:     0.0.14.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { MarkdownProcessor, codeBlocks } = require('./helpers');

const { parseHighlightedLines, parseInfo } = codeBlocks;

const render = (source) =>
  new MarkdownProcessor({ enableSyntaxHighlighting: true, showCodeHeader: true }).render(source);

const calledLines = (html) =>
  [...html.matchAll(/strata-code-line( strata-code-line--called)?"/g)]
    .map((match, index) => (match[1] ? index + 1 : 0))
    .filter(Boolean);

test('single lines, ranges and both together', () => {
  assert.deepEqual(parseHighlightedLines('js {2}'), [2]);
  assert.deepEqual(parseHighlightedLines('js {2,5}'), [2, 5]);
  assert.deepEqual(parseHighlightedLines('js {4-6}'), [4, 5, 6]);
  assert.deepEqual(parseHighlightedLines('js {2,4-6}'), [2, 4, 5, 6]);
});

test('spacing and repeats do not change the answer', () => {
  assert.deepEqual(parseHighlightedLines('js { 2 , 4 - 6 }'), [2, 4, 5, 6]);
  assert.deepEqual(parseHighlightedLines('js {2,2,2}'), [2]);
});

test('a range written backwards is a slip, not a request for nothing', () => {
  assert.deepEqual(parseHighlightedLines('js {6-4}'), [4, 5, 6]);
});

test('a fence with no spec asks for nothing', () => {
  assert.deepEqual(parseHighlightedLines('js'), []);
  assert.deepEqual(parseHighlightedLines(''), []);
});

test('the language survives a spec, and a spec alone is not a language', () => {
  assert.equal(parseInfo('js {2}').lang, 'js');
  assert.equal(parseInfo('{2}').lang, '', '{2} is not a language');
});

test('the existing fence flags still work alongside one', () => {
  const parsed = parseInfo('python {3} wrap numbers');
  assert.equal(parsed.lang, 'python');
  assert.equal(parsed.wrap, true);
  assert.equal(parsed.lineNumbers, true);
  assert.deepEqual(parsed.highlight, [3]);
});

/*
 * markdown-it-attrs uses the same braces. It read {2,4-6} as an attribute
 * list, found nothing it allows in it, and removed it from the info string
 * before the fence renderer ever saw it, so the whole feature silently did
 * nothing while every unit test on the parser passed.
 */
test('the spec survives the attributes plugin', () => {
  const html = render('```js {2,4-6}\na\nb\nc\nd\ne\nf\n```');
  assert.deepEqual(calledLines(html), [2, 4, 5, 6]);
});

test('the language is not eaten along with the spec', () => {
  const html = render('```js {2}\na\nb\n```');
  assert.match(html, /data-lang="js"/);
  assert.match(html, /strata-code-lang">JavaScript/);
});

test('a block with nothing called out is not dimmed', () => {
  assert.doesNotMatch(render('```js\na\nb\n```'), /strata-code--calling/);
  assert.match(render('```js {1}\na\nb\n```'), /strata-code--calling/);
});

test('a line past the end of the block matches nothing', () => {
  const html = render('```js {9}\na\nb\n```');
  assert.deepEqual(calledLines(html), []);
});
