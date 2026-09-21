/**
 * .SYNOPSIS
 * An author's stylesheet reaches the web part's own content and nothing else.
 *
 * .DESCRIPTION
 * The HTML web part lets an author name a stylesheet so one sheet can dress a
 * folder of documents. Injected as written it would dress the SharePoint page
 * too, and two of these web parts on one page would fight over every selector
 * they share.
 *
 * Most of what is checked here is not the happy path. Prefixing selectors is
 * easy right up to the first comment containing a brace, and the reason
 * scopedCss tokenises rather than pattern-matching is that a stylesheet is
 * full of characters that mean one thing in a selector and another inside a
 * string, a comment or a bracket. Each of those is a test below, because each
 * of them is how the obvious implementation breaks:
 *
 *   a comment holding a brace     ends the rule early, and everything after it
 *                                 is scoped against the wrong nesting
 *   a string holding a brace      the same, from content: '}'
 *   :is(a, b)                     one selector, and the comma is not a
 *                                 separator, so splitting on commas makes two
 *                                 broken ones
 *   @keyframes                    its block holds percentages, not selectors,
 *                                 and prefixing them silently kills the
 *                                 animation
 *
 * .USAGE
 *   npm test                              every test
 *   node --test tests/scoped-css.test.js  this one
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { scopedCss } = require('./helpers');
const { scopeCss, scopeSelector, stripComments } = scopedCss;

const ROOT = '.strata-root';

/** Whitespace is kept for legibility in a browser inspector, not for tests. */
function tidy(css) {
  return css.replace(/\s+/g, ' ').trim();
}

test('an ordinary rule is prefixed with the root', () => {
  assert.equal(
    tidy(scopeCss('.note { color: red }', ROOT)),
    '.strata-root .note { color: red }'
  );
});

test('a selector naming the whole document becomes the root itself', () => {
  /* Not a descendant of it: there is no body inside a web part, so
     ".strata-root body" would match nothing and the rule would do nothing. */
  for (const whole of [':root', 'html', 'body', ':host']) {
    assert.equal(
      tidy(scopeCss(`${whole} { margin: 0 }`, ROOT)),
      '.strata-root { margin: 0 }',
      whole
    );
  }
});

test('a selector that descends from the document has its leading part replaced', () => {
  assert.equal(
    tidy(scopeCss('body .note { color: red }', ROOT)),
    '.strata-root .note { color: red }'
  );
  assert.equal(
    tidy(scopeCss('html > main { padding: 0 }', ROOT)),
    '.strata-root > main { padding: 0 }'
  );
});

test('a selector merely starting with those letters is left alone', () => {
  /* "bodycopy" is not "body", and a prefix match would have turned it into the
     root and quietly restyled the whole web part. */
  assert.equal(
    tidy(scopeCss('.bodycopy { color: red }', ROOT)),
    '.strata-root .bodycopy { color: red }'
  );
  assert.equal(
    tidy(scopeCss('htmlish { color: red }', ROOT)),
    '.strata-root htmlish { color: red }'
  );
});

test('every selector in a list is prefixed, not just the first', () => {
  assert.equal(
    tidy(scopeCss('h1, h2, .note { color: red }', ROOT)),
    '.strata-root h1, .strata-root h2, .strata-root .note { color: red }'
  );
});

test('a comma inside brackets is not a separator', () => {
  /* Splitting on every comma makes ":is(a" and "b)", and both are nonsense. */
  assert.equal(
    tidy(scopeCss(':is(h1, h2) { color: red }', ROOT)),
    '.strata-root :is(h1, h2) { color: red }'
  );
  assert.equal(
    tidy(scopeCss('[title="a,b"] { color: red }', ROOT)),
    '.strata-root [title="a,b"] { color: red }'
  );
});

test('a comment holding a brace does not end the rule early', () => {
  const css = '.a { color: red; /* } not the end */ background: blue }';
  const out = tidy(scopeCss(css, ROOT));
  assert.equal(out, '.strata-root .a { color: red; background: blue }');
});

test('a string holding a brace does not end the rule early', () => {
  const css = '.a::before { content: "}"; color: red } .b { color: blue }';
  const out = tidy(scopeCss(css, ROOT));
  assert.ok(
    out.indexOf('.strata-root .b { color: blue }') !== -1,
    `the rule after the string was lost or misparsed: ${out}`
  );
});

test('an escaped quote does not end the string early', () => {
  const css = '.a::before { content: "a\\"}b" } .c { color: red }';
  const out = tidy(scopeCss(css, ROOT));
  assert.ok(
    out.indexOf('.strata-root .c { color: red }') !== -1,
    `the rule after the escaped quote was lost: ${out}`
  );
});

test('rules inside a media query are scoped and the query is kept', () => {
  const out = tidy(scopeCss('@media (min-width: 600px) { .note { color: red } }', ROOT));
  assert.ok(out.indexOf('@media (min-width: 600px)') === 0, out);
  assert.ok(out.indexOf('.strata-root .note { color: red }') !== -1, out);
});

test('nested at-rules are scoped all the way down', () => {
  const css = '@supports (display: grid) { @media print { .note { color: red } } }';
  const out = tidy(scopeCss(css, ROOT));
  assert.ok(out.indexOf('@supports (display: grid)') === 0, out);
  assert.ok(out.indexOf('@media print') !== -1, out);
  assert.ok(out.indexOf('.strata-root .note { color: red }') !== -1, out);
});

test('keyframe offsets are not selectors and are left alone', () => {
  /* Prefixed, "from" and "to" stop being keyframe offsets and the animation
     silently does nothing: the rule is still valid CSS, so nothing complains. */
  const out = tidy(scopeCss('@keyframes spin { from { opacity: 0 } to { opacity: 1 } }', ROOT));
  assert.ok(out.indexOf('.strata-root from') === -1, `offsets were scoped: ${out}`);
  assert.ok(out.indexOf('from { opacity: 0 }') !== -1, out);
});

test('font-face descriptors are left alone', () => {
  const out = tidy(scopeCss("@font-face { font-family: 'X'; src: url(x.woff2) }", ROOT));
  assert.ok(out.indexOf('.strata-root') === -1, `a descriptor block was scoped: ${out}`);
  assert.ok(out.indexOf('@font-face') === 0, out);
});

test('an import is dropped', () => {
  /* It would fetch a stylesheet from wherever it names, with the reader's
     browser, and pull in rules this function never sees. */
  const out = tidy(scopeCss("@import url('https://example.com/x.css'); .a { color: red }", ROOT));
  assert.ok(out.indexOf('@import') === -1, `the import survived: ${out}`);
  assert.equal(out, '.strata-root .a { color: red }');
});

test('an at-rule nobody here knows is kept rather than mangled', () => {
  const out = tidy(scopeCss('@future-thing (x) { .a { color: red } }', ROOT));
  assert.ok(out.indexOf('@future-thing') === 0, out);
  assert.ok(out.indexOf('.a { color: red }') !== -1, out);
});

test('nothing in, nothing out', () => {
  assert.equal(scopeCss('', ROOT), '');
  assert.equal(scopeCss('   \n  ', ROOT), '');
});

test('an unclosed rule is emitted rather than swallowed', () => {
  /* A truncated sheet is an author's mistake, and losing the rest of it
     silently is worse than leaving one rule unscoped. */
  const out = tidy(scopeCss('.a { color: red', ROOT));
  assert.ok(out.length > 0, 'the truncated rule vanished');
  assert.ok(out.indexOf('color: red') !== -1, out);
});

test('stripComments leaves strings alone', () => {
  assert.equal(
    tidy(stripComments('.a::before { content: "/* not a comment */" }')),
    '.a::before { content: "/* not a comment */" }'
  );
});

test('scopeSelector is the whole judgement, and is testable on its own', () => {
  assert.equal(scopeSelector('.note', ROOT), '.strata-root .note');
  assert.equal(scopeSelector('body', ROOT), ROOT);
  assert.equal(scopeSelector('', ROOT), '');
});

/*
 * Light and dark, which an author had no way to write at all.
 *
 * The web part puts data-strata-mode on the element the stylesheet is narrowed
 * to. Prefixed the ordinary way, `[data-strata-mode="dark"] .card` becomes
 * `.scope [data-strata-mode="dark"] .card` - and that asks for the attribute
 * on something inside the scope, where it never is. The rule matched nothing
 * in either mode.
 *
 * Attaching it to the root is the fix, and dropping it would be worse than the
 * fault: a dark rule that applies in both modes is a document that is wrong
 * half the time rather than merely unstyled.
 */
test('a rule for the colour mode attaches to the root, attribute and all', () => {
  assert.equal(
    scopeSelector('[data-strata-mode="dark"] .card', '.wp'),
    '.wp[data-strata-mode="dark"] .card'
  );
});

test('and the attribute is kept, not dropped', () => {
  const scoped = scopeSelector('[data-strata-mode="dark"] .card', '.wp');
  assert.match(scoped, /data-strata-mode="dark"/,
    'the rule would apply in both modes');
});

test('several of the web part\'s attributes at once', () => {
  assert.equal(
    scopeSelector('[data-strata-mode="dark"][data-strata-theme="github"] .card', '.wp'),
    '.wp[data-strata-mode="dark"][data-strata-theme="github"] .card'
  );
});

test('a :root or :host an author wrote out of habit is absorbed', () => {
  for (const written of [':root[data-strata-mode="dark"] .card',
    ':host[data-strata-mode="dark"] .card']) {
    assert.equal(scopeSelector(written, '.wp'), '.wp[data-strata-mode="dark"] .card',
      `${written} was not absorbed`);
  }
});

test('the state can be the whole selector', () => {
  assert.equal(
    scopeSelector('[data-strata-mode="dark"]', '.wp'),
    '.wp[data-strata-mode="dark"]'
  );
});

test('a combinator after it survives', () => {
  assert.equal(
    scopeSelector('[data-strata-mode="dark"] > .card', '.wp'),
    '.wp[data-strata-mode="dark"] > .card'
  );
});

test('an author\'s own data attribute is still theirs', () => {
  /* Only the attributes this web part puts on its own root are absorbed.
     Anything else describes something inside the document and stays a
     descendant, or an author could not select on their own markup. */
  assert.equal(
    scopeSelector('[data-status="open"] .card', '.wp'),
    '.wp [data-status="open"] .card'
  );
});

test('and one in the middle of a selector is left where it is', () => {
  assert.equal(
    scopeSelector('.panel [data-strata-mode="dark"]', '.wp'),
    '.wp .panel [data-strata-mode="dark"]'
  );
});

