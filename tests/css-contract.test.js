/**
 * .SYNOPSIS
 * The file handed to a language model still describes the stylesheets it was
 * generated from.
 *
 * .DESCRIPTION
 * docs/css-for-an-llm.md is generated, and a generated file that nobody
 * regenerates is the worst kind of documentation: it reads as authoritative
 * and is wrong. The failure it causes is specific, too. A model given a token
 * that no longer exists writes var(--gone), which is valid CSS that resolves
 * to nothing, so the document renders unstyled with no error anywhere to
 * explain it.
 *
 * So this compares the file to the stylesheets rather than to a copy of the
 * list. A token added to a theme, renamed, or removed fails here until the
 * generator has been run.
 *
 * .USAGE
 *   npm test                                every test
 *   node --test tests/css-contract.test.js  this one
 *
 *   node scripts/build-css-contract.js      what to run when this fails
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  scripts/build-css-contract.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { grouped, OUT } = require('../scripts/build-css-contract');

const guide = fs.readFileSync(OUT, 'utf8');
const tokens = grouped();

/** Every token name the file names, in the order it names them. */
const named = [...guide.matchAll(/^(--strata-[a-z0-9-]+)$/gm)].map((match) => match[1]);

const REGENERATE = 'run `node scripts/build-css-contract.js`';

test('the file names every token the stylesheets declare', () => {
  const expected = tokens.everyTheme
    .concat(tokens.someThemes.map((entry) => entry.token))
    .concat(tokens.structural);
  const missing = expected.filter((token) => guide.indexOf(token) === -1);

  assert.deepEqual(missing, [],
    `these are in the stylesheets and not in the file: ${REGENERATE}`);
});

test('and names nothing the stylesheets do not', () => {
  /* The direction that matters most: a name here that no longer exists is one
     a model will write into var(), where it resolves to nothing at all. */
  const declared = new Set(tokens.everyTheme
    .concat(tokens.someThemes.map((entry) => entry.token))
    .concat(tokens.structural));
  const invented = named.filter((token) => !declared.has(token));

  assert.deepEqual(invented, [],
    `these are in the file and not in any stylesheet: ${REGENERATE}`);
});

test('the colour tokens are listed apart from the ones that do not follow', () => {
  /* The grouping is the advice. A token that does not change with the theme,
     listed among the ones that do, is a document that stops following the
     reader for a reason nobody can see. */
  const colours = guide.split('## Colour tokens')[1].split('##')[0];
  const fixed = guide.split('## Tokens that do not change with the theme')[1];

  assert.ok(tokens.everyTheme.every((token) => colours.indexOf(token) !== -1),
    `a colour token is not in the colour list: ${REGENERATE}`);
  assert.ok(tokens.structural.every((token) => fixed.indexOf(token) !== -1),
    `a fixed token is not in the fixed list: ${REGENERATE}`);
});

test('a token only some themes declare is called out rather than hidden', () => {
  /* Such a token follows the reader in some themes and falls back in the
     rest, which is worth a warning and is currently true of one of them. */
  if (tokens.someThemes.length === 0) {
    assert.match(guide, /Every colour token is declared by all three themes/,
      `no gaps, so the file should say so: ${REGENERATE}`);
    return;
  }
  for (const entry of tokens.someThemes) {
    assert.match(guide, new RegExp(`\`${entry.token}\`\\s*-\\s*only`),
      `${entry.token} is declared by some themes only and the file does not say so:`
      + ` ${REGENERATE}`);
  }
});

test('the rules a model cannot guess are all in it', () => {
  /* The half that is not generated. Each of these is a rule that, left out,
     produces CSS that looks right and is wrong: in the dark, in a frame, or
     the moment it is scoped. */
  for (const rule of [
    'prefers-color-scheme',        // the wrong question here
    'data-strata-mode',           // the right one
    '@import',                    // dropped by the scoper
    '<style>',                    // kept, unlike what the sanitiser would do
    'sharepoint.com'              // the iframe allowlist
  ]) {
    assert.ok(guide.indexOf(rule) !== -1, `the file does not mention ${rule}`);
  }
});

test('it says which render modes there are, and there are three', () => {
  for (const mode of ['Inline', 'Shadow DOM', 'Frame']) {
    assert.ok(guide.indexOf(mode) !== -1, `the file does not mention ${mode}`);
  }
});

test('no em dashes, since this ships as prose', () => {
  const found = /—|&mdash;|&#8212;/.exec(guide);
  assert.equal(found, null, `an em dash reached the file at ${found ? found.index : 0}`);
});
