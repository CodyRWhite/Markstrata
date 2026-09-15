/**
 * .SYNOPSIS
 * Every generated asset paints from the palette assets/brand.md documents.
 *
 * .USAGE
 *   npm test                          every test
 *   node --test tests/brand.test.js   this one
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.ts
 */

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
/* The brand package is the master and is not edited here, so the check is that
 * what the build copies out of it is present and the right shape, rather than
 * a palette audit of artwork somebody else drew. */
const BRAND = path.join(ASSETS, 'markstrata-brand-v1');

const GENERATED = [
  'mark.svg', 'mark-mono-light.svg', 'mark-mono-dark.svg', 'mark-small.svg',
  'lockup.svg', 'lockup-tagline.svg',
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
  const bytes = fs.readFileSync(file);
  if (bytes.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`${file} is not a PNG`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('the brand package is present', () => {
  for (const file of ['BRAND-GUIDE.md', 'icon/markstrata-icon-512.svg',
    'lockup/markstrata-lockup-horizontal.svg', 'export/markstrata-icon-96.png',
    'export/spfx-iconImageUrl.txt', 'tokens/markstrata-tokens.css']) {
    assert.ok(fs.existsSync(path.join(BRAND, file)), `the brand package is missing ${file}`);
  }
});

test('every generated asset exists', () => {
  const missing = GENERATED.filter((file) => !fs.existsSync(path.join(ASSETS, file)));
  assert.deepEqual(missing, [], 'run `npm run brand` to rebuild these');
});

/* Each copy has to match the file it came from, or the build has not been run
 * since the brand package changed. */
test('what the build copied still matches the brand package', () => {
  const pairs = [
    ['icon/markstrata-glyph.svg', 'mark.svg'],
    ['lockup/markstrata-lockup-horizontal.svg', 'lockup-horizontal.svg'],
    ['lockup/markstrata-lockup-horizontal-reversed.svg', 'lockup-horizontal-dark.svg'],
    ['export/markstrata-icon-96.png', '../sharepoint/icon.png']
  ];
  for (const [source, copy] of pairs) {
    assert.deepEqual(fs.readFileSync(path.join(ASSETS, copy)), fs.readFileSync(path.join(BRAND, source)),
      `${copy} is out of step with the brand package; run \`npm run brand\``);
  }
});

/* A viewBox is what lets a mark scale; the rest of each file's internals are
 * the brand package's business, not this build's. */
test('every SVG the build publishes can scale', () => {
  for (const file of svgs) {
    assert.match(read(file), /viewBox="[-\d. ]+"/, `${file} needs a viewBox`);
  }
});

test('brand.md accounts for every file the build produces', () => {
  const guide = read('brand.md');
  for (const file of GENERATED) {
    const name = file.startsWith('icons/') ? 'icons/*.png' : file;
    assert.ok(guide.includes(name), `assets/brand.md does not mention ${name}`);
  }
});

test('brand.md sends people to the delivered guide rather than restating it', () => {
  const guide = read('brand.md');
  assert.ok(guide.includes('BRAND-GUIDE.md'), 'link the delivered guide');
  assert.ok(/do not edit/i.test(guide), 'say that the package is not edited here');
});

/*
 * SharePoint validates the app catalog tile and refuses the whole package if it
 * is the wrong size: "The height of the app package icon does not meet the
 * required size of '96' pixels". Nothing else in the build catches that, and
 * the only other place it shows up is an upload failing in a tenant.
 */
test('the app catalog tile is exactly 96x96', () => {
  const icon = path.join(__dirname, '..', 'sharepoint', 'icon.png');
  assert.ok(fs.existsSync(icon), 'sharepoint/icon.png is missing');
  assert.deepEqual(pngSize(icon), { width: 96, height: 96 });
});

/*
 * The packager writes <AppIconPath> as the BASENAME of iconPath, but copies the
 * file to iconPath itself. A tile under a folder therefore ships to
 * assets/icon.png while the manifest asks SharePoint for icon.png, and the app
 * shows the generic package tile with no error anywhere. Keeping iconPath flat
 * is what makes the two agree, so the shape is asserted, not just the string.
 */
test('the solution points at that tile, at the package root', () => {
  const solution = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'package-solution.json'), 'utf8')
  );
  const iconPath = solution.solution.iconPath;
  assert.equal(iconPath.indexOf('/'), -1,
    `iconPath must be a bare file name or SharePoint cannot resolve it: ${iconPath}`);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'sharepoint', iconPath)),
    `sharepoint/${iconPath} is missing`);
});

/* The title the App Catalog lists the app under. */
test('the solution is titled for people, not for the scaffold', () => {
  const solution = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'package-solution.json'), 'utf8')
  );
  assert.equal(solution.solution.name, 'Markstrata - Markdown Web Part for SharePoint Online');
  assert.ok(!/client-side-solution/.test(solution.solution.name),
    'the generated scaffold name is still showing in the App Catalog');
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
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.readUInt16BE(0), 0xffd8, 'expected a JPEG');
  assert.ok(bytes.length < 40 * 1024, `tile is ${bytes.length} bytes; it is inlined into the manifest`);
});

/*
 * The toolbox and full-page apps picker show this one, and it is the tile
 * rather than the mark: the mark is already the app catalog icon, and showing
 * it twice tells a reader nothing about what the web part does. It is inlined
 * into the manifest, which loads with the web part on every page, so the cap
 * is a real budget and not a formality.
 */
test('the manifest carries the web part tile, with a glyph still there as a fallback', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'webparts',
    'markstrata', 'MarkstrataWebPart.manifest.json'), 'utf8'));
  for (const entry of manifest.preconfiguredEntries) {
    assert.ok(entry.iconImageUrl.startsWith('data:image/jpeg;base64,'),
      'the manifest icon should be the rendered tile; run `npm run brand`');
    assert.ok(entry.iconImageUrl.length < 20 * 1024,
      `manifest icon is ${entry.iconImageUrl.length} chars; it loads with every page`);
    assert.ok(entry.officeFabricIconFontName, 'keep a glyph for surfaces that ignore the image');
  }
});

/*
 * Two places initialise mermaid: the web part through MermaidRenderer, and the
 * site's static pages in an inline script. They used to hold separate copies of
 * the config, so the gantt legibility fix reached a deployed web part and not
 * the demo site. Both now read the same module, and neither may go back to
 * spelling the options out for itself.
 */
test('mermaid is configured from one place', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'webparts',
    'markstrata', 'utils', 'MermaidRenderer.ts'), 'utf8');
  const builder = fs.readFileSync(path.join(__dirname, '..', 'demo', 'build-demo.js'), 'utf8');
  for (const [name, body] of [['MermaidRenderer.ts', renderer], ['build-demo.js', builder]]) {
    assert.ok(/mermaidConfigFor/.test(body), `${name} should build its config with mermaidConfigFor`);
    assert.ok(!/securityLevel:\s*'strict'/.test(body),
      `${name} spells out mermaid options again; they belong in utils/mermaidConfig.ts`);
  }
});

/*
 * A gantt lays out wider than its container and useMaxWidth scales the SVG
 * down to fit, so what is written here lands smaller on screen. It has to
 * start above body text to survive that, and the size the layout is measured
 * at has to match the size that is drawn or the labels stop fitting the bars.
 */
test('gantt text is sized to survive the scaling, and layout agrees with it', () => {
  const { GANTT_TEXT_CSS, MERMAID_BASE_CONFIG } = require('./helpers').mermaidConfig;
  const sizes = (GANTT_TEXT_CSS.match(/font-size:\s*(\d+)px/g) || [])
    .map((rule) => parseInt(/\d+/.exec(rule)[0], 10));
  assert.ok(sizes.length >= 2, 'expected rules for the axis and the task labels');
  for (const size of sizes) {
    assert.ok(size >= 15, `gantt text is ${size}px; scaling would drop it below body text`);
  }
  assert.equal(MERMAID_BASE_CONFIG.gantt.fontSize, sizes[0],
    'the layout font size and the drawn font size have drifted apart');
});

/*
 * Fitting is what keeps a gantt readable without a scrollbar: the chart is laid
 * out at the column width, so its axis compresses and the text stays put. The
 * other two modes are the reader's call, not a fallback.
 */
test('each diagram width mode asks mermaid for the right thing', () => {
  const { mermaidConfigFor, MERMAID_BASE_CONFIG } = require('./helpers').mermaidConfig;
  const fitted = mermaidConfigFor('fit', 900, MERMAID_BASE_CONFIG).gantt;
  assert.equal(fitted.useMaxWidth, false, 'fitting must not let mermaid scale the drawing');
  assert.equal(fitted.useWidth, 900, 'fitting lays the chart out at the width it was given');

  const scroll = mermaidConfigFor('scroll', 900, MERMAID_BASE_CONFIG).gantt;
  assert.equal(scroll.useMaxWidth, false);
  assert.equal(scroll.useWidth, undefined, 'scrolling keeps the natural width');

  const scale = mermaidConfigFor('scale', 900, MERMAID_BASE_CONFIG).gantt;
  assert.equal(scale.useMaxWidth, true, 'scaling is mermaid shrinking it to fit');

  /* An unmeasurable box must not become a zero-width chart. */
  const unmeasured = mermaidConfigFor('fit', 0, MERMAID_BASE_CONFIG).gantt;
  assert.equal(unmeasured.useWidth, undefined, 'a zero-width box falls back to natural width');
});
