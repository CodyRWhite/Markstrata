/**
 * .SYNOPSIS
 * The pipeline end to end: every syntax the processor claims to render,
 * rendered.
 *
 * .USAGE
 *   npm test                             every test
 *   node --test tests/markdown.test.js   this one
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

test('two adjacent tables stay two tables', () => {
  const html = markdown.render('| a | b |\n|---|---|\n| 1 | 2 |\n\n| c | d |\n|---|---|\n| 3 | 4 |');
  assert.equal((html.match(/<table>/g) || []).length, 2);
  assert.equal((html.match(/strata-table-scroll/g) || []).length, 2);
});

test('tables are wrapped so wide ones scroll instead of stretching the page', () => {
  const html = markdown.render('| a |\n|---|\n| 1 |');
  assert.match(html, /<div class="strata-table-scroll"><table>/);
  assert.match(html, /<\/table>\s*<\/div>/);
});

test('multimd table extensions still work on markdown-it 15', () => {
  // colspan: a cell followed by an empty one merges.
  const html = markdown.render('| a | b | c |\n|---|---|---|\n| spans two || third |');
  assert.match(html, /colspan="2"/);
});

/*
 * markdown-it-multimd-table reads a bracketed line beside a table as its
 * caption, and it used to try that before it tried reading the line as a row.
 * A row of wiki links or of bracketed cells was swallowed whole: the caption
 * appeared, the row did not, and nothing on the page said a row had been lost.
 */
/*
 * markdown-it-attrs reads a brace group at the end of a block as an attribute
 * list, and it used to take the braces before looking at what was in them:
 * what it could not use it dropped, and the text went with it. A shell
 * variable, a LaTeX environment and a template placeholder all end a line in
 * braces, and all three were being deleted without a word.
 */
test('a trailing brace group that is not attributes stays on the page', () => {
  assert.match(markdown.render('- The shell uses ${HOME}'), /<li>The shell uses \$\{HOME\}<\/li>/);
  assert.match(markdown.render('# Config {env}'), /Config \{env\}<\/h1>/);
  assert.match(
    markdown.render('| a | b |\n|---|---|\n| home | ${HOME} |'),
    /<td>\$\{HOME\}<\/td>/
  );
  assert.match(markdown.render('\\begin{align}\nx = 1\n\\end{align}'), /\\end\{align\}/);
  assert.match(markdown.render('{HOME}'), /<p>\{HOME\}<\/p>/);
});

test('a trailing brace group that is attributes is still read as attributes', () => {
  assert.match(markdown.render('text {.center}'), /<p class="center">text<\/p>/);
  assert.match(markdown.render('# Head {#custom}'), /<h1 id="custom"/);
  assert.match(markdown.render('- item {.red}'), /<li class="red">item<\/li>/);
  assert.match(markdown.render('# H {.a #b}'), /<h1 class="a" id="b"/);
  assert.match(markdown.render('item\n{.cls}'), /<p class="cls">item<\/p>/);
});

test('a row of bracketed cells stays a row instead of becoming a caption', () => {
  const html = markdown.render('A | B\n-- | --\n[x] | [y]');
  assert.match(html, /<tbody>/);
  assert.match(html, /<td>\[x\]<\/td>/);
  assert.match(html, /<td>\[y\]<\/td>/);
  assert.doesNotMatch(html, /<caption/);
});

test('a header row of wiki links is still a header row', () => {
  const wiki = new MarkdownProcessor({ enableWikiLinks: true });
  const html = wiki.render('[[Wiki]] | ![[Embed]]\n-- | --\na | b');
  assert.match(html, /<thead>/);
  assert.match(html, /<tbody>/);
  assert.match(html, /<td>a<\/td>/);
  assert.doesNotMatch(html, /<caption/);
});

/*
 * GitHub's own documentation of tables uses this table: a column of characters,
 * one of which is a backtick. The plugin reads a backtick as opening a code
 * span and ignores every pipe until the closing one, so a row with an odd
 * number of them ran to the end of the line as a single cell.
 */
test('a lone backtick in a cell does not swallow the rest of the row', () => {
  const html = markdown.render(
    '| Name     | Character |\n| ---      | ---       |\n| Backtick | ` |\n| Pipe     | \\| |'
  );
  assert.match(html, /<td>Backtick<\/td>\s*<td>`<\/td>/);
  assert.match(html, /<td>Pipe<\/td>\s*<td>\|<\/td>/);
});

test('a pipe inside a code span in a cell is written as the document wrote it', () => {
  /* The only escape a table cell has, and the backslash has to come off before
     the cell is read as markdown: a code span reads no escapes of its own. */
  const html = markdown.render('| a | b |\n|---|---|\n| b `\\|` az | x |');
  assert.match(html, /<code>\|<\/code>/);
});

test('a cell may still hold a pipe inside a closed code span', () => {
  const html = markdown.render('| a | b |\n|---|---|\n| `x|y` | z |');
  assert.match(html, /<code>x\|y<\/code>/);
  assert.match(html, /<td>z<\/td>/);
});

test('a row with the wrong number of cells is padded or trimmed to the table', () => {
  const html = markdown.render('| a | b |\n|---|---|\n| one |\n| 1 | 2 | 3 |');
  assert.match(html, /<tr>\s*<td>one<\/td>\s*<td><\/td>\s*<\/tr>/);
  assert.match(html, /<tr>\s*<td>1<\/td>\s*<td>2<\/td>\s*<\/tr>/);
  assert.doesNotMatch(html, /<td>3<\/td>/);
});

test('a padded cell is aligned the way its column is', () => {
  const html = markdown.render('| l | c | r |\n|:--|:-:|--:|\n| 1 |');
  assert.match(html, /<td style="text-align:center"><\/td>/);
  assert.match(html, /<td style="text-align:right"><\/td>/);
});

test('rowspan and colspan rows are left to the plugin that understands them', () => {
  const rowspan = markdown.render('| Service | Host |\n|---|---|\n| Orders | db01 |\n| ^^ | db02 |');
  assert.match(rowspan, /rowspan="2"/);
  assert.match(rowspan, /<td>db02<\/td>/);

  const colspan = markdown.render('| a | b | c |\n|---|---|---|\n| spans two || third |');
  assert.match(colspan, /colspan="2"/);
});

test('a caption that could not have been a row is still a caption', () => {
  const above = markdown.render('[Quarterly figures]\nA | B\n-- | --\na | b');
  assert.match(above, /<caption[^>]*>Quarterly figures<\/caption>/);
  assert.match(above, /<td>a<\/td>/);

  const below = markdown.render('A | B\n-- | --\na | b\n[Quarterly figures]');
  assert.match(below, /caption-side: bottom/);
  assert.match(below, /<td>a<\/td>/);
});

test('column alignment is honoured', () => {
  const html = markdown.render('| l | c | r |\n|:--|:-:|--:|\n| 1 | 2 | 3 |');
  assert.match(html, /text-align:center/);
  assert.match(html, /text-align:right/);
});

test('task lists render checkboxes and mark their state', () => {
  const html = markdown.render('- [ ] todo\n- [x] done');
  assert.match(html, /class="strata-task-list"/);
  assert.equal((html.match(/strata-task-checkbox/g) || []).length, 2);
  assert.match(html, /data-checked="false"[^>]*>.*todo/s);
  assert.match(html, /<input class="strata-task-checkbox" type="checkbox" disabled checked \/>/);
  assert.doesNotMatch(html, /\[x\]/);
});

test('a list mixing tasks and plain bullets keeps the plain markers', () => {
  const html = markdown.render('- plain item\n- [x] task item');
  const items = html.match(/<li[^>]*>/g) || [];
  assert.equal(items.length, 2);
  assert.equal(items.filter((item) => item.indexOf('strata-task-item') !== -1).length, 1);
});

test('inline math renders but prices do not', () => {
  const math = markdown.render('The identity $E = mc^2$ holds.');
  assert.match(math, /katex/);

  const prices = markdown.render('It costs $5 and then $10 later.');
  assert.doesNotMatch(prices, /katex/);
  assert.match(prices, /\$5 and then \$10/);
});

test('block math renders in its own container', () => {
  const html = markdown.render('$$\n\\int_0^1 x^2 dx\n$$');
  assert.match(html, /<div class="strata-math-block">/);
  assert.match(html, /katex/);
});

/* The commonest way of all to write display maths: a line introducing it, the
   block under it, and no blank line between them. Without permission to
   interrupt a paragraph the whole thing was one paragraph of literal LaTeX. */
test('display math can follow the sentence that introduces it', () => {
  const html = markdown.render('The formula is:\n$$\nE = mc^2\n$$');
  assert.match(html, /<div class="strata-math-block">/);
  assert.doesNotMatch(html, /\$\$/);
});

test('display math works inside a list item and inside a quote', () => {
  assert.match(markdown.render('- item\n  $$\n  x = 1\n  $$'), /<li>item<div class="strata-math-block">/);
  assert.match(markdown.render('> $$\n> x = 1\n> $$'), /<blockquote>\s*<div class="strata-math-block">/);
});

test('double dollars inside a sentence are display math, not stray dollars', () => {
  const html = markdown.render('Before $$x^2$$ after.');
  assert.match(html, /katex-display/);
  assert.doesNotMatch(html, /\$/);
});

test("GitHub's backtick form of inline math does not typeset its backticks", () => {
  const html = markdown.render('The identity $`a+b`$ holds.');
  assert.match(html, /katex/);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /[`\u2018\u2019]/);
});

test('a fence labelled math is display math, not a code block', () => {
  const html = markdown.render('```math\nE = mc^2\n```');
  assert.match(html, /<div class="strata-math-block">/);
  assert.doesNotMatch(html, /strata-code/);
});

test('math can be switched off', () => {
  const noMath = new MarkdownProcessor({ enableMath: false });
  const html = noMath.render('$E = mc^2$');
  assert.doesNotMatch(html, /katex/);
});

test('mermaid fences become a diagram container with arrows intact', () => {
  const html = markdown.render('```mermaid\ngraph LR\nA-->B\n```');
  assert.match(html, /<div class="strata-mermaid" data-mermaid-container="true">/);
  // The source must survive as escaped text: reading it back with textContent
  // has to give "A-->B" again, which is what broke diagrams on refresh.
  assert.match(html, /A--&gt;B/);
  assert.doesNotMatch(html, /A--&amp;gt;B/);
});

test('mermaid fences are left as code when diagrams are off', () => {
  const withoutMermaid = new MarkdownProcessor({ enableMermaid: false });
  const html = withoutMermaid.render('```mermaid\ngraph LR\nA-->B\n```');
  assert.doesNotMatch(html, /strata-mermaid/);
  assert.match(html, /strata-code/);
});

test('the inline table of contents is not left inside a paragraph', () => {
  const html = markdown.render('# Title\n\n[[toc]]\n\n## One\n\n## Two');
  assert.match(html, /<div class="strata-toc">/);
  assert.doesNotMatch(html, /<p>\s*<div class="strata-toc">/);
  assert.doesNotMatch(html, /<p><\/p>/);
});

test('headings get ids and anchors', () => {
  const html = markdown.render('## A heading here');
  assert.match(html, /<h2 id="a-heading-here">/);
  assert.match(html, /class="strata-anchor" href="#a-heading-here"/);
  // The anchor must not leak a stray space into the heading text.
  assert.doesNotMatch(html, />\s+A heading here/);
});

test('anchors can be switched off', () => {
  const plain = new MarkdownProcessor({ enableAnchors: false });
  const html = plain.render('## Heading');
  assert.match(html, /id="heading"/);
  assert.doesNotMatch(html, /strata-anchor/);
});

/*
 * GitHub links a bare `www.` address, and so does this. The switch that allows
 * it also links every bare word ending in something domain shaped, and `md` is
 * a country code, so it is narrowed back to what GitHub documents: a file name
 * in a sentence is a file name.
 */
test('a bare www address is a link and a bare file name is not', () => {
  assert.match(markdown.render('see www.github.com now'), /<a href="http:\/\/www\.github\.com">www\.github\.com<\/a>/);
  const prose = markdown.render('see notes.md and example.com');
  assert.doesNotMatch(prose, /<a /);
});

test('addresses and schemes still autolink as they did', () => {
  assert.match(markdown.render('http://a.example'), /<a href="http:\/\/a\.example">/);
  assert.match(markdown.render('mail me at a@b.com'), /href="mailto:a@b\.com"/);
});

test('raw HTML is escaped by default and rendered when allowed', () => {
  assert.match(markdown.render('<b onclick="x()">hi</b>'), /&lt;b/);
  const permissive = new MarkdownProcessor({ allowHtml: true });
  assert.match(permissive.render('<b>hi</b>'), /<b>hi<\/b>/);
});

test('highlighted text renders as a mark element', () => {
  assert.match(markdown.render('some ==important== text'), /<mark>important<\/mark>/);
});

test('footnotes, definition lists, sub and sup all load', () => {
  assert.match(markdown.render('text[^1]\n\n[^1]: note'), /class="footnotes/);
  assert.match(markdown.render('Term\n: definition'), /<dl>/);
  assert.match(markdown.render('H~2~O'), /<sub>2<\/sub>/);
  assert.match(markdown.render('x^2^'), /<sup>2<\/sup>/);
});

test('rendering never throws on malformed input', () => {
  ['', '   ', '```\nunclosed', '| broken |\n|---', '> [!', '$$', '~~~'].forEach((input) => {
    assert.doesNotThrow(() => markdown.render(input), `input: ${JSON.stringify(input)}`);
  });
});

test('options can be changed after construction', () => {
  const processor = new MarkdownProcessor({ showLineNumbers: false });
  assert.doesNotMatch(processor.render('```js\nx\n```'), /strata-code--numbered/);
  processor.updateOptions({ showLineNumbers: true });
  assert.match(processor.render('```js\nx\n```'), /strata-code--numbered/);
});
