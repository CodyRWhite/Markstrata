/**
 * .SYNOPSIS
 * The arithmetic behind zooming and panning a picture.
 *
 * .DESCRIPTION
 * Three rules decide whether a zoomed picture behaves or fights the reader,
 * and all three are sums rather than DOM: how far in it may go, how far it may
 * be dragged before it leaves, and where it has to move so that the point
 * under the pointer stays under the pointer.
 *
 * Only those are here. The gestures need a browser with real pointers and a
 * real layout, and the harness drives them there; a jsdom test of a pinch
 * would be asserting that two numbers this file already tests still add up.
 *
 * .USAGE
 *   npm test                                every test
 *   node --test tests/picture-zoom.test.js  this one
 *
 * .NOTES
 * Since:     0.0.20.3
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { pictureZoom } = require('./helpers');

const { clampPan, clampScale, panAfterZoom } = pictureZoom;

/* ------------------------------------------------------------ how far in */

test('a picture opens at fit and cannot go smaller', () => {
  /* Zooming out past fit would leave the picture adrift in a dark frame,
     smaller than the overlay opened it at, which is nobody's intent. */
  assert.equal(clampScale(1), 1);
  assert.equal(clampScale(0.5), 1);
  assert.equal(clampScale(-3), 1);
});

test('and there is a point past which it is pixels rather than detail', () => {
  assert.equal(clampScale(8), 8);
  assert.equal(clampScale(40), 8);
});

test('between the two it is left alone', () => {
  assert.equal(clampScale(2.25), 2.25);
});

/* --------------------------------------------------------- how far across */

test('a picture that fits its window has nowhere to be panned to', () => {
  /* Dragging one that already fits would move it off centre for no reason and
     leave the reader to put it back. */
  assert.equal(clampPan(200, 400, 800, 1), 0);
  assert.equal(clampPan(-200, 400, 800, 1), 0);
});

test('one larger than its window may be moved by what hangs over the edge', () => {
  /* 800 wide at 2x is 1600 in a 800 window, so 400 either way puts an edge
     against the middle. */
  assert.equal(clampPan(1000, 800, 800, 2), 400);
  assert.equal(clampPan(-1000, 800, 800, 2), -400);
  assert.equal(clampPan(100, 800, 800, 2), 100);
});

test('so half of it is always over the window somewhere', () => {
  /* The failure this prevents: a drag that throws the picture off the side and
     leaves an empty frame, with the way back a button the reader now has to
     find. */
  const scale = 4;
  const picture = 600;
  const window = 500;
  const furthest = clampPan(Number.MAX_SAFE_INTEGER, picture, window, scale);
  assert.ok(furthest < (picture * scale) / 2,
    'the picture can be dragged until none of it is over the window');
});

/* ------------------------------------------------- what stays under the pointer */

test('zooming about the middle moves nothing', () => {
  assert.equal(panAfterZoom(0, 0, 1, 2), 0);
});

test('zooming toward a point pulls that point back to where it was', () => {
  /* A reader points at the thing they want bigger. Zooming about the middle
     instead walks it off the screen and makes them chase it. */
  const pointer = 100;
  const after = panAfterZoom(0, pointer, 1, 2);
  /* The point was 100 from the middle at 1x, so it is 200 from the middle at
     2x; the picture has to come back 100 for it to be under the pointer. */
  assert.equal(after, -100);
});

test('and zooming out pushes it back the same way', () => {
  assert.equal(panAfterZoom(-100, 100, 2, 1), 0);
});

test('a zoom and its undo leave the picture where it started', () => {
  const pointer = 37;
  const half = panAfterZoom(12, pointer, 1, 2.5);
  assert.ok(Math.abs(panAfterZoom(half, pointer, 2.5, 1) - 12) < 1e-9);
});
