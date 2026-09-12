const test = require('node:test');
const assert = require('node:assert/strict');
const { MarkdownProcessor } = require('./helpers');

const md = new MarkdownProcessor();

test('GitHub alert syntax becomes a callout', () => {
  const html = md.render('> [!NOTE]\n> Something worth knowing.');
  assert.match(html, /<div class="ink-callout" data-callout="note">/);
  assert.match(html, /<span class="ink-callout-title-text">Note<\/span>/);
  assert.match(html, /Something worth knowing\./);
  assert.doesNotMatch(html, /\[!NOTE\]/);
});

test('all five GitHub alert types resolve', () => {
  ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'].forEach((type) => {
    const html = md.render(`> [!${type}]\n> body`);
    assert.match(html, new RegExp(`data-callout="${type.toLowerCase()}"`), `${type} should render`);
  });
});

test('Obsidian syntax keeps a custom title', () => {
  const html = md.render('> [!tip] Try this instead\n> body text');
  assert.match(html, /data-callout="tip"/);
  assert.match(html, /<span class="ink-callout-title-text">Try this instead<\/span>/);
});

test('aliases map to their canonical type', () => {
  assert.match(md.render('> [!summary]\n> x'), /data-callout="abstract"/);
  assert.match(md.render('> [!error]\n> x'), /data-callout="danger"/);
  assert.match(md.render('> [!faq]\n> x'), /data-callout="question"/);
});

test('foldable callouts render as details, - closed and + open', () => {
  const closed = md.render('> [!warning]- Hidden\n> body');
  assert.match(closed, /<details class="ink-callout ink-callout--foldable" data-callout="warning">/);
  assert.doesNotMatch(closed, /<details[^>]* open>/);
  assert.match(closed, /<\/details>/);

  const open = md.render('> [!warning]+ Shown\n> body');
  assert.match(open, /<details[^>]* open>/);
});

test('an unknown type stays an ordinary blockquote', () => {
  const html = md.render('> [!notathing]\n> body');
  assert.match(html, /<blockquote>/);
  assert.doesNotMatch(html, /ink-callout/);
});

test('a plain blockquote is left alone', () => {
  const html = md.render('> just a quote');
  assert.match(html, /<blockquote>/);
  assert.doesNotMatch(html, /ink-callout/);
});

test('Wiki.js classes still render as callouts', () => {
  const html = md.render('> legacy content\n{.is-info}');
  assert.match(html, /data-callout="info"/);
  assert.match(html, /legacy content/);
});

test('a title-only callout leaves no empty paragraph', () => {
  const html = md.render('> [!note] Just a heading');
  assert.match(html, /<div class="ink-callout-content"><\/div>/);
});

test('callouts carry nested block content', () => {
  const html = md.render('> [!bug] Broken\n>\n> - one\n> - two\n>\n> ```js\n> go();\n> ```');
  assert.match(html, /<ul>/);
  assert.match(html, /ink-code/);
});

test('callout titles are escaped, not injected', () => {
  const html = md.render('> [!note] <img src=x onerror=alert(1)>\n> body');
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});
