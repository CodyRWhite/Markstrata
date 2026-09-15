const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
 * The demo page draws its own property pane, because there is no SharePoint
 * behind it to draw the real one. Its whole value is being the same pane, so
 * someone can try a setting before installing anything and find it in the same
 * place afterwards. Nothing makes that true: they are two literals in two
 * files, and the demo had already drifted, missing Wide diagrams entirely.
 *
 * So the pages and the groups on them are compared. The fields are not: the
 * demo's Content page is openly a stub, since a document library picker with
 * no tenant behind it can only mislead.
 */
const ROOT = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/* The pane names its text through strings.X; the demo writes it out. */
const STRINGS = (() => {
  const loc = read('src/webparts/markstrata/loc/en-us.js');
  const table = {};
  [...loc.matchAll(/^ {4}"([A-Za-z]+)": "((?:[^"\\]|\\.)*)"/gm)].forEach((match) => {
    table[match[1]] = JSON.parse(`"${match[2]}"`);
  });
  return table;
})();

/* Both files declare the pane as a literal, so its shape is read back out of
   the source in the order the markers appear. */
function structure(text, pageMark, groupMark) {
  const pattern = new RegExp(`${pageMark}|${groupMark}`, 'g');
  const pages = [];
  [...text.matchAll(pattern)].forEach((match) => {
    const [, page, group] = match;
    if (page !== undefined) {
      pages.push({ description: page, groups: [] });
    } else if (pages.length) {
      pages[pages.length - 1].groups.push(group);
    }
  });
  return pages;
}

const webPart = structure(
  read('src/webparts/markstrata/MarkstrataWebPart.ts')
    .split('getPropertyPaneConfiguration')[1],
  'header: \\{ description: strings\\.(\\w+)',
  'groupName: strings\\.(\\w+)'
).map((page) => ({
  description: STRINGS[page.description],
  groups: page.groups.map((name) => STRINGS[name])
}));

const demo = structure(
  read('harness/harness.ts').split('const PANEL_PAGES')[1],
  "description: '((?:[^'\\\\]|\\\\.)*)'",
  "name: '((?:[^'\\\\]|\\\\.)*)'"
);

test('the pane has the pages this test knows about', () => {
  assert.equal(webPart.length, 5, 'the web part should declare five pane pages');
  assert.ok(webPart.every((page) => page.description && page.groups.every(Boolean)),
    'a page description or group name did not resolve to a string');
});

test('the demo pane has the same pages as the web part', () => {
  assert.deepEqual(demo.map((page) => page.description),
    webPart.map((page) => page.description));
});

test('the demo pane has the same groups on each page', () => {
  assert.deepEqual(demo.map((page) => page.groups),
    webPart.map((page) => page.groups));
});
