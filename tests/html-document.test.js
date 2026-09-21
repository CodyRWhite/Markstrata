/**
 * .SYNOPSIS
 * An HTML file comes apart into content, styles and a title, and the styles
 * survive the trip.
 *
 * .DESCRIPTION
 * The reason this module exists is a silent loss. The sanitiser removes a
 * `<style>` block and says nothing, so an HTML web part that sanitised first
 * would render an author's document with none of the author's styling and no
 * error anywhere to explain it. The first test below is that measurement,
 * pinned: if DOMPurify ever starts keeping `<style>`, this says so rather than
 * leaving a now-pointless extraction in the path.
 *
 * .USAGE
 *   npm test                                 every test
 *   node --test tests/html-document.test.js  this one
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { htmlDocument, htmlSanitiser } = require('./helpers');
const { splitHtmlDocument, titleOf } = htmlDocument;

test('the sanitiser really does remove a style block', () => {
  /* The premise. Extracting styles first is only worth doing because of this,
     so it is checked rather than remembered. */
  const out = htmlSanitiser.sanitiseRenderedHtml('<style>.a{color:red}</style><p>hi</p>');
  assert.ok(out.indexOf('<style') === -1, `style survived sanitising: ${out}`);
  assert.ok(out.indexOf('color:red') === -1, `the rules survived: ${out}`);
});

test('and really does keep a style attribute', () => {
  /* The other half: per-element styling needs no rescuing, so this does not
     touch it. */
  const out = htmlSanitiser.sanitiseRenderedHtml('<p style="color:red">hi</p>');
  assert.ok(out.indexOf('style="color:red"') !== -1, out);
});

test('a style block is lifted out instead of being lost', () => {
  const parts = splitHtmlDocument('<style>.a{color:red}</style><p>hi</p>');
  assert.equal(parts.css, '.a{color:red}');
  assert.ok(parts.body.indexOf('<p>hi</p>') !== -1, parts.body);
  assert.ok(parts.body.indexOf('<style') === -1, 'the block was left in the body');
});

test('every style block is taken, in order', () => {
  const parts = splitHtmlDocument(
    '<style>.a{color:red}</style><p>hi</p><style>.b{color:blue}</style>'
  );
  assert.ok(parts.css.indexOf('.a{color:red}') < parts.css.indexOf('.b{color:blue}'), parts.css);
});

test('a whole document gives up its body, its styles and its title', () => {
  const raw = [
    '<!DOCTYPE html>',
    '<html><head><title>Starter checklist</title>',
    '<style>h1{color:red}</style></head>',
    '<body><h1>Hello</h1></body></html>'
  ].join('\n');
  const parts = splitHtmlDocument(raw);

  assert.equal(parts.title, 'Starter checklist');
  assert.equal(parts.css, 'h1{color:red}');
  assert.ok(parts.body.indexOf('<h1>Hello</h1>') !== -1, parts.body);
  assert.ok(parts.body.indexOf('<!DOCTYPE') === -1, 'the doctype reached the page');
});

test('scripting is still taken out of the body', () => {
  /* Splitting the file must not become a way round the sanitiser. */
  const parts = splitHtmlDocument('<p onclick="alert(1)">hi</p><script>alert(1)</script>');
  assert.ok(parts.body.indexOf('script') === -1, parts.body);
  assert.ok(parts.body.indexOf('onclick') === -1, parts.body);
});

test('a style attribute inside the body is left where it is', () => {
  const parts = splitHtmlDocument('<p style="color:red">hi</p>');
  assert.ok(parts.body.indexOf('style="color:red"') !== -1, parts.body);
  assert.equal(parts.css, '');
});

test('an escaped style tag in the text is text, not a stylesheet', () => {
  const parts = splitHtmlDocument('<p>&lt;style&gt;.evil{}&lt;/style&gt;</p>');
  assert.equal(parts.css, '', `text was read as CSS: ${parts.css}`);
});

test('a file with no styles and no title says so', () => {
  const parts = splitHtmlDocument('<p>hi</p>');
  assert.equal(parts.css, '');
  assert.equal(parts.title, undefined);
});

test('nothing in, nothing out', () => {
  const parts = splitHtmlDocument('');
  assert.deepEqual(parts, { body: '', css: '', title: undefined });
});

test('a title carrying markup is reduced to its text', () => {
  assert.equal(titleOf('<title>A <b>bold</b> title</title>'), 'A bold title');
});

test('an empty title is no title', () => {
  assert.equal(titleOf('<title>   </title>'), undefined);
  assert.equal(titleOf('<p>no title here</p>'), undefined);
});
