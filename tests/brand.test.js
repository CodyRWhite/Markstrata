const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');

/*
 * The palette documented in assets/brand.md. Every generated asset has to paint
 * from it: a stray colour means something was hand-edited instead of rebuilt
 * from the master, and the next `npm run brand` would silently undo it.
 */
const PALETTE = new Set([
  '#013463', '#36a7ca', '#a7bcd0',   // light
  '#2f7fc4', '#c3d4e4',              // navy and slate, lifted for dark surfaces
  'currentColor'                      // the single-colour mark
]);

const GENERATED = [
  'mark.svg', 'mark-dark.svg', 'mark-mono.svg', 'mark-small.svg',
  'wordmark.svg', 'wordmark-dark.svg',
  'lockup.svg', 'lockup-dark.svg',
  'lockup-horizontal.svg', 'lockup-horizontal-dark.svg',
  'social-card.png',
  'icons/favicon-16.png', 'icons/favicon-32.png', 'icons/favicon-48.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

const read = (file) => fs.readFileSync(path.join(ASSETS, file), 'utf8');
const svgs = GENERATED.filter((file) => file.endsWith('.svg'));

test('the logo master is present', () => {
  assert.ok(fs.existsSync(path.join(ASSETS, 'mark.svg')),
    'assets/mark.svg is the source every other asset is cut from');
});

test('every generated asset exists', () => {
  const missing = GENERATED.filter((file) => !fs.existsSync(path.join(ASSETS, file)));
  assert.deepEqual(missing, [], 'run `npm run brand` to rebuild these');
});

test('generated SVGs paint only from the documented palette', () => {
  for (const file of svgs) {
    const fills = [...read(file).matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(fills.length > 0, `${file} has no fills`);
    const strays = fills.filter((fill) => !PALETTE.has(fill) && !fill.startsWith('url(#'));
    assert.deepEqual(strays, [], `${file} paints with colours outside the palette`);
  }
});

test('the dark variants lift navy off the dark surface', () => {
  for (const file of svgs.filter((name) => name.includes('-dark'))) {
    const body = read(file);
    assert.ok(body.includes('#2f7fc4'), `${file} should use the lifted navy`);
    assert.ok(!body.includes('#013463'), `${file} still has ink navy in it`);
  }
});

test('the single-colour mark inherits its colour', () => {
  const mono = read('mark-mono.svg');
  assert.ok(mono.includes('currentColor'));
  assert.ok(!/fill="#/.test(mono), 'mark-mono.svg should have no fixed colours');
  assert.ok(!mono.includes('url(#'),
    'a gradient cannot follow currentColor, so the mono mark drops it');
});

test('every generated SVG carries a viewBox and a label', () => {
  for (const file of svgs) {
    const body = read(file);
    assert.match(body, /viewBox="[-\d. ]+"/, `${file} needs a viewBox to scale`);
    assert.match(body, /aria-label="Markstrata Markdown"/, `${file} needs an accessible name`);
  }
});

test('brand.md documents every generated file', () => {
  const guide = read('brand.md');
  for (const file of GENERATED) {
    const name = file.startsWith('icons/') ? 'icons/*.png' : file;
    assert.ok(guide.includes(name), `assets/brand.md does not mention ${name}`);
  }
});
