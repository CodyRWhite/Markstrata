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
const stylesDir = path.join(root, 'src', 'webparts', 'markdownFormatter', 'styles');

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

if (standalone) {
  copyInto(stylesDir, path.join(outDir, 'styles'), (name) => name.endsWith('.css'));
  const katexSource = path.join(root, 'node_modules', 'katex', 'dist');
  fs.mkdirSync(path.join(outDir, 'katex', 'fonts'), { recursive: true });
  fs.copyFileSync(path.join(katexSource, 'katex.min.css'), path.join(outDir, 'katex', 'katex.min.css'));
  copyInto(path.join(katexSource, 'fonts'), path.join(outDir, 'katex', 'fonts'), (name) => name.endsWith('.woff2'));
}

// Stylesheets are plain CSS, so the page links the real files rather than a
// copy: editing one and reloading is enough to see the change.
const cssBase = standalone ? 'styles' : '../../src/webparts/markdownFormatter/styles';
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
<title>Markdown Formatter - runtime harness</title>
${links}
<style>
  body { margin: 0; font-family: system-ui, sans-serif; }
  /* Stands in for the SharePoint page canvas around the web part. */
  .page { padding: 24px; background: #f3f2f1; min-height: 100vh; }
  .canvas { margin: 0 auto; max-width: 1100px; }
  #log { position: fixed; right: 8px; bottom: 8px; width: 280px; max-height: 160px;
         overflow: auto; background: #111; color: #0f0; font: 11px monospace;
         padding: 6px; border-radius: 4px; opacity: .9; }
</style>
</head>
<body>
<div class="page"><div class="canvas"><div id="host"></div></div></div>
<div id="log"></div>
<script src="sample.js"></script>
<script src="bundle.js"></script>
</body>
</html>
`
);

console.log(`Wrote ${path.relative(root, path.join(outDir, 'index.html'))}`);
