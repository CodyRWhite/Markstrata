/**
 * .SYNOPSIS
 * Nothing in the web part's stylesheets reaches the page around it.
 *
 * .DESCRIPTION
 * SharePoint loads a web part's stylesheets into the page, not into the web
 * part: they go in the document head, next to SharePoint's own, and they stay
 * there for as long as the page does. So a selector that names an element
 * rather than one of this web part's classes is not a rule about this web
 * part - it is a rule about everything on the page, including SharePoint's own
 * furniture and every other web part somebody has put there.
 *
 * Three of them had got out, all inside `@media print`, so they only showed on
 * paper and nobody was printing. The worst printed the address after every
 * external link on the page, navigation included, on any page that merely had
 * this web part somewhere on it.
 *
 * Hence the flat rule checked here: every selector, in every stylesheet that
 * ships, names a strata class somewhere. It is stricter than it needs to be -
 * a `:root` block of custom properties would be harmless and is refused - and
 * that is the point, because the harmless exception is how the rule stops
 * being a rule.
 *
 * .USAGE
 *   npm test                             every test
 *   node --test tests/style-scope.test.js  this one
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it runs at test time only
 * Requires:  nothing else in this project
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STYLES = path.join(__dirname, '..', 'src', 'webparts', 'markstrata', 'styles');

function stylesheets(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) { return stylesheets(full); }
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

/** Every selector that opens a block, with the file and line it is on. */
function selectorsIn(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, ' ')
  );

  const found = [];
  const pattern = /([^{}]+)\{/g;
  let match = pattern.exec(text);

  while (match) {
    const selector = match[1].trim().replace(/\s+/g, ' ');
    if (selector && !selector.startsWith('@')) {
      const line = text.slice(0, match.index).split('\n').length;
      selector.split(',').forEach((one) => {
        if (one.trim()) {
          found.push({ selector: one.trim(), line: line, file: path.basename(file) });
        }
      });
    }
    match = pattern.exec(text);
  }
  return found;
}

const files = stylesheets(STYLES);
const all = files.flatMap(selectorsIn);

test('there are stylesheets to check, and selectors in them', () => {
  assert.ok(files.length >= 10, `only found ${files.length} stylesheets`);
  assert.ok(all.length > 200, `only found ${all.length} selectors`);
});

test('every selector is scoped to the web part', () => {
  const escaped = all
    .filter((entry) => entry.selector.indexOf('strata') === -1)
    .map((entry) => `${entry.file}:${entry.line} ${entry.selector}`);

  assert.deepEqual(
    escaped,
    [],
    'these are rules about the whole SharePoint page, not about this web part'
  );
});
