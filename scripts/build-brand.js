/**
 * .SYNOPSIS
 * Puts the brand package to work.
 *
 * .DESCRIPTION
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
 *
 * .USAGE
 *   npm run brand
 *
 *   Copies the brand package into assets/, redraws the social card and the web
 *   part tile, and stamps the tile into the web part's manifest.
 *
 *   Needs Playwright, because the card and the tile are drawn in a browser.
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  webpart-tile.ts
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
  path.join(root, 'sharepoint', 'icon.png')];

/*
 * The manifest icon is the web part's tile in the toolbox and on the full-page
 * apps picker, so it shows the thing itself - a document open in an editor -
 * rather than the mark, which is already the app catalog icon two rows up.
 * It is the rendered tile re-encoded a little harder: the manifest rides along
 * with every page that loads the web part, so the bytes are worth trimming.
 */
const MANIFEST_TILE_QUALITY = 70;

/*
 * One tile per web part, because a toolbox showing the same picture twice tells
 * an author nothing about which of the two entries they want - which is the
 * whole reason the two were given separate names.
 */
const TILES = [
  {
    lines: 'MARKDOWN',
    file: 'webpart-tile.jpg',
    manifest: path.join(root, 'src', 'webparts', 'markstrata',
      'MarkstrataWebPart.manifest.json')
  },
  {
    lines: 'HTML',
    file: 'webpart-tile-html.jpg',
    manifest: path.join(root, 'src', 'webparts', 'markstratahtml',
      'MarkstrataHtmlWebPart.manifest.json')
  }
];

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

/* Writes a manifest's icon from the data URI its tile render produced. */
function stampManifestIcon(manifest, dataUri) {
  const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  let changed = false;
  json.preconfiguredEntries.forEach((entry) => {
    if (entry.iconImageUrl !== dataUri) {
      entry.iconImageUrl = dataUri;
      changed = true;
    }
  });
  if (changed) {
    fs.writeFileSync(manifest, JSON.stringify(json, null, 2) + '\n');
  }
  console.log(`${path.basename(manifest, '.json')} icon`.padEnd(30),
    String(dataUri.length).padStart(6), 'chars', changed ? '(updated)' : '(unchanged)');
}

function dataUri(file) {
  const type = file.endsWith('.svg') ? 'svg+xml' : path.extname(file).slice(1);
  return `data:image/${type};base64,` + fs.readFileSync(file).toString('base64');
}

/*
 * A web part tile: its own source at an angle, with the mono-light glyph in
 * the corner. Rendered above its final size and scaled down, because the
 * perspective transform resamples the text and the extra pixels are what keep
 * the receding edge tight. JPEG, because it is photographic.
 */
async function renderTile(browser, which) {
  const page = await browser.newPage({ deviceScaleFactor: tile.SUPERSAMPLE });
  const dest = path.join(assets, which.file);
  await page.setViewportSize({ width: tile.WIDTH, height: tile.HEIGHT });
  await page.setContent('<body>'
    + tile.tileHtml(dataUri(path.join(assets, 'mark-mono-light.svg')), tile[which.lines])
    + '</body>');
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth));
  await page.screenshot({ path: dest, type: 'jpeg', quality: 82, scale: 'css' });
  /* The same frame, encoded for the manifest rather than for the site. */
  const inline = await page.screenshot({
    type: 'jpeg', quality: MANIFEST_TILE_QUALITY, scale: 'css'
  });
  await page.close();
  console.log(which.file.padEnd(30), String(fs.statSync(dest).size).padStart(6), 'bytes');
  return 'data:image/jpeg;base64,' + inline.toString('base64');
}

/*
 * The two icons a Teams app package needs, named for the web part's component
 * id, which is how SharePoint's Sync to Teams finds them: without them it
 * generates its own and the app in the Teams rail is not ours.
 *
 * The colour one is delivered at 192 and copied. The outline one has to be
 * drawn here, because Teams asks for something the brand package has no reason
 * to contain: 32 pixels square, transparent, and white all through. It is the
 * app bar icon, and Teams tints the whole thing itself, so anything other than
 * white comes out as a silhouette of the wrong shape.
 */
const TEAMS_COMPONENT_ID = '74aecd51-7619-4ca6-b81a-6c670d6098b3';

async function renderTeamsIcons(browser) {
  const teams = path.join(root, 'teams');
  fs.mkdirSync(teams, { recursive: true });

  const colour = path.join(teams, `${TEAMS_COMPONENT_ID}_color.png`);
  fs.copyFileSync(path.join(BRAND, 'export/markstrata-icon-192.png'), colour);
  console.log(`${TEAMS_COMPONENT_ID}_color.png`.padEnd(30),
    String(fs.statSync(colour).size).padStart(6), 'bytes');

  const outline = path.join(teams, `${TEAMS_COMPONENT_ID}_outline.png`);
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setViewportSize({ width: 32, height: 32 });
  /* The glyph is wider than it is tall, so it is fitted rather than stretched,
     with a little room around it: Teams draws this inside a small circle. */
  await page.setContent('<body style="margin:0;width:32px;height:32px;background:transparent;'
    + 'display:flex;align-items:center;justify-content:center">'
    + `<img src="${dataUri(path.join(assets, 'mark-mono-light.svg'))}" style="width:26px"></body>`);
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete && image.naturalWidth));
  await page.screenshot({ path: outline, omitBackground: true });
  await page.close();
  console.log(`${TEAMS_COMPONENT_ID}_outline.png`.padEnd(30),
    String(fs.statSync(outline).size).padStart(6), 'bytes');
}

/* Social preview, at the 1.91:1 GitHub, Slack and Teams all crop to. */
async function renderSocialCard(browser) {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const dest = path.join(assets, 'social-card.png');
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent('<body style="margin:0;width:1200px;height:630px;background:#F7FAFA;'
    + 'display:flex;align-items:center;justify-content:center">'
    + `<img src="${dataUri(path.join(assets, 'lockup-tagline.svg'))}" style="width:760px"></body>`);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth));
  await page.screenshot({ path: dest });
  await page.close();
  console.log('social-card.png'.padEnd(30), String(fs.statSync(dest).size).padStart(6), 'bytes');
}

async function build() {
  copyDelivered();
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
  );
  try {
    await renderSocialCard(browser);
    await renderTeamsIcons(browser);
    for (const which of TILES) {
      stampManifestIcon(which.manifest, await renderTile(browser, which));
    }
  } finally {
    await browser.close();
  }
}

build().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
