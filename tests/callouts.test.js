/**
 * .SYNOPSIS
 * What a callout is made of: the three syntaxes that mean one thing, the
 * markup they render to, and the icon that goes with each type.
 *
 * .USAGE
 *   npm test                             every test
 *   node --test tests/callouts.test.js   this one
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { MarkdownProcessor } = require('./helpers');

const markdown = new MarkdownProcessor();

test('GitHub alert syntax becomes a callout', () => {
  const html = markdown.render('> [!NOTE]\n> Something worth knowing.');
  assert.match(html, /<div class="strata-callout" data-callout="note">/);
  assert.match(html, /<span class="strata-callout-title-text">Note<\/span>/);
  assert.match(html, /Something worth knowing\./);
  assert.doesNotMatch(html, /\[!NOTE\]/);
});

test('all five GitHub alert types resolve', () => {
  ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'].forEach((type) => {
    const html = markdown.render(`> [!${type}]\n> body`);
    assert.match(html, new RegExp(`data-callout="${type.toLowerCase()}"`), `${type} should render`);
  });
});

test('Obsidian syntax keeps a custom title', () => {
  const html = markdown.render('> [!tip] Try this instead\n> body text');
  assert.match(html, /data-callout="tip"/);
  assert.match(html, /<span class="strata-callout-title-text">Try this instead<\/span>/);
});

test('aliases map to their canonical type', () => {
  assert.match(markdown.render('> [!summary]\n> x'), /data-callout="abstract"/);
  assert.match(markdown.render('> [!error]\n> x'), /data-callout="danger"/);
  assert.match(markdown.render('> [!faq]\n> x'), /data-callout="question"/);
});

test('foldable callouts render as details, - closed and + open', () => {
  const closed = markdown.render('> [!warning]- Hidden\n> body');
  assert.match(closed, /<details class="strata-callout strata-callout--foldable" data-callout="warning">/);
  assert.doesNotMatch(closed, /<details[^>]* open>/);
  assert.match(closed, /<\/details>/);

  const open = markdown.render('> [!warning]+ Shown\n> body');
  assert.match(open, /<details[^>]* open>/);
});

test('an unknown type stays an ordinary blockquote', () => {
  const html = markdown.render('> [!notathing]\n> body');
  assert.match(html, /<blockquote>/);
  assert.doesNotMatch(html, /strata-callout/);
});

test('a plain blockquote is left alone', () => {
  const html = markdown.render('> just a quote');
  assert.match(html, /<blockquote>/);
  assert.doesNotMatch(html, /strata-callout/);
});

test('Wiki.js classes still render as callouts', () => {
  const html = markdown.render('> legacy content\n{.is-info}');
  assert.match(html, /data-callout="info"/);
  assert.match(html, /legacy content/);
});

test('a title-only callout leaves no empty paragraph', () => {
  const html = markdown.render('> [!note] Just a heading');
  assert.match(html, /<div class="strata-callout-content"><\/div>/);
});

test('callouts carry nested block content', () => {
  const html = markdown.render('> [!bug] Broken\n>\n> - one\n> - two\n>\n> ```js\n> go();\n> ```');
  assert.match(html, /<ul>/);
  assert.match(html, /strata-code/);
});

test('callout titles are escaped, not injected', () => {
  const html = markdown.render('> [!note] <img src=x onerror=alert(1)>\n> body');
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});
