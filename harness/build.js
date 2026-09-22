/**
 * .SYNOPSIS
 * Builds the runtime harness into harness/dist.
 *
 * .DESCRIPTION
 * SPFx removed the local workbench, and the hosted one needs a tenant, so
 * there is no way to open this web part in a browser without deploying it.
 * Everything below the web part shell is plain DOM code, though, so the
 * harness loads those classes - the same ViewModeRenderer, EditModeManager,
 * ContentEnhancer, MermaidRenderer and MarkdownProcessor a deployed page uses,
 * and the same stylesheets - into an ordinary page.
 *
 *   npm run harness         build it, then open harness/dist/index.html
 *   npm run harness:drive   build it and drive it with Playwright
 *
 * .USAGE
 *   node harness/build.js
 *   node harness/build.js --standalone --out site/demo --page demo
 *
 *   Bundles the real renderer classes with esbuild and writes one HTML file
 *   that carries the web part, the stylesheets and the sample document.
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  brand-assets.ts, site.ts
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { copyBrand, brandHead } = require('../scripts/brand-assets');
const site = require('../scripts/site');

/*
 * Two modes:
 *   (default)     the page links the stylesheets where they live, so editing
 *                 one and reloading shows the change
 *   --standalone  assets are copied next to the page, for publishing
 */
const args = process.argv.slice(2);
const standalone = args.indexOf('--standalone') !== -1;
/*
 * --html publishes the HTML web part as the page instead of the markdown
 * renderer. It is the same page the development harness builds as
 * htmlwebpart.html - the real web part, the real property pane with the
 * stylesheet on a page of its own, the real split editor - because a demo of
 * the HTML web part that was not the HTML web part would be a drawing of one.
 */
const htmlPart = args.indexOf('--html') !== -1;
const outArg = args.indexOf('--out');

const root = path.join(__dirname, '..');
const outDir = outArg === -1 ? path.join(__dirname, 'dist') : path.resolve(args[outArg + 1]);
/* With --page the harness is published as a page of the site and carries its
   header and footer; without it, it is the bare development harness. */
const pageArg = args.indexOf('--page');
const pageId = pageArg === -1 ? null : args[pageArg + 1];
const stylesDir = path.join(root, 'src', 'webparts', 'markstrata', 'styles');

const CSS_FILES = [
  'base.css',
  'typography.css',
  'code.css',
  'syntax.css',
  'callouts.css',
  'tables-lists.css',
  'extras.css',
  'chrome.css',
  'themes/github.css',
  'themes/obsidian.css',
  'themes/vscode.css',
  'modifiers.css',
  'print.css'
];

fs.mkdirSync(outDir, { recursive: true });

/*
 * The page's own styles: the canvas the web part sits on, and the stand-in for
 * the property pane. Shared by both harness pages, which is why it is a
 * function rather than sitting in one of their templates.
 */
function pageStyles(pageId) {
  return `<style>
  /* Matches the rest of the site: the surface around the web part follows the
     reader's system setting until they choose a mode, in the header or in the
     pane, which are the same choice written in the same place. */
${site.SITE_TOKENS_CSS}
  body { margin: 0; font-family: system-ui, sans-serif; background: var(--site-canvas); }
  /* Stands in for the SharePoint page canvas around the web part. */
  .page { padding: 24px; background: var(--site-canvas); min-height: 100vh; }
  /* The canvas stands in for a SharePoint section, so it caps the web part the
     way a section does. Full width means exactly that, though, and a cap here
     made it identical to wide: the setting looked broken on this page while
     working on a real page. */
  .canvas { margin: 0 auto; max-width: 1100px; }
  body[data-demo-width="full"] .canvas { max-width: none; }
  .demo-intro { margin: 0; padding: 18px 22px 0; max-width: 1100px;
                margin-inline: auto; color: var(--site-intro);
                font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .demo-actions { max-width: 1100px; margin: 14px auto 0; padding: 0 22px; }
  .demo-actions button { font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                         padding: 9px 16px; border-radius: 6px; cursor: pointer;
                         border: 1px solid #0E7C86; background: #0E7C86; color: #fff; }
  .demo-actions button:hover { background: #0a626a; border-color: #0a626a; }
  .demo-actions { display: flex; gap: 10px; }
  .demo-actions button[aria-pressed="true"] { background: #fff; color: #0E7C86; }
  .demo-actions .demo-secondary { background: #fff; color: #0E7C86; }
  .demo-actions .demo-secondary:hover { background: #f3f2f1; border-color: #0a626a; }
  .demo-actions button:focus-visible { outline: 2px solid #F0A442; outline-offset: 2px; }
  /* A stand-in for the SharePoint property pane: docked right, Fluent-ish
     surface, the page pushed aside rather than covered so the web part stays
     visible while its settings change. */
  #demo-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 340px; z-index: 40;
                display: flex; flex-direction: column; background: #fff;
                border-left: 1px solid #e1dfdd; box-shadow: -4px 0 18px rgba(0,0,0,.10);
                font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                color: #323130; }
  #demo-panel[hidden] { display: none; }
  body.pp-open { padding-right: 340px; }
  .pp-header { display: flex; align-items: flex-start; justify-content: space-between;
               gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid #edebe9; }
  .pp-title { font-size: 20px; font-weight: 600; }
  .pp-subtitle { font-size: 12px; color: #605e5c; margin-top: 2px; }
  .pp-close { border: 0; background: none; font-size: 15px; line-height: 1; cursor: pointer;
              color: #605e5c; padding: 6px; border-radius: 4px; }
  .pp-close:hover { background: #f3f2f1; color: #201f1e; }
  .pp-body { flex: 1; overflow-y: auto; padding: 14px 20px 20px; }
  .pp-description { margin: 0 0 14px; font-size: 12px; color: #605e5c; }
  .pp-group { margin: 20px 0 10px; font-size: 14px; font-weight: 600; }
  .pp-group:first-of-type { margin-top: 4px; }
  .pp-field { margin-bottom: 14px; }
  .pp-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 5px; }
  .pp-select { width: 100%; height: 32px; padding: 0 8px; border: 1px solid #605e5c;
               border-radius: 2px; background: #fff; color: #323130; font: inherit; }
  .pp-select:focus { outline: 2px solid #0E7C86; outline-offset: -2px; }
  .pp-hint { margin: 6px 0 0; font-size: 12px; color: #605e5c; }
  .pp-slider-row { display: flex; align-items: center; gap: 10px; }
  .pp-slider { flex: 1; accent-color: #0E7C86; }
  .pp-slider-value { min-width: 1.5em; text-align: right; font-size: 13px; color: #605e5c; }
  .pp-toggle-row { display: flex; align-items: center; gap: 9px; }
  .pp-toggle { position: relative; width: 40px; height: 20px; border-radius: 10px;
               border: 1px solid #605e5c; background: #fff; cursor: pointer; padding: 0; }
  .pp-toggle-thumb { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
                     border-radius: 50%; background: #605e5c; transition: left .1s, background .1s; }
  .pp-toggle[aria-checked="true"] { background: #0E7C86; border-color: #0E7C86; }
  .pp-toggle[aria-checked="true"] .pp-toggle-thumb { left: 22px; background: #fff; }
  .pp-toggle:focus-visible { outline: 2px solid #0E7C86; outline-offset: 2px; }
  .pp-toggle-word { font-size: 13px; color: #323130; }
  .pp-footer { display: flex; align-items: center; justify-content: space-between;
               padding: 12px 20px; border-top: 1px solid #edebe9; font-size: 13px; }
  .pp-step { border: 0; background: none; color: #0E7C86; font: inherit; font-weight: 600;
             cursor: pointer; padding: 6px 4px; border-radius: 4px; }
  .pp-step[disabled] { color: #a19f9d; cursor: default; }
  .pp-step:not([disabled]):hover { background: #f3f2f1; }
  .pp-count { color: #605e5c; }
  @media (max-width: 900px) {
    #demo-panel { width: 100%; }
    body.pp-open { padding-right: 0; }
  }
  #log { position: fixed; right: 8px; bottom: 8px; width: 280px; max-height: 160px;
         overflow: auto; background: #111; color: #0f0; font: 11px monospace;
         padding: 6px; border-radius: 4px; opacity: .9; }
  ${pageId ? '#log { display: none; }' : ''}
${pageId ? site.CHROME_CSS : ''}
</style>`;
}

// The sample document, as a global the harness reads.
const sample = fs.readFileSync(path.join(root, 'samples', 'kitchen-sink.md'), 'utf8');
fs.writeFileSync(path.join(outDir, 'sample.js'), `globalThis.SAMPLE=${JSON.stringify(sample)};`);

if (!htmlPart) {
  execFileSync(
  path.join(root, 'node_modules', '.bin', 'esbuild'),
  [
    path.join(__dirname, 'harness.ts'),
    '--bundle',
    '--format=iife',
    `--outfile=${path.join(outDir, 'bundle.js')}`,
    `--define:process.env.NODE_ENV="${standalone ? 'production' : 'development'}"`,
    standalone ? '--minify' : '--sourcemap',
    '--log-level=warning'
  ],
  { stdio: 'inherit', cwd: root }
  );
}

function copyInto(sourceDir, targetDir, filter) {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.readdirSync(sourceDir).forEach((entry) => {
    const source = path.join(sourceDir, entry);
    if (fs.statSync(source).isDirectory()) {
      copyInto(source, path.join(targetDir, entry), filter);
    } else if (!filter || filter(entry)) {
      fs.copyFileSync(source, path.join(targetDir, entry));
    }
  });
}

// Both modes: the sample document references brand/mark.svg to exercise
// relative image sources, and the development harness should show the same
// page the published one does rather than a broken image.
copyBrand(outDir);

if (standalone) {
  copyInto(stylesDir, path.join(outDir, 'styles'), (name) => name.endsWith('.css'));
  /* And the HTML web part's own, which lives in the other web part's folder and
     so is not picked up by the copy above. Without it a published HTML page
     has no frame, no shadow mount and no narrow-screen rule. */
  fs.mkdirSync(path.join(outDir, 'styles'), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'src', 'webparts', 'markstratahtml', 'styles', 'html.css'),
    path.join(outDir, 'styles', 'html.css')
  );
  const katexSource = path.join(root, 'node_modules', 'katex', 'dist');
  fs.mkdirSync(path.join(outDir, 'katex', 'fonts'), { recursive: true });
  fs.copyFileSync(path.join(katexSource, 'katex.min.css'), path.join(outDir, 'katex', 'katex.min.css'));
  copyInto(path.join(katexSource, 'fonts'), path.join(outDir, 'katex', 'fonts'), (name) => name.endsWith('.woff2'));
}

// Stylesheets are plain CSS, so the page links the real files rather than a
// copy: editing one and reloading is enough to see the change.
const cssBase = standalone ? 'styles' : '../../src/webparts/markstrata/styles';
const katexHref = standalone ? 'katex/katex.min.css' : '../../node_modules/katex/dist/katex.min.css';

const links = [katexHref]
  .concat(CSS_FILES.map((file) => `${cssBase}/${file}`))
  .map((href) => `<link rel="stylesheet" href="${href}">`)
  .join('\n');

/*
 * The HTML web part's own stylesheet, on top of all of those.
 *
 * It is not in CSS_FILES because CSS_FILES is what the markdown pages load,
 * and this is the only page that draws a frame, a shadow mount or a document
 * at full bleed. Left out, those three had no styling at all on the page that
 * exists to check them, and the narrow-screen rule - which is entirely a
 * media query in this file - simply was not there. The bundle loads it through
 * an import the harness replaces with nothing, so the page has to link it.
 */
const htmlPartStyles = standalone
  ? 'styles/html.css'
  : '../../src/webparts/markstratahtml/styles/html.css';
const htmlLinks = `${links}\n<link rel="stylesheet" href="${htmlPartStyles}">`;

if (!htmlPart) {
fs.writeFileSync(
  path.join(outDir, 'index.html'),
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageId ? site.page(pageId).title : 'Markstrata - runtime harness'}</title>
${standalone ? brandHead(pageId ? site.page(pageId).title : 'Markstrata',
    pageId ? site.page(pageId).description : 'The web part\'s own renderer, running in the page.') : ''}
${links}
${pageStyles(pageId)}
${site.MODE_BOOTSTRAP}
</head>
<body>
${pageId ? site.header(pageId) : ''}
${pageId ? '<p class="demo-intro">This is the web part itself, running its real renderer classes in this page, the same code a SharePoint page loads. Use the toolbar, fold a callout, copy a code block, or open the editor and change the markdown.</p>' : ''}
${pageId ? '<div class="demo-actions"><button type="button" id="demo-configure" aria-expanded="false" aria-controls="demo-panel">Edit web part properties</button><button type="button" class="demo-secondary" id="demo-edit" aria-pressed="false">Edit the markdown</button></div>' : ''}
<div class="page"><div class="canvas"><div id="host"></div></div></div>
${pageId ? site.footer(pageId) : ''}
${pageId ? '<aside id="demo-panel" hidden aria-label="Markstrata web part properties"></aside>' : ''}
<div id="log"></div>
<script src="sample.js"></script>
<script src="bundle.js"></script>
${site.MODE_SCRIPT}
</body>
</html>
`
);

console.log(`Wrote ${path.relative(root, path.join(outDir, 'index.html'))}`);
}

/*
 * The second page: the web part itself.
 *
 * index.html runs the renderer classes, which is most of the code and none of
 * the lifecycle. This one runs MarkstrataWebPart - onInit, render, onDispose,
 * the property pane - against the stand-ins in harness/spfx. It is built only
 * for development, not for the published site: a page whose whole purpose is
 * to start a web part badly on purpose is not a demo.
 */
const SPFX_STAND_INS = {
  '@microsoft/sp-core-library': 'harness/spfx/coreLibrary.ts',
  '@microsoft/sp-webpart-base': 'harness/spfx/webPartBase.ts',
  '@microsoft/sp-component-base': 'harness/spfx/componentBase.ts',
  '@microsoft/sp-property-pane': 'harness/spfx/propertyPane.ts',
  'MarkstrataWebPartStrings': 'harness/spfx/strings.js'
};

/*
 * SharePoint itself cannot be stood in for by a package alias: the web part
 * reaches it through a relative path of its own. So the resolver catches the
 * path instead, wherever it is imported from.
 */
const SHAREPOINT_SERVICE = /(^|\/)SharePointService$/;

/* Asynchronous because esbuild only takes plugins that way, and the whole
   point here is a plugin. */
async function bundleWebPart(entry, outfile) {
  const esbuild = require('esbuild');

  const standIns = {
    name: 'sharepoint-stand-ins',
    setup(build) {
      Object.keys(SPFX_STAND_INS).forEach((moduleName) => {
        const filter = new RegExp(`^${moduleName.replace(/[/@.]/g, '\\$&')}$`);
        build.onResolve({ filter }, () => ({
          path: path.join(root, SPFX_STAND_INS[moduleName])
        }));
      });

      build.onResolve({ filter: SHAREPOINT_SERVICE }, () => ({
        path: path.join(root, 'harness', 'spfx', 'sharePoint.ts')
      }));
    }
  };

  await esbuild.build({
    entryPoints: [path.join(__dirname, entry)],
    bundle: true,
    format: 'iife',
    outfile: path.join(outDir, outfile),
    /* Minified and without a map when it is a page the site publishes, as the
       markdown bundle is; readable in the development harness, which is where
       anybody would be standing when they needed to read it. */
    minify: standalone,
    sourcemap: !standalone,
    /* The page links the real stylesheets, as index.html does; the web part's
       own imports of them would otherwise bundle a second copy. */
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [standIns],
    logLevel: 'warning'
  });
}

async function buildWebPartPage() {
  await bundleWebPart('webPart.ts', 'webpart.js');

  fs.writeFileSync(
    path.join(outDir, 'webpart.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Markstrata - the web part itself</title>
${links}
${pageStyles(null)}
<style>
  .wp-intro { max-width: 1100px; margin: 0 auto; padding: 18px 22px 0;
              color: var(--site-intro); font: 15px/1.6 system-ui, sans-serif; }
  #wp-status { max-width: 1100px; margin: 12px auto 0; padding: 10px 14px;
               border-radius: 6px; font: 600 14px/1.5 system-ui, sans-serif;
               border: 1px solid; }
  #wp-status[data-state="started"] { background: #edf7ed; border-color: #9ad29a; color: #1f5c1f; }
  #wp-status[data-state="failed"] { background: #fdecea; border-color: #e2a6a0; color: #7a231b; }
  #wp-status[data-state="away"], #wp-status[data-state="starting"] {
               background: #f3f2f1; border-color: #d6d4d2; color: #424242; }
  .pp-text { width: 100%; padding: 6px 8px; border: 1px solid #605e5c;
             border-radius: 2px; font: inherit; background: #fff; color: #323130; }
</style>
${site.MODE_BOOTSTRAP}
</head>
<body>
<p class="wp-intro">This is <strong>MarkstrataWebPart</strong> itself, started the way a SharePoint page starts it: onInit is awaited, then render is called, and putting it away calls onDispose. SharePoint around it is stood in for; the web part is the real one. Here is <a id="wp-outside-link" href="https://example.com/outside">a link outside the web part</a>, which stands in for the rest of a SharePoint page: the web part's stylesheets are loaded into this page, as SharePoint loads them into its own, and nothing in them may reach this.</p>
<div id="wp-status" data-state="starting">Starting…</div>
<div class="demo-actions">
  <button type="button" id="demo-configure" aria-expanded="false" aria-controls="demo-panel">Edit web part properties</button>
  <button type="button" class="demo-secondary" id="demo-edit" aria-pressed="false">Edit the markdown</button>
  <button type="button" class="demo-secondary" id="demo-away">Put the web part away</button>
</div>
<div class="page"><div class="canvas"><div id="host"></div></div></div>
<aside id="demo-panel" hidden aria-label="Markstrata web part properties"></aside>
<div id="log"></div>
<script src="sample.js"></script>
<script src="webpart.js"></script>
</body>
</html>
`
  );

  console.log(`Wrote ${path.relative(root, path.join(outDir, 'webpart.html'))}`);
}

/*
 * The third page: the HTML web part itself.
 *
 * It exists because the HTML web part is the only part of either web part that
 * cannot be checked without a browser. Whether a shadow root really keeps an
 * author's stylesheet off the page; whether a sandboxed frame really refuses
 * what its sandbox says it refuses; whether the CSS narrowing survives
 * Chromium's own parser rather than a test that reads strings. Those are the
 * browser's answers, not ours.
 *
 * The page carries one thing that is not the web part: a paragraph and a link
 * outside it, styled by the page. A driver checks those are untouched, which
 * is how an author's `body { background: ... }` escaping the web part is
 * caught.
 */
async function buildHtmlWebPartPage() {
  /* Published as the page itself when the site asked for it, and as a second
     page beside the markdown one when this is the development harness. */
  const file = htmlPart ? 'index.html' : 'htmlwebpart.html';
  await bundleWebPart('htmlWebPart.ts', 'htmlwebpart.js');

  fs.writeFileSync(
    path.join(outDir, file),
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlPart && pageId ? site.page(pageId).title : 'Markstrata - the HTML web part itself'}</title>
${htmlPart && pageId ? brandHead(site.page(pageId).title, site.page(pageId).description) : ''}
${htmlLinks}
${/* The site's own chrome CSS, when this page IS a page of the site rather
      than the development harness. Passing null unconditionally drew the
      header, the nav and the footer with none of the CSS that lays them out,
      and left the harness log box on a published page. */''}
${pageStyles(htmlPart ? pageId : null)}
<style>
  .wp-intro { max-width: 1100px; margin: 0 auto; padding: 18px 22px 0;
              color: var(--site-intro); font: 15px/1.6 system-ui, sans-serif; }
  #wp-status { max-width: 1100px; margin: 12px auto 0; padding: 10px 14px;
               border-radius: 6px; font: 600 14px/1.5 system-ui, sans-serif;
               border: 1px solid; }
  #wp-status[data-state="started"] { background: #edf7ed; border-color: #9ad29a; color: #1f5c1f; }
  #wp-status[data-state="failed"] { background: #fdecea; border-color: #e2a6a0; color: #7a231b; }
  #wp-status[data-state="away"], #wp-status[data-state="starting"] {
               background: #f3f2f1; border-color: #d6d4d2; color: #424242; }
  .pp-text { width: 100%; padding: 6px 8px; border: 1px solid #605e5c;
             border-radius: 2px; font: inherit; background: #fff; color: #323130; }
  /*
   * What a driver measures to find out whether the document's stylesheet
   * stayed where it was put.
   *
   * Deliberately unstyled. The first version of this carried an id selector
   * and its own background, and the check passed with the scoping switched
   * off: an id beats a bare element selector on specificity, so what was
   * measured was CSS precedence rather than anything the web part does. This
   * paragraph has no rule of its own at all, so the only thing that can
   * colour it is a rule that escaped.
   */
  #wp-probe { margin: 12px auto 0; max-width: 1100px; padding: 0 22px 12px;
              font: 15px/1.6 system-ui, sans-serif; }
</style>
${site.MODE_BOOTSTRAP}
</head>
<body>
${htmlPart && pageId ? site.header(pageId) : ''}
${htmlPart
  ? '<p class="demo-intro">This is <strong>Markstrata - HTML</strong> itself, running in this page the way a SharePoint page runs it. The library behind it holds <code>notes.html</code> - a whole HTML file, with its own <code>&lt;style&gt;</code> block - and <code>shared.css</code>, a stylesheet several web parts could be given. Open the properties: the document is on the first page and the stylesheet on a page of its own, so one file can dress every HTML web part in a site while a document still varies with styles of its own. Try the render modes, and open the editor to see the HTML and the CSS as two tabs over one preview. The cream behind the document is that file\u2019s own <code>body</code> rule, and it stops where the document stops: an author styles their document, not the toolbar and the footer around it.</p>'
  : '<p class="wp-intro">This is <strong>MarkstrataHtmlWebPart</strong> itself, started the way a SharePoint page starts it. SharePoint around it is stood in for; the web part is the real one. The library holds <code>notes.html</code>, which is a whole HTML file with a <code>&lt;style&gt;</code> block, a <code>&lt;script&gt;</code> and three kinds of link in it, plus <code>rollback.html</code> to follow a link to, <code>fragment.htm</code>, and <code>shared.css</code> to dress them with.</p>'}
<p id="wp-probe">This paragraph is outside the web part and has no styling of its own, so anything that colours it is a rule that escaped the document. <a id="wp-outside-link" href="https://example.com/outside">A link outside the web part</a>, for the same reason.</p>
<div id="wp-status" data-state="starting"${htmlPart ? ' hidden' : ''}>Starting…</div>
<div class="demo-actions">
  <button type="button" id="demo-configure" aria-expanded="false" aria-controls="demo-panel">Edit web part properties</button>
  <button type="button" class="demo-secondary" id="demo-edit" aria-pressed="false">Edit the HTML</button>
  ${htmlPart ? '' : '<button type="button" class="demo-secondary" id="demo-away">Put the web part away</button>'}
</div>
<div class="page"><div class="canvas"><div id="host"></div></div></div>
${htmlPart && pageId ? site.footer(pageId) : ''}
<aside id="demo-panel" hidden aria-label="Markstrata HTML web part properties"></aside>
<div id="log"></div>
<script src="sample.js"></script>
<script src="htmlwebpart.js"></script>
${htmlPart ? site.MODE_SCRIPT : ''}
</body>
</html>
`
  );

  console.log(`Wrote ${path.relative(root, path.join(outDir, file))}`);
}

if (htmlPart) {
  /* The published HTML page, on its own: nothing else belongs in that folder. */
  buildHtmlWebPartPage().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else if (!standalone) {
  buildWebPartPage()
    .then(() => buildHtmlWebPartPage())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
