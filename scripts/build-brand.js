/*
 * Puts the brand package to work.
 *
 *   node scripts/build-brand.js
 *
 * assets/markstrata-brand-v1/ is the delivered brand system and is never
 * edited here: the icons, lockups and tokens in it are the masters. This script
 * only does the things the repository needs that the package does not already
 * contain - it copies the right file into each place the build expects, and
 * renders the two composites (the social card and the web part tile) that are
 * made from brand artwork rather than shipped with it.
 *
 * Needs Playwright, for the composites:
 *   npm install --no-save playwright && npx playwright install chromium
 */
const fs = require('fs');
const path = require('path');
const tile = require('./webpart-tile');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (error) {
  console.error('Playwright is not installed. Run:\n  npm install --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const BRAND = path.join(root, 'assets', 'markstrata-brand-v1');
const assets = path.join(root, 'assets');

/*
 * Where each delivered file is needed. The brand guide names a specific icon
 * for each size band - the 16px one drops a stratum, the 32px one thickens the
 * weights - so these pick the drawn file rather than downscaling the master.
 */
const COPIES = [
  ['export/markstrata-icon-16.png', 'icons/favicon-16.png'],
  ['export/markstrata-icon-32.png', 'icons/favicon-32.png'],
  ['export/markstrata-icon-48.png', 'icons/favicon-48.png'],
  ['export/markstrata-icon-180.png', 'icons/apple-touch-icon.png'],
  ['export/markstrata-icon-192.png', 'icons/icon-192.png'],
  ['export/markstrata-icon-512.png', 'icons/icon-512.png'],
  ['lockup/markstrata-lockup-horizontal.svg', 'lockup-horizontal.svg'],
  ['lockup/markstrata-lockup-horizontal-reversed.svg', 'lockup-horizontal-dark.svg'],
  ['lockup/markstrata-lockup-stacked.svg', 'lockup.svg'],
  ['lockup/markstrata-lockup-tagline.svg', 'lockup-tagline.svg'],
  ['icon/markstrata-glyph.svg', 'mark.svg'],
  ['icon/markstrata-glyph-mono-light.svg', 'mark-mono-light.svg'],
  ['icon/markstrata-glyph-mono-dark.svg', 'mark-mono-dark.svg'],
  ['icon/markstrata-icon-16.svg', 'mark-small.svg']
];

/*
 * The app catalog tile. SharePoint validates it and refuses the package if it
 * is not exactly 96x96 - "The height of the app package icon does not meet the
 * required size of '96' pixels" - and the brand package draws one at that size.
 */
const APP_CATALOG_ICON = ['export/markstrata-icon-96.png',
  path.join(root, 'sharepoint', 'assets', 'icon.png')];

/* The manifest icon, as the brand guide supplies it: an SVG data URI. */
const MANIFEST_ICON = 'export/spfx-iconImageUrl.txt';

function copyDelivered() {
  COPIES.forEach(([from, to]) => {
    const dest = path.join(assets, to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(BRAND, from), dest);
  });
  const [from, dest] = APP_CATALOG_ICON;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(BRAND, from), dest);
  console.log(`copied ${COPIES.length + 1} files out of the brand package`);
}

/*
 * Writes the manifest's icon. The brand package supplies the data URI, so this
 * copies it rather than encoding one: the SVG is 691 characters against 16 KB
 * for a raster of the same mark, and it rides along in every page that loads
 * the web part.
 */
function stampManifestIcon() {
  const manifest = path.join(root, 'src', 'webparts', 'markstrata',
    'MarkstrataWebPart.manifest.json');
  const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const uri = fs.readFileSync(path.join(BRAND, MANIFEST_ICON), 'utf8').trim();
  let changed = false;
  json.preconfiguredEntries.forEach((entry) => {
    if (entry.iconImageUrl !== uri) {
      entry.iconImageUrl = uri;
      changed = true;
    }
  });
  if (changed) {
    fs.writeFileSync(manifest, JSON.stringify(json, null, 2) + '\n');
  }
  console.log('manifest iconImageUrl'.padEnd(30), String(uri.length).padStart(6), 'chars',
    changed ? '(updated)' : '(unchanged)');
}

function dataUri(file) {
  const type = file.endsWith('.svg') ? 'svg+xml' : path.extname(file).slice(1);
  return `data:image/${type};base64,` + fs.readFileSync(file).toString('base64');
}

/*
 * The web part tile: markdown source at an angle, with the mono-light glyph in
 * the corner. Rendered above its final size and scaled down, because the
 * perspective transform resamples the text and the extra pixels are what keep
 * the receding edge tight. JPEG, because it is photographic.
 */
async function renderTile(browser) {
  const page = await browser.newPage({ deviceScaleFactor: tile.SUPERSAMPLE });
  const dest = path.join(assets, 'webpart-tile.jpg');
  await page.setViewportSize({ width: tile.WIDTH, height: tile.HEIGHT });
  await page.setContent('<body>'
    + tile.tileHtml(dataUri(path.join(assets, 'mark-mono-light.svg'))) + '</body>');
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
  await page.screenshot({ path: dest, type: 'jpeg', quality: 82, scale: 'css' });
  await page.close();
  console.log('webpart-tile.jpg'.padEnd(30), String(fs.statSync(dest).size).padStart(6), 'bytes');
}

/* Social preview, at the 1.91:1 GitHub, Slack and Teams all crop to. */
async function renderSocialCard(browser) {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const dest = path.join(assets, 'social-card.png');
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent('<body style="margin:0;width:1200px;height:630px;background:#F7FAFA;'
    + 'display:flex;align-items:center;justify-content:center">'
    + `<img src="${dataUri(path.join(assets, 'lockup-tagline.svg'))}" style="width:760px"></body>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
  await page.screenshot({ path: dest });
  await page.close();
  console.log('social-card.png'.padEnd(30), String(fs.statSync(dest).size).padStart(6), 'bytes');
}

async function build() {
  copyDelivered();
  stampManifestIcon();
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
  );
  try {
    await renderSocialCard(browser);
    await renderTile(browser);
  } finally {
    await browser.close();
  }
}

build().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
