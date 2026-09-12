/*
 * Builds the brand asset set from the logo master.
 *
 *   node scripts/build-brand.js [master.svg] [--out <directory>]
 *
 * The master (assets/mark.svg) is one artboard: the drop mark above the
 * MARKSTRATA / MARKDOWN lockup. Everything published - the mark on its own, the
 * wordmark on its own, the dark and single-colour variants, the icon PNGs and
 * the social card - is cut from that one file here, so no asset can drift away
 * from the artwork it came from. Re-run it after changing the master.
 *
 * Needs Playwright, which measures the real geometry and rasterises the PNGs:
 *   npm install --no-save playwright && npx playwright install chromium
 */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (error) {
  console.error('Playwright is not installed. Run:\n  npm install --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const master = path.resolve(args.find((a, i) => a.indexOf('--') !== 0 && args[i - 1] !== '--out') || path.join(root, 'assets', 'mark.svg'));
const outDir = path.resolve(outIndex === -1 ? path.join(root, 'assets') : args[outIndex + 1]);

/* The palette, taken from the master's own fills. */
const NAVY = '#013463';
const CYAN = '#36a7ca';
const SLATE = '#a7bcd0';
/*
 * Navy sits at about 1.4:1 on a dark surface, well under the 3:1 a graphic
 * needs to stay legible, so the dark variants lift it and lighten the fold to
 * match. Cyan already clears 4.5:1 either way and is left alone.
 */
const NAVY_DARK = '#2f7fc4';
const SLATE_DARK = '#c3d4e4';

const LIGHT = { [NAVY]: NAVY, [SLATE]: SLATE, [CYAN]: CYAN };
const DARK = { [NAVY]: NAVY_DARK, [SLATE]: SLATE_DARK, [CYAN]: CYAN };
/* A single-colour mark inherits `color` from whatever it is placed in. */
const MONO = { [NAVY]: 'currentColor', [SLATE]: 'currentColor', [CYAN]: 'currentColor' };

/* Rows further apart than this belong to different parts of the lockup. */
const ROW_GAP = 100;

const PNGS = [
  /* Tabs crop tightly, so the favicons run nearly edge to edge. */
  { file: 'icons/favicon-16.png', size: 16, pad: 0.02, source: 'mark-small.svg' },
  { file: 'icons/favicon-32.png', size: 32, pad: 0.02, source: 'mark-small.svg' },
  { file: 'icons/favicon-48.png', size: 48, pad: 0.02, source: 'mark-small.svg' },
  { file: 'icons/icon-192.png', size: 192, pad: 0.06, source: 'mark.svg' },
  { file: 'icons/icon-512.png', size: 512, pad: 0.06, source: 'mark.svg' },
  /* iOS fills transparency with black, so this one carries its own plate. */
  { file: 'icons/apple-touch-icon.png', size: 180, pad: 0.14, source: 'mark.svg', background: '#ffffff' }
];

function trim(value) {
  return Number(value.toFixed(2)).toString();
}

function dataUri(file) {
  return 'data:image/svg+xml;base64,' + fs.readFileSync(file).toString('base64');
}

/*
 * Reads every shape out of the master: its path data, the fill that actually
 * paints it, and where it sits. The master carries stale `fill` attributes
 * from an earlier colourway that a `style` overrides, so the style wins here
 * the same way it wins in a browser.
 */
async function readMaster(page, file) {
  await page.setContent('<body style="margin:0">'
    + fs.readFileSync(file, 'utf8').replace(/<\?xml[^>]*\?>/, '')
    + '</body>');
  return page.evaluate(() => {
    const svg = document.querySelector('svg');
    const hex = (value) => {
      const rgb = value.match(/^rgba?\(([^)]+)\)$/);
      if (!rgb) { return value.trim(); }
      const parts = rgb[1].split(/[,\s/]+/).slice(0, 3).map(Number);
      return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('');
    };
    const shapes = [...svg.querySelectorAll('path')].map((el) => {
      const style = el.getAttribute('style') || '';
      const styled = /fill:\s*([^;]+)/.exec(style);
      const box = el.getBBox();
      return {
        d: el.getAttribute('d'),
        fill: hex((styled ? styled[1] : el.getAttribute('fill') || '').trim()),
        x: box.x, y: box.y, width: box.width, height: box.height
      };
    });
    const defs = svg.querySelector('defs');
    return { shapes, defs: defs ? defs.outerHTML : '' };
  });
}

/*
 * Splits the artboard into its stacked rows - the mark, then the lines of the
 * wordmark - by looking for vertical gaps no shape crosses.
 */
function rows(shapes) {
  const sorted = [...shapes].sort((a, b) => a.y - b.y);
  const out = [];
  let current = [];
  let bottom = -Infinity;
  for (const shape of sorted) {
    if (current.length && shape.y - bottom > ROW_GAP) {
      out.push(current);
      current = [];
    }
    current.push(shape);
    bottom = Math.max(bottom, shape.y + shape.height);
  }
  if (current.length) { out.push(current); }
  return out;
}

function bounds(shapes) {
  return {
    x: Math.min(...shapes.map((s) => s.x)),
    y: Math.min(...shapes.map((s) => s.y)),
    right: Math.max(...shapes.map((s) => s.x + s.width)),
    bottom: Math.max(...shapes.map((s) => s.y + s.height))
  };
}

/*
 * One asset: the given shapes, recoloured, cropped by the viewBox. Path data
 * keeps the master's coordinates, so a shape is never rewritten to be reused;
 * a `transform` on the wrapping group is what moves a piece somewhere else.
 */
function paint(shapes, palette, gradients) {
  return shapes
    .map((shape) => {
      if (shape.fill.startsWith('url(')) {
        /* Gradients are lighting details; a single-colour asset has no use
         * for one, and dropping it takes the <defs> with it. */
        return gradients ? `<path fill="${shape.fill}" d="${shape.d}"/>` : '';
      }
      const fill = palette[shape.fill];
      if (fill === undefined) {
        throw new Error(`no colour mapped for ${shape.fill}`);
      }
      return `<path fill="${fill}" d="${shape.d}"/>`;
    })
    .join('');
}

function svg(viewBox, body, defs) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.map(trim).join(' ')}"`
    + ` role="img" aria-label="Markstrata Markdown">${body.includes('url(#') ? defs : ''}${body}</svg>\n`;
}

function compose(shapes, palette, defs, gradients = true) {
  const painted = paint(shapes, palette, gradients);
  const box = bounds(shapes);
  return svg([box.x, box.y, box.right - box.x, box.bottom - box.y], painted, defs);
}

/*
 * The horizontal lockup: the mark to the left of the type, sized so the two
 * read as one unit. It is laid out here rather than in the master because the
 * master stacks them, and a nav bar has height to spare but not width.
 */
const MARK_TO_TYPE = 1.5;   /* mark height, as a multiple of the type block's */
const GAP = 0.25;           /* space between them, as a share of the mark's width */

function composeHorizontal(mark, wordmark, palette, defs, gradients = true) {
  const markBox = bounds(mark);
  const typeBox = bounds(wordmark);
  const typeHeight = typeBox.bottom - typeBox.y;
  const scale = (typeHeight * MARK_TO_TYPE) / (markBox.bottom - markBox.y);
  const markWidth = (markBox.right - markBox.x) * scale;
  const height = typeHeight * MARK_TO_TYPE;
  const gap = markWidth * GAP;

  const place = (shapes, dx, dy, s) =>
    `<g transform="translate(${trim(dx)},${trim(dy)}) scale(${trim(s)})">`
    + paint(shapes, palette, gradients) + '</g>';

  const body = place(mark, -markBox.x * scale, -markBox.y * scale, scale)
    + place(wordmark, markWidth + gap - typeBox.x, (height - typeHeight) / 2 - typeBox.y, 1);
  return svg([0, 0, markWidth + gap + (typeBox.right - typeBox.x), height], body, defs);
}

async function rasterise(page, { file, size, pad, source, background }) {
  const inset = Math.round(size * pad);
  const uri = dataUri(path.join(outDir, source));
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;`
    + `background:${background || 'transparent'};display:flex;align-items:center;justify-content:center">`
    + `<img src="${uri}" style="width:${size - inset * 2}px;height:${size - inset * 2}px"></body>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
  const dest = path.join(outDir, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await page.screenshot({ path: dest, omitBackground: !background });
  return dest;
}

async function build() {
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
  );
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  try {
    const { shapes, defs } = await readMaster(page, master);
    const banded = rows(shapes);
    if (banded.length < 2) {
      throw new Error(`expected the mark and the wordmark on separate rows, found ${banded.length} row(s)`);
    }
    const mark = banded[0];
    const wordmark = banded.slice(1).flat();

    /*
     * Below about 40px the turned corner and the falling droplet break up into
     * stray pixels, so the small mark keeps the drop and the hash only - the
     * two largest shapes on the row.
     */
    const bySize = [...mark].sort((a, b) => b.width * b.height - a.width * a.height);
    const markSmall = mark.filter((shape) => bySize.indexOf(shape) < 2);

    const files = {
      'mark.svg': [mark, LIGHT],
      'mark-dark.svg': [mark, DARK],
      'mark-mono.svg': [mark, MONO, false],
      'mark-small.svg': [markSmall, LIGHT],
      'wordmark.svg': [wordmark, LIGHT],
      'wordmark-dark.svg': [wordmark, DARK],
      'lockup.svg': [shapes, LIGHT],
      'lockup-dark.svg': [shapes, DARK]
    };
    const horizontal = {
      'lockup-horizontal.svg': LIGHT,
      'lockup-horizontal-dark.svg': DARK
    };

    fs.mkdirSync(outDir, { recursive: true });
    for (const [name, [selection, palette, gradients]] of Object.entries(files)) {
      const svg = compose(selection, palette, defs, gradients !== false);
      fs.writeFileSync(path.join(outDir, name), svg);
      console.log(name.padEnd(22), String(svg.length).padStart(6), 'bytes');
    }

    for (const [name, palette] of Object.entries(horizontal)) {
      const markup = composeHorizontal(mark, wordmark, palette, defs);
      fs.writeFileSync(path.join(outDir, name), markup);
      console.log(name.padEnd(22), String(markup.length).padStart(6), 'bytes');
    }

    for (const spec of PNGS) {
      const dest = await rasterise(page, spec);
      console.log(spec.file.padEnd(22), String(fs.statSync(dest).size).padStart(6), 'bytes');
    }

    /* Social preview, at the 1.91:1 GitHub, Slack and Teams all crop to. */
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent('<body style="margin:0;width:1200px;height:630px;background:#f6f8fa;'
      + 'display:flex;flex-direction:column;gap:34px;align-items:center;justify-content:center;'
      + 'font:400 30px/1.4 -apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif">'
      + `<img src="${dataUri(path.join(outDir, 'lockup.svg'))}" style="height:370px">`
      + `<p style="margin:0;color:${NAVY}">Markdown for SharePoint, themed like the editors you write it in</p>`
      + '</body>');
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
    const card = path.join(outDir, 'social-card.png');
    await page.screenshot({ path: card });
    console.log('social-card.png'.padEnd(22), String(fs.statSync(card).size).padStart(6), 'bytes');
  } finally {
    await browser.close();
  }
}

build().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
