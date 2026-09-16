/**
 * .SYNOPSIS
 * Taking YAML frontmatter off the front of a document, which markdown
 * itself has no concept of.
 *
 * .USAGE
 *   npm test                                 every test
 *   node --test tests/front-matter.test.js   this one
 *
 * .NOTES
 * Since:     0.0.14.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { MarkdownProcessor, frontMatter } = require('./helpers');

const { splitFrontMatter } = frontMatter;

/*
 * Markdown has no frontmatter. `---` is a thematic break and a `---` under a
 * line of text is a setext underline, so a file carrying the block that Obsidian,
 * Hugo and Jekyll all write renders as a rule followed by a heading made of its
 * own metadata, which then leads the table of contents above the real title.
 *
 * It is taken off the front instead. The risk in doing that is taking off
 * something that was never frontmatter, so most of these check it stays put.
 */

test('the block is removed and read', () => {
  const split = splitFrontMatter('---\ntitle: Deploy runbook\nauthor: Ops\n---\n\n# Real title\n');
  assert.equal(split.data.title, 'Deploy runbook');
  assert.equal(split.data.author, 'Ops');
  assert.equal(split.body, '\n# Real title\n');
});

/*
 * The third way YAML writes a list, and the one Obsidian's own documentation
 * of tags uses. Nothing after the colon was read as no value at all, so the
 * key was skipped and the indented lines under it were skipped too by the rule
 * that only reads top level keys: every tag in the file was dropped.
 */
test('tags are read from an indented list under the key', () => {
  assert.deepEqual(
    splitFrontMatter('---\ntags:\n  - recipe\n  - cooking\n---\n').data.tags,
    ['recipe', 'cooking']
  );
});

test('an indented list stops where it stops', () => {
  const data = splitFrontMatter(
    '---\ntitle: Dinner\ntags:\n  - recipe\nauthor: Cody\n---\n'
  ).data;
  assert.deepEqual(data.tags, ['recipe']);
  assert.equal(data.author, 'Cody');
  assert.equal(data.title, 'Dinner');
});

test('a key with nothing under it is still no tags', () => {
  assert.equal(splitFrontMatter('---\ntags:\nauthor: Cody\n---\n').data.tags, undefined);
});

test('tags are read as a list, bracketed or not', () => {
  assert.deepEqual(splitFrontMatter('---\ntags: [ops, sharepoint]\n---\n').data.tags,
    ['ops', 'sharepoint']);
  assert.deepEqual(splitFrontMatter('---\ntags: ops, sharepoint\n---\n').data.tags,
    ['ops', 'sharepoint']);
});

test('quoted values lose their quotes', () => {
  assert.equal(splitFrontMatter('---\ntitle: "Deploy: the runbook"\n---\n').data.title,
    'Deploy: the runbook');
});

test('a TOML fence works the same way', () => {
  const split = splitFrontMatter('+++\ntitle: Notes\n+++\n\nBody\n');
  assert.equal(split.data.title, 'Notes');
  assert.equal(split.body, '\nBody\n');
});

/* The ways it must not fire. */

test('a rule further down the document stays a rule', () => {
  const source = '# Title\n\nSome text.\n\n---\n\nMore text.\n';
  const split = splitFrontMatter(source);
  assert.equal(split.body, source, 'only the very top of the file is frontmatter');
  assert.deepEqual(split.data, {});
});

test('an opening fence with no closing one is left alone', () => {
  const source = '---\n\nThis is a document that opens with a rule.\n';
  assert.equal(splitFrontMatter(source).body, source);
});

test('a fence that is closed by the other kind is left alone', () => {
  const source = '---\ntitle: x\n+++\n\nBody\n';
  assert.equal(splitFrontMatter(source).body, source);
});

test('nested keys are skipped rather than guessed at', () => {
  const split = splitFrontMatter('---\ntitle: Top\nnested:\n  title: Inner\n---\n');
  assert.equal(split.data.title, 'Top', 'an indented key must not overwrite a real one');
});

/* What the reader actually gets. */

test('the rendered document does not show the frontmatter', () => {
  const html = new MarkdownProcessor({ enableAnchors: true, enableToc: true })
    .render('---\ntitle: Deploy runbook\ntags: [ops]\n---\n\n[[toc]]\n\n# Deploy runbook\n\n## Steps\n\nBody.');

  assert.doesNotMatch(html, /<hr>/, 'the opening fence must not become a rule');
  assert.doesNotMatch(html, /title:/, 'the keys must not reach the page');
  assert.doesNotMatch(html, /tags:/);
});

test('the frontmatter does not reach the table of contents', () => {
  const html = new MarkdownProcessor({ enableAnchors: true, enableToc: true })
    .render('---\ntitle: Deploy runbook\n---\n\n[[toc]]\n\n## Steps\n');

  const toc = /<div class="strata-toc">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(toc, 'the contents should still be built');
  assert.doesNotMatch(toc[1], /title/, 'the metadata led the contents before this');
});

test('a document with no frontmatter is untouched', () => {
  const source = '# Title\n\nBody.\n';
  const split = splitFrontMatter(source);
  assert.equal(split.body, source);
  assert.deepEqual(split.data, {});
});
