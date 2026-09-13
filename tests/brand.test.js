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
  'social-card.png', 'webpart-tile.jpg',
  'icons/favicon-16.png', 'icons/favicon-32.png', 'icons/favicon-48.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

const read = (file) => fs.readFileSync(path.join(ASSETS, file), 'utf8');
const svgs = GENERATED.filter((file) => file.endsWith('.svg'));

/* A PNG's dimensions are in the IHDR chunk, at a fixed offset - enough to
 * check a size without pulling in an image library. */
function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`${file} is not a PNG`);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

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

/*
 * SharePoint validates the app catalog tile and refuses the whole package if it
 * is the wrong size: "The height of the app package icon does not meet the
 * required size of '96' pixels". Nothing else in the build catches that, and
 * the only other place it shows up is an upload failing in a tenant.
 */
test('the app catalog tile is exactly 96x96', () => {
  const icon = path.join(__dirname, '..', 'sharepoint', 'assets', 'icon.png');
  assert.ok(fs.existsSync(icon), 'sharepoint/assets/icon.png is missing');
  assert.deepEqual(pngSize(icon), { width: 96, height: 96 });
});

test('the solution points at that tile', () => {
  const solution = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'package-solution.json'), 'utf8')
  );
  assert.equal(solution.solution.iconPath, 'assets/icon.png');
});

test('the icon PNGs are the sizes their names claim', () => {
  for (const file of GENERATED.filter((name) => /icons\/.*-(\d+)\.png$/.test(name))) {
    const expected = Number(/-(\d+)\.png$/.exec(file)[1]);
    assert.deepEqual(pngSize(path.join(ASSETS, file)), { width: expected, height: expected }, file);
  }
});

/*
 * The tile travels inside the manifest as a data URI, so its size is a build
 * concern rather than only a visual one: a PNG of the same image is six times
 * larger and rides along in every page that loads the web part.
 */
test('the web part tile is a JPEG at its intended size', () => {
  const file = path.join(ASSETS, 'webpart-tile.jpg');
  const buf = fs.readFileSync(file);
  assert.equal(buf.readUInt16BE(0), 0xffd8, 'expected a JPEG');
  assert.ok(buf.length < 40 * 1024, `tile is ${buf.length} bytes; it is inlined into the manifest`);
});

test('the manifest carries the tile, with the glyph still there as a fallback', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'webparts',
    'markstrata', 'MarkstrataWebPart.manifest.json'), 'utf8'));
  const tile = fs.readFileSync(path.join(ASSETS, 'webpart-tile.jpg')).toString('base64');
  for (const entry of manifest.preconfiguredEntries) {
    assert.equal(entry.iconImageUrl, `data:image/jpeg;base64,${tile}`,
      'the manifest icon is out of step with assets/webpart-tile.jpg; run `npm run brand`');
    assert.ok(entry.officeFabricIconFontName, 'keep a glyph for surfaces that ignore the image');
  }
});
