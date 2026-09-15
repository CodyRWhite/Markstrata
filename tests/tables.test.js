const test = require('node:test');
const assert = require('node:assert/strict');
const { tables } = require('./helpers');

const { asNumber, asTime, columnKind, compareCells, sortedOrder } = tables;

/*
 * Reading a column is the whole of sorting a markdown table: every cell is
 * text, so what a column holds has to be worked out from the column. The DOM
 * side - which table can be sorted at all, and what a click does to it - is a
 * browser question and is driven there.
 */

test('a number written for a person is still a number', () => {
  assert.equal(asNumber('42'), 42);
  assert.equal(asNumber('-3.5'), -3.5);
  assert.equal(asNumber('.5'), 0.5);
  assert.equal(asNumber('1,234'), 1234);
  assert.equal(asNumber('1 234 567'), 1234567);
  assert.equal(asNumber('$1,200.00'), 1200);
  assert.equal(asNumber('-$40'), -40);
  assert.equal(asNumber('£99'), 99);
  assert.equal(asNumber('12%'), 12);
  assert.equal(asNumber('  7  '), 7);
});

test('things that merely contain digits are not numbers', () => {
  assert.equal(asNumber('4 GB'), undefined);
  assert.equal(asNumber('v2'), undefined);
  assert.equal(asNumber('1-2'), undefined);
  assert.equal(asNumber('n/a'), undefined);
  assert.equal(asNumber(''), undefined);
  assert.equal(asNumber('1.2.3'), undefined);
});

test('only dates that mean one thing to everybody are dates', () => {
  assert.equal(typeof asTime('2024-03-01'), 'number');
  assert.equal(typeof asTime('2024-03-01T09:30:00Z'), 'number');
  assert.equal(typeof asTime('1 March 2024'), 'number');
  assert.equal(typeof asTime('March 1, 2024'), 'number');

  /* The reason for the whole rule: this is the second of January to Date.parse
     and the first of February to half the world, and sorting a column of them
     by the wrong one is a confident wrong answer. */
  assert.equal(asTime('01/02/2024'), undefined);
  /* Date.parse takes this and hands back the fifth of May. */
  assert.equal(asTime('5'), undefined);
  assert.equal(asTime('1 Foobar 2024'), undefined);
});

test('a column is only what every filled cell in it is', () => {
  assert.equal(columnKind(['1', '2', '30']), 'number');
  assert.equal(columnKind(['1', '', '30']), 'number');
  assert.equal(columnKind(['2024-01-01', '2023-12-31']), 'date');
  assert.equal(columnKind(['Alpha', 'Beta']), 'text');
  /* One "n/a" among the numbers makes it text, rather than a guess about
     where the odd one out belongs. */
  assert.equal(columnKind(['1', 'n/a', '30']), 'text');
  assert.equal(columnKind(['', '  ']), 'text');
});

test('numbers compare as numbers, not as the text they were written as', () => {
  /* Text collation already reads a run of digits as a number, so whole numbers
     come out right either way. What it cannot read is everything around them,
     and that is what this is for: a decimal point is a separator to it, so
     0.25 sorts after 0.5 on the 25, and a thousands separator ends the run, so
     1,200 sorts before 999 on the 1. */
  assert.ok(compareCells('0.5', '0.25', 'number') > 0);
  assert.ok(compareCells('0.5', '0.25', 'text') < 0);

  assert.ok(compareCells('1,200', '999', 'number') > 0);
  assert.ok(compareCells('1,200', '999', 'text') < 0);

  assert.ok(compareCells('-3', '2', 'number') < 0);
  assert.ok(compareCells('$9', '$10', 'number') < 0);
});

test('text compares naturally, so item 2 comes before item 10', () => {
  assert.ok(compareCells('item 2', 'item 10', 'text') < 0);
  assert.ok(compareCells('alpha', 'Beta', 'text') < 0);
});

test('a sort keeps the order the document had for rows that tie', () => {
  const rows = [
    { value: 'b', index: 0 },
    { value: 'a', index: 1 },
    { value: 'b', index: 2 },
    { value: 'a', index: 3 }
  ];
  assert.deepEqual(sortedOrder(rows, 'text', false), [1, 3, 0, 2]);
  /* Descending reverses the comparison, not the tie-break: the two b rows are
     still in the order the author wrote them. */
  assert.deepEqual(sortedOrder(rows, 'text', true), [0, 2, 1, 3]);
});

test('empty cells sit at the end whichever way the column is sorted', () => {
  const rows = [
    { value: '', index: 0 },
    { value: '2', index: 1 },
    { value: '   ', index: 2 },
    { value: '1', index: 3 }
  ];
  assert.deepEqual(sortedOrder(rows, 'number', false), [3, 1, 0, 2]);
  assert.deepEqual(sortedOrder(rows, 'number', true), [1, 3, 0, 2]);
});

test('dates sort by when they are, not by how they are written', () => {
  const rows = [
    { value: '2024-03-01', index: 0 },
    { value: '1 January 2024', index: 1 },
    { value: 'February 2, 2024', index: 2 }
  ];
  assert.deepEqual(sortedOrder(rows, 'date', false), [1, 2, 0]);
});
