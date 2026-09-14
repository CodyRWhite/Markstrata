const test = require('node:test');
const assert = require('node:assert/strict');
const { readingTime } = require('./helpers');

const { countWords, readingMinutes, readingTimeLabel, WORDS_PER_MINUTE } = readingTime;

/*
 * The arithmetic is here; pulling the prose out of a rendered document is a
 * DOM question and is checked in the browser instead.
 */

test('words are counted on whitespace', () => {
  assert.equal(countWords('one two three'), 3);
  assert.equal(countWords('  spaced   out \n across lines '), 4);
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
});

test('a hyphenated term or a path counts once, because it reads once', () => {
  assert.equal(countWords('well-known'), 1);
  assert.equal(countWords('/sites/team/docs/readme.md'), 1);
  /* A space is a space wherever it falls: a path containing one is two things
     to read, and counting it as one would be the odd answer. */
  assert.equal(countWords('/sites/team/Shared Documents/readme.md'), 2);
});

test('a document with something in it always takes at least a minute', () => {
  assert.equal(readingMinutes(1), 1, 'rounding to zero would say a document is not there');
  assert.equal(readingMinutes(0), 0);
});

test('minutes follow the reading rate', () => {
  assert.equal(readingMinutes(WORDS_PER_MINUTE * 3), 3);
  assert.equal(readingMinutes(WORDS_PER_MINUTE * 10), 10);
});

test('an empty document says nothing rather than "0 min read"', () => {
  assert.equal(readingTimeLabel(0), '');
  assert.equal(readingTimeLabel(WORDS_PER_MINUTE * 2), '2 min read');
});
