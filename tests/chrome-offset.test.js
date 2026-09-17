/**
 * .SYNOPSIS
 * How far down the page a heading has to land to clear what is above it.
 *
 * .DESCRIPTION
 * Two things can be above a heading and they are found in different places.
 * The page's own bars are outside the web part and are measured by walking
 * the page; the toolbar is inside it, and is only in the way when the author
 * has asked for it to be stuck there.
 *
 * Only the arithmetic is here. Measuring is layout, and jsdom has none, so a
 * test written against elements would be adding zero to zero and reporting
 * that it passed - which is worse than no test, because it reads as though
 * something was checked.
 *
 * .USAGE
 *   npm test                                 every test
 *   node --test tests/chrome-offset.test.js  this one
 *
 * .NOTES
 * Since:     0.0.20.3
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { chromeOffset } = require('./helpers');

const { landingOffset } = chromeOffset;

test('with nothing above it, a heading still gets breathing room', () => {
  /* Against the top of the window reads as scrolling too far, even when
     nothing is covering it. */
  assert.ok(landingOffset(0, 0) > 0);
});

test('a page bar is cleared', () => {
  assert.equal(landingOffset(48, 0) - landingOffset(0, 0), 48);
});

test('a sticky toolbar is cleared as well', () => {
  /* The bug this exists to prevent: the offset accounts for the page's bars,
     the toolbar is stuck under them, and the heading lands behind the
     toolbar. Both are above the heading, so both count. */
  assert.equal(landingOffset(48, 37) - landingOffset(48, 0), 37);
});

test('the two add up rather than the larger one winning', () => {
  assert.equal(landingOffset(48, 37), landingOffset(0, 0) + 48 + 37);
});

test('a toolbar that is not stuck is not in the way', () => {
  /* stickyToolbarHeight answers zero for a toolbar in the flow, so this is
     the same page with the setting off. */
  assert.equal(landingOffset(48, 0), landingOffset(48, 0));
  assert.ok(landingOffset(48, 0) < landingOffset(48, 37));
});
