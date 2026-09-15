/**
 * .SYNOPSIS
 * The syntax page is built through the real pipeline, so it cannot claim a
 * feature that has stopped working.
 *
 * .USAGE
 *   npm test                                every test
 *   node --test tests/syntax-page.test.js   this one
 *
 * .NOTES
 * Since:     0.0.14.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MarkdownProcessor } = require('./helpers');

/*
 * The syntax page lists everything the web part renders, with the markdown you
 * write beside what it turns into, and it is built through the same pipeline
 * as a real page. That is the point of it: an example that has stopped working
 * stops working here in public.
 *
 * So it is rendered and checked, the way the kitchen sink is. The two are not
 * the same document and neither replaces the other: the kitchen sink shows
 * every feature at once for judging a theme, this one shows how each is
 * written.
 */
const source = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'site', 'syntax.md'), 'utf8'
);
const html = new MarkdownProcessor({
  imageBasePath: '/sites/x/docs',
  enableMath: true,
  enableMermaid: true,
  enableAnchors: true,
  enableToc: true,
  enableWikiLinks: true,
  /* The site builds these pages with raw HTML allowed, which is what lets the
     page show a <kbd> key, so the check has to render them the same way. */
  allowHtml: true
}).render(source);

/* Things the page demonstrates rather than only describes. */
const SHOWN = {
  'bold': /<strong>/,
  'italic': /<em>/,
  'strikethrough': /<s>|<del>/,
  'inline code': /<code>/,
  'highlighted text': /<mark>/,
  'subscript': /<sub>/,
  'superscript': /<sup>/,
  'a keyboard key': /<kbd>/,
  'an emoji': /\u{1F680}/u,
  'a table': /<table/,
  'a code block': /strata-code/,
  'a bare address turned into a link': /href="https:\/\/example\.com/,
  'a contents': /strata-toc/
};

Object.keys(SHOWN).forEach((feature) => {
  test(`the syntax page shows ${feature}`, () => {
    assert.match(html, SHOWN[feature]);
  });
});

/*
 * Every setting the page names has to be a setting that exists, or the page is
 * telling someone to look for a control that is not in the pane.
 */
test('every setting the page names exists in the pane', () => {
  const strings = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'webparts', 'markstrata', 'loc', 'en-us.js'), 'utf8'
  );
  const labels = [...strings.matchAll(/^ {4}"[A-Za-z]+": "((?:[^"\\]|\\.)*)"/gm)]
    .map((match) => JSON.parse(`"${match[1]}"`));

  /* Bold runs that look like a pane label: capitalised, a few words, no
     sentence punctuation. */
  const named = [...new Set([...source.matchAll(/\*\*([A-Z][^*]{2,60})\*\*/g)]
    .map((match) => match[1].trim())
    .filter((text) => !/[.,:;?]$/.test(text)))];

  const unknown = named.filter((text) => labels.indexOf(text) === -1);
  assert.deepEqual(unknown, [],
    'the syntax page names a setting the property pane does not have');
});
