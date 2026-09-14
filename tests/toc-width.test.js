const test = require('node:test');
const assert = require('node:assert/strict');
const { tocWidth } = require('./helpers');

const { tocWidthCss, tocWidthForUnit, TOC_WIDTH_RANGES } = tocWidth;

test('auto is a mode, not a length', () => {
  assert.equal(tocWidthCss('auto', 'em', 15), 'auto');
  assert.equal(tocWidthCss('auto', 'px', 9999), 'auto');
});

test('a fixed width carries its unit', () => {
  assert.equal(tocWidthCss('fixed', 'em', 15), '15em');
  assert.equal(tocWidthCss('fixed', '%', 22), '22%');
  assert.equal(tocWidthCss('fixed', 'px', 300), '300px');
  assert.equal(tocWidthCss('fixed', 'vw', 16), '16vw');
});

/*
 * The number survives a change of unit and arrives from a text box that will
 * accept anything, so neither is trusted: 240 is a fine px sidebar and an
 * absurd em one.
 */
test('a width is clamped to what its unit can sensibly mean', () => {
  assert.equal(tocWidthCss('fixed', 'em', 240), `${TOC_WIDTH_RANGES.em.max}em`);
  assert.equal(tocWidthCss('fixed', 'px', 2), `${TOC_WIDTH_RANGES.px.min}px`);
  assert.equal(tocWidthCss('fixed', '%', 300), `${TOC_WIDTH_RANGES['%'].max}%`);
});

test('a fraction is rounded rather than passed through', () => {
  assert.equal(tocWidthCss('fixed', 'em', 15.6), '16em');
});

test('switching unit keeps a number that still makes sense, replaces one that does not', () => {
  assert.equal(tocWidthForUnit('px', 240), 240, '240 is a reasonable px width');
  assert.equal(tocWidthForUnit('em', 240), TOC_WIDTH_RANGES.em.fallback,
    '240em would be wider than any page');
  assert.equal(tocWidthForUnit('%', 22), 22);
});

test('an unknown unit falls back rather than emitting nonsense', () => {
  assert.equal(tocWidthCss('fixed', 'parsecs', 12), 'auto');
});
