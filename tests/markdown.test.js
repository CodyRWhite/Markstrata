const test = require('node:test');
const assert = require('node:assert/strict');
const { MarkdownProcessor } = require('./helpers');

const md = new MarkdownProcessor();

test('two adjacent tables stay two tables', () => {
  const html = md.render('| a | b |\n|---|---|\n| 1 | 2 |\n\n| c | d |\n|---|---|\n| 3 | 4 |');
  assert.equal((html.match(/<table>/g) || []).length, 2);
  assert.equal((html.match(/mdf-table-scroll/g) || []).length, 2);
});

test('tables are wrapped so wide ones scroll instead of stretching the page', () => {
  const html = md.render('| a |\n|---|\n| 1 |');
  assert.match(html, /<div class="mdf-table-scroll"><table>/);
  assert.match(html, /<\/table>\s*<\/div>/);
});

test('multimd table extensions still work on markdown-it 15', () => {
  // colspan: a cell followed by an empty one merges.
  const html = md.render('| a | b | c |\n|---|---|---|\n| spans two || third |');
  assert.match(html, /colspan="2"/);
});

test('column alignment is honoured', () => {
  const html = md.render('| l | c | r |\n|:--|:-:|--:|\n| 1 | 2 | 3 |');
  assert.match(html, /text-align:center/);
  assert.match(html, /text-align:right/);
});

test('task lists render checkboxes and mark their state', () => {
  const html = md.render('- [ ] todo\n- [x] done');
  assert.match(html, /class="mdf-task-list"/);
  assert.equal((html.match(/mdf-task-checkbox/g) || []).length, 2);
  assert.match(html, /data-checked="false"[^>]*>.*todo/s);
  assert.match(html, /<input class="mdf-task-checkbox" type="checkbox" disabled checked \/>/);
  assert.doesNotMatch(html, /\[x\]/);
});

test('a list mixing tasks and plain bullets keeps the plain markers', () => {
  const html = md.render('- plain item\n- [x] task item');
  const items = html.match(/<li[^>]*>/g) || [];
  assert.equal(items.length, 2);
  assert.equal(items.filter((item) => item.indexOf('mdf-task-item') !== -1).length, 1);
});

test('inline math renders but prices do not', () => {
  const math = md.render('The identity $E = mc^2$ holds.');
  assert.match(math, /katex/);

  const prices = md.render('It costs $5 and then $10 later.');
  assert.doesNotMatch(prices, /katex/);
  assert.match(prices, /\$5 and then \$10/);
});

test('block math renders in its own container', () => {
  const html = md.render('$$\n\\int_0^1 x^2 dx\n$$');
  assert.match(html, /<div class="mdf-math-block">/);
  assert.match(html, /katex/);
});

test('math can be switched off', () => {
  const noMath = new MarkdownProcessor({ enableMath: false });
  const html = noMath.render('$E = mc^2$');
  assert.doesNotMatch(html, /katex/);
});

test('mermaid fences become a diagram container with arrows intact', () => {
  const html = md.render('```mermaid\ngraph LR\nA-->B\n```');
  assert.match(html, /<div class="mdf-mermaid" data-mermaid-container="true">/);
  // The source must survive as escaped text: reading it back with textContent
  // has to give "A-->B" again, which is what broke diagrams on refresh.
  assert.match(html, /A--&gt;B/);
  assert.doesNotMatch(html, /A--&amp;gt;B/);
});

test('mermaid fences are left as code when diagrams are off', () => {
  const off = new MarkdownProcessor({ enableMermaid: false });
  const html = off.render('```mermaid\ngraph LR\nA-->B\n```');
  assert.doesNotMatch(html, /mdf-mermaid/);
  assert.match(html, /mdf-code/);
});

test('the inline table of contents is not left inside a paragraph', () => {
  const html = md.render('# Title\n\n[[toc]]\n\n## One\n\n## Two');
  assert.match(html, /<div class="mdf-toc">/);
  assert.doesNotMatch(html, /<p>\s*<div class="mdf-toc">/);
  assert.doesNotMatch(html, /<p><\/p>/);
});

test('headings get ids and anchors', () => {
  const html = md.render('## A heading here');
  assert.match(html, /<h2 id="a-heading-here">/);
  assert.match(html, /class="mdf-anchor" href="#a-heading-here"/);
  // The anchor must not leak a stray space into the heading text.
  assert.doesNotMatch(html, />\s+A heading here/);
});

test('anchors can be switched off', () => {
  const plain = new MarkdownProcessor({ enableAnchors: false });
  const html = plain.render('## Heading');
  assert.match(html, /id="heading"/);
  assert.doesNotMatch(html, /mdf-anchor/);
});

test('raw HTML is escaped by default and rendered when allowed', () => {
  assert.match(md.render('<b onclick="x()">hi</b>'), /&lt;b/);
  const permissive = new MarkdownProcessor({ allowHtml: true });
  assert.match(permissive.render('<b>hi</b>'), /<b>hi<\/b>/);
});

test('highlighted text renders as a mark element', () => {
  assert.match(md.render('some ==important== text'), /<mark>important<\/mark>/);
});

test('footnotes, definition lists, sub and sup all load', () => {
  assert.match(md.render('text[^1]\n\n[^1]: note'), /class="footnotes/);
  assert.match(md.render('Term\n: definition'), /<dl>/);
  assert.match(md.render('H~2~O'), /<sub>2<\/sub>/);
  assert.match(md.render('x^2^'), /<sup>2<\/sup>/);
});

test('rendering never throws on malformed input', () => {
  ['', '   ', '```\nunclosed', '| broken |\n|---', '> [!', '$$', '~~~'].forEach((input) => {
    assert.doesNotThrow(() => md.render(input), `input: ${JSON.stringify(input)}`);
  });
});

test('options can be changed after construction', () => {
  const processor = new MarkdownProcessor({ showLineNumbers: false });
  assert.doesNotMatch(processor.render('```js\nx\n```'), /mdf-code--numbered/);
  processor.updateOptions({ showLineNumbers: true });
  assert.match(processor.render('```js\nx\n```'), /mdf-code--numbered/);
});
