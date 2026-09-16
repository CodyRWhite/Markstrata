/**
 * .SYNOPSIS
 * Drives the harness in Chromium and checks the things only a running page can
 * show: that the toolbar wires up, that the contents track the reading
 * position, that copy copies the source rather than the line numbers, that a
 * theme change re-renders diagrams, and that the editor previews as you type.
 *
 * .DESCRIPTION
 *   npm run harness:drive
 *
 * Needs Playwright:  npm install --no-save playwright && npx playwright install chromium
 *
 * .USAGE
 *   npm run harness:drive
 *
 *   Needs Playwright:
 *     npm install --no-save playwright && npx playwright install chromium
 *
 *   PLAYWRIGHT_CHROMIUM=/path/to/chrome node harness/drive.js   uses that browser.
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  nothing else in this project
 */

const fs = require('fs');
const path = require('path');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (error) {
  console.error('Playwright is not installed. Run:\n  npm install --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const HARNESS_DIST = path.join(__dirname, 'dist');
const pageUrl = 'file://' + path.join(HARNESS_DIST, 'index.html');
/*
 * The property pane only exists on the page the documentation site publishes:
 * the bare harness page is the web part with no chrome around it. So the pane
 * is driven against the built site, which is the artifact that ships, rather
 * than a copy of it built here.
 *
 * It is a second pass rather than a replacement for the first because the site
 * page resolves its images against the site root, and the image checks above
 * would then be testing paths instead of behaviour.
 */
const demoUrl = 'file://' + path.join(__dirname, '..', 'site', 'demo', 'index.html');
/*
 * And the web part itself, which is a third page because it is a different
 * thing being driven: not the renderers, but MarkstrataWebPart's own
 * lifecycle, against the SharePoint stand-ins in harness/spfx.
 */
const webPartUrl = 'file://' + path.join(HARNESS_DIST, 'webpart.html');
/* The library harness/spfx/sharePoint.ts stands up, as a path. */
const LIBRARY_PATH = '/sites/demo/Documents';

(async () => {
  // PLAYWRIGHT_CHROMIUM lets a preinstalled browser be used instead.
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
  );
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1.5 });

  /*
   * The stand-in library, one layer further out than harness/spfx reaches.
   *
   * The web part resolves a relative image against the folder its document is
   * in, which is right and is what production does: the sample writes
   * `brand/mark.svg` and the web part asks SharePoint for
   * /sites/demo/Documents/brand/mark.svg. Under file:// that is the root of
   * the filesystem, so the picture never arrived - which is what the three
   * unnamed ERR_FILE_NOT_FOUND in CI were, every one of them this same file.
   *
   * harness/spfx cannot answer it, because an <img> goes over the network
   * rather than through the SPHttpClient stand-in, so the stand-in never sees
   * the request. This does, and serves it out of the harness build, where the
   * same file really is sitting.
   *
   * Only what the library would actually hold is served. Anything else under
   * that path is aborted rather than passed through, so a request for a file
   * that is not there still reports as a failure: watching for failed
   * requests is worth nothing if the harness answers all of them.
   */
  await page.route('**/sites/demo/**', (route, request) => {
    const asked = new URL(request.url()).pathname;

    /* SharePoint's own preview page, which an Office embed puts in a frame.
       Stood in for here rather than left to fail, because the thing being
       checked is that the frame is built and addressed correctly - what
       SharePoint draws inside it is SharePoint's business and is not
       reachable from a harness at all. */
    if (asked.indexOf('/_layouts/15/Doc.aspx') !== -1) {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Preview</title>'
          + '<body><p id="stand-in-preview">SharePoint would draw the document here.</p>'
      });
    }

    const within = asked.indexOf(LIBRARY_PATH) === 0
      ? asked.slice(LIBRARY_PATH.length + 1)
      : '';
    const file = within ? path.join(HARNESS_DIST, within) : '';
    if (file && file.indexOf(HARNESS_DIST) === 0 && fs.existsSync(file)) {
      return route.fulfill({ path: file });
    }
    return route.abort();
  });

  const problems = [];
  page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
  /*
   * A console error is a problem unless a check has said it is expecting one.
   * Two of them break something on purpose, and a web part that says so on the
   * console is the behaviour being checked, not a fault.
   */
  /*
   * A console error for a missing file says only "Failed to load resource",
   * with no clue which one. CI reported three of those and nothing else, and
   * finding out which three meant guessing. Playwright knows the address, so
   * ask it.
   */
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const why = failure ? failure.errorText : 'failed';

    /*
     * ERR_ABORTED is not a failure. It is what a browser reports for a request
     * it cancelled itself, which is what happens to anything still in flight
     * when the page navigates - and this driver navigates between a dozen
     * pages. It was reported twice as a missing brand mark on a site page that
     * is sitting exactly where it belongs, once here and once to an agent who
     * correctly went and checked before believing it.
     *
     * A request that was really refused or really not found says so with a
     * different error, and those are still reported.
     */
    if (why === 'net::ERR_ABORTED') {
      return;
    }

    problems.push(`request: ${why} ${request.url()}`);
  });

  const expected = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (expected.some((pattern) => pattern.test(text))) return;
    problems.push('console: ' + text);
  });

  await page.goto(pageUrl, { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  const step = async (name, check) => {
    try {
      await check();
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

  /*
   * What the bar is made of and in what order: the theme list and how long the
   * document takes on the left, everything you can do to the page in one group
   * at the right, the colour toggle last of those. It also has to sit level in
   * its own strip - it used to carry more air below it than above, which read
   * as a bar hung too high.
   */
  await step('the bar reads left to right and sits level', async () => {
    const bar = await page.evaluate(() => {
      const toolbar = document.querySelector('.strata-toolbar');
      const style = getComputedStyle(toolbar);
      const actions = toolbar.querySelector('.strata-toolbar-actions');
      return {
        order: Array.from(toolbar.children).map((child) => child.className),
        actions: actions
          ? Array.from(actions.children).map((child) => (child.textContent || '').trim())
          : [],
        top: parseFloat(style.paddingTop),
        bottom: parseFloat(style.paddingBottom)
      };
    });
    const expected = ['strata-switcher', 'strata-reading-time', 'strata-toolbar-actions'];
    if (bar.order.join(' ') !== expected.join(' ')) {
      throw new Error('the bar holds ' + JSON.stringify(bar.order));
    }
    /* Reload and History are about the file, Share and Print are about the
       document on screen, and the mode switch is about the page. Share sits
       with Print rather than beside Reload for that reason. */
    if (bar.actions.join(' ') !== 'Reload History Share Print Dark mode') {
      throw new Error('the actions are ' + JSON.stringify(bar.actions));
    }
    if (Math.abs(bar.top - bar.bottom) > 0.5) {
      throw new Error('padded ' + bar.top + ' above and ' + bar.bottom + ' below');
    }
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
      const viewBoxWidth = parseFloat(svg.getAttribute('viewBox').split(/\s+/)[2]);
      const scale = svg.getBoundingClientRect().width / viewBoxWidth;
      const body = parseFloat(getComputedStyle(document.querySelector('.strata-content p')).fontSize);
      const onScreen = (selector) => {
        const element = document.querySelector('.strata-mermaid ' + selector);
        return element ? parseFloat(getComputedStyle(element).fontSize) * scale : 0;
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
    /* Every image is loading="lazy", so one below the fold has not decoded yet
       and never will while it is off screen. Bring each into view first, or
       this measures where the images are rather than whether they load. */
    await page.evaluate(async () => {
      const images = [...document.querySelectorAll('.strata-content img')];
      for (const image of images) {
        image.scrollIntoView();
        await new Promise((done) => setTimeout(done, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
    const images = await page.evaluate(() => [...document.querySelectorAll('.strata-content img')]
      .map((image) => ({ src: image.getAttribute('src'), loading: image.getAttribute('loading'),
                       width: image.naturalWidth })));
    if (images.length < 3) throw new Error('only ' + images.length + ' images');
    for (const image of images) {
      if (image.loading !== 'lazy') throw new Error('loading=' + image.loading + ' on ' + image.src.slice(0, 40));
      if (!image.width) throw new Error('did not decode: ' + image.src.slice(0, 60));
    }
    /* The data URI must survive untouched; resolving it would corrupt it. */
    if (!images.some((image) => image.src.indexOf('data:image/png;base64,') === 0)) {
      throw new Error('the data URI was rewritten');
    }
  });

  /*
   * Captions and the full size view are built from the rendered document
   * rather than from the markdown, because both turn on where an image sits:
   * only an image that is a paragraph of its own can become a figure, and an
   * image inside a link already does something when clicked. Nothing outside a
   * browser can check either.
   */
  await step('a titled image on its own becomes a figure with a caption', async () => {
    const captions = await page.locator('.strata-figure figcaption').allTextContents();
    if (!captions.length) throw new Error('no figure captions at all');
    if (!captions.some((text) => /shown as a caption/.test(text))) {
      throw new Error('captions read: ' + JSON.stringify(captions));
    }
    const stillATooltip = await page.locator('.strata-figure img[title]').count();
    if (stillATooltip !== 0) throw new Error('the title is still a tooltip as well');
  });

  await step('an inline image is left in its sentence', async () => {
    /* The data URI in the kitchen sink sits mid-sentence and carries a title;
       lifting it into a figure would break the sentence around it. */
    const inline = await page.evaluate(() => {
      const images = Array.prototype.slice.call(document.querySelectorAll('.strata-content img'));
      return images.some((image) => image.closest('p') && (image.closest('p').textContent || '').trim().length > 0);
    });
    if (!inline) throw new Error('no inline image left to check');
  });

  await step('a sized image keeps its aspect ratio', async () => {
    const bounds = await page.evaluate(() => {
      const image = document.querySelector('.strata-content img[width="240"]');
      if (!image) return null;
      const rect = image.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height),
               natural: image.naturalWidth / image.naturalHeight };
    });
    if (!bounds) throw new Error('the sized image is missing');
    if (bounds.width !== 240) {
      throw new Error('rendered ' + bounds.width + 'px wide, asked for 240');
    }
    const ratio = bounds.width / bounds.height;
    if (Math.abs(ratio - bounds.natural) > 0.02) {
      throw new Error('drawn at ' + ratio.toFixed(3) + ', the picture is ' + bounds.natural.toFixed(3));
    }
  });

  await step('clicking an image opens it full size, and Escape closes it', async () => {
    await page.locator('.strata-content img.strata-zoomable').first().click();
    await page.waitForTimeout(250);
    if (await page.locator('.strata-zoom img').count() === 0) {
      throw new Error('no full size view opened');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    if (await page.locator('.strata-zoom').count() !== 0) {
      throw new Error('Escape did not close it');
    }
  });

  await step('reading time counts prose, not code or diagram source', async () => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    /* The pill shows the number beside a clock, and says the whole phrase in
       its tooltip: "4 min" next to a clock face needs no second word. */
    const shown = await page.locator('.strata-reading-time-value').textContent();
    if (!/^\d+ min$/.test((shown || '').trim())) {
      throw new Error('toolbar reads "' + shown + '"');
    }
    const spoken = await page.locator('.strata-reading-time').getAttribute('title');
    if (!/^About \d+ min to read$/.test(spoken || '')) {
      throw new Error('the pill says "' + spoken + '" to a pointer');
    }
    /* The kitchen sink is mostly code and diagrams. Counting those as prose
       roughly doubles it, so the two numbers have to differ. */
    const counts = await page.evaluate(() => {
      const article = document.querySelector('.strata-content');
      const words = (text) => (text || '').trim().split(/\s+/).filter(Boolean).length;
      const copy = article.cloneNode(true);
      [...copy.querySelectorAll('pre, code, .strata-mermaid, .strata-toc, figcaption')]
        .forEach((node) => node.remove());
      return { everything: words(article.textContent), prose: words(copy.textContent) };
    });
    if (counts.prose >= counts.everything) {
      throw new Error('nothing was excluded: ' + JSON.stringify(counts));
    }
    const claimed = parseInt((shown || '').trim(), 10);
    if (claimed !== Math.max(1, Math.round(counts.prose / 220))) {
      throw new Error('says ' + claimed + ' for ' + counts.prose + ' words of prose');
    }
  });

  await step('back to top appears once scrolled, and goes back', async () => {
    /* Reading, not editing, and started from the top: this checks the button
       following the scroll position, so it must inherit neither a mode nor a
       position from whatever ran before it. */
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.waitForTimeout(400);

    const button = page.locator('.strata-to-top');
    if (await button.count() !== 1) throw new Error('no button');
    if (!(await button.isHidden())) {
      const showing = await page.evaluate(() => {
        const button = document.querySelector('.strata-to-top');
        const root = document.querySelector('.strata-root');
        return { scrollY: Math.round(window.scrollY),
                 rootTop: root ? Math.round(root.getBoundingClientRect().top) : 'no root',
                 hiddenAttr: button.hidden, buttons: document.querySelectorAll('.strata-to-top').length,
                 editing: !!document.querySelector('[data-strata-editing]') };
      });
      throw new Error('showing: ' + JSON.stringify(showing));
    }

    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(400);
    if (await button.isHidden()) {
      const showing = await page.evaluate(() => {
        const root = document.querySelector('.strata-root');
        return { scrollY: Math.round(window.scrollY),
                 docHeight: document.documentElement.scrollHeight,
                 viewport: window.innerHeight,
                 rootTop: root ? Math.round(root.getBoundingClientRect().top) : 'none' };
      });
      throw new Error('still hidden: ' + JSON.stringify(showing));
    }

    const side = await button.getAttribute('data-strata-side');
    if (side !== 'right') throw new Error('sits on the ' + side);

    await button.click();
    await page.waitForTimeout(900);
    const top = await page.evaluate(() =>
      Math.round(document.querySelector('.strata-root').getBoundingClientRect().top));
    if (top < -40) throw new Error('document top still ' + top + 'px above the screen');
  });

  await step('the button can be moved to the left, or turned off', async () => {
    await page.evaluate(() => window.harness.setBackToTop('left'));
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(400);
    const side = await page.locator('.strata-to-top').getAttribute('data-strata-side');
    if (side !== 'left') throw new Error('sits on the ' + side);

    await page.evaluate(() => window.harness.setBackToTop('off'));
    await page.waitForTimeout(300);
    if (await page.locator('.strata-to-top').count() !== 0) {
      throw new Error('still there with the setting off');
    }
    await page.evaluate(() => window.harness.setBackToTop('right'));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
  });

  /*
   * Checking a link means asking SharePoint, which happens after the document
   * is on screen rather than during the render. The demo stands in for the
   * library with a folder holding some of the pages the sample links to and
   * not others.
   */
  await step('a link to a page that is not there is marked', async () => {
    /* A wiki link only has a folder to ask about once the document has a
       library path, which is what a library file gives it. The document is
       swapped for one made of links while that is set, because a base path
       moves relative image paths with it and there is no library behind this
       page to serve them. */
    await page.evaluate(() => window.harness.setLibraryBase('/sites/demo/runbooks',
      '# Links\n\nHere: [[deploy]], [[handbook|the handbook]], '
      + '[[a page nobody wrote]], [[deploy#Rollback]] and [[#Links]].\n'));
    await page.waitForTimeout(800);
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('a.strata-wiki-link')].map((link) => ({
        text: link.textContent.replace(' (page not found)', ''),
        missing: link.classList.contains('strata-wiki-link--missing'),
        note: !!link.querySelector('.strata-missing-note')
      })));
    if (links.length < 4) throw new Error('only ' + links.length + ' wiki links');

    const gone = links.filter((link) => link.missing);
    const found = links.filter((link) => !link.missing);
    if (!gone.length) throw new Error('nothing marked: ' + JSON.stringify(links));
    if (!found.length) throw new Error('everything marked: ' + JSON.stringify(links));
    if (!gone.every((link) => link.note)) {
      throw new Error('a marked link says nothing to a screen reader');
    }
    /* The one pointing inside this document is not asked about at all. */
    const inward = await page.evaluate(() =>
      [...document.querySelectorAll('a.strata-wiki-link')]
        .filter((link) => (link.getAttribute('href') || '').charAt(0) === '#')
        .every((link) => !link.classList.contains('strata-wiki-link--missing')));
    if (!inward) throw new Error('a link to a heading here was called missing');
  });

  await step('a missing link is marked visibly, not just in the markup', async () => {
    const colours = await page.evaluate(() => {
      const gone = document.querySelector('a.strata-wiki-link--missing');
      const present = [...document.querySelectorAll('a.strata-wiki-link')]
        .find((link) => !link.classList.contains('strata-wiki-link--missing'));
      return { gone: getComputedStyle(gone).color, present: getComputedStyle(present).color };
    });
    if (colours.gone === colours.present) {
      throw new Error('a missing link paints the same as a working one: ' + colours.gone);
    }
    /* Both put back, so the later checks see the sample they expect. */
    await page.evaluate(() => window.harness.setLibraryBase('', ''));
    await page.waitForTimeout(600);
  });

  /*
   * Where a relative link points. A document saying [deploy](deploy.md) means
   * the folder it is in, but the browser resolves that against the page it is
   * on - an .aspx in SitePages - and lands somewhere the document never meant.
   * Images have been resolved against the document's folder from the start;
   * links never were.
   */
  await step('a relative link points from the document, not from the page', async () => {
    await page.evaluate(() => window.harness.setLibraryBase('/sites/demo/runbooks',
      '# Links\n\nOrdinary: [deploy](deploy.md) and [a file](notes/spec.pdf).\n'));
    await page.waitForTimeout(600);
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('.strata-content a')].map((link) => link.getAttribute('href')));
    if (hrefs.indexOf('/sites/demo/runbooks/deploy.md') === -1) {
      throw new Error('the markdown link reads ' + JSON.stringify(hrefs));
    }
    /* Not only markdown: a relative link to anything else was just as wrong. */
    if (hrefs.indexOf('/sites/demo/runbooks/notes/spec.pdf') === -1) {
      throw new Error('the file link reads ' + JSON.stringify(hrefs));
    }
  });

  await step('a link to another document opens it here, and there is a way back', async () => {
    await page.evaluate(() => window.harness.setLibraryBase('/sites/demo/runbooks',
      '# Handbook\n\nSee [[deploy]] for how we ship.\n'));
    await page.waitForTimeout(600);

    await page.locator('.strata-content a.strata-wiki-link').first().click();
    await page.waitForTimeout(600);

    const opened = await page.evaluate(() => ({
      heading: ((document.querySelector('.strata-content h1') || {}).textContent || '')
        .replace('#', '').trim(),
      bar: !!document.querySelector('.strata-open-doc'),
      name: (document.querySelector('.strata-crumb-here') || {}).textContent,
      hover: (document.querySelector('.strata-crumb-here') || {}).title,
      crumbs: Array.prototype.slice
        .call(document.querySelectorAll('.strata-crumb-link'))
        .map((crumb) => (crumb.textContent || '').trim())
    }));
    if (opened.heading !== 'Deploying') {
      throw new Error('the document on screen is "' + opened.heading + '"');
    }
    if (!opened.bar) throw new Error('nothing says which document is open');
    if (opened.name !== 'deploy') throw new Error('the bar names "' + opened.name + '"');
    /* The extension is dropped from what is drawn, because every document
       here is markdown and it is on every crumb. The file name itself is
       still what the reader is being sent to, so it stays on hover. */
    if (opened.hover !== 'deploy.md') {
      throw new Error('the crumb no longer names the file: "' + opened.hover + '"');
    }
    /* One link in, the only crumb behind this one is the configured document. */
    if (opened.crumbs.length !== 1 || opened.crumbs[0] !== 'handbook') {
      throw new Error('the trail behind it reads ' + JSON.stringify(opened.crumbs));
    }

    await page.locator('.strata-crumb-link').first().click();
    await page.waitForTimeout(600);
    const home = await page.evaluate(() => ({
      heading: ((document.querySelector('.strata-content h1') || {}).textContent || '')
        .replace('#', '').trim(),
      bar: !!document.querySelector('.strata-open-doc')
    }));
    if (home.heading !== 'Handbook') throw new Error('back gave "' + home.heading + '"');
    if (home.bar) throw new Error('the bar is still there at home');
  });

  await step('a link to a heading in another document lands on it', async () => {
    await page.evaluate(() => window.harness.setLibraryBase('/sites/demo/runbooks',
      '# Handbook\n\nStraight to [[deploy#Rollback]].\n'
      + '\n' + 'Filler.\n'.repeat(80)));
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.locator('.strata-content a.strata-wiki-link').first().click();
    await page.waitForTimeout(800);

    const landed = await page.evaluate(() => {
      const heading = document.getElementById('rollback');
      if (!heading) { return { error: 'the heading is not in the opened document' }; }
      const root = document.querySelector('.strata-root');
      const offset = parseFloat(getComputedStyle(root).getPropertyValue('--strata-scroll-offset')) || 0;
      return { top: heading.getBoundingClientRect().top, offset: offset };
    });
    if (landed.error) throw new Error(landed.error);
    /* Not under whatever is stuck above, and not left at the top of the
       document either. */
    if (landed.top < landed.offset - 2 || landed.top > landed.offset + 40) {
      throw new Error('the heading sits at ' + Math.round(landed.top)
        + ' with the line at ' + Math.round(landed.offset));
    }
    await page.locator('.strata-crumb-link').first().click();
    await page.waitForTimeout(400);
  });

  /*
   * The browser's own Back button, which is the half of following a link that
   * could not be driven until the navigator moved out of the web part: it
   * pushes a history entry at the same URL, so Back comes back here rather than
   * sending SharePoint's router off to a page of its own.
   */
  await step('the browser\'s Back button comes back to the first document', async () => {
    await page.evaluate(() => window.harness.setLibraryBase('/sites/demo/runbooks',
      '# Handbook\n\nSee [[deploy]] for how we ship.\n'));
    await page.waitForTimeout(600);

    const entries = await page.evaluate(() => window.history.length);
    await page.locator('.strata-content a.strata-wiki-link').first().click();
    await page.waitForTimeout(600);

    if (await page.evaluate(() => window.history.length) <= entries) {
      throw new Error('following a link pushed no history entry');
    }
    const opened = await page.evaluate(() =>
      ((document.querySelector('.strata-content h1') || {}).textContent || '').replace('#', '').trim());
    if (opened !== 'Deploying') throw new Error('the link opened "' + opened + '"');

    await page.goBack();
    await page.waitForTimeout(700);

    const back = await page.evaluate(() => ({
      heading: ((document.querySelector('.strata-content h1') || {}).textContent || '')
        .replace('#', '').trim(),
      bar: !!document.querySelector('.strata-open-doc')
    }));
    if (back.heading !== 'Handbook') {
      throw new Error('Back gave "' + back.heading + '"');
    }
    if (back.bar) throw new Error('the bar is still there after going back');

    /* And forward again, because an entry of ours names the document to show. */
    await page.goForward();
    await page.waitForTimeout(700);
    const forward = await page.evaluate(() =>
      ((document.querySelector('.strata-content h1') || {}).textContent || '').replace('#', '').trim());
    if (forward !== 'Deploying') {
      throw new Error('Forward gave "' + forward + '"');
    }

    await page.evaluate(() => window.harness.setLibraryBase('', ''));
    await page.waitForTimeout(600);
  });

  /* Ctrl, Shift and the middle button are how people open things in a new tab.
     Taking those away would be worse than what this fixes, so the href stays
     on the link and a modified click is left to the browser. */
  await step('a modified click is left to the browser, with the real file behind it', async () => {
    await page.evaluate(() => window.harness.setLibraryBase('/sites/demo/runbooks',
      '# Handbook\n\nSee [[deploy]].\n'));
    await page.waitForTimeout(600);

    const link = page.locator('.strata-content a.strata-wiki-link').first();
    const href = await link.getAttribute('href');
    if (href !== '/sites/demo/runbooks/deploy.md') {
      throw new Error('the link points at ' + href);
    }
    await link.click({ modifiers: ['Control'] });
    await page.waitForTimeout(400);
    if (await page.locator('.strata-open-doc').count() !== 0) {
      throw new Error('a ctrl-click opened the document here');
    }

    /* Put back for the checks that follow. */
    await page.evaluate(() => window.harness.setLibraryBase('', ''));
    await page.waitForTimeout(600);
  });


  /*
   * Captioned images used to centre themselves while plain ones sat left,
   * because the figure rule set text-align and nothing else did. So this
   * measures where the pictures actually are, not what classes they carry.
   */
  await step('block images line up with each other, whatever the setting', async () => {
    const offsets = () => page.evaluate(() => {
      const blocks = [...document.querySelectorAll('.strata-content .strata-image-block')]
        .filter((block) => !block.hasAttribute('data-strata-align'));
      return blocks.map((block) => {
        const image = block.querySelector('img').getBoundingClientRect();
        const bounds = block.getBoundingClientRect();
        /* Positive means a gap on the left, so equal values mean lined up. */
        return Math.round(image.left - bounds.left);
      });
    });

    const left = await offsets();
    if (left.length < 2) throw new Error('only ' + left.length + ' block images');
    if (!left.every((value) => value === left[0])) {
      throw new Error('left aligned but sitting differently: ' + JSON.stringify(left));
    }
    if (left[0] !== 0) throw new Error('left aligned but indented by ' + left[0]);

    await page.evaluate(() => window.harness.setImageAlign('center'));
    await page.waitForTimeout(400);
    const centred = await offsets();
    if (!centred.every((value) => value > 0)) {
      throw new Error('centring left something against the edge: ' + JSON.stringify(centred));
    }

    await page.evaluate(() => window.harness.setImageAlign('left'));
    await page.waitForTimeout(400);
  });

  await step('a picture can place itself against the page setting', async () => {
    const placed = await page.evaluate(() => {
      const block = document.querySelector('.strata-image-block[data-strata-align="center"]');
      if (!block) return null;
      const image = block.querySelector('img').getBoundingClientRect();
      const bounds = block.getBoundingClientRect();
      return Math.round(image.left - bounds.left);
    });
    if (placed === null) throw new Error('no picture asked to place itself');
    /* The page is left aligned, so a gap on the left means the class won. */
    if (placed <= 0) throw new Error('the class did not override the page: ' + placed);
  });

  await step('a fence calls out its lines, and dims the rest', async () => {
    const block = page.locator('.strata-code--calling').first();
    if (await block.count() === 0) throw new Error('no block calling out lines');

    const opacity = await block.evaluate((node) => {
      const lines = [...node.querySelectorAll('.strata-code-line')];
      const called = lines.filter((line) => line.classList.contains('strata-code-line--called'));
      const rest = lines.filter((line) => !line.classList.contains('strata-code-line--called'));
      const opacityOf = (line) => parseFloat(getComputedStyle(line).opacity);
      return {
        called: called.map(opacityOf),
        rest: rest.map(opacityOf),
        counts: [called.length, rest.length]
      };
    });
    if (!opacity.counts[0] || !opacity.counts[1]) {
      throw new Error('nothing to compare: ' + JSON.stringify(opacity.counts));
    }
    /* Measured on screen rather than trusting the class: a rule that loses to
       another one leaves the markup right and the page unchanged. */
    if (!opacity.called.every((value) => value === 1)) {
      throw new Error('called lines faded: ' + JSON.stringify(opacity.called));
    }
    if (!opacity.rest.every((value) => value < 1)) {
      throw new Error('the rest is not dimmed: ' + JSON.stringify(opacity.rest));
    }
  });

  /*
   * A capped block. This is layout, so a browser is the only place it can be
   * checked: the cap is written in the block's own line height and code font
   * size, both of which come from the theme, so what a rule says and what a
   * reader gets are two different questions.
   *
   * The count is what is checked, not a pixel height. Ten lines is the promise;
   * how many pixels that is depends on the theme, which is the whole reason the
   * cap is not written in pixels.
   */
  await step('a fence capped short shows about ten lines and scrolls the rest', async () => {
    const capped = await page.evaluate(() => {
      const block = document.querySelector('.strata-code--short');
      if (!block) { return { error: 'no block capped short' }; }
      const pre = block.querySelector('pre');
      const line = block.querySelector('.strata-code-line');
      const lineHeight = line.getBoundingClientRect().height;
      /* clientHeight carries the block's padding, and the three themes pad by
         different amounts. The cap counts lines, so measure lines. */
      const style = getComputedStyle(pre);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      return {
        shown: (pre.clientHeight - padding) / lineHeight,
        held: (pre.scrollHeight - padding) / lineHeight,
        scrolls: pre.scrollHeight > pre.clientHeight + 1,
        /* The whole block, header and padding included, against the window. */
        block: Math.round(block.getBoundingClientRect().height),
        window: window.innerHeight
      };
    });
    if (capped.error) throw new Error(capped.error);
    if (!capped.scrolls) throw new Error('nothing was capped: ' + JSON.stringify(capped));
    if (capped.held < 12) throw new Error('the sample block is too short to cap');
    /* Ten lines of code, plus the padding that sits outside them. */
    if (capped.shown < 9.8 || capped.shown > 10.2) {
      throw new Error('it shows ' + capped.shown.toFixed(1) + ' lines, not ten');
    }
    /* And the point of it: a capped block leaves room for the document. */
    if (capped.block > capped.window / 2) {
      throw new Error('a short block took ' + capped.block + 'px of a '
        + capped.window + 'px window');
    }
  });

  /* The same cap, in every theme, because the line height it counts in is the
     theme's. Written in pixels this would be ten lines in one theme and nine
     and a bit in the next. */
  await step('the cap is the same number of lines in all three themes', async () => {
    for (const family of ['github', 'obsidian', 'vscode']) {
      await page.evaluate((name) => window.harness.setTheme(name, 'light'), family);
      await page.waitForTimeout(250);
      const shown = await page.evaluate(() => {
        const block = document.querySelector('.strata-code--short');
        const pre = block.querySelector('pre');
        const style = getComputedStyle(pre);
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const line = block.querySelector('.strata-code-line').getBoundingClientRect().height;
        return (pre.clientHeight - padding) / line;
      });
      if (shown < 9.8 || shown > 10.2) {
        throw new Error(family + ' shows ' + shown.toFixed(1) + ' lines');
      }
    }
    await page.evaluate(() => window.harness.setTheme('vscode', 'light'));
    await page.waitForTimeout(250);
  });

  /* And the page setting, which a fence beats. */
  await step('the page setting caps every block a fence has not spoken for', async () => {
    await page.evaluate(() => window.harness.setCodeHeight('medium'));
    await page.waitForTimeout(400);
    const counts = await page.evaluate(() => ({
      medium: document.querySelectorAll('.strata-code--medium').length,
      short: document.querySelectorAll('.strata-code--short').length,
      blocks: document.querySelectorAll('.strata-code').length
    }));
    if (counts.medium < counts.blocks - counts.short) {
      throw new Error('only ' + counts.medium + ' of ' + counts.blocks + ' took the setting');
    }
    /* The sample's own `short` fence is still short: a word on a fence beats
       the page, the way wrap and numbers already do. */
    if (counts.short !== 1) throw new Error('the fence lost to the page setting');

    await page.evaluate(() => window.harness.setCodeHeight('full'));
    await page.waitForTimeout(400);
    const left = await page.evaluate(() =>
      document.querySelectorAll('.strata-code--medium').length);
    if (left !== 0) throw new Error(left + ' blocks stayed capped');
  });

  /*
   * Which blocks offer a full size view, and which are left alone.
   *
   * Decided by measuring the rendered block, so a browser is the only place it
   * can be checked at all: the rule is that a block offers Expand when its
   * <pre> has more to show than it is showing in either direction, or when the
   * block is taller than the window.
   */
  await step('only the blocks with more to show offer a full size view', async () => {
    const blocks = await page.evaluate(() => {
      const FITS = 2;
      return [...document.querySelectorAll('.strata-code')].map((block) => {
        const pre = block.querySelector('.strata-code-pre');
        return {
          lang: block.getAttribute('data-lang'),
          offers: !!block.querySelector('.strata-code-expand'),
          overflows: pre.scrollHeight > pre.clientHeight + FITS
            || pre.scrollWidth > pre.clientWidth + FITS
            || block.getBoundingClientRect().height > window.innerHeight
        };
      });
    });
    if (blocks.length < 5) throw new Error('only ' + blocks.length + ' blocks');
    const wrong = blocks.filter((block) => block.offers !== block.overflows);
    if (wrong.length) {
      throw new Error('the rule and the markup disagree: ' + JSON.stringify(wrong));
    }
    /* Both halves have to be represented, or this passes by there being
       nothing of one kind on the page. */
    if (!blocks.some((block) => block.offers)) {
      throw new Error('no block offers it at all');
    }
    if (!blocks.some((block) => !block.offers)) {
      throw new Error('every block offers it, so the rule is not a rule');
    }
  });

  await step('a capped block opens full size, uncapped, and closes again', async () => {
    const block = page.locator('.strata-code--short').first();
    await block.scrollIntoViewIfNeeded();
    await block.locator('.strata-code-expand').click();
    await page.waitForSelector('.strata-zoom .strata-zoom-code', { timeout: 3000 });

    const open = await page.evaluate(() => {
      const copy = document.querySelector('.strata-zoom-code .strata-code');
      const pre = copy.querySelector('.strata-code-pre');
      const onPage = document.querySelector('.strata-content .strata-code--short pre');
      return {
        capped: copy.className.indexOf('strata-code--short') !== -1,
        /* Nothing left in it to scroll past. */
        scrolls: pre.scrollHeight > pre.clientHeight + 2,
        lines: copy.querySelectorAll('.strata-code-line').length,
        /* A cloned button would have no listener behind it. */
        buttons: copy.querySelectorAll('button').length,
        /* The document keeps its own block, still capped. */
        pageStillCapped: onPage.scrollHeight > onPage.clientHeight + 2,
        label: document.querySelector('.strata-zoom').getAttribute('aria-label')
      };
    });
    if (open.capped) throw new Error('the copy is still capped');
    if (open.scrolls) throw new Error('the copy still has more to show');
    if (open.lines < 12) throw new Error('the copy holds ' + open.lines + ' lines');
    if (open.buttons) throw new Error(open.buttons + ' dead buttons in the overlay');
    if (!open.pageStillCapped) throw new Error('the block on the page was changed');
    if (!open.label) throw new Error('the overlay has no name');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    if (await page.locator('.strata-zoom').count() !== 0) {
      throw new Error('Escape did not close it');
    }
  });

  await step('a click on the block opens it, and a click on Copy does not', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const block = page.locator('.strata-code--short').first();
    await block.scrollIntoViewIfNeeded();

    /* Copy first: it has to copy and it must not open anything. */
    await block.locator('.strata-code-copy').click();
    await page.waitForTimeout(300);
    if (await page.locator('.strata-zoom').count() !== 0) {
      throw new Error('copying opened the overlay as well');
    }
    const state = await block.locator('.strata-code-copy').getAttribute('data-state');
    if (state !== 'done') throw new Error('copy said ' + state);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    if (!/dataclass/.test(copied || '')) {
      throw new Error('the clipboard holds ' + JSON.stringify((copied || '').slice(0, 40)));
    }

    /* Then the code itself, which is what a reader tries on something cut off. */
    await block.locator('.strata-code-line-text').first().click();
    await page.waitForSelector('.strata-zoom-code', { timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  /* Selecting code has to keep working: a drag that selected something ends in
     a click, and swallowing that to open an overlay makes code unselectable. */
  await step('selecting code does not open the overlay', async () => {
    const block = page.locator('.strata-code--short').first();
    await block.scrollIntoViewIfNeeded();
    /* This is only worth anything over a block that would otherwise open. */
    if (await block.locator('.strata-code-expand').count() === 0) {
      throw new Error('this block does not open at all, so nothing was checked');
    }
    const line = await block.locator('.strata-code-line-text').first().boundingBox();
    await page.mouse.move(line.x + 4, line.y + line.height / 2);
    await page.mouse.down();
    await page.mouse.move(line.x + line.width - 4, line.y + line.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const selected = await page.evaluate(() => (window.getSelection().toString() || '').trim());
    if (!selected) throw new Error('nothing was selected, so this checked nothing');
    if (await page.locator('.strata-zoom').count() !== 0) {
      throw new Error('selecting opened the overlay');
    }
    await page.evaluate(() => window.getSelection().removeAllRanges());
  });

  /*
   * A fence that named an address instead of a body. The address is fetched
   * after the document is drawn, so this is the one thing about the feature a
   * unit test cannot see: that the block really is filled in on the page, by
   * the renderer, without the document waiting on it.
   *
   * Nothing here reaches the network. harness/fixtures.ts holds the file the
   * sample's fence names, keyed by the raw address - so a pass also says the
   * github.com blob link in the document was translated on the way.
   */
  await step('a fence with a src is filled in from that address', async () => {
    await page.waitForSelector('.strata-code[data-lang="ts"]', { timeout: 5000 });
    const filled = await page.evaluate(() => {
      /* The sample writes `ts` on exactly this fence; its other TypeScript
         blocks are written `typescript`. */
      const block = document.querySelector('.strata-code[data-lang="ts"]');
      if (!block) { return { error: 'the fence with a src never rendered' }; }
      return {
        waiting: block.classList.contains('strata-code--loading'),
        failed: block.classList.contains('strata-code--failed'),
        stillCarriesTheAddress: block.hasAttribute('data-strata-code-src'),
        note: !!block.querySelector('.strata-code-note'),
        lines: block.querySelectorAll('.strata-code-line').length,
        highlighted: block.querySelectorAll('.hljs-keyword').length,
        first: (block.querySelector('.strata-code-line-text') || {}).textContent,
        /* Nothing fetched may become markup. */
        elements: block.querySelectorAll('.strata-code-line-text *').length > 0
      };
    });
    if (filled.error) throw new Error(filled.error);
    if (filled.waiting || filled.failed) throw new Error('the block is ' + JSON.stringify(filled));
    if (filled.stillCarriesTheAddress) throw new Error('the address was never claimed');
    if (filled.note) throw new Error('it still says it is loading');
    /* The sample asks for #L12-L22, which is the get method and nothing else. */
    if (filled.lines !== 11) throw new Error('the fragment gave ' + filled.lines + ' lines');
    if (!/public get\(key/.test(filled.first || '')) {
      throw new Error('the fragment started at ' + JSON.stringify(filled.first));
    }
    if (!filled.highlighted) throw new Error('the fetched code was not highlighted');
  });

  /* And the other half: an address nothing answers has to say so in the block,
     because a block that stays empty reads as a fence the author left blank. */
  await step('a fence whose address does not answer says so in the block', async () => {
    await page.evaluate(() => window.harness.setMarkdown(
      '# One block\n\n```ts src="https://github.com/contoso/nothing/blob/main/gone.ts"\n```\n'
    ));
    await page.waitForTimeout(500);
    const said = await page.evaluate(() => {
      const block = document.querySelector('.strata-code');
      const note = block ? block.querySelector('.strata-code-note') : null;
      return block ? {
        failed: block.classList.contains('strata-code--failed'),
        waiting: block.classList.contains('strata-code--loading'),
        note: note ? (note.textContent || '').trim() : null,
        /* Nothing to copy, so nothing offering to. */
        copyShown: block.querySelector('.strata-code-actions')
          ? getComputedStyle(block.querySelector('.strata-code-actions')).visibility : 'gone'
      } : null;
    });
    if (!said) throw new Error('no block at all');
    if (!said.failed || said.waiting) throw new Error('the block is ' + JSON.stringify(said));
    if (!said.note || !/raw\.githubusercontent\.com/.test(said.note)) {
      throw new Error('it said ' + JSON.stringify(said.note));
    }
    await page.evaluate(() => window.harness.setMarkdown(''));
    await page.waitForTimeout(600);
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

  /*
   * A diagram is the thing on the page most likely to be too small to read, and
   * until now it was the one thing that did nothing when clicked. It opens as
   * SVG rather than as a bitmap, so what comes up has to be genuinely bigger
   * than what was on the page, not the same pixels stretched.
   */
  await step('a diagram opens full size, and Escape closes it', async () => {
    /* The host holds the drawing and the icons on its buttons, so the drawing
       is the direct child, not "an svg somewhere inside". */
    const drawing = page.locator('.strata-mermaid > svg').first();
    const before = await drawing.boundingBox();

    await drawing.click({ position: { x: 4, y: 4 } });
    await page.waitForSelector('.strata-zoom .strata-zoom-diagram svg', { timeout: 3000 });
    const after = await page.locator('.strata-zoom .strata-zoom-diagram svg').boundingBox();
    if (after.width <= before.width + 1) {
      throw new Error('opened at ' + Math.round(after.width)
        + 'px from ' + Math.round(before.width) + 'px');
    }

    /* The drawing carries no background of its own, so the panel under it has
       to paint one: on the overlay's black, a light-theme diagram would be an
       empty rectangle. */
    const ground = await page.evaluate(() => {
      const panel = document.querySelector('.strata-zoom-diagram');
      const colour = getComputedStyle(panel).backgroundColor;
      return { colour, transparent: /rgba\(0, 0, 0, 0\)|transparent/.test(colour) };
    });
    if (ground.transparent) throw new Error('the panel paints no background');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    if (await page.locator('.strata-zoom').count() !== 0) {
      throw new Error('Escape left the overlay open');
    }
  });

  /* The same thing from the keyboard, which cannot click a drawing: the host
     holds buttons of its own, so it is not itself a button, and the Expand
     button is what a keyboard reaches. */
  await step('a diagram opens from its own button too', async () => {
    const host = page.locator('.strata-mermaid').first();
    await host.hover();
    await page.locator('.strata-diagram-open').first().click();
    await page.waitForSelector('.strata-zoom-diagram svg', { timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  /*
   * A sticky header has a condition nothing in the stylesheet can see: the box
   * a wide table scrolls in is also a scroll container, and a sticky cell
   * sticks to that rather than to the page - so inside it the header never
   * moves. Tables that fit are let out of the box by measurement, and this is
   * that measurement.
   */
  await step('a table that fits its column is let out of the scroll box', async () => {
    const seen = await page.evaluate(() => {
      const wraps = [...document.querySelectorAll('.strata-table-scroll')];
      return wraps.map((wrap) => ({
        fits: wrap.classList.contains('strata-table-scroll--fits'),
        overflow: getComputedStyle(wrap).overflowX,
        wider: wrap.querySelector('table').scrollWidth > wrap.clientWidth + 1
      }));
    });
    if (seen.length === 0) throw new Error('no tables in the sample');
    seen.forEach((wrap, index) => {
      if (wrap.fits === wrap.wider) {
        throw new Error('table ' + index + ' is ' + JSON.stringify(wrap));
      }
      if (wrap.fits && wrap.overflow !== 'visible') {
        throw new Error('table ' + index + ' fits but still scrolls: ' + wrap.overflow);
      }
    });
  });

  await step('a table header stays in view while its rows go past', async () => {
    const stuck = await page.evaluate(async () => {
      const wrap = document.querySelector('.strata-table-scroll--fits');
      if (!wrap) { return { error: 'no table is out of its box' }; }
      const table = wrap.querySelector('table');
      const header = table.querySelector('thead th');
      const root = document.querySelector('.strata-root');
      const offset = parseFloat(getComputedStyle(root).getPropertyValue('--strata-scroll-offset')) || 0;

      /* Far enough that the table's own top has gone past the line the header
         should hold, while its last row is still below it. */
      const head = header.getBoundingClientRect().height;
      window.scrollBy(0, table.getBoundingClientRect().top - offset + head);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

      const bounds = table.getBoundingClientRect();
      return {
        offset: offset,
        header: header.getBoundingClientRect().top,
        tableTop: bounds.top,
        tableBottom: bounds.bottom,
        position: getComputedStyle(header).position
      };
    });
    if (stuck.error) throw new Error(stuck.error);
    if (stuck.position !== 'sticky') throw new Error('the header is ' + stuck.position);
    if (stuck.tableTop >= stuck.offset || stuck.tableBottom <= stuck.offset) {
      throw new Error('the table did not straddle the line: ' + JSON.stringify(stuck));
    }
    if (Math.abs(stuck.header - stuck.offset) > 2) {
      throw new Error('the header rode up to ' + Math.round(stuck.header)
        + ' with the line at ' + Math.round(stuck.offset));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  await step('clicking a column sorts by it, and a third click puts it back', async () => {
    /* Not simply the first sortable table: the sample's first one is already in
       alphabetical order, so sorting it would prove nothing - every state would
       look like every other. This picks one the document did not write in
       order. */
    const which = await page.evaluate(() => {
      const order = (table) => [...table.tBodies[0].rows]
        .map((row) => (row.cells[0].textContent || '').trim());
      const sorted = (list) => list.slice()
        .sort((first, second) => first.localeCompare(second, undefined, { numeric: true, sensitivity: 'base' }));
      const tables = [...document.querySelectorAll('.strata-table-sortable')];
      const index = tables.findIndex((table) => {
        const written = order(table);
        return written.length > 1 && written.join('|') !== sorted(written).join('|');
      });
      if (index === -1) { return { error: 'every sortable table is already in order' }; }
      tables[index].setAttribute('data-drive-sort', 'yes');
      return { written: order(tables[index]) };
    });
    if (which.error) throw new Error(which.error);

    const column = async () => page.evaluate(() => {
      const table = document.querySelector('[data-drive-sort]');
      return [...table.tBodies[0].rows].map((row) => (row.cells[0].textContent || '').trim());
    });
    const head = page.locator('[data-drive-sort] thead th').first();
    const expected = which.written.slice().sort((first, second) =>
      first.localeCompare(second, undefined, { numeric: true, sensitivity: 'base' }));

    await head.locator('.strata-th-sort').click();
    const ascending = await column();
    if (ascending.join('|') !== expected.join('|')) {
      throw new Error('ascending gave ' + JSON.stringify(ascending));
    }
    if (await head.getAttribute('aria-sort') !== 'ascending') {
      throw new Error('the header does not say it is sorted');
    }

    await head.locator('.strata-th-sort').click();
    const down = await column();
    if (down.join('|') !== expected.slice().reverse().join('|')) {
      throw new Error('descending gave ' + JSON.stringify(down));
    }

    /* The third click is the one that matters: a reader who sorted a table of
       steps by name has no other way back to the steps in order. */
    await head.locator('.strata-th-sort').click();
    const back = await column();
    if (back.join('|') !== which.written.join('|')) {
      throw new Error('the document order did not come back: ' + JSON.stringify(back));
    }
    if (await head.getAttribute('aria-sort') !== 'none') {
      throw new Error('the header still claims to be sorted');
    }
  });

  /* Reordering rows under a merged cell scrambles what the merge says, so a
     table holding one is left exactly as the document wrote it. */
  await step('a table with merged cells is not made sortable', async () => {
    const merged = await page.evaluate(() => {
      const tables = [...document.querySelectorAll('.strata-content table')];
      const withSpans = tables.filter((table) => table.querySelector('[colspan], [rowspan]'));
      return {
        found: withSpans.length,
        sortable: withSpans.filter((table) =>
          table.classList.contains('strata-table-sortable')).length
      };
    });
    if (merged.found === 0) throw new Error('the sample has no merged-cell table to check');
    if (merged.sortable !== 0) throw new Error('a merged table was made sortable');
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
    if (await details.evaluate((element) => element.open)) throw new Error('started open');
    await details.locator('summary').click();
    if (!(await details.evaluate((element) => element.open))) throw new Error('did not open');
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
    const toggle = page.locator('.strata-mode-toggle');
    /* It is a switch: named for what it switches, and saying whether that is
       on. A button that renamed itself would be a second, quieter claim about
       which way round it is, and the two would have to agree forever. */
    const named = (await toggle.textContent() || '').trim();
    if (named !== 'Dark mode') throw new Error('the toggle reads "' + named + '"');
    if (await toggle.getAttribute('aria-pressed') !== 'false') {
      throw new Error('a light page reports dark mode as on');
    }
    await toggle.click();
    await page.waitForTimeout(600);
    const mode = await page.locator('.strata-root').getAttribute('data-strata-mode');
    if (mode !== 'dark') throw new Error('mode is ' + mode);
    if ((await toggle.textContent() || '').trim() !== 'Dark mode') {
      throw new Error('the toggle renamed itself to "' + await toggle.textContent() + '"');
    }
    if (await toggle.getAttribute('aria-pressed') !== 'true') {
      throw new Error('a dark page reports dark mode as off');
    }
  });

  /*
   * The sun and the moon are one drawing that travels between the two. Choosing
   * a mode rebuilds the toolbar, so the button is a new element every time and
   * would land in its finished state with nothing to animate unless the
   * renderer mounts it in the state being left. Caught only in a browser: the
   * markup is identical either way, and what differs is whether it moves.
   */
  await step('the sun and moon travel rather than swap', async () => {
    /* Which way round they are matters as much as that they move: the icon
       shows the mode the page is in, so a dark page is a moon. Shown the other
       way round, the icon would turn away from the page while the reader
       watched it change. */
    const moonNow = await page.evaluate(() =>
      document.querySelector('.strata-mode-toggle').classList.contains('strata-mode-toggle--dark'));
    if (!moonNow) throw new Error('a dark page is not showing the moon');

    const reading = () => page.evaluate(() => {
      const disc = document.querySelector('.strata-theme-disc');
      const bite = document.querySelector('.strata-theme-bite');
      const scale = /matrix\(([-\d.]+)/.exec(getComputedStyle(disc).transform);
      const slide = /matrix\(1, 0, 0, 1, ([-\d.]+)/.exec(getComputedStyle(bite).transform);
      return { scale: scale ? Number(scale[1]) : null, slide: slide ? Number(slide[1]) : null };
    });

    const sun = await reading();
    if (sun.scale === null || sun.slide === null) throw new Error('no transform on the icon');
    await page.locator('.strata-mode-toggle').click();
    await page.waitForTimeout(120);
    const flight = await reading();
    await page.waitForTimeout(900);
    const moon = await reading();

    if (Math.abs(moon.scale - sun.scale) < 0.1 || Math.abs(moon.slide - sun.slide) < 1) {
      throw new Error('the two states look the same: '
        + JSON.stringify(sun) + ' then ' + JSON.stringify(moon));
    }
    const between = (value, first, second) =>
      value > Math.min(first, second) + 0.001 && value < Math.max(first, second) - 0.001;
    if (!between(flight.scale, sun.scale, moon.scale)) {
      throw new Error('the disc jumped: ' + JSON.stringify(flight));
    }
    // Back to where the rest of the run expects it.
    await page.locator('.strata-mode-toggle').click();
    await page.waitForTimeout(600);
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
      const background = getComputedStyle(root).backgroundColor;
      const channels = /(\d+), (\d+), (\d+)/.exec(background);
      return {
        background,
        transparent: /rgba\(0, 0, 0, 0\)|transparent/.test(background),
        luminance: channels ? (Number(channels[1]) + Number(channels[2]) + Number(channels[3])) / 3 : null
      };
    });
    if (state.error) { throw new Error(state.error); }
    if (state.transparent) { throw new Error('the root paints no background, so the page shows through'); }
    if (state.luminance > 128) { throw new Error('dark mode but the root is light: ' + state.background); }
  });

  await page.screenshot({ path: path.join(HARNESS_DIST, 'harness-view-obsidian-dark.png'), fullPage: false });

  /*
   * Auto sizes the sidebar to its longest entry; a fixed width is whatever it
   * says. The setting only applies as a sidebar, so this runs with one.
   */
  await step('the contents sidebar takes the width it is given', async () => {
    await page.evaluate(() => window.harness.setToc('left'));
    await page.waitForTimeout(300);
    const widthOf = async (toc) => page.evaluate((value) => {
      const root = document.querySelector('.strata-root');
      root.setAttribute('data-strata-toc-width', value === 'auto' ? 'auto' : 'fixed');
      if (value === 'auto') {
        root.style.removeProperty('--strata-toc-width');
      } else {
        root.style.setProperty('--strata-toc-width', value);
      }
      const side = document.querySelector('.strata-toc-sidebar');
      return side ? Math.round(side.getBoundingClientRect().width) : 0;
    }, toc);

    const auto = await widthOf('auto');
    const fixed = await widthOf('320px');
    if (fixed !== 320) throw new Error(`320px asked for, ${fixed}px drawn`);
    if (auto === fixed) throw new Error('auto is not sizing to its content');
    if (auto < 100) throw new Error(`auto collapsed to ${auto}px`);
    await widthOf('auto');
  });

  /*
   * The kitchen sink opens with [[toc]], so it is exactly the case that used
   * to produce two tables of contents: the document's own, in the text, and a
   * generated one beside it.
   */
  await step("the document's own contents is used, not a second one", async () => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.evaluate(() => window.harness.setToc('left'));
    await page.waitForTimeout(400);

    const counts = await page.evaluate(() => ({
      inTheText: document.querySelectorAll('.strata-content .strata-toc').length,
      panels: document.querySelectorAll('.strata-toc-sidebar, .strata-toc-inline').length
    }));
    if (counts.inTheText !== 0) {
      throw new Error('the authored contents is still in the text as well');
    }
    if (counts.panels !== 1) {
      throw new Error(counts.panels + ' contents panels');
    }
  });

  await step('the adopted contents still scrolls and tracks', async () => {
    const entries = await page.locator('.strata-toc-sidebar .strata-toc a').count();
    if (entries < 3) throw new Error('only ' + entries + ' entries');
    await page.locator('.strata-toc-sidebar .strata-toc a').nth(2).click();
    await page.waitForTimeout(600);
    const active = await page.locator('.strata-toc-sidebar .strata-toc a[aria-current="true"]').count();
    if (active !== 1) throw new Error(active + ' entries marked as being read');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
  });

  /*
   * A SharePoint page puts a suite header and a command bar across the top and
   * they stay there. The web part's stylesheet used to clear them with a fixed
   * 24px, which is right for a bare page and too small for any real one, so a
   * heading scrolled to landed underneath the chrome. The harness has no
   * chrome of its own, so one is put there.
   */
  await step('a heading scrolled to clears chrome stuck above the web part', async () => {
    await page.evaluate(() => {
      const bar = document.createElement('div');
      bar.id = 'fake-suite-bar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:68px;'
        + 'background:#333;z-index:900';
      document.body.appendChild(bar);
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(400);

    const offset = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.strata-root'))
        .getPropertyValue('--strata-scroll-offset').trim());
    if (parseInt(offset, 10) < 68) {
      throw new Error('measured ' + offset + ' against 68px of chrome');
    }

    await page.locator('.strata-toc a').nth(4).click();
    await page.waitForTimeout(900);
    const landed = await page.evaluate(() => {
      const link = [...document.querySelectorAll('.strata-toc a')][4];
      const heading = document.getElementById(
        decodeURIComponent(link.getAttribute('href')).slice(1));
      return Math.round(heading.getBoundingClientRect().top);
    });
    if (landed < 68) throw new Error('the heading landed at ' + landed + ', under the bar');

    await page.evaluate(() => {
      document.getElementById('fake-suite-bar').remove();
      window.dispatchEvent(new Event('resize'));
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
  });

  await step('the last contents entry is reachable at the end of the document', async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(700);
    const end = await page.evaluate(() => {
      const links = [...document.querySelectorAll('.strata-toc-sidebar a, .strata-toc-inline a')];
      const activeIndex = links.findIndex((link) => link.getAttribute('aria-current') === 'true');
      return { activeIndex: activeIndex + 1, of: links.length };
    });
    /* The last few headings never pass the reading line, because the page runs
       out before they can, so the highlight used to stop short of the end. */
    if (end.activeIndex !== end.of) {
      throw new Error('marked ' + end.activeIndex + ' of ' + end.of + ' at the very bottom');
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
  });

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

  await page.screenshot({ path: path.join(HARNESS_DIST, 'harness-edit-split.png'), fullPage: false });

  /*
   * A document long enough that both halves have somewhere to scroll to, so
   * the two checks below are read off the case they exist for rather than off
   * a document that happens to fit.
   */
  const longDocument = '# Split view\n' + Array.from({ length: 40 }, (unused, index) =>
    `\n## Section ${index + 1}\n\nA paragraph about section ${index + 1}, long enough `
    + 'to wrap in the source and in the preview both.\n'
  ).join('');

  /*
   * The two halves of a split view are read across, and they could not be:
   * the source stopped at its own minimum height while the preview ran on to
   * the bottom of the row, and the MARKDOWN label sat outside its box while
   * PREVIEW sat inside its border, so the panes began 22px apart.
   */
  await step('both halves of the split view are the same box', async () => {
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await page.fill('.strata-editor-input', longDocument);
    await page.waitForTimeout(800);
    const split = await page.evaluate(() => {
      const box = (selector) => {
        const found = document.querySelector(selector);
        if (!found) return null;
        const bounds = found.getBoundingClientRect();
        return { top: Math.round(bounds.top), height: Math.round(bounds.height) };
      };
      return {
        sourcePane: box('.strata-editor-pane'),
        previewPane: box('.strata-preview-pane'),
        source: box('.strata-editor-input'),
        preview: box('.strata-preview-box')
      };
    });
    if (Math.abs(split.sourcePane.top - split.previewPane.top) > 1) {
      throw new Error('panes start at ' + split.sourcePane.top + ' and ' + split.previewPane.top);
    }
    if (Math.abs(split.sourcePane.height - split.previewPane.height) > 1) {
      throw new Error('panes are ' + split.sourcePane.height + ' and ' + split.previewPane.height + ' tall');
    }
    if (!split.preview) throw new Error('the preview has no box of its own to scroll');
    if (Math.abs(split.source.top - split.preview.top) > 1) {
      throw new Error('the boxes start at ' + split.source.top + ' and ' + split.preview.top);
    }
    if (Math.abs(split.source.height - split.preview.height) > 1) {
      throw new Error('the boxes are ' + split.source.height + ' and ' + split.preview.height + ' tall');
    }
    /* And the boxes fill their panes, rather than both stopping short of the
       row by the same amount. A pane is its label and then its box. */
    if (split.source.height < split.sourcePane.height - 40) {
      throw new Error('the source box is ' + split.source.height + ' in a pane of ' + split.sourcePane.height);
    }
  });

  /* Scrolling is shared by the proportion of the way down each pane is: the
     source is monospace text and the preview is headings, code and images, so
     the same line is never at the same pixel in both. */
  await step('scrolling either half takes the other with it', async () => {
    const moved = await page.evaluate(async () => {
      const source = document.querySelector('.strata-editor-input');
      const preview = document.querySelector('.strata-preview-box');
      if (!source || !preview) return { missing: true };
      const room = (pane) => pane.scrollHeight - pane.clientHeight;
      const settle = () => new Promise((done) => setTimeout(done, 200));
      if (room(source) < 200 || room(preview) < 200) {
        return { room: [room(source), room(preview)] };
      }

      source.scrollTop = 0;
      preview.scrollTop = 0;
      await settle();
      source.scrollTop = Math.round(room(source) * 0.5);
      await settle();
      const previewFollowed = preview.scrollTop / room(preview);

      preview.scrollTop = Math.round(room(preview) * 0.9);
      await settle();
      return { previewFollowed, sourceFollowed: source.scrollTop / room(source) };
    });
    if (moved.missing) throw new Error('the split view has no pair of boxes to scroll');
    if (moved.room) throw new Error('nothing to scroll: ' + moved.room.join(' and '));
    if (Math.abs(moved.previewFollowed - 0.5) > 0.05) {
      throw new Error('the source at halfway put the preview at ' + moved.previewFollowed.toFixed(2));
    }
    if (Math.abs(moved.sourceFollowed - 0.9) > 0.05) {
      throw new Error('the preview at nine tenths put the source at ' + moved.sourceFollowed.toFixed(2));
    }
  });

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
    const bounds = await page.locator('.strata-content').boundingBox();
    const toc = await page.locator('.strata-toc-sidebar').boundingBox();
    if (toc.y + toc.height > bounds.y + 8) throw new Error('contents overlap the text');
  });

  /*
   * The property pane is the only way most of these settings are ever reached,
   * and its pages are declared as data, so a field can be dropped from the
   * layout without anything failing to compile. These walk the real pane the
   * demo draws and check that every page is reachable and that the fields
   * which only apply given another setting appear when it is made.
   */
  /*
   * The site's pages are built by a different builder from the web part, with
   * its own contents code, so the rule that a document's own contents wins had
   * to be taught to it separately. The documentation page carried two until it
   * was: its own from [[toc]], and a generated one beside it.
   */
  await step('every page of the site shows one contents', async () => {
    const pages = ['docs/index.html', 'themes/index.html', 'about/index.html',
      'support/index.html', 'install/index.html', 'teams/index.html',
      'linking/index.html', 'reading/index.html', 'editing/index.html'];
    for (const name of pages) {
      await page.goto('file://' + path.join(__dirname, '..', 'site', name),
        { waitUntil: 'load' });
      await page.waitForTimeout(300);
      const counts = await page.evaluate(() => ({
        panels: document.querySelectorAll('.strata-toc-sidebar, .strata-toc-inline').length,
        inText: document.querySelectorAll('.strata-content .strata-toc').length,
        entries: document.querySelectorAll('.strata-toc-sidebar a').length
      }));
      if (counts.panels !== 1 || counts.inText !== 0) {
        throw new Error(name + ': ' + JSON.stringify(counts));
      }
      if (counts.entries < 2) throw new Error(name + ' has an empty contents');
    }
  });

  /*
   * The front page asks for none, and asking for none has to mean none was
   * built rather than one built and hidden: a panel nothing can reach is still
   * a panel, still in the tab order, and still read out.
   */
  await step('the front page carries no contents at all', async () => {
    await page.goto('file://' + path.join(__dirname, '..', 'site', 'index.html'),
      { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const panels = await page.evaluate(() =>
      document.querySelectorAll('.strata-toc-sidebar, .strata-toc-inline, .strata-toc').length);
    if (panels !== 0) throw new Error('the front page drew ' + panels + ' of them');
  });

  /*
   * The site serves two readers who want different things, and the navigation
   * says which half is which. Both halves are on every page, the pages that are
   * out of the navigation included, or a reader who arrived on the privacy
   * policy from the app catalog has a dead end rather than a site.
   */
  await step('the navigation is split into two labelled sections', async () => {
    for (const name of ['index.html', 'docs/index.html', 'privacy/index.html']) {
      await page.goto('file://' + path.join(__dirname, '..', 'site', name),
        { waitUntil: 'load' });
      const nav = await page.evaluate(() => ({
        groups: [...document.querySelectorAll('.site-nav-group')].map((group) => ({
          label: (group.querySelector('.site-nav-label') || {}).textContent,
          links: group.querySelectorAll('.site-nav-link').length
        })),
        current: document.querySelectorAll('.site-nav-link[aria-current="page"]').length
      }));
      if (nav.groups.length !== 2) {
        throw new Error(name + ' has ' + nav.groups.length + ' navigation groups');
      }
      for (const group of nav.groups) {
        if (!group.label) throw new Error(name + ' has an unlabelled group');
        if (group.links < 2) throw new Error(name + ': ' + group.label + ' has too few links');
      }
      /* The privacy policy is out of the navigation, so nothing in it is where
         the reader is. Every other page marks exactly one entry. */
      const expected = name === 'privacy/index.html' ? 0 : 1;
      if (nav.current !== expected) {
        throw new Error(name + ' marks ' + nav.current + ' entries as current');
      }
    }
  });

  /*
   * Light and dark is one choice for the whole site, made in the header and
   * remembered. It used to be a dropdown in a bar of theme controls, which was
   * on every page whether the page was about the rendering or not.
   */
  await step('the switch in the header changes the mode and remembers it', async () => {
    await page.goto('file://' + path.join(__dirname, '..', 'site', 'docs', 'index.html'),
      { waitUntil: 'load' });
    await page.waitForTimeout(300);

    const before = await page.evaluate(() =>
      document.documentElement.getAttribute('data-site-mode'));
    await page.click('#site-mode-toggle');
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => ({
      site: document.documentElement.getAttribute('data-site-mode'),
      /* The web part's own root has to move with the page, or a dark document
         sits on a light one. */
      webPart: document.querySelector('.strata-root').getAttribute('data-strata-mode'),
      stored: window.localStorage.getItem('markstrata-site-mode'),
      label: document.getElementById('site-mode-toggle').getAttribute('aria-label')
    }));

    if (after.site === before) throw new Error('the page stayed ' + before);
    if (after.webPart !== after.site) {
      throw new Error('the page is ' + after.site + ' and the document ' + after.webPart);
    }
    if (after.stored !== after.site) throw new Error('the choice was not remembered');
    if (after.label.indexOf(after.site === 'dark' ? 'light' : 'dark') === -1) {
      throw new Error('the switch says ' + JSON.stringify(after.label));
    }

    /* Another page of the site opens in the mode that was chosen on this one. */
    await page.goto('file://' + path.join(__dirname, '..', 'site', 'reading', 'index.html'),
      { waitUntil: 'load' });
    const carried = await page.evaluate(() =>
      document.documentElement.getAttribute('data-site-mode'));
    if (carried !== after.site) {
      throw new Error('the next page opened ' + carried + ' rather than ' + after.site);
    }
    await page.evaluate(() => window.localStorage.removeItem('markstrata-site-mode'));
  });

  /*
   * A guided page drops panels of real web part markup into itself, drawn at
   * build time by the same ViewModeRenderer and EditModeManager a SharePoint
   * page runs. The point of them is that they cannot drift, so this checks the
   * markup is the web part's own rather than a drawing of it, and that nothing
   * in one is reachable: they are stills, their handlers did not survive being
   * written to a file, and a control that looks live and is not is worse than a
   * picture.
   */
  await step('a guided page carries real web part markup, inert', async () => {
    await page.goto('file://' + path.join(__dirname, '..', 'site', 'linking', 'index.html'),
      { waitUntil: 'load' });
    await page.waitForTimeout(400);

    const found = await page.evaluate(() => ({
      panels: document.querySelectorAll('.site-specimen').length,
      unfilled: document.querySelectorAll('[data-specimen]').length,
      notes: document.querySelectorAll('.site-specimen-note').length,
      crumbs: document.querySelectorAll('.site-specimen .strata-crumb-link').length,
      here: document.querySelectorAll('.site-specimen .strata-crumb-here').length,
      wiki: document.querySelectorAll('.site-specimen a.strata-wiki-link').length,
      missing: document.querySelectorAll('.site-specimen a.strata-wiki-link--missing').length,
      focusable: [...document.querySelectorAll('.site-specimen a[href], .site-specimen button')]
        .filter((element) => element.getAttribute('tabindex') !== '-1').length,
      /* Nothing in a panel carries a theme of its own, or it would sit out the
         theme the rest of the page is drawn in. */
      pinned: document.querySelectorAll('.site-specimen [data-strata-theme]').length
    }));

    if (found.panels < 4) throw new Error('only ' + found.panels + ' specimens');
    if (found.unfilled) throw new Error(found.unfilled + ' placeholders were never filled');
    if (found.notes !== found.panels) throw new Error('a specimen has no note under it');
    if (found.crumbs < 3) throw new Error('the trail never builds up');
    if (found.here < 3) throw new Error('a trail does not say where the reader is');
    if (!found.wiki) throw new Error('no wiki links were rendered');
    if (!found.missing) throw new Error('no link to a missing page was marked');
    if (found.focusable) throw new Error(found.focusable + ' controls are still in the tab order');
    if (found.pinned) throw new Error('a specimen is pinned to a theme of its own');

    /* The panel refuses the pointer, so a reader cannot click a button that
       would do nothing. */
    const clickable = await page.evaluate(() =>
      window.getComputedStyle(document.querySelector('.site-specimen-frame')).pointerEvents);
    if (clickable !== 'none') throw new Error('a specimen takes clicks: ' + clickable);
  });

  await step('the editor specimen is the real split editor', async () => {
    await page.goto('file://' + path.join(__dirname, '..', 'site', 'editing', 'index.html'),
      { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const editor = await page.evaluate(() => {
      const split = document.querySelector('.site-specimen .strata-editor');
      const box = document.querySelector('.site-specimen .strata-editor-input');
      return {
        layout: split ? split.getAttribute('data-layout') : 'nothing',
        /* A textarea's value is a property. Written to a file it comes back
           empty unless the text was put in the element as well. */
        text: box ? box.value.length : 0,
        preview: document.querySelectorAll('.site-specimen .strata-preview-box table').length,
        save: document.querySelectorAll('.site-specimen .strata-btn-primary').length
      };
    });
    if (editor.layout !== 'split') throw new Error('the editor is laid out ' + editor.layout);
    if (editor.text < 40) throw new Error('the editing half is empty');
    if (!editor.preview) throw new Error('the preview half rendered nothing');
    if (!editor.save) throw new Error('there is no save button');
  });

  /*
   * The site's pages are rendered ahead of time, but everything the web part
   * does after rendering is behaviour and does not survive being written to a
   * file. They ran none of it: a contents that did not follow the reading
   * position, code blocks nobody could copy from, and no way back to the top,
   * while the demo page beside them had all three.
   */
  await step('the site pages run the same behaviour as the web part', async () => {
    await page.goto('file://' + path.join(__dirname, '..', 'site', 'docs', 'index.html'),
      { waitUntil: 'load' });
    await page.waitForTimeout(700);

    const wired = await page.evaluate(() => ({
      copy: document.querySelectorAll('.strata-code-copy').length,
      toTop: document.querySelectorAll('.strata-to-top').length,
      newTab: document.querySelectorAll('.strata-content a[target="_blank"]').length
    }));
    if (!wired.copy) throw new Error('no copy buttons on the code blocks');
    if (!wired.toTop) throw new Error('no back to top button');
    if (!wired.newTab) throw new Error('external links do not leave the page');

    /* The half that cannot be written to a file: the contents keeping up. */
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(700);
    const reading = await page.evaluate(() => {
      const current = document.querySelector('.strata-toc a[aria-current="true"]');
      return current ? current.textContent.trim() : null;
    });
    if (!reading) throw new Error('the contents does not follow the reading position');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
  });

  /*
   * Counting copy buttons only proves the markup is there. The site pages used
   * to carry a second, hand-written copy handler of their own, which was dead
   * on arrival - the real one wired by page.js stops the event before it gets
   * there - and was a worse handler besides. So this clicks one and looks at
   * what the real handler does: the button says Copied, and what lands on the
   * clipboard is the source without the line numbers.
   */
  await step('a copy button on a site page is the web part\'s own', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('file://' + path.join(__dirname, '..', 'site', 'docs', 'index.html'),
      { waitUntil: 'load' });
    await page.waitForTimeout(900);

    const button = page.locator('.strata-code-copy').first();
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await page.waitForTimeout(300);

    const said = await page.evaluate(() => {
      const first = document.querySelector('.strata-code-copy');
      return {
        label: (first.querySelector('.strata-code-btn-label') || {}).textContent,
        state: first.getAttribute('data-state'),
        wired: first.getAttribute('data-strata-wired')
      };
    });
    if (said.wired !== 'true') {
      throw new Error('the copy button was never wired by the enhancer');
    }
    if (said.label !== 'Copied' || said.state !== 'done') {
      throw new Error('the button said ' + JSON.stringify(said));
    }

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    if (!copied || /^\s*\d+\s/.test(copied)) {
      throw new Error('the clipboard holds ' + JSON.stringify((copied || '').slice(0, 60)));
    }
  });

  await step('a site page with pictures gets the picture behaviour too', async () => {
    await page.goto('file://' + path.join(__dirname, '..', 'site', 'themes', 'index.html'),
      { waitUntil: 'load' });
    await page.waitForTimeout(900);
    const pictures = await page.evaluate(() => ({
      figures: document.querySelectorAll('.strata-figure').length,
      zoomable: document.querySelectorAll('img.strata-zoomable').length,
      blocks: document.querySelectorAll('.strata-image-block').length
    }));
    if (!pictures.figures) throw new Error('no captions');
    if (!pictures.zoomable) throw new Error('no image can be opened full size');
    if (!pictures.blocks) throw new Error('no image is placed by the page setting');
  });

  /*
   * The colour mode used to be decided at the foot of the page, so a page was
   * drawn light, painted, and repainted dark: a white flash on every load for
   * anyone reading in the dark. It is decided in the head now, and this
   * samples the page from the moment it commits rather than waiting for load,
   * because a flash is only visible before that.
   */
  await step('a page opens in the reader\'s colour mode, without a flash', async () => {
    const dark = await page.context().browser().newContext({
      viewport: { width: 1000, height: 700 }, colorScheme: 'dark'
    });
    try {
      for (const name of ['docs/index.html', 'demo/index.html']) {
        const fresh = await dark.newPage();
        const seen = [];
        await fresh.goto('file://' + path.join(__dirname, '..', 'site', name),
          { waitUntil: 'commit' });
        for (let image = 0; image < 16; image += 1) {
          try {
            /* Only once there is a body, because that is the first moment
               anything can be on screen: an instant with no body is not a
               flash, it is a page that has not started. */
            const state = await fresh.evaluate(() => document.body
              ? (document.documentElement.getAttribute('data-site-mode') || 'none')
              : null);
            if (state) {
              seen.push(state);
            }
          } catch (error) {
            /* Still navigating; nothing painted to judge yet. */
          }
          await fresh.waitForTimeout(25);
        }
        const states = [...new Set(seen)];
        await fresh.close();
        if (!states.length) throw new Error(name + ' never painted');
        if (states.length !== 1 || states[0] !== 'dark') {
          throw new Error(name + ' passed through ' + JSON.stringify(states));
        }
      }
    } finally {
      await dark.close();
    }
  });

  /*
   * Walks the pane to the page carrying a control, rather than relying on
   * wherever the previous step left it. Steps that inherited a page broke the
   * moment the pane was laid out differently, which is exactly the change the
   * pane is most likely to see.
   */
  const paneTo = async (control) => {
    for (let image = 0; image < 8; image += 1) {
      if (await page.locator(control).count() > 0) return;
      const next = page.locator('.pp-step', { hasText: 'Next' });
      if (await next.isDisabled()) break;
      await next.click();
      await page.waitForTimeout(120);
    }
    if (await page.locator(control).count() === 0) {
      throw new Error('no pane page carries ' + control);
    }
  };

  const paneToStart = async () => {
    for (let image = 0; image < 8; image += 1) {
      const back = page.locator('.pp-step', { hasText: 'Back' });
      if (await back.isDisabled()) return;
      await back.click();
      await page.waitForTimeout(120);
    }
  };

  await step('the property pane opens on five pages', async () => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto(demoUrl, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.locator('#demo-configure').click();
    await page.waitForTimeout(200);
    const count = await page.locator('.pp-count').textContent();
    if (!/of 5$/.test(count.trim())) throw new Error('pane reports ' + count);
  });

  await step('every pane page names its groups', async () => {
    const seen = [];
    for (let image = 0; image < 5; image += 1) {
      const groups = await page.locator('.pp-group').allTextContents();
      seen.push(groups.join(', '));
      if (image < 4) {
        await page.locator('.pp-step', { hasText: 'Next' }).click();
        await page.waitForTimeout(120);
      }
    }
    const expected = [
      'Content',
      'Theme, Reading, Pictures, The page',
      'Code blocks, Diagrams, Maths and HTML, Tables',
      'Contents, Links between documents',
      'Toolbar, File information'
    ];
    for (let image = 0; image < 5; image += 1) {
      if (seen[image] !== expected[image]) {
        throw new Error('page ' + (image + 1) + ' has "' + seen[image] + '", expected "'
          + expected[image] + '"');
      }
    }
  });

  await step('turning diagrams off hides the width that depends on them', async () => {
    await paneToStart();
    await paneTo('#pp-diagramWidth');
    const width = page.locator('#pp-diagramWidth');
    if (await width.count() === 0) throw new Error('Wide diagrams is missing');
    await page.locator('#pp-enableMermaid').click();
    await page.waitForTimeout(200);
    if (await page.locator('#pp-diagramWidth').count() !== 0) {
      throw new Error('Wide diagrams still shown with diagrams off');
    }
    await page.locator('#pp-enableMermaid').click();
    await page.waitForTimeout(400);
    if (await page.locator('#pp-diagramWidth').count() === 0) {
      throw new Error('Wide diagrams did not come back');
    }
  });

  await step('a wide diagram takes the width mode it is given', async () => {
    await page.selectOption('#pp-diagramWidth', 'scroll');
    await page.waitForTimeout(900);
    const mode = await page.evaluate(() => {
      const bounds = document.querySelector('.strata-mermaid[data-strata-diagram]');
      return bounds ? bounds.getAttribute('data-strata-diagram') : null;
    });
    if (mode !== 'scroll') throw new Error('diagram box reports ' + mode);
  });

  await page.screenshot({ path: path.join(HARNESS_DIST, 'harness-narrow.png'), fullPage: false });

  /*
   * A short document leaves the page canvas showing under the web part, which
   * is the whole point of "Fill the available height". The height it takes is
   * measured in the page rather than written as 100vh, because a SharePoint
   * page scrolls an inner container rather than the window, so only a running
   * browser can show whether the measurement lands.
   */
  await step('filling the height reaches the bottom, and carries the footer', async () => {
    /* Asked for by the control it needs, rather than counted in clicks from
       wherever the last step finished. */
    await paneToStart();
    await paneTo('#pp-fillHeight');

    await page.evaluate(() => {
      window.scrollTo(0, 0);
      window.harness.state.markdown = '# Access VM Remotely\n\n- Dial your number\n- Press star\n';
    });
    await page.locator('#pp-fillHeight').click();
    await page.waitForTimeout(500);

    const bounds = await page.evaluate(() => {
      const root = document.querySelector('.strata-root');
      const meta = document.querySelector('.strata-meta');
      return {
        fill: root.getAttribute('data-strata-fill'),
        minHeight: root.style.minHeight,
        bottom: root.getBoundingClientRect().bottom,
        metaBottom: meta ? meta.getBoundingClientRect().bottom : null,
        viewport: window.innerHeight
      };
    });

    if (bounds.fill !== 'window') throw new Error('the root reports fill=' + bounds.fill);
    if (!/^[0-9]+px$/.test(bounds.minHeight)) {
      throw new Error('nothing was measured; min-height is "' + bounds.minHeight + '"');
    }
    if (bounds.viewport - bounds.bottom > 4) {
      throw new Error('the web part stops ' + Math.round(bounds.viewport - bounds.bottom)
        + 'px above the bottom of the window');
    }
    if (bounds.metaBottom === null) throw new Error('the file footer is not shown');
    if (bounds.bottom - bounds.metaBottom > 40) {
      throw new Error('the file footer sits ' + Math.round(bounds.bottom - bounds.metaBottom)
        + 'px above the bottom of the web part');
    }
  });

  await step('turning it off gives the height straight back', async () => {
    await page.locator('#pp-fillHeight').click();
    await page.waitForTimeout(500);
    const left = await page.evaluate(() => {
      const root = document.querySelector('.strata-root');
      return {
        fill: root.getAttribute('data-strata-fill'),
        minHeight: root.style.minHeight,
        height: root.getBoundingClientRect().height
      };
    });
    if (left.fill !== 'content') throw new Error('the root reports fill=' + left.fill);
    if (left.minHeight) {
      throw new Error('a measured height was left on the element: ' + left.minHeight);
    }
    if (left.height > 500) {
      throw new Error('the web part is still ' + Math.round(left.height) + 'px tall');
    }
  });

  /*
   * The third pass: the web part itself.
   *
   * Everything above drives the classes below the web part. This drives
   * MarkstrataWebPart - the real one, started the way SharePoint starts it -
   * against the stand-ins in harness/spfx. It exists because 0.0.17.0 shipped
   * a web part that could not start at all and nothing here noticed: the
   * lifecycle had never run outside a tenant.
   *
   * Against that release these checks fail with the two errors it produced, in
   * the order it produced them: it could not start because the processor was
   * built before the navigator it reads, and it could not be put away either
   * because the disposal assumed everything had been built. The second is the
   * one the tenant showed.
   */
  console.log('\nDriving the web part itself:');

  await step('the web part starts, and says so rather than failing', async () => {
    await page.goto(webPartUrl, { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const state = await page.evaluate(() => {
      const strip = document.getElementById('wp-status');
      const failure = document.querySelector('#host .strata-status[data-tone="error"]');
      return {
        state: strip.dataset.state,
        text: (strip.textContent || '').trim(),
        failure: failure ? (failure.textContent || '').trim() : ''
      };
    });
    if (state.state !== 'started') {
      throw new Error(state.text || ('the status strip reads ' + state.state));
    }
    /* onInit keeps its own failures to itself now, so a web part that could not
       start still resolves: it says so by drawing a box instead of a document,
       and that is what has to be absent here. */
    if (state.failure) {
      throw new Error(state.failure);
    }
  });

  await step('it drew a document, with its toolbar and its contents', async () => {
    /* Given a document: a web part nobody has configured draws a panel saying
       so, which is checked further down and is why this has to ask for one. */
    const drawn = await page.evaluate(async () => {
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/handbook.md'
      });
      return {
        toolbar: !!document.querySelector('.strata-toolbar'),
        headings: document.querySelectorAll('#host h1, #host h2').length,
        code: document.querySelectorAll('#host pre').length
      };
    });
    if (!drawn.toolbar) throw new Error('no toolbar');
    if (drawn.headings < 2) throw new Error('only ' + drawn.headings + ' headings');
    if (drawn.code < 1) throw new Error('no code blocks');
  });

  /*
   * The other half of the same release. The lists the pane offers come from
   * the site through the web part, and they were built from a connection that
   * did not exist yet - so every dropdown was empty, in every tenant, and in
   * nothing anybody could see until an author opened the pane.
   */
  await step('the pane offers the libraries the site holds', async () => {
    const libraries = await page.evaluate(() => {
      /* The library picker only appears once the source is a library, which is
         also the only time its contents mean anything. */
      window.webPartHarness.change('contentSource', 'library');
      window.webPartHarness.openPane();
      return window.webPartHarness.paneOptions('selectedLibrary');
    });
    if (libraries.indexOf('Documents') === -1) {
      throw new Error('the library dropdown offers ' + JSON.stringify(libraries));
    }
  });

  await step('picking a file in the pane loads that file', async () => {
    const heading = await page.evaluate(async () => {
      window.webPartHarness.change('selectedLibrary', '/sites/demo/Documents');
      window.webPartHarness.change('selectedFile', '/sites/demo/Documents/Runbooks/deploy.md');
      await new Promise((resolve) => setTimeout(resolve, 400));
      const first = document.querySelector('#host h1');
      return first ? first.textContent : '';
    });
    if (heading.indexOf('Deploying') === -1) {
      throw new Error('the web part is showing ' + JSON.stringify(heading));
    }
  });

  await step('a link to another document opens it in the web part', async () => {
    const heading = await page.evaluate(async () => {
      const link = Array.from(document.querySelectorAll('#host a'))
        .filter((anchor) => (anchor.getAttribute('href') || '').indexOf('rollback.md') !== -1)[0];
      if (!link) { return 'no link to follow'; }
      link.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const first = document.querySelector('#host h1');
      return first ? first.textContent : '';
    });
    if (heading.indexOf('Rolling back') === -1) {
      throw new Error('after following the link the web part shows ' + JSON.stringify(heading));
    }
  });

  await step('a setting changed in the pane reaches the document', async () => {
    const theme = await page.evaluate(() => {
      window.webPartHarness.change('themeFamily', 'obsidian');
      const root = document.querySelector('.strata-root');
      return root ? root.getAttribute('data-strata-theme') : '';
    });
    if (theme !== 'obsidian') throw new Error('the document reports theme ' + theme);
  });

  await step('the site turning dark reaches a web part set to follow it', async () => {
    const modes = await page.evaluate(() => {
      window.webPartHarness.change('colorMode', 'auto');
      const before = document.querySelector('.strata-root').getAttribute('data-strata-mode');
      window.webPartHarness.siteTheme(true);
      const after = document.querySelector('.strata-root').getAttribute('data-strata-mode');
      return { before: before, after: after };
    });
    if (modes.before !== 'light' || modes.after !== 'dark') {
      throw new Error('the document went from ' + modes.before + ' to ' + modes.after);
    }
  });

  /*
   * Putting it away has to let go of everything it took hold of. The theme
   * listener is the one that can be checked from outside, because SharePoint
   * matches it on both the handler and the scope it was added with, so a
   * disposal that gets either wrong leaves it attached.
   */
  await step('putting the web part away lets go of the page', async () => {
    const left = await page.evaluate(() => {
      const failure = window.webPartHarness.dispose();
      return {
        error: failure ? failure.message : '',
        listeners: window.webPartHarness.themeListeners(),
        drawn: document.getElementById('host').children.length
      };
    });
    if (left.error) throw new Error('disposing threw: ' + left.error);
    if (left.listeners !== 0) {
      throw new Error(left.listeners + ' theme listeners are still attached');
    }
    if (left.drawn !== 0) throw new Error('the web part is still on the page');
  });

  /*
   * The case the release actually died on. A web part whose onInit threw on
   * its first line still gets disposed, with nothing built - and a disposal
   * that throws takes the whole page with it, which is why the tenant showed
   * a failure to stop instead of the failure to start.
   */
  await step('a web part that never started can still be put away', async () => {
    const failure = await page.evaluate(() => {
      const error = window.webPartHarness.disposeBeforeStarting();
      return error ? error.message : '';
    });
    if (failure) throw new Error('disposing an unstarted web part threw: ' + failure);
  });

  await step('so can one put away while it is still starting', async () => {
    const failure = await page.evaluate(async () => {
      const error = await window.webPartHarness.disposeWhileStarting(300);
      return error ? error.message : '';
    });
    if (failure) throw new Error('disposing mid-start threw: ' + failure);
  });

  /*
   * The rule the release broke: whatever happens to this web part happens to
   * this web part. SharePoint hosts many of them in one React tree, so an
   * exception that escapes lands in the page - which is how a web part that
   * could not start took its whole page down with it.
   */
  await step('a web part that cannot start keeps it to itself', async () => {
    /* The web part is meant to say so on the console: that is where an
       administrator looks, and it is all that is left of the real cause once
       the reader has been handed a box instead of a document. */
    expected.push(/The web part could not start/);

    const shown = await page.evaluate(async () => {
      window.webPartHarness.breakTheme(true);
      const result = await window.webPartHarness.start();
      window.webPartHarness.breakTheme(false);

      const failure = document.querySelector('#host .strata-status[data-tone="error"]');
      return {
        threw: result.started ? '' : 'the failure was thrown at the page',
        message: failure ? (failure.textContent || '').trim() : '',
        stillThere: !!document.getElementById('host')
      };
    });
    if (shown.threw) throw new Error(shown.threw);
    if (shown.message.indexOf('could not start') === -1) {
      throw new Error('the web part shows ' + JSON.stringify(shown.message));
    }
    if (!shown.stillThere) throw new Error('the page around it is gone');
  });

  await step('and can still be put away afterwards', async () => {
    const failure = await page.evaluate(() => {
      const error = window.webPartHarness.dispose();
      return error ? error.message : '';
    });
    if (failure) throw new Error('disposing a failed web part threw: ' + failure);
  });

  /*
   * Stylesheets are the other way a web part reaches a page it is not on:
   * SharePoint loads them into the document head, beside its own, where a
   * selector naming an element rather than one of this web part's classes is a
   * rule about everything on the page. Three had got out, all inside a print
   * media query, so they only ever showed on paper - and the worst of them
   * printed the address after every external link on the page, SharePoint's
   * navigation included.
   */
  await step('the print rules stay inside the web part', async () => {
    await page.evaluate(async () => {
      await window.webPartHarness.start({
        contentSource: 'manual',
        markdownContent: 'A link to [an example](https://example.com/inside).'
      });
    });
    await page.emulateMedia({ media: 'print' });

    const printed = await page.evaluate(() => {
      const after = (element) => element
        ? window.getComputedStyle(element, '::after').content
        : 'that element is not on the page';
      return {
        inside: after(document.querySelector('#host .strata-root a[href^="http"]')),
        outside: after(document.getElementById('wp-outside-link'))
      };
    });
    await page.emulateMedia({ media: null });

    /* The feature itself: a printed document says where its links went. */
    if (printed.inside.indexOf('example.com/inside') === -1) {
      throw new Error('a link in the document prints as ' + printed.inside);
    }
    /* And the page around it is none of the web part's business. */
    if (printed.outside.indexOf('example.com') !== -1) {
      throw new Error('a link outside the web part prints as ' + printed.outside);
    }
  });

  /*
   * Measuring the chrome means asking every element on the page where it sits,
   * which on a SharePoint page is thousands of them, on every render and on
   * every tick of a window drag. Two things are being checked here: that the
   * measurement no longer reads the web part's own document, and that it still
   * finds a real bar across the top of the page.
   *
   * The web part's own content matters because its table headers are sticky
   * and positioned at this very offset, so a wide enough one was chrome as far
   * as the measurement was concerned - and the offset it fed back into was its
   * own.
   */
  await step('the offset does not grow every time the window changes', async () => {
    const offsets = await page.evaluate(async () => {
      const wide = [
        '| A column wide enough to be mistaken for a bar across the page | B |',
        '|---|---|',
        '| one | two |'
      ].join('\n');

      await window.webPartHarness.start({
        contentSource: 'manual',
        markdownContent: `# Wide\n\n${wide}\n`
      });

      const read = () => {
        const root = document.querySelector('.strata-root');
        return parseFloat(root.style.getPropertyValue('--strata-scroll-offset')) || 0;
      };
      const settle = () => new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const first = read();
      window.dispatchEvent(new Event('resize'));
      await settle();
      const second = read();
      window.dispatchEvent(new Event('resize'));
      await settle();
      return { first: first, second: second, third: read() };
    });

    if (offsets.second !== offsets.first || offsets.third !== offsets.first) {
      throw new Error('the offset went ' + offsets.first + ' then ' + offsets.second
        + ' then ' + offsets.third);
    }
  });

  await step('but a bar across the top of the page is still measured', async () => {
    const measured = await page.evaluate(async () => {
      const bar = document.createElement('div');
      bar.id = 'wp-fake-chrome';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:48px;background:#333';
      document.body.appendChild(bar);

      const settle = () => new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)));

      window.dispatchEvent(new Event('resize'));
      await settle();
      const root = document.querySelector('.strata-root');
      const offset = parseFloat(root.style.getPropertyValue('--strata-scroll-offset')) || 0;

      bar.remove();
      window.dispatchEvent(new Event('resize'));
      await settle();
      const without = parseFloat(root.style.getPropertyValue('--strata-scroll-offset')) || 0;

      return { withBar: offset, without: without };
    });

    if (measured.withBar < 48) {
      throw new Error('a 48px bar measured as ' + measured.withBar);
    }
    if (measured.without >= measured.withBar) {
      throw new Error('removing the bar left the offset at ' + measured.without);
    }
  });

  await step('and it does not read the web part own document to do it', async () => {
    const counted = await page.evaluate(async () => {
      /* A long document, so anything proportional to it is obvious. */
      const rows = [];
      for (let index = 0; index < 400; index += 1) {
        rows.push(`- item number ${index}`);
      }
      await window.webPartHarness.start({
        contentSource: 'manual',
        markdownContent: `# Long\n\n${rows.join('\n')}\n`
      });

      const inside = document.querySelectorAll('.strata-root *').length;
      const onThePage = document.querySelectorAll('body *').length;

      /* Counted rather than timed: a stopwatch in a browser check is a flake
         waiting to happen, and the question is what it looks at, not how fast
         it looks. */
      const real = window.getComputedStyle;
      let asked = 0;
      window.getComputedStyle = function () {
        asked += 1;
        return real.apply(window, arguments);
      };

      const settle = () => new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.dispatchEvent(new Event('resize'));
      await settle();

      window.getComputedStyle = real;
      return { asked: asked, inside: inside, onThePage: onThePage };
    });

    if (counted.inside < 400) {
      throw new Error('the document only has ' + counted.inside + ' elements in it');
    }
    if (counted.asked >= counted.onThePage - counted.inside + 10) {
      throw new Error('it asked about ' + counted.asked + ' elements, with '
        + counted.inside + ' of the page\'s ' + counted.onThePage + ' inside the web part');
    }
  });

  await step('and it measures once for a burst of resizes, not once each', async () => {
    const counted = await page.evaluate(async () => {
      const real = window.getComputedStyle;
      let asked = 0;
      window.getComputedStyle = function () {
        asked += 1;
        return real.apply(window, arguments);
      };

      for (let index = 0; index < 20; index += 1) {
        window.dispatchEvent(new Event('resize'));
      }
      const duringTheBurst = asked;

      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const afterIt = asked;

      window.getComputedStyle = real;
      return { duringTheBurst: duringTheBurst, afterIt: afterIt };
    });

    if (counted.duringTheBurst !== 0) {
      throw new Error('twenty resize events measured ' + counted.duringTheBurst
        + ' times before the browser had drawn anything');
    }
    if (counted.afterIt === 0) {
      throw new Error('the burst never measured at all');
    }
  });

  /*
   * The same web part in a different frame. Nothing about a Teams tab can be
   * driven here - there is no Teams to stand in for - so what is checked is
   * the one thing that is this web part's own: that it reads which host it is
   * in without assuming any part of the way there exists, and writes the
   * answer where a tenant test can read it back. The differences between the
   * hosts are then a question that has an answer rather than a guess.
   */
  await step('it says which host it is in, and says SharePoint by default', async () => {
    const host = await page.evaluate(async () => {
      window.webPartHarness.inTeams(undefined);
      await window.webPartHarness.start();
      return document.getElementById('host').getAttribute('data-strata-host');
    });
    if (host !== 'sharepoint') throw new Error('it reports ' + host);
  });

  await step('and names the Teams client when there is one', async () => {
    const hosts = await page.evaluate(async () => {
      const seen = [];
      for (const client of ['desktop', 'web', 'ios']) {
        window.webPartHarness.inTeams(client);
        await window.webPartHarness.start();
        seen.push(document.getElementById('host').getAttribute('data-strata-host'));
      }
      window.webPartHarness.inTeams(undefined);
      return seen;
    });
    const expected = ['teams-desktop', 'teams-web', 'teams-ios'];
    if (hosts.join(' ') !== expected.join(' ')) {
      throw new Error('it reported ' + JSON.stringify(hosts));
    }
  });

  await step('and still draws the document in a Teams tab', async () => {
    const drawn = await page.evaluate(async () => {
      window.webPartHarness.inTeams('desktop');
      const result = await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/Runbooks/deploy.md'
      });
      window.webPartHarness.inTeams(undefined);
      const heading = document.querySelector('#host h1');
      return {
        started: result.started,
        heading: heading ? heading.textContent : '',
        toolbar: !!document.querySelector('.strata-toolbar')
      };
    });
    if (!drawn.started) throw new Error('it did not start in a Teams tab');
    if (drawn.heading.indexOf('Deploying') === -1) {
      throw new Error('it is showing ' + JSON.stringify(drawn.heading));
    }
    if (!drawn.toolbar) throw new Error('no toolbar in a Teams tab');
  });

  /*
   * A web part nobody has set up.
   *
   * It used to answer that by rendering the sample document, which reads as a
   * configured web part showing a document about Markstrata - and in a Teams
   * tab, where there is no property pane anywhere in sight, that is all anyone
   * ever saw. It says so now, and says where the way in is, which differs by
   * host and is only obvious in one of them.
   */
  await step('a web part nobody set up says so rather than showing a sample', async () => {
    const shown = await page.evaluate(async () => {
      window.webPartHarness.inTeams(undefined);
      await window.webPartHarness.start();
      const panel = document.querySelector('#host .strata-unconfigured');
      return {
        panel: panel ? (panel.textContent || '').trim() : '',
        document: document.querySelectorAll('#host .strata-root').length,
        toolbar: document.querySelectorAll('#host .strata-toolbar').length
      };
    });
    if (!shown.panel) throw new Error('nothing was said; the host holds nothing');
    if (shown.document !== 0) throw new Error('a document was rendered anyway');
    if (shown.toolbar !== 0) throw new Error('a toolbar was rendered over nothing');
    if (shown.panel.indexOf('No document chosen yet') === -1) {
      throw new Error('it says ' + JSON.stringify(shown.panel.slice(0, 80)));
    }
  });

  await step('and points at the way in, which is different in each host', async () => {
    const said = await page.evaluate(async () => {
      const read = () => {
        const panel = document.querySelector('#host .strata-unconfigured');
        return panel ? (panel.textContent || '').trim() : '';
      };

      window.webPartHarness.inTeams(undefined);
      await window.webPartHarness.start();
      const onPage = read();
      window.webPartHarness.editing(true);
      const editingPage = read();

      window.webPartHarness.inTeams('desktop');
      await window.webPartHarness.start();
      const inTeams = read();
      window.webPartHarness.inTeams(undefined);

      return { onPage: onPage, editingPage: editingPage, inTeams: inTeams };
    });

    if (said.onPage.indexOf('edit this page') === -1) {
      throw new Error('a reader on a page is told: ' + JSON.stringify(said.onPage));
    }
    if (said.editingPage.indexOf('property pane') === -1) {
      throw new Error('an author is told: ' + JSON.stringify(said.editingPage));
    }
    if (said.inTeams.indexOf("tab's settings") === -1) {
      throw new Error('a Teams tab is told: ' + JSON.stringify(said.inTeams));
    }
    /* The one that mattered: a Teams tab must not be told to open a property
       pane that a Teams tab does not have. */
    if (said.inTeams.indexOf('property pane') !== -1) {
      throw new Error('a Teams tab is pointed at a property pane it has not got');
    }
  });

  await step('an author can take the sample, and a reader is not offered it', async () => {
    const outcome = await page.evaluate(async () => {
      await window.webPartHarness.start();
      const offeredToReader = !!document.querySelector('.strata-unconfigured-sample');

      window.webPartHarness.editing(true);
      const button = document.querySelector('.strata-unconfigured-sample');
      if (!button) { return { offeredToReader: offeredToReader, took: 'no button' }; }
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const heading = document.querySelector('#host .strata-root h1');
      return {
        offeredToReader: offeredToReader,
        took: heading ? heading.textContent : 'nothing was rendered',
        panelGone: !document.querySelector('.strata-unconfigured')
      };
    });

    if (outcome.offeredToReader) throw new Error('a reader was offered the sample');
    if (outcome.took.indexOf('Markstrata') === -1) {
      throw new Error('after taking the sample it shows ' + JSON.stringify(outcome.took));
    }
    if (!outcome.panelGone) throw new Error('the panel is still there');
  });

  await step('and a web part that is set up shows the document, not the panel', async () => {
    const shown = await page.evaluate(async () => {
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/Runbooks/deploy.md'
      });
      const heading = document.querySelector('#host h1');
      return {
        panel: !!document.querySelector('.strata-unconfigured'),
        heading: heading ? heading.textContent : ''
      };
    });
    if (shown.panel) throw new Error('a configured web part shows the panel');
    if (shown.heading.indexOf('Deploying') === -1) {
      throw new Error('it is showing ' + JSON.stringify(shown.heading));
    }
  });

  /*
   * The shape a reader reported and the shape nothing here had: an index at
   * the root of a library, a wiki link into a subfolder, and a file whose name
   * has a space in it.
   *
   * Every document in these checks had an ASCII name, so every href was the
   * same string encoded or not, so nothing noticed that the encoded one was
   * being handed to SharePoint as a path. SharePoint encodes paths itself, so
   * it was encoded twice and matched nothing. "deploy.md" hid it; "Deploy
   * notes.md" does not, and neither does "Shared Documents", which is what the
   * library is called in most tenants.
   */
  await step('a wiki link into a subfolder opens the document it names', async () => {
    const opened = await page.evaluate(async () => {
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/index.md',
        enableWikiLinks: true,
        followDocumentLinks: true
      });
      await new Promise((resolve) => setTimeout(resolve, 400));

      const link = Array.from(document.querySelectorAll('#host article a'))
        .filter((anchor) => anchor.classList.contains('strata-wiki-link'))[0];
      if (!link) { return { failed: 'the wiki link did not render as a link' }; }
      if (!link.classList.contains('strata-doc-link')) {
        return { failed: 'the web part did not take the click' };
      }

      const href = link.getAttribute('href');
      link.click();
      await new Promise((resolve) => setTimeout(resolve, 600));

      const heading = document.querySelector('#host h1');
      const banner = document.querySelector('#host .strata-banner');
      return {
        href: href,
        heading: heading ? heading.textContent : '',
        banner: banner ? (banner.textContent || '').trim() : ''
      };
    });

    if (opened.failed) throw new Error(opened.failed);
    /* The href stays encoded, because that is what the browser follows when
       somebody opens it in a new tab. */
    if (opened.href.indexOf('%20') === -1) {
      throw new Error('the href was left unencoded: ' + opened.href);
    }
    if (opened.banner) throw new Error(opened.banner);
    if (opened.heading.indexOf('Deploying') === -1) {
      throw new Error('after the click the web part shows ' + JSON.stringify(opened.heading));
    }
  });

  /*
   * The way back goes back one document, not all the way out.
   *
   * The bar closed straight to the configured document however deep the
   * reader had gone, so every link after the first was a one-way trip: three
   * pages into a wiki the only way back was the beginning, and the trail the
   * reader had walked was gone. It now names the document behind this one and
   * returns there, and the browser's own Back button walks the same trail
   * because the trail rides in the history entry.
   *
   * index.md -> Runbooks/Deploy notes.md -> Runbooks/rollback.md, which is a
   * chain the stand-in library already holds.
   */
  await step('the way back goes back one document, not out to the start', async () => {
    const walk = await page.evaluate(async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 600));
      const heading = () => {
        const found = document.querySelector('#host h1');
        return found ? (found.textContent || '').trim() : '';
      };
      /* The way back is the last crumb before the one the reader is on. */
      const backButton = () => {
        const links = document.querySelectorAll('#host .strata-crumb-link');
        return links.length ? links[links.length - 1] : null;
      };
      const backSays = () => {
        const button = backButton();
        return button ? (button.textContent || '').trim() : '';
      };
      const crumbs = () => Array.prototype.slice
        .call(document.querySelectorAll('#host .strata-crumb'))
        .map((crumb) => (crumb.textContent || '').trim());

      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/index.md',
        enableWikiLinks: true,
        followDocumentLinks: true
      });
      await settle();

      const follow = (within) => {
        const link = Array.from(document.querySelectorAll('#host article a'))
          .filter((anchor) => anchor.classList.contains('strata-doc-link')
            && (anchor.getAttribute('href') || '').indexOf(within) !== -1)[0];
        if (!link) { return false; }
        link.click();
        return true;
      };

      const steps = [];
      if (!follow('Deploy%20notes')) { return { failed: 'no link to the deploy notes' }; }
      await settle();
      steps.push({ at: heading(), back: backSays(), trail: crumbs() });

      if (!follow('rollback')) { return { failed: 'the deploy notes link nowhere' }; }
      await settle();
      steps.push({ at: heading(), back: backSays(), trail: crumbs() });

      /* Said rather than thrown. Against the old behaviour the first way back
         went all the way out, so the bar was gone by the second click and the
         check died on a null instead of reporting what it had found. */
      const goBack = (which) => {
        const button = backButton();
        if (!button) { return `the way back was gone ${which}`; }
        button.click();
        return '';
      };

      const first = goBack('after two links in');
      if (first) { return { failed: first, steps: steps }; }
      await settle();
      steps.push({ at: heading(), back: backSays(), trail: crumbs() });

      const second = goBack('after going back once, which means it went out to the start');
      if (second) { return { failed: second, steps: steps }; }
      await settle();
      steps.push({ at: heading(), back: backSays(), bar: !!document.querySelector('#host .strata-open-doc') });

      return { steps: steps };
    });

    if (walk.failed) {
      throw new Error(walk.failed + '; got to ' + JSON.stringify(walk.steps));
    }
    const [one, two, three, four] = walk.steps;

    /* One link in, the way back is the configured document, which is the only
       name the navigator does not hold itself. */
    if (one.back !== 'index') {
      throw new Error('one link in, the way back says ' + JSON.stringify(one.back));
    }
    /* Two crumbs: where the reader started, and where they are. */
    if (one.trail.length !== 2) {
      throw new Error('one link in, the trail reads ' + JSON.stringify(one.trail));
    }
    /* Two in, and this is the whole point: it names the page just left, not
       the one the page is configured with. */
    if (two.back !== 'Deploy notes') {
      throw new Error('two links in, the way back says ' + JSON.stringify(two.back));
    }
    /* And every step of the way is on screen and clickable, which is the
       whole reason this is a trail rather than a button. */
    if (two.trail.length !== 3 || two.trail[0] !== 'index') {
      throw new Error('two links in, the trail reads ' + JSON.stringify(two.trail));
    }
    if (two.at.indexOf('Rolling back') === -1 && two.at.indexOf('Roll') === -1) {
      throw new Error('two links in, the document is ' + JSON.stringify(two.at));
    }
    /* Back once lands on the middle document, not on the configured one. */
    if (three.at.indexOf('Deploying') === -1) {
      throw new Error('after going back the document is ' + JSON.stringify(three.at));
    }
    if (three.back !== 'index') {
      throw new Error('after going back the way back says ' + JSON.stringify(three.back));
    }
    /* The crumb walked back from is dropped, not left hanging off the end. */
    if (three.trail.length !== 2) {
      throw new Error('after going back the trail reads ' + JSON.stringify(three.trail));
    }
    /* And back again leaves the trail entirely, so the bar goes with it. */
    if (four.bar) {
      throw new Error('back at the configured document the bar is still there');
    }
  });

  /*
   * And a crumb in the middle is a way straight there, which is the point of
   * drawing the trail rather than one button: four documents deep, going back
   * three times to reach the second one is not navigation.
   *
   * index.md -> Runbooks/Deploy notes.md -> rollback.md -> deploy.md, then a
   * click on the second crumb.
   */
  await step('a crumb in the middle goes straight there and drops the rest', async () => {
    const jumped = await page.evaluate(async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 600));
      const crumbs = () => Array.prototype.slice
        .call(document.querySelectorAll('#host .strata-crumb'))
        .map((crumb) => (crumb.textContent || '').trim());

      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/index.md',
        enableWikiLinks: true,
        followDocumentLinks: true
      });
      await settle();

      const follow = (within) => {
        const link = Array.from(document.querySelectorAll('#host article a'))
          .filter((anchor) => anchor.classList.contains('strata-doc-link')
            && (anchor.getAttribute('href') || '').indexOf(within) !== -1)[0];
        if (!link) { return false; }
        link.click();
        return true;
      };

      if (!follow('Deploy%20notes')) { return { failed: 'no link to the deploy notes' }; }
      await settle();
      if (!follow('rollback')) { return { failed: 'the deploy notes link nowhere' }; }
      await settle();
      if (!follow('deploy.md')) { return { failed: 'rollback links nowhere' }; }
      await settle();

      const deep = crumbs();
      const links = document.querySelectorAll('#host .strata-crumb-link');
      if (links.length < 2) {
        return { failed: 'four deep there are ' + links.length + ' crumbs to click', deep: deep };
      }
      /* The second crumb: the first document followed to, two behind. */
      links[1].click();
      await settle();

      const heading = document.querySelector('#host h1');
      return {
        deep: deep,
        at: heading ? (heading.textContent || '').trim() : '',
        after: crumbs()
      };
    });

    if (jumped.failed) {
      throw new Error(jumped.failed + '; the trail was ' + JSON.stringify(jumped.deep));
    }
    if (jumped.deep.length !== 4) {
      throw new Error('four documents in, the trail reads ' + JSON.stringify(jumped.deep));
    }
    if (jumped.at.indexOf('Deploying') === -1) {
      throw new Error('the crumb went to ' + JSON.stringify(jumped.at));
    }
    /* Everything the reader has just said is behind them is gone, rather than
       left on the end to be walked forward into again. */
    if (jumped.after.length !== 2) {
      throw new Error('after the jump the trail reads ' + JSON.stringify(jumped.after));
    }
  });

  /*
   * A SharePoint page is a single-page application with a router listening for
   * clicks on the whole document, and it listens before any one element does.
   * Bubbling up to it meant it saw every click on a document link first: it
   * put the .md file's address in the address bar and handed the reader the
   * download this feature exists to replace, and a refresh downloaded it
   * again. The document did open underneath, which is why it looked like a
   * double click worked and a single click did not.
   *
   * There is no router here, so one is stood up: a listener on the document,
   * in the same phase SharePoint's uses, that records what reached it.
   */
  await step('the page router never sees a click on a document link', async () => {
    const seen = await page.evaluate(async () => {
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/index.md',
        enableWikiLinks: true,
        followDocumentLinks: true
      });
      await new Promise((resolve) => setTimeout(resolve, 400));

      const reached = [];
      const router = (event) => {
        const link = event.target.closest && event.target.closest('a[href]');
        if (link) { reached.push(link.getAttribute('href')); }
      };
      /* Capture, as a router would, so it gets first refusal. */
      document.addEventListener('click', router, true);

      const wiki = Array.from(document.querySelectorAll('#host article a'))
        .filter((anchor) => anchor.classList.contains('strata-wiki-link'))[0];
      wiki.click();
      await new Promise((resolve) => setTimeout(resolve, 500));

      /* And a link the web part does not claim, to prove the router is alive
         and that ordinary links are still the page's business. */
      const outside = document.getElementById('wp-outside-link');
      outside.addEventListener('click', (event) => event.preventDefault());
      outside.click();
      await new Promise((resolve) => setTimeout(resolve, 100));

      document.removeEventListener('click', router, true);
      const heading = document.querySelector('#host h1');
      return { reached: reached, heading: heading ? heading.textContent : '' };
    });

    const tookTheDocumentLink = seen.reached.some((href) => href.indexOf('.md') !== -1);
    if (tookTheDocumentLink) {
      throw new Error('the router saw ' + JSON.stringify(seen.reached));
    }
    if (seen.reached.length === 0) {
      throw new Error('the stand-in router saw nothing at all, so it proves nothing');
    }
    if (seen.heading.indexOf('Deploying') === -1) {
      throw new Error('the document did not open: ' + JSON.stringify(seen.heading));
    }
  });

  /*
   * The editor writes to the file the web part is configured with, because
   * that is the only file it has. So opening it while the reader has followed
   * a link somewhere else put somebody's runbook in the box with Home.md on
   * the save button, and saving would have replaced one with the other without
   * a word. Version history is already withheld in that state for the same
   * reason; this is the same rule applied to the operation that destroys
   * something.
   */
  await step('the editor is withheld while another document is open', async () => {
    const state = await page.evaluate(async () => {
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/index.md',
        enableWikiLinks: true,
        followDocumentLinks: true
      });
      await new Promise((resolve) => setTimeout(resolve, 400));

      /* Follow a link, then have the author open the page for editing. */
      const link = Array.from(document.querySelectorAll('#host article a'))
        .filter((anchor) => anchor.classList.contains('strata-wiki-link'))[0];
      link.click();
      await new Promise((resolve) => setTimeout(resolve, 600));

      window.webPartHarness.editing(true);
      await new Promise((resolve) => setTimeout(resolve, 300));

      const banner = document.querySelector('#host .strata-banner');
      return {
        heading: (document.querySelector('#host h1') || {}).textContent || '',
        editor: document.querySelectorAll('#host textarea').length,
        saveButtons: Array.from(document.querySelectorAll('#host button'))
          .map((button) => (button.textContent || '').trim())
          .filter((text) => text.toLowerCase().indexOf('save') !== -1),
        banner: banner ? (banner.textContent || '').trim() : ''
      };
    });

    if (state.heading.indexOf('Deploying') === -1) {
      throw new Error('the followed document is not the one on screen: ' + state.heading);
    }
    if (state.editor !== 0) {
      throw new Error('the editor opened on a document it cannot save');
    }
    if (state.saveButtons.length !== 0) {
      throw new Error('a save button is offered: ' + JSON.stringify(state.saveButtons));
    }
    if (state.banner.indexOf('Close it') === -1) {
      throw new Error('nothing explains why the editor is not there: '
        + JSON.stringify(state.banner));
    }
  });

  await step('and comes back once that document is closed', async () => {
    const state = await page.evaluate(async () => {
      /* The trail above the document carries the way back: the first crumb
         is the configured document. */
      const close = document.querySelector('#host .strata-crumb-link');
      if (close) { close.click(); }
      await new Promise((resolve) => setTimeout(resolve, 500));

      return {
        editor: document.querySelectorAll('#host textarea').length,
        closed: !close ? 'no way back was offered' : ''
      };
    });
    if (state.closed) throw new Error(state.closed);
    if (state.editor === 0) throw new Error('the editor did not come back');
  });

  /*
   * A SharePoint menu can only point at a page, and a page shows the one
   * document it was configured with, so a wiki's navigation bar worked exactly
   * once: a reader reached the home document and had to find the rest by
   * following links out of it. Naming the document in the address is what
   * makes the other entries on the menu mean something.
   */
  await step('a document named in the address is the one that opens', async () => {
    const shown = await page.evaluate(async () => {
      window.webPartHarness.addressDocument('/sites/demo/Documents/Runbooks/Deploy notes.md');
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/index.md',
        followDocumentLinks: true
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      const heading = document.querySelector('#host h1');
      const bar = document.querySelector('#host .strata-open-doc');
      return {
        heading: heading ? heading.textContent : '',
        wayBack: !!(bar && bar.querySelector('.strata-crumb-link'))
      };
    });
    if (shown.heading.indexOf('Deploying') === -1) {
      throw new Error('the address was ignored; it shows ' + JSON.stringify(shown.heading));
    }
    /* And it is still plainly a document other than the page's own, with the
       way back to it, exactly as a followed link is. */
    if (!shown.wayBack) throw new Error('no way back to the configured document');
  });

  /*
   * And the heading in that address, which is the half of it a menu entry
   * actually uses: a wiki's navigation points at sections, not only at files.
   *
   * The document here is the page's own configured one, because that is the
   * case a menu hits most: every entry points at the same page, and most of
   * them name a heading in the document it already shows. Reported as "it just
   * loaded the home page", which is what landing on the top of the right
   * document looks like.
   */
  await step('and lands on the heading that address names', async () => {
    const landed = await page.evaluate(async () => {
      window.webPartHarness.addressDocument('/sites/demo/Documents/handbook.md#tables');
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/handbook.md',
        followDocumentLinks: true
      });
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const heading = document.getElementById('tables');
      if (!heading) { return { failed: 'the document has no heading with that id' }; }
      return { top: Math.round(heading.getBoundingClientRect().top) };
    });

    if (landed.failed) throw new Error(landed.failed);
    /* Somewhere near the top of the window rather than far down it, which is
       where it sits if nothing scrolled. */
    if (landed.top > 200 || landed.top < -200) {
      throw new Error('the named heading sits at ' + landed.top + ', so nothing landed on it');
    }
  });

  /*
   * The same address, with the heading written the way a person writes one.
   *
   * The check above names it `#tables`, which is already lower case and is
   * already the id the heading was given, so it matched whatever the lookup
   * did with it. A menu entry is written by hand against a heading that reads
   * "Tables", and that is the spelling that found nothing: the reader landed
   * at the top of the right document and reported the anchor as ignored.
   */
  await step('and honours a heading named the way a person writes it', async () => {
    const landed = await page.evaluate(async () => {
      window.webPartHarness.addressDocument('/sites/demo/Documents/handbook.md#Tables');
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/handbook.md',
        followDocumentLinks: true
      });
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const heading = document.getElementById('tables');
      if (!heading) { return { failed: 'the document has no heading with that id' }; }
      return { top: Math.round(heading.getBoundingClientRect().top) };
    });

    if (landed.failed) throw new Error(landed.failed);
    if (landed.top > 200 || landed.top < -200) {
      throw new Error('the named heading sits at ' + landed.top + ', so nothing landed on it');
    }
  });

  /*
   * And an anchor inside the document, which is the other half of the fault.
   *
   * Left to the browser this is not a scroll. A SharePoint page is a
   * single-page application with a router listening for clicks, a fragment is
   * a navigation as far as it is concerned, and what the reader got was
   * wiki.aspx with the anchor on the address and the configured document back
   * on the screen - a heading that document has not got. The click is taken
   * before the router the same way a click on a document link already is.
   */
  await step('an anchor in the document scrolls instead of leaving it', async () => {
    const moved = await page.evaluate(async () => {
      window.webPartHarness.addressDocument('');
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/Runbooks/rollback.md',
        enableWikiLinks: true,
        followDocumentLinks: true
      });
      /* Long enough that the document has finished being drawn. Measured
         earlier, the heading is wherever the half-built article left it. */
      await new Promise((resolve) => setTimeout(resolve, 1500));

      /* By its href, not by being the first one: the permalink beside every
         heading is an anchor into this document too, and is the first in the
         article. It is taken by the same handler for the same reason, which is
         why there is more than one of these to choose from. */
      const link = Array.from(
        document.querySelectorAll('#host article a.strata-anchor-link')
      ).filter((a) => a.getAttribute('href') === '#when-to-roll-back')[0];
      if (!link) { return { failed: 'the anchor did not render as one the web part takes' }; }

      const before = window.location.href;
      link.click();
      /* A smooth scroll of a couple of thousand pixels is not instant. */
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const heading = document.getElementById('when-to-roll-back');
      if (!heading) { return { failed: 'the document has no heading with that id' }; }
      const title = document.querySelector('#host article h1');
      return {
        top: Math.round(heading.getBoundingClientRect().top),
        title: title ? title.textContent : '',
        addressChanged: window.location.href !== before
      };
    });

    if (moved.failed) throw new Error(moved.failed);
    /* Still the document that carried the link, rather than the configured one
       the router used to send the reader back to. */
    if (moved.title.indexOf('Rolling back') === -1) {
      throw new Error('the click left the document; it now shows ' + JSON.stringify(moved.title));
    }
    if (moved.addressChanged) {
      throw new Error('the click put a fragment on the address, which is what the router follows');
    }
    if (moved.top > 200 || moved.top < -200) {
      throw new Error('the named heading sits at ' + moved.top + ', so nothing scrolled to it');
    }
  });

  /*
   * A document that is not in this tenant at all.
   *
   * The File URL source reads markdown from anywhere that will answer, and a
   * wiki link inside that document resolves against the folder its address is
   * in - so following one asks another server for another document. That used
   * to leave the page for the file itself, which on a raw host hands the
   * reader markdown as plain text: the source of the page they were reading
   * rather than the page.
   *
   * The link in the sample is written as a github.com blob address, which is
   * the one a browser gives you, while the document is stored under the raw
   * address. So this only passes if the two are translated between.
   */
  await step('a link in a document fetched from a URL opens here too', async () => {
    const opened = await page.evaluate(async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 600));
      /* The check before this one left a document named in the address, and it
         is still there: replaceState outlives a restart of the web part. With
         it set, the web part opens that document over this one and the check
         reads the wrong page. */
      window.webPartHarness.addressDocument(undefined);
      await window.webPartHarness.start({
        contentSource: 'url',
        fileUrl: 'https://raw.githubusercontent.com/contoso/wiki/main/docs/Home.md',
        enableWikiLinks: true,
        followDocumentLinks: true
      });
      await settle();

      const first = document.querySelector('#host h1');
      const wiki = Array.from(document.querySelectorAll('#host article a'))
        .filter((anchor) => anchor.classList.contains('strata-doc-link'))[0];
      if (!wiki) {
        return { failed: 'no link in the remote document was claimed by the web part' };
      }

      const href = wiki.getAttribute('href');
      wiki.click();
      await settle();

      const heading = document.querySelector('#host h1');
      const banner = document.querySelector('#host .strata-banner');
      const crumbs = Array.prototype.slice
        .call(document.querySelectorAll('#host .strata-crumb'))
        .map((crumb) => (crumb.textContent || '').trim());
      return {
        started: first ? (first.textContent || '').trim() : '',
        href: href,
        at: heading ? (heading.textContent || '').trim() : '',
        banner: banner ? (banner.textContent || '').trim() : '',
        crumbs: crumbs
      };
    });

    if (opened.failed) throw new Error(opened.failed);
    if (opened.started.indexOf('Remote handbook') === -1) {
      throw new Error('the configured URL did not load; it shows '
        + JSON.stringify(opened.started));
    }
    /* The href is the address on that server, not a path on this tenant. */
    if (opened.href.indexOf('https://raw.githubusercontent.com/') !== 0) {
      throw new Error('the wiki link points at ' + JSON.stringify(opened.href));
    }
    if (opened.banner) throw new Error(opened.banner);
    if (opened.at.indexOf('Remote deploying') === -1) {
      throw new Error('after the click the web part shows ' + JSON.stringify(opened.at));
    }
    /* And it is a followed document like any other, with a way back. */
    if (opened.crumbs.length !== 2) {
      throw new Error('the trail reads ' + JSON.stringify(opened.crumbs));
    }
  });

  /*
   * And the same document reached by the address a browser gives you, which is
   * GitHub's blob page rather than the file. Written as an ordinary markdown
   * link rather than a wiki link, because that is how somebody pastes one.
   */
  await step('and a GitHub blob address opens the file it is a page about', async () => {
    const opened = await page.evaluate(async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 600));
      /* The check before this one left a document named in the address, and it
         is still there: replaceState outlives a restart of the web part. With
         it set, the web part opens that document over this one and the check
         reads the wrong page. */
      window.webPartHarness.addressDocument(undefined);
      await window.webPartHarness.start({
        contentSource: 'url',
        fileUrl: 'https://raw.githubusercontent.com/contoso/wiki/main/docs/Home.md',
        enableWikiLinks: true,
        followDocumentLinks: true
      });
      await settle();

      const blob = Array.from(document.querySelectorAll('#host article a'))
        .filter((anchor) => (anchor.getAttribute('href') || '').indexOf('github.com/contoso') !== -1)[0];
      if (!blob) { return { failed: 'the blob link is not in the sample' }; }
      if (!blob.classList.contains('strata-doc-link')) {
        return { failed: 'the web part did not claim the blob link' };
      }
      blob.click();
      await settle();

      const heading = document.querySelector('#host h1');
      const banner = document.querySelector('#host .strata-banner');
      return {
        at: heading ? (heading.textContent || '').trim() : '',
        banner: banner ? (banner.textContent || '').trim() : ''
      };
    });

    if (opened.failed) throw new Error(opened.failed);
    if (opened.banner) throw new Error(opened.banner);
    if (opened.at.indexOf('Remote deploying') === -1) {
      throw new Error('the blob address went to ' + JSON.stringify(opened.at));
    }
  });

  /*
   * An Office file embedded in a document.
   *
   * `![[Quarterly report.docx]]` used to render as a link with a mark on it,
   * which is a link to a download: the reader either gets a file or loses the
   * page they were on. It is a card now, with the file's name, the way into
   * Word beside it, and SharePoint's own preview in a frame underneath.
   *
   * The card is built from what the link already says and the preview arrives
   * afterwards, because the frame is addressed by the file's unique id and
   * that is a request. So a card with no preview in it is a state worth
   * checking on purpose: a tenant can refuse the frame and there is no way to
   * find that out from the outside, so the name and the link have to stand on
   * their own.
   */
  await step('an embedded Office file is a card, not a link to a download', async () => {
    const card = await page.evaluate(async () => {
      window.webPartHarness.addressDocument(undefined);
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/reports.md',
        enableWikiLinks: true,
        followDocumentLinks: true
      });
      await new Promise((resolve) => setTimeout(resolve, 900));

      const cards = Array.prototype.slice.call(
        document.querySelectorAll('#host .strata-office')
      );
      if (cards.length !== 2) {
        return { failed: `${cards.length} cards, expected two` };
      }

      const read = (element) => {
        const name = element.querySelector('.strata-office-name');
        const open = element.querySelector('.strata-office-open');
        const frame = element.querySelector('iframe.strata-office-frame');
        const holder = element.querySelector('.strata-office-preview');
        return {
          kind: element.getAttribute('data-office'),
          name: name ? (name.textContent || '').trim() : '',
          opens: open ? open.getAttribute('href') : '',
          target: open ? open.getAttribute('target') : '',
          src: frame ? frame.getAttribute('src') : '',
          suppressed: holder ? holder.getAttribute('data-strata-no-preview') : ''
        };
      };

      return {
        filed: read(cards[0]),
        unfiled: read(cards[1]),
        leftovers: document.querySelectorAll('#host a.strata-wiki-embed').length
      };
    });

    if (card.failed) throw new Error(card.failed);

    /* The one the library holds: named, openable, and previewed. */
    if (card.filed.kind !== 'word') {
      throw new Error('the card calls it ' + JSON.stringify(card.filed.kind));
    }
    if (card.filed.name !== 'Quarterly report.docx') {
      throw new Error('the card is titled ' + JSON.stringify(card.filed.name));
    }
    if ((card.filed.opens || '').indexOf('Quarterly%20report.docx') === -1) {
      throw new Error('the way into Word points at ' + JSON.stringify(card.filed.opens));
    }
    if (card.filed.target !== '_blank') {
      throw new Error('opening the file would take the reader off the page they are on');
    }
    if ((card.filed.src || '').indexOf('/_layouts/15/Doc.aspx') === -1
      || card.filed.src.indexOf('action=embedview') === -1) {
      throw new Error('the preview is addressed as ' + JSON.stringify(card.filed.src));
    }

    /* The one nothing could look up: still a card, with no empty box under it. */
    if (card.unfiled.name !== 'Missing report.docx') {
      throw new Error('the second card is titled ' + JSON.stringify(card.unfiled.name));
    }
    if (card.unfiled.src) {
      throw new Error('a file with no id got a frame pointing at '
        + JSON.stringify(card.unfiled.src));
    }
    if (card.unfiled.suppressed !== 'true') {
      throw new Error('a card with no preview left an empty box behind it');
    }

    /* And no embed was left as the marked link it started as. */
    if (card.leftovers !== 0) {
      throw new Error(card.leftovers + ' embeds were never turned into cards');
    }
  });

  await step('and the preview frame really loads what it is pointed at', async () => {
    /* Scrolled to first: the frame is lazy, which is right when a document
       holds several of these, and a lazy frame off the bottom of the window
       has not fetched anything yet. */
    await page.evaluate(() => {
      const card = document.querySelector('#host .strata-office');
      if (card) { card.scrollIntoView(); }
    });
    await page.waitForTimeout(800);

    /* Read through Playwright's own view of the frames rather than by reaching
       into contentDocument, which is empty until the load finishes and says
       nothing about why. */
    const preview = page.frames().filter(
      (frame) => frame.url().indexOf('/_layouts/15/Doc.aspx') !== -1
    )[0];
    if (!preview) {
      throw new Error('no frame is pointed at the preview address; frames: '
        + JSON.stringify(page.frames().map((frame) => frame.url())));
    }
    const text = await preview.locator('#stand-in-preview').textContent();
    if ((text || '').indexOf('SharePoint would draw the document here') === -1) {
      throw new Error('the frame shows ' + JSON.stringify(text));
    }
  });

  await step('and the configured one opens when the address names none', async () => {
    const shown = await page.evaluate(async () => {
      window.webPartHarness.addressDocument(undefined);
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/index.md',
        followDocumentLinks: true
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      const heading = document.querySelector('#host h1');
      return {
        heading: heading ? heading.textContent : '',
        bar: !!document.querySelector('#host .strata-open-doc')
      };
    });
    if (shown.heading.indexOf('Wiki index') === -1) {
      throw new Error('it shows ' + JSON.stringify(shown.heading));
    }
    if (shown.bar) throw new Error('it thinks it is showing somebody else document');
  });

  await step('an address naming something that is not markdown is ignored', async () => {
    const shown = await page.evaluate(async () => {
      window.webPartHarness.addressDocument('/sites/demo/Documents/payroll.xlsx');
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/index.md',
        followDocumentLinks: true
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      window.webPartHarness.addressDocument(undefined);
      const heading = document.querySelector('#host h1');
      const banner = document.querySelector('#host .strata-banner');
      return {
        heading: heading ? heading.textContent : '',
        banner: banner ? (banner.textContent || '').trim() : ''
      };
    });
    /* The configured document, with no error: a menu entry somebody typed
       wrongly is not the reader's problem to read about. */
    if (shown.heading.indexOf('Wiki index') === -1) {
      throw new Error('it shows ' + JSON.stringify(shown.heading));
    }
    if (shown.banner) throw new Error('it complained at the reader: ' + shown.banner);
  });

  /*
   * And says so to whoever can fix it. A menu entry that names a document the
   * page is not set up to open produced nothing at all: the configured
   * document appeared, which is exactly what a menu entry pointing at the
   * wrong file looks like. Only in page edit mode, because it names a setting
   * to change and that is not a reader's business.
   */
  await step('an address that cannot be honoured says so to an author', async () => {
    const seen = await page.evaluate(async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 600));
      const banner = () => {
        const found = document.querySelector('#host .strata-banner');
        return found ? (found.textContent || '').trim() : '';
      };

      window.webPartHarness.addressDocument('/sites/demo/Documents/Runbooks/Deploy notes.md');

      /* Following turned off, which is the setting the message names. */
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/index.md',
        followDocumentLinks: false
      });
      await settle();
      const toReader = banner();

      /* Started in edit mode rather than switched into it, because reading the
         address happens once while the web part starts. */
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/index.md',
        followDocumentLinks: false
      }, true);
      await settle();
      const toAuthor = banner();
      window.webPartHarness.addressDocument(undefined);

      return { toReader: toReader, toAuthor: toAuthor };
    });

    if (seen.toReader) {
      throw new Error('a reader was shown a setting to change: '
        + JSON.stringify(seen.toReader));
    }
    if (seen.toAuthor.indexOf('Open a linked document here') === -1) {
      throw new Error('an author was told ' + JSON.stringify(seen.toAuthor));
    }
  });

  /*
   * The share button. A reader three links into a wiki is looking at a
   * document the page's own address says nothing about - it still reads
   * Wiki.aspx - so sending that address sends a colleague to the front page.
   * This copies the address of the document on screen.
   */
  await step('sharing copies the address of the document on screen', async () => {
    const shared = await page.evaluate(async () => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 600));
      window.webPartHarness.addressDocument(undefined);
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/index.md',
        enableWikiLinks: true,
        followDocumentLinks: true,
        showToolbar: 'always'
      });
      await settle();

      const shareButton = () => Array.prototype.slice
        .call(document.querySelectorAll('#host .strata-toolbar-actions .strata-btn'))
        .filter((button) => (button.textContent || '').indexOf('Share') !== -1)[0];

      if (!shareButton()) { return { failed: 'there is no share button' }; }

      /* The clipboard is not readable from a file:// page without a
         permission nobody grants a test, so the write is intercepted. That
         still proves the whole path: the button was found, clicked, and asked
         to copy something, and what it asked to copy is what is checked. */
      const copied = [];
      const realClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (text) => { copied.push(text); return Promise.resolve(); } }
      });

      shareButton().click();
      await settle();
      const atHome = copied[copied.length - 1];

      const link = Array.from(document.querySelectorAll('#host article a'))
        .filter((anchor) => anchor.classList.contains('strata-doc-link')
          && (anchor.getAttribute('href') || '').indexOf('Deploy%20notes') !== -1)[0];
      if (!link) {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: realClipboard });
        return { failed: 'no link to follow before sharing' };
      }
      link.click();
      await settle();

      shareButton().click();
      await settle();
      const atDocument = copied[copied.length - 1];

      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: realClipboard });
      return { atHome: atHome, atDocument: atDocument, copies: copied.length };
    });

    if (shared.failed) throw new Error(shared.failed);
    if (shared.copies !== 2) {
      throw new Error('the button copied ' + shared.copies + ' times, expected two');
    }

    /* At the configured document the page address already is its address, so
       there is nothing to add to it. */
    if (shared.atHome.indexOf('strataDoc') !== -1) {
      throw new Error('the page own document was shared as ' + JSON.stringify(shared.atHome));
    }

    /* And a followed one is named, encoded, exactly once. */
    if (shared.atDocument.indexOf('strataDoc=') === -1) {
      throw new Error('a followed document was shared as ' + JSON.stringify(shared.atDocument));
    }
    if (shared.atDocument.split('strataDoc=').length - 1 !== 1) {
      throw new Error('two documents on one address: ' + JSON.stringify(shared.atDocument));
    }
    if (shared.atDocument.indexOf('Deploy%20notes.md') === -1) {
      throw new Error('it named ' + JSON.stringify(shared.atDocument));
    }

    /* Named against the folder the page reads from, not from the server root.
       The whole path was written out before, carrying the site and the library
       whether or not they said anything. */
    if (shared.atDocument.indexOf('strataDoc=Runbooks/Deploy%20notes.md') === -1) {
      throw new Error('not the short form: ' + JSON.stringify(shared.atDocument));
    }

    /* And escaped only where it has to be. Every slash was %2F before, which
       is most of what made the link unreadable. */
    if (shared.atDocument.indexOf('%2F') !== -1) {
      throw new Error('slashes came back encoded: ' + JSON.stringify(shared.atDocument));
    }
  });

  await step('a library that will not answer is a message, not a broken page', async () => {
    const shown = await page.evaluate(async () => {
      window.webPartHarness.refuse(true);
      await window.webPartHarness.start({
        contentSource: 'library',
        selectedLibrary: '/sites/demo/Documents',
        selectedFile: '/sites/demo/Documents/handbook.md'
      });
      window.webPartHarness.refuse(false);
      const strip = document.getElementById('wp-status');
      const banner = document.querySelector('#host .strata-banner');
      return {
        state: strip.dataset.state,
        banner: banner ? (banner.textContent || '').trim() : '',
        drawn: document.querySelectorAll('#host .strata-root').length
      };
    });
    if (shown.state !== 'started') {
      throw new Error('the web part reports ' + shown.state + ' rather than starting anyway');
    }
    if (shown.drawn !== 1) throw new Error('nothing was drawn');
    if (shown.banner.indexOf('Could not load') === -1) {
      throw new Error('the page says ' + JSON.stringify(shown.banner));
    }
  });

  /*
   * Closed before the tally is read, not after.
   *
   * `problems` is appended to by the page's own handlers - a page error, a
   * failed request, a console error - and those go on arriving while the
   * browser is being torn down. Printed first, the summary was written from a
   * list that `process.exit` then read again one line later and disagreed
   * with: the log ended "No failures and no page errors." and the job failed
   * anyway, which is the least useful thing CI can say. It happened twice, and
   * cost a round of investigation both times because the run was green
   * everywhere a person would look.
   *
   * Nothing new counts as a problem. Whatever teardown turns up was already
   * failing the build; it is in the list that gets printed now, so it can be
   * read and fixed rather than guessed at.
   */
  await browser.close();
  console.log('\n' + (problems.length ? 'Problems:\n  ' + problems.join('\n  ') : 'No failures and no page errors.'));
  process.exit(problems.length ? 1 : 0);
})();
