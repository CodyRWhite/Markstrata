/*
 * Builds the runtime harness into harness/dist.
 *
 * SPFx removed the local workbench, and the hosted one needs a tenant, so
 * there is no way to open this web part in a browser without deploying it.
 * Everything below the web part shell is plain DOM code, though, so the
 * harness loads those classes - the same ViewModeRenderer, EditModeManager,
 * ContentEnhancer, MermaidRenderer and MarkdownProcessor a deployed page uses,
 * and the same stylesheets - into an ordinary page.
 *
 *   npm run harness         build it, then open harness/dist/index.html
 *   npm run harness:drive   build it and drive it with Playwright
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

// The sample document, as a global the harness reads.
const sample = fs.readFileSync(path.join(root, 'samples', 'kitchen-sink.md'), 'utf8');
fs.writeFileSync(path.join(outDir, 'sample.js'), `globalThis.SAMPLE=${JSON.stringify(sample)};`);

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
<style>
  /* Matches the rest of the site: the surface around the web part follows the
     reader's system setting until they choose a mode in the pane. */
  :root { color-scheme: light; --site-canvas: #f3f2f1; --site-intro: #424242; }
  :root[data-site-mode="dark"] { color-scheme: dark; --site-canvas: #0A1417; --site-intro: #9FBCBE; }
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
</style>
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
</body>
</html>
`
);

console.log(`Wrote ${path.relative(root, path.join(outDir, 'index.html'))}`);
