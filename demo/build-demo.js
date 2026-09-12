/*
 * Builds demo/dist/index.html - a self-contained preview of every theme.
 *
 * It runs the real pipeline: the same MarkdownProcessor the web part uses and
 * the same stylesheets, inlined into one file. That makes it useful for two
 * things: checking a theme change without deploying to SharePoint, and showing
 * someone what the themes look like.
 *
 *   npm run demo && open demo/dist/index.html
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/*
 * Usage:
 *   node demo/build-demo.js [markdown file] [--out <directory>]
 */
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const sampleArg = args.filter((arg, index) => arg.indexOf('--') !== 0 && args[index - 1] !== '--out')[0];

const root = path.join(__dirname, '..');
const outDir = outArg === -1 ? path.join(__dirname, 'dist') : path.resolve(args[outArg + 1]);
const libDir = path.join(root, 'temp', 'demo-lib');

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

function compileProcessor() {
  console.log('Compiling the markdown pipeline...');
  execFileSync(
    path.join(root, 'node_modules', '.bin', 'tsc'),
    [
      path.join(root, 'src', 'webparts', 'markdownFormatter', 'utils', 'MarkdownProcessor.ts'),
      path.join(root, 'src', 'webparts', 'markdownFormatter', 'utils', 'ThemeManager.ts'),
      '--outDir', libDir,
      '--module', 'commonjs',
      '--target', 'es2017',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--skipLibCheck'
    ],
    { stdio: 'inherit', cwd: root }
  );
}

function readCss() {
  const stylesDir = path.join(root, 'src', 'webparts', 'markdownFormatter', 'styles');
  return CSS_FILES.map((file) => fs.readFileSync(path.join(stylesDir, file), 'utf8')).join('\n');
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/*
 * Copies KaTeX's stylesheet and fonts, and Mermaid's browser build, out of
 * node_modules so the preview is fully self-contained: it renders maths and
 * diagrams with no network access, exactly like the deployed web part.
 */
function copyAssets() {
  const katexSource = path.join(root, 'node_modules', 'katex', 'dist');
  const katexTarget = path.join(outDir, 'katex');
  fs.mkdirSync(path.join(katexTarget, 'fonts'), { recursive: true });
  fs.copyFileSync(path.join(katexSource, 'katex.min.css'), path.join(katexTarget, 'katex.min.css'));
  fs.readdirSync(path.join(katexSource, 'fonts'))
    .filter((file) => file.endsWith('.woff2'))
    .forEach((file) =>
      fs.copyFileSync(path.join(katexSource, 'fonts', file), path.join(katexTarget, 'fonts', file))
    );

  fs.copyFileSync(
    path.join(root, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
    path.join(outDir, 'mermaid.min.js')
  );
}

function build() {
  compileProcessor();

  const { MarkdownProcessor } = require(path.join(libDir, 'MarkdownProcessor.js'));
  const { ThemeManager } = require(path.join(libDir, 'ThemeManager.js'));
  const processor = new MarkdownProcessor({ showLineNumbers: true, allowHtml: true });

  // Diagrams are themed from the same palettes the web part uses, so the
  // preview shows what a deployed page shows.
  const mermaidThemes = {};
  ['github', 'obsidian', 'vscode'].forEach((family) => {
    ['light', 'dark'].forEach((mode) => {
      mermaidThemes[`${family}-${mode}`] = ThemeManager.getMermaidTheme(family, mode);
    });
  });

  const sample = sampleArg
    ? fs.readFileSync(path.resolve(sampleArg), 'utf8')
    : fs.readFileSync(path.join(root, 'samples', 'kitchen-sink.md'), 'utf8');

  const html = processor.render(sample);
  const page = template(readCss(), html, buildToc(html), mermaidThemes, pageTitle(html));

  fs.mkdirSync(outDir, { recursive: true });
  copyAssets();
  fs.writeFileSync(path.join(outDir, 'index.html'), page);
  console.log('Wrote', path.relative(root, path.join(outDir, 'index.html')));
}

/*
 * The web part builds its sidebar from the rendered DOM at runtime; the demo
 * is a static file, so it does the same job here from the rendered HTML.
 */
function buildToc(html) {
  const items = [];
  const pattern = /<(h[23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const text = match[3]
      // Drop the heading's anchor link, or its "#" ends up in the entry - the
      // web part removes the same element when it builds the list from the DOM.
      .replace(/<a class="mdf-anchor"[\s\S]*?<\/a>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (text) {
      items.push({ level: Number(match[1].slice(1)), id: match[2], text: text });
    }
  }
  if (items.length === 0) {
    return '';
  }
  const links = items
    .map(
      (item) =>
        `<li style="padding-left:${(item.level - 2) * 12}px"><a href="#${item.id}">${item.text}</a></li>`
    )
    .join('\n');
  return `<details class="mdf-toc-sidebar" open>
      <summary class="mdf-toc-heading">On this page</summary>
      <nav class="mdf-toc" aria-label="Table of contents"><ul>${links}</ul></nav>
    </details>`;
}

/*
 * The document's own first heading, so a page built from another markdown file
 * is not labelled "theme preview" in the browser tab.
 */
function pageTitle(html) {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  if (!match) {
    return 'Markdown Formatter';
  }
  const text = match[1]
    .replace(/<a class="mdf-anchor"[\s\S]*?<\/a>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
  return text || 'Markdown Formatter';
}

function template(css, content, toc, mermaidThemes, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="katex/katex.min.css">
<style>
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.demo-bar {
  position: sticky; top: 0; z-index: 20; display: flex; flex-wrap: wrap; gap: 12px;
  align-items: center; padding: 10px 16px; background: #1b1f24; color: #e6edf3; font-size: 13px;
}
.demo-bar strong { font-weight: 600; }
.demo-bar select, .demo-bar button {
  padding: 4px 8px; border-radius: 4px; border: 1px solid #444c56;
  background: #22272e; color: #e6edf3; font: inherit;
}
.demo-stage { padding: 24px 20px 64px; }
</style>
<style>
${css}
</style>
</head>
<body>
<div class="demo-bar">
  <strong>Markdown Formatter</strong>
  <label>Theme
    <select id="theme">
      <option value="github">GitHub</option>
      <option value="obsidian">Obsidian</option>
      <option value="vscode">VS Code</option>
    </select>
  </label>
  <label>Mode
    <select id="mode">
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>
  <label>Width
    <select id="width">
      <option value="narrow">Narrow</option>
      <option value="comfortable" selected>Comfortable</option>
      <option value="wide">Wide</option>
      <option value="full">Full</option>
    </select>
  </label>
  <label>Contents
    <select id="toc">
      <option value="left" selected>Left</option>
      <option value="right">Right</option>
      <option value="inline">Above</option>
      <option value="off">Off</option>
    </select>
  </label>
  <label>Spacing
    <select id="density">
      <option value="compact">Compact</option>
      <option value="normal" selected>Normal</option>
      <option value="relaxed">Relaxed</option>
    </select>
  </label>
  <label><input type="checkbox" id="numbers" checked> Line numbers</label>
  <label><input type="checkbox" id="wrap"> Wrap code</label>
</div>
<div class="demo-stage">
  <div class="mdf-root" id="root" data-mdf-theme="github" data-mdf-mode="light"
       data-mdf-width="comfortable" data-mdf-density="normal" data-mdf-size="normal" data-mdf-code-size="normal">
    <div class="mdf-layout" id="layout" data-mdf-toc="left">
      ${toc}
      <article class="mdf-content" id="content">
${content}
      </article>
    </div>
  </div>
</div>
<script src="mermaid.min.js"></script>
<script>
var MERMAID_THEMES = ${JSON.stringify(mermaidThemes)};
</script>
<script>
(function () {
  var root = document.getElementById('root');

  // Contents placement, the same attribute and classes the web part sets.
  var tocSelect = document.getElementById('toc');
  var layout = document.getElementById('layout');
  var content = document.getElementById('content');
  tocSelect.addEventListener('change', function () {
    var panel = document.querySelector('.mdf-toc-sidebar, .mdf-toc-inline');
    var placement = tocSelect.value;
    panel.hidden = placement === 'off';
    layout.setAttribute('data-mdf-toc', placement === 'off' ? 'left' : placement);
    panel.className = placement === 'inline' ? 'mdf-toc-inline' : 'mdf-toc-sidebar';
    if (placement === 'inline') {
      content.insertBefore(panel, content.firstChild);
    } else {
      layout.insertBefore(panel, content);
    }
  });

  // Mirror the web part: the contents start collapsed when the column is too
  // narrow to sit them beside the text.
  var toc = document.querySelector('.mdf-toc-sidebar');
  if (toc && root.clientWidth <= 720) {
    toc.open = false;
  }
  function bind(id, attribute) {
    var input = document.getElementById(id);
    input.addEventListener('change', function () {
      root.setAttribute(attribute, input.value);
      root.style.colorScheme = document.getElementById('mode').value;
      renderDiagrams();
    });
  }
  bind('theme', 'data-mdf-theme');
  bind('mode', 'data-mdf-mode');
  bind('width', 'data-mdf-width');
  bind('density', 'data-mdf-density');

  function toggleClass(id, className) {
    var input = document.getElementById(id);
    input.addEventListener('change', function () {
      var blocks = document.querySelectorAll('.mdf-code');
      for (var i = 0; i < blocks.length; i++) {
        blocks[i].classList.toggle(className, input.checked);
      }
    });
  }
  toggleClass('numbers', 'mdf-code--numbered');
  toggleClass('wrap', 'mdf-code--wrap');

  // Copy buttons, same behaviour as the web part.
  document.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('.mdf-code-copy') : null;
    if (!button) { return; }
    var block = button.closest('.mdf-code');
    var lines = block.querySelectorAll('.mdf-code-line-text');
    var text = [];
    for (var i = 0; i < lines.length; i++) { text.push(lines[i].textContent); }
    navigator.clipboard.writeText(text.join('\\n'));
    button.setAttribute('data-state', 'done');
    setTimeout(function () { button.removeAttribute('data-state'); }, 1500);
  });

  var mermaidThemes = MERMAID_THEMES;
  var sources = [];
  function renderDiagrams() {
    if (typeof mermaid === 'undefined') { return; }
    var hosts = document.querySelectorAll('.mdf-mermaid');
    for (var i = 0; i < hosts.length; i++) {
      if (sources[i] === undefined) {
        var pre = hosts[i].querySelector('pre.mermaid');
        sources[i] = pre ? pre.textContent : '';
      }
    }
    var key = document.getElementById('theme').value + '-' + document.getElementById('mode').value;
    var config = mermaidThemes[key];
    mermaid.initialize(Object.assign({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false, curve: 'basis', padding: 12, useMaxWidth: true, wrappingWidth: 220 }
    }, config));
    for (var j = 0; j < hosts.length; j++) {
      (function (host, source, index) {
        mermaid.render('demo-mermaid-' + index + '-' + Date.now(), source).then(function (result) {
          host.innerHTML = result.svg;
        }).catch(function () {});
      })(hosts[j], sources[j], j);
    }
  }
  renderDiagrams();
})();
</script>
</body>
</html>
`;
}

build();
