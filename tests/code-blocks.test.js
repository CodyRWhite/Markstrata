const test = require('node:test');
const assert = require('node:assert/strict');
const { MarkdownProcessor, codeBlocks } = require('./helpers');

const md = new MarkdownProcessor();

test('fence info parsing', () => {
  assert.deepEqual(codeBlocks.parseInfo('ts'), { lang: 'ts', filename: '' });
  assert.deepEqual(codeBlocks.parseInfo(''), { lang: '', filename: '' });
  assert.equal(codeBlocks.parseInfo('ts title="app.ts"').filename, 'app.ts');
  assert.equal(codeBlocks.parseInfo("ts title='app.ts'").filename, 'app.ts');
  assert.equal(codeBlocks.parseInfo('ts:app.ts').filename, 'app.ts');
  assert.equal(codeBlocks.parseInfo('TypeScript').lang, 'typescript');
});

test('per-fence wrap and line number flags', () => {
  assert.equal(codeBlocks.parseInfo('python wrap').wrap, true);
  assert.equal(codeBlocks.parseInfo('python nowrap').wrap, false);
  assert.equal(codeBlocks.parseInfo('python').wrap, undefined);
  assert.equal(codeBlocks.parseInfo('python numbers').lineNumbers, true);
  assert.equal(codeBlocks.parseInfo('python nonumbers').lineNumbers, false);
});

test('a fence flag overrides the web part default', () => {
  const wrapping = new MarkdownProcessor({ wrapCodeLines: false });
  assert.match(wrapping.render('```python wrap\nx = 1\n```'), /ink-code--wrap/);

  const notWrapping = new MarkdownProcessor({ wrapCodeLines: true });
  assert.doesNotMatch(notWrapping.render('```python nowrap\nx = 1\n```'), /ink-code--wrap/);
});

test('language label is humanised', () => {
  assert.equal(codeBlocks.languageLabel('ts'), 'TypeScript');
  assert.equal(codeBlocks.languageLabel('ps1'), 'PowerShell');
  assert.equal(codeBlocks.languageLabel(''), 'Text');
  assert.equal(codeBlocks.languageLabel('zig'), 'ZIG');
});

test('every line becomes one block element with no separating newline', () => {
  const html = md.render('```js\nconst a = 1;\nconst b = 2;\n```');
  const lines = html.match(/<span class="ink-code-line">/g);
  assert.equal(lines.length, 2);
  // A newline between the line elements would render as a blank line in <pre>.
  assert.doesNotMatch(html, /<\/span><\/span>\n<span class="ink-code-line">/);
});

test('highlight spans are reopened across line breaks', () => {
  const html = md.render('```js\n/* a\n   multi line comment */\nconst x = 1;\n```');
  const openTags = (html.match(/<span class="hljs-comment">/g) || []).length;
  const lineCount = (html.match(/<span class="ink-code-line">/g) || []).length;
  assert.equal(lineCount, 3);
  // The comment spans two source lines, so it must be opened on both.
  assert.ok(openTags >= 2, `expected the comment span to reopen, saw ${openTags}`);
  // And every opened span must be closed - count the tags.
  const opens = (html.match(/<span/g) || []).length;
  const closes = (html.match(/<\/span>/g) || []).length;
  assert.equal(opens, closes);
});

test('line numbers are not part of the text content', () => {
  const numbered = new MarkdownProcessor({ showLineNumbers: true });
  const html = numbered.render('```js\nconst a = 1;\n```');
  assert.match(html, /ink-code--numbered/);
  assert.match(html, /<span class="ink-code-ln" aria-hidden="true"><\/span>/);
});

test('code content is escaped, never live markup', () => {
  const html = md.render('```html\n<script>alert(1)</script>\n```');
  // highlight.js wraps the tag parts in spans, so assert on the escaping
  // itself rather than on an exact string.
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /alert\(1\)<\/script>/);
  assert.match(html, /&lt;/);
  assert.match(html, /script/);
});

test('an unknown language still renders a block', () => {
  const html = md.render('```notalanguage\nsome text\n```');
  assert.match(html, /ink-code/);
  assert.match(html, /some text/);
});

test('indented code blocks render through the same path', () => {
  const html = md.render('    indented code\n');
  assert.match(html, /ink-code/);
  assert.match(html, /indented code/);
});

test('the header can be turned off, leaving only the copy button', () => {
  const bare = new MarkdownProcessor({ showCodeHeader: false });
  const html = bare.render('```js\nx\n```');
  assert.doesNotMatch(html, /ink-code-header/);
  assert.match(html, /ink-code-copy/);
});

test('trailing newline does not add an empty line', () => {
  const html = md.render('```\none\n```');
  assert.equal((html.match(/ink-code-line"/g) || []).length, 1);
});
