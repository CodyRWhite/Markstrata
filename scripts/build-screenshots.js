/**
 * .SYNOPSIS
 * Regenerates the theme screenshots in docs/images/.
 *
 * .DESCRIPTION
 *   node scripts/build-screenshots.js [--out <directory>]
 *
 * Each shot is the kitchen sink document rendered by the web part's own
 * pipeline and stylesheets - the same build the docs site publishes - so the
 * README shows what a SharePoint page actually shows rather than a mock-up.
 *
 * The capture covers the callouts and a code block, the two things the themes
 * differ on most. The demo chrome is hidden and the padding moves onto
 * .strata-root, which paints the theme background: anything outside it would be
 * the page's own white, which is what put a white strip down the left of the
 * dark shots before.
 *
 * Needs Playwright:
 *   npm install --no-save playwright && npx playwright install chromium
 *
 * .USAGE
 *   npm run screenshots
 *   node scripts/build-screenshots.js --out /tmp/shots
 *
 *   Needs Playwright:
 *     npm install --no-save playwright && npx playwright install chromium
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  nothing else in this project
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
const outDir = path.resolve(outIndex === -1 ? path.join(root, 'docs', 'images') : args[outIndex + 1]);
const buildDir = path.join(root, 'temp', 'screenshots');

const THEMES = ['github', 'obsidian', 'vscode'];
const MODES = ['light', 'dark'];
const WIDTH = 705;
const HEIGHT = 885;
/* Where the shot starts: the heading whose section shows the callouts. */
const ANCHOR = 'Callouts';

function build() {
  execFileSync(
    process.execPath,
    [path.join(root, 'demo', 'build-demo.js'), path.join(root, 'samples', 'kitchen-sink.md'),
      '--out', buildDir],
    { stdio: 'inherit', cwd: root }
  );
}

async function capture() {
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
  );
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2
  });
  await page.goto('file://' + path.join(buildDir, 'index.html'));
  await page.waitForLoadState('networkidle');

  /* The demo's own chrome is not part of the web part. */
  await page.addStyleTag({
    content: `.demo-bar { display: none !important; }
      .demo-stage { padding: 0 !important; }
      body { margin: 0; }
      .strata-root { padding: 18px 22px; }`
  });
  /* The controls are set through their own change events rather than clicked:
     the bar they live in is hidden for the capture, and a hidden control
     cannot be operated. */
  await page.evaluate(() => {
    window.setControl = (id, value) => {
      const element = document.getElementById(id);
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
  });
  await page.evaluate(() => window.setControl('toc', 'off'));

  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const theme of THEMES) {
    for (const mode of MODES) {
      await page.evaluate(([t, m]) => {
        window.setControl('theme', t);
        window.setControl('mode', m);
      }, [theme, mode]);
      /* The page paints the surface behind the web part, so it has to follow
         the theme too - otherwise the shot picks up white at the edges. */
      const surface = await page.evaluate(() => {
        const element = document.getElementById('root');
        const background = getComputedStyle(element).backgroundColor;
        document.body.style.background = background;
        return background;
      });
      if (/rgba\(0, 0, 0, 0\)|transparent/.test(surface)) {
        throw new Error(`${theme}/${mode}: the theme paints no background, so the shot would show the page behind it`);
      }
      await page.waitForTimeout(700);            // diagrams re-render on theme change
      await page.evaluate((text) => {
        const heading = [...document.querySelectorAll('.strata-content h2')]
          .find((h) => h.textContent.indexOf(text) !== -1);
        if (!heading) { throw new Error('no heading matching ' + text); }
        window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - 18);
      }, ANCHOR);
      await page.waitForTimeout(150);
      const file = path.join(outDir, `${theme}-${mode}.png`);
      await page.screenshot({ path: file });
      written.push(file);
    }
  }
  await browser.close();
  return written;
}

build();
capture().then((written) => {
  written.forEach((file) => {
    console.log(path.relative(root, file).padEnd(30), String(fs.statSync(file).size).padStart(7), 'bytes');
  });
}).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
