/*
 * Drives the harness in Chromium and checks the things only a running page can
 * show: that the toolbar wires up, that the contents track the reading
 * position, that copy copies the source rather than the line numbers, that a
 * theme change re-renders diagrams, and that the editor previews as you type.
 *
 *   npm run harness:drive
 *
 * Needs Playwright:  npm install --no-save playwright && npx playwright install chromium
 */
const path = require('path');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (error) {
  console.error('Playwright is not installed. Run:\n  npm install --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const OUT = path.join(__dirname, 'dist');
const pageUrl = 'file://' + path.join(OUT, 'index.html');

(async () => {
  // PLAYWRIGHT_CHROMIUM lets a preinstalled browser be used instead.
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
  );
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1.5 });

  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });

  await page.goto(pageUrl, { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  const step = async (name, fn) => {
    try {
      await fn();
      console.log('  ok   ' + name);
    } catch (error) {
      console.log('  FAIL ' + name + ' :: ' + error.message.split('\n')[0]);
      problems.push(name + ': ' + error.message.split('\n')[0]);
    }
  };

  console.log('Driving the web part:');

  await step('toolbar rendered', async () => {
    await page.waitForSelector('.strata-toolbar .strata-btn', { timeout: 5000 });
  });

  // Either placement, so the check follows the harness's starting position
  // rather than pinning it: what matters is that headings became entries.
  await step('contents built from headings', async () => {
    const count = await page.locator('.strata-toc-sidebar .strata-toc a, .strata-toc-inline .strata-toc a').count();
    if (count < 5) throw new Error('only ' + count + ' entries');
  });

  await step('callouts rendered', async () => {
    const count = await page.locator('.strata-callout').count();
    if (count < 8) throw new Error('only ' + count + ' callouts');
  });

  await step('mermaid diagram rendered to svg', async () => {
    await page.waitForSelector('.strata-mermaid svg', { timeout: 15000 });
  });

  /*
   * Gantt labels come from mermaid's own stylesheet at 10-11px, and unlike a
   * flowchart the chart re-lays out rather than scaling, so they stay that
   * size however wide the column is. themeCSS is what lifts them; this fails
   * if that override stops reaching the generated stylesheet.
   */
  /*
   * The size that matters is the one on screen, not the one in the stylesheet.
   * An SVG with a viewBox is scaled to fit its box, so gantt labels shipped at
   * 13px and then 16px still arrived smaller than body text while a check on
   * the computed value passed. This measures what a reader actually gets, by
   * multiplying the computed size by the SVG's scale, and compares it to the
   * page's own body text.
   */
  await step('gantt labels reach the screen at body text size', async () => {
    await page.waitForSelector('.strata-mermaid svg .taskText', { timeout: 15000 });
    const seen = await page.evaluate(() => {
      const svg = document.querySelector('.strata-mermaid svg[aria-roledescription="gantt"]');
      if (!svg) { return { error: 'no gantt in the sample' }; }
      const box = parseFloat(svg.getAttribute('viewBox').split(/\s+/)[2]);
      const scale = svg.getBoundingClientRect().width / box;
      const body = parseFloat(getComputedStyle(document.querySelector('.strata-content p')).fontSize);
      const onScreen = (sel) => {
        const el = document.querySelector('.strata-mermaid ' + sel);
        return el ? parseFloat(getComputedStyle(el).fontSize) * scale : 0;
      };
      return { scale: scale, body: body, tick: onScreen('.tick text'),
               task: onScreen('.taskText'), section: onScreen('.sectionTitle') };
    });
    if (seen.error) throw new Error(seen.error);
    for (const name of ['tick', 'task', 'section']) {
      /* A little under body text is fine; noticeably under is the bug. */
      if (seen[name] < seen.body - 2) {
        throw new Error(`${name} reaches the screen at ${seen[name].toFixed(1)}px `
          + `against ${seen.body}px body text (svg scale ${seen.scale.toFixed(3)})`);
      }
    }
  });

  await step('katex rendered', async () => {
    await page.waitForSelector('.strata-math-block .katex', { timeout: 5000 });
  });

  /* The sample links brand/mark.svg relatively, so this proves both that the
     image survives rendering and that the browser could actually fetch it. */
  await step('every image decodes: relative, data URI and reference style', async () => {
    await page.waitForSelector('.strata-content img', { timeout: 5000 });
    const imgs = await page.evaluate(() => [...document.querySelectorAll('.strata-content img')]
      .map((img) => ({ src: img.getAttribute('src'), loading: img.getAttribute('loading'),
                       width: img.naturalWidth })));
    if (imgs.length < 3) throw new Error('only ' + imgs.length + ' images');
    for (const img of imgs) {
      if (img.loading !== 'lazy') throw new Error('loading=' + img.loading + ' on ' + img.src.slice(0, 40));
      if (!img.width) throw new Error('did not decode: ' + img.src.slice(0, 60));
    }
    /* The data URI must survive untouched; resolving it would corrupt it. */
    if (!imgs.some((i) => i.src.indexOf('data:image/png;base64,') === 0)) {
      throw new Error('the data URI was rewritten');
    }
  });

  /*
   * A diagram is the one thing on the page nobody can copy out by selecting it,
   * so the button hands over a raster. This checks the clipboard actually
   * receives PNG bytes, not that a button exists and says Copied.
   */
  await step('a diagram can be copied as a PNG', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const host = page.locator('.strata-mermaid').first();
    await host.hover();
    await page.locator('.strata-diagram-copy').first().click();
    await page.waitForTimeout(1000);
    const copied = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.indexOf('image/png') !== -1) {
          const bytes = new Uint8Array(await (await item.getType('image/png')).arrayBuffer());
          return { bytes: bytes.length, png: bytes[0] === 0x89 && bytes[1] === 0x50 };
        }
      }
      return { bytes: 0, png: false };
    });
    if (!copied.png) throw new Error('no PNG on the clipboard');
    if (copied.bytes < 1000) throw new Error('suspiciously small: ' + copied.bytes + ' bytes');
  });

  await step('copy button copies the code, without line numbers', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const block = page.locator('.strata-code[data-lang="typescript"]').first();
    await block.hover();
    await block.locator('.strata-code-copy').click();
    await page.waitForTimeout(300);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    if (!text.includes('export function resolveMode')) throw new Error('unexpected clipboard: ' + text.slice(0, 40));
    if (/^\s*1\s/.test(text)) throw new Error('line numbers were copied');
    if (text.split('\n').length < 8) throw new Error('too few lines copied');
    const state = await block.locator('.strata-code-copy').getAttribute('data-state');
    if (state !== 'done') throw new Error('button did not confirm, state=' + state);
  });

  await step('foldable callout opens on click', async () => {
    const details = page.locator('details.strata-callout').first();
    if (await details.evaluate((el) => el.open)) throw new Error('started open');
    await details.locator('summary').click();
    if (!(await details.evaluate((el) => el.open))) throw new Error('did not open');
  });

  await step('scroll spy marks the heading in view', async () => {
    await page.evaluate(() => document.querySelector('#tables').scrollIntoView());
    await page.waitForTimeout(600);
    const current = await page.locator('.strata-toc a[aria-current="true"]').count();
    if (current !== 1) throw new Error(current + ' entries marked current');
    const label = await page.locator('.strata-toc a[aria-current="true"]').innerText();
    if (label.trim() !== 'Tables') throw new Error('marked "' + label.trim() + '"');
  });

  await step('clicking a contents entry highlights that entry', async () => {
    await page.locator('.strata-toc a', { hasText: 'Callouts' }).first().click();
    await page.waitForTimeout(900);
    const label = await page.locator('.strata-toc a[aria-current="true"]').innerText();
    if (label.trim() !== 'Callouts') throw new Error('marked "' + label.trim() + '"');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
  });

  await step('reader theme switcher repaints', async () => {
    await page.selectOption('.strata-switcher select', 'obsidian');
    await page.waitForTimeout(400);
    const theme = await page.locator('.strata-root').getAttribute('data-strata-theme');
    if (theme !== 'obsidian') throw new Error('theme is ' + theme);
  });

  await step('dark mode toggle repaints', async () => {
    await page.getByRole('button', { name: 'Dark mode' }).click();
    await page.waitForTimeout(600);
    const mode = await page.locator('.strata-root').getAttribute('data-strata-mode');
    if (mode !== 'dark') throw new Error('mode is ' + mode);
  });

  await step('mermaid re-rendered for the new theme', async () => {
    await page.waitForSelector('.strata-mermaid svg', { timeout: 15000 });
  });

  /*
   * The themed root has to be an element of ours inside the host, painting its
   * own background. Stamped onto the host instead, SharePoint's own styling of
   * the web part container beat it in display mode and the page came out as
   * dark-theme text on a white background.
   */
  await step('the themed root is ours, and paints its background', async () => {
    const state = await page.evaluate(() => {
      const host = document.getElementById('host');
      const root = host.querySelector('.strata-root');
      if (!root) { return { error: 'no .strata-root inside the host' }; }
      if (root === host) { return { error: '.strata-root is the host itself' }; }
      const bg = getComputedStyle(root).backgroundColor;
      const rgb = /(\d+), (\d+), (\d+)/.exec(bg);
      return {
        bg,
        transparent: /rgba\(0, 0, 0, 0\)|transparent/.test(bg),
        luminance: rgb ? (Number(rgb[1]) + Number(rgb[2]) + Number(rgb[3])) / 3 : null
      };
    });
    if (state.error) { throw new Error(state.error); }
    if (state.transparent) { throw new Error('the root paints no background, so the page shows through'); }
    if (state.luminance > 128) { throw new Error('dark mode but the root is light: ' + state.bg); }
  });

  await page.screenshot({ path: path.join(OUT, 'harness-view-obsidian-dark.png'), fullPage: false });

  await step('contents move to the right', async () => {
    await page.evaluate(() => window.harness.setToc('right'));
    await page.waitForTimeout(400);
    const placement = await page.locator('.strata-layout').getAttribute('data-strata-toc');
    if (placement !== 'right') throw new Error('placement is ' + placement);
  });

  await step('edit mode opens a split editor with a live preview', async () => {
    await page.evaluate(() => window.harness.toggleEdit());
    await page.waitForSelector('.strata-editor-input', { timeout: 5000 });
    await page.fill('.strata-editor-input', '# Live\n\n> [!tip] Typed just now\n> The preview should follow.\n\n```js\nconst x = 1;\n```');
    await page.waitForTimeout(800);
    const previewText = await page.locator('.strata-preview-pane .strata-content').innerText();
    if (!previewText.includes('Typed just now')) throw new Error('preview did not update');
    const callouts = await page.locator('.strata-preview-pane .strata-callout').count();
    if (callouts !== 1) throw new Error('preview callouts: ' + callouts);
  });

  await page.screenshot({ path: path.join(OUT, 'harness-edit-split.png'), fullPage: false });

  await step('Ctrl+S saves', async () => {
    await page.locator('.strata-editor-input').press('Control+s');
    await page.waitForTimeout(400);
    const status = await page.locator('.strata-status').innerText();
    if (!/Saved/i.test(status)) throw new Error('status reads "' + status + '"');
  });

  await step('layout switches to edit or preview only', async () => {
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.waitForTimeout(200);
    const layout = await page.locator('.strata-editor').getAttribute('data-layout');
    if (layout !== 'preview') throw new Error('layout is ' + layout);
  });

  await step('narrow column collapses the layout', async () => {
    await page.evaluate(() => window.harness.toggleEdit());
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 560, height: 900 });
    await page.waitForTimeout(400);
    const box = await page.locator('.strata-content').boundingBox();
    const toc = await page.locator('.strata-toc-sidebar').boundingBox();
    if (toc.y + toc.height > box.y + 8) throw new Error('contents overlap the text');
  });

  await page.screenshot({ path: path.join(OUT, 'harness-narrow.png'), fullPage: false });

  console.log('\n' + (problems.length ? 'Problems:\n  ' + problems.join('\n  ') : 'No failures and no page errors.'));
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
