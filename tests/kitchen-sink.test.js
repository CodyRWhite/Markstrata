const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MarkdownProcessor } = require('./helpers');

/*
 * The kitchen sink is the document the theme screenshots, the demo page and the
 * themes page are all built from, and its whole job is to show every feature at
 * once. A feature that is documented but missing from it is invisible to all
 * three, which is how six of them went unnoticed: spanning table cells, emoji,
 * abbreviations, the two fence flags and an inline table of contents.
 */
const source = fs.readFileSync(
  path.join(__dirname, '..', 'samples', 'kitchen-sink.md'), 'utf8'
);
const html = new MarkdownProcessor({
  imageBasePath: '/sites/x/docs',
  enableMath: true,
  enableMermaid: true,
  enableAnchors: true,
  enableToc: true
}).render(source);

/* Checked against the rendered HTML where a feature has a visible result, and
   against the source where it is a fence flag the renderer consumes. */
const RENDERED = {
  'a table': /<table/,
  'a spanning cell, across': /colspan="\d+"/,
  'a spanning cell, down': /rowspan="\d+"/,
  'aligned columns': /text-align/,
  'a task list': /type="checkbox"/,
  'a footnote': /footnote/,
  'a definition list': /<dl/,
  'an abbreviation': /<abbr/,
  'subscript or superscript': /<su[bp]>/,
  'highlighted text': /<mark/,
  'a blockquote': /<blockquote/,
  'strikethrough': /<s>|<del/,
  'a heading anchor': /strata-anchor|class="header-anchor/,
  'a code block': /strata-code/,
  'a callout': /strata-callout/,
  'a foldable callout': /<details/,
  'a diagram': /strata-mermaid/,
  'maths': /strata-math|katex/,
  'an inline contents list': /strata-toc/,
  'an image': /<img/,
  'a data URI image': /src="data:image\/png/
};

const IN_SOURCE = {
  'a GitHub alert': /\[!NOTE\]|\[!TIP\]|\[!WARNING\]/,
  'an Obsidian callout': /\[![a-z]+\]/,
  'a Wiki.js callout': /\{\.is-[a-z]+\}/,
  'a gantt chart': /^gantt/m,
  'a flowchart': /^flowchart/m,
  'a diff block': /```diff/,
  'a code block with a title': /```\w+ +title="/,
  'the wrap fence flag': /```\w+[^\n]*\b(wrap|nowrap)\b/,
  'the line-number fence flag': /```\w+[^\n]*\b(numbers|nonumbers)\b/,
  'emoji shortcodes': /:[a-z_]+:/,
  'a reference-style image': /!\[[^\]]*\]\[/
};

for (const [what, pattern] of Object.entries(RENDERED)) {
  test(`the kitchen sink renders ${what}`, () => {
    assert.match(html, pattern, `${what} is documented but the sample never shows it`);
  });
}

for (const [what, pattern] of Object.entries(IN_SOURCE)) {
  test(`the kitchen sink contains ${what}`, () => {
    assert.match(source, pattern, `${what} is documented but the sample never uses it`);
  });
}
