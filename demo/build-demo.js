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
const { copyBrand, brandHead } = require('../scripts/brand-assets');
const site = require('../scripts/site');

/*
 * Usage:
 *   node demo/build-demo.js [markdown file] [--out <directory>]
 */
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const pageArg = args.indexOf('--page');
/* With --page the output carries the site's header and footer; without it the
   file stands alone, which is what `npm run demo` wants. */
const pageId = pageArg === -1 ? null : args[pageArg + 1];
const sampleArg = args.filter((arg, index) =>
  arg.indexOf('--') !== 0 && args[index - 1] !== '--out' && args[index - 1] !== '--page')[0];

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
      path.join(root, 'src', 'webparts', 'markstrata', 'utils', 'MarkdownProcessor.ts'),
      path.join(root, 'src', 'webparts', 'markstrata', 'utils', 'ThemeManager.ts'),
      path.join(root, 'src', 'webparts', 'markstrata', 'utils', 'mermaidConfig.ts'),
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
  const stylesDir = path.join(root, 'src', 'webparts', 'markstrata', 'styles');
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
/*
 * The web part's own post-render behaviour, bundled for a static page: copy
 * buttons, image captions and zoom, external links, the button back to the
 * top, and the contents following the reading position. Bundled rather than
 * reimplemented, so the site cannot drift from the web part on any of it.
 */
function buildPageScript() {
  execFileSync(
    path.join(root, 'node_modules', '.bin', 'esbuild'),
    [
      path.join(root, 'demo', 'page.ts'),
      '--bundle',
      '--format=iife',
      `--outfile=${path.join(outDir, 'page.js')}`,
      '--minify',
      '--log-level=warning'
    ],
    { stdio: 'inherit', cwd: root }
  );
}

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

  copyBrand(outDir);
}

function build() {
  compileProcessor();

  const { MarkdownProcessor } = require(path.join(libDir, 'MarkdownProcessor.js'));
  const { ThemeManager } = require(path.join(libDir, 'ThemeManager.js'));
  /* The same object the web part initialises mermaid with, so the two cannot
     drift: this page used to carry its own copy and missed the gantt fix. */
  const { mermaidConfigFor, MERMAID_BASE_CONFIG } = require(path.join(libDir, 'mermaidConfig.js'));
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

  /* The web part prefers a contents the document wrote for itself; this does
     the same, or the page carries two. */
  const rendered = adoptAuthoredToc(processor.render(sample));
  const html = rendered.html;
  const page = template(readCss(), html, rendered.toc || buildToc(html), mermaidThemes,
    { fn: mermaidConfigFor, base: MERMAID_BASE_CONFIG },
    pageId ? site.page(pageId).title : pageTitle(html));

  fs.mkdirSync(outDir, { recursive: true });
  copyAssets();
  buildPageScript();
  fs.writeFileSync(path.join(outDir, 'index.html'), page);
  console.log('Wrote', path.relative(root, path.join(outDir, 'index.html')));
}

/*
 * Takes over a contents the document wrote for itself, with [[toc]].
 *
 * The same rule ViewModeRenderer follows, for the same reason: a document that
 * has said what its contents are should not also be given a generated one. The
 * web part does it against the rendered DOM, this does it against the rendered
 * HTML, and the documentation page showed two tables of contents until it did.
 */
function adoptAuthoredToc(html) {
  const authored = /<div class="strata-toc">([\s\S]*?)<\/div>/.exec(html);
  if (!authored) {
    return { html: html, toc: '' };
  }
  return {
    /* Out of the text, since it is about to become the sidebar. */
    html: html.replace(authored[0], ''),
    toc: sidebar(authored[1])
  };
}

/** The panel the layout expects, around a list of entries. */
function sidebar(list) {
  return `<details class="strata-toc-sidebar" open>
      <summary class="strata-toc-heading">On this page</summary>
      <nav class="strata-toc" aria-label="Table of contents">${list}</nav>
    </details>`;
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
      .replace(/<a class="strata-anchor"[\s\S]*?<\/a>/g, '')
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
  return sidebar(`<ul>${links}</ul>`);
}

/*
 * The document's own first heading, so a page built from another markdown file
 * is not labelled "theme preview" in the browser tab.
 */
function pageTitle(html) {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  if (!match) {
    return 'Markstrata';
  }
  const text = match[1]
    .replace(/<a class="strata-anchor"[\s\S]*?<\/a>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
  return text || 'Markstrata';
}

function template(css, content, toc, mermaidThemes, mermaidBase, title) {
  const header = pageId ? site.header(pageId) : '';
  const footer = pageId ? site.footer(pageId) : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${brandHead(title, pageId ? site.page(pageId).description : 'Markdown for SharePoint, themed like the editors you write it in.')}
<link rel="stylesheet" href="katex/katex.min.css">
<style>
/* The page follows the reader's system setting unless they pick a mode, and
   the surface behind the web part has to move with it or a dark document sits
   on a white page. The web part paints its own root; this is everything
   around it. */
:root { color-scheme: light; --site-canvas: #FFFFFF; }
:root[data-site-mode="dark"] { color-scheme: dark; --site-canvas: #0A1417; }
body { margin: 0; background: var(--site-canvas);
       font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.demo-bar {
  position: sticky; top: 0; z-index: 20; display: flex; flex-wrap: wrap; gap: 12px;
  align-items: center; padding: 10px 16px; background: #1b1f24; color: #e6edf3; font-size: 13px;
}
.demo-bar .demo-brand { display: flex; align-items: center; margin-right: 4px; }
.demo-bar select, .demo-bar button {
  padding: 4px 8px; border-radius: 4px; border: 1px solid #444c56;
  background: #22272e; color: #e6edf3; font: inherit;
}
.demo-stage { padding: 24px 20px 64px; }
${pageId ? site.CHROME_CSS : ''}
</style>
<style>
${css}
</style>
${site.MODE_BOOTSTRAP}
</head>
<body>
${header}
<div class="demo-bar">
  <label>Theme
    <select id="theme">
      <option value="github">GitHub</option>
      <option value="obsidian">Obsidian</option>
      <option value="vscode" selected>VS Code</option>
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
      <option value="compact" selected>Compact</option>
      <option value="normal">Normal</option>
      <option value="relaxed">Relaxed</option>
    </select>
  </label>
  <label><input type="checkbox" id="numbers" checked> Line numbers</label>
  <label><input type="checkbox" id="wrap"> Wrap code</label>
</div>
<div class="demo-stage">
  <div class="strata-root" id="root" data-strata-theme="vscode" data-strata-mode="light"
       data-strata-width="comfortable" data-strata-density="compact" data-strata-size="normal" data-strata-code-size="normal">
    <script>
      /* Runs as soon as the opening tag above has been parsed, so the element
         carries the right mode before any of its content is painted. The
         attribute is written into the markup as light because a file has to
         say something, and this corrects it in the same breath. */
      document.getElementById('root')
        .setAttribute('data-strata-mode', window.__strataMode || 'light');
    </script>
    <div class="strata-layout" id="layout" data-strata-toc="left">
      ${toc}
      <article class="strata-content" id="content">
${content}
      </article>
    </div>
  </div>
</div>
${footer}
<script src="mermaid.min.js"></script>
<script src="page.js"></script>
<script>
var MERMAID_THEMES = ${JSON.stringify(mermaidThemes)};
var MERMAID_BASE = ${JSON.stringify(mermaidBase.base)};
var MERMAID_CONFIG_FOR = ${mermaidBase.fn.toString()};
</script>
<script>
(function () {
  var root = document.getElementById('root');

  // Contents placement, the same attribute and classes the web part sets.
  var tocSelect = document.getElementById('toc');
  var layout = document.getElementById('layout');
  var content = document.getElementById('content');
  function placeToc() {
    var panel = document.querySelector('.strata-toc-sidebar, .strata-toc-inline');
    var placement = tocSelect.value;
    panel.hidden = placement === 'off';
    layout.setAttribute('data-strata-toc', placement === 'off' ? 'left' : placement);
    panel.className = placement === 'inline' ? 'strata-toc-inline' : 'strata-toc-sidebar';
    if (placement === 'inline') {
      content.insertBefore(panel, content.firstChild);
    } else {
      layout.insertBefore(panel, content);
    }
  }
  tocSelect.addEventListener('change', function () {
    placeToc();
    if (window.strataEnhance) { window.strataEnhance(); }
  });
  // Run it once so the page starts wherever the select does, rather than the
  // markup having to repeat the default placement and drift from it.
  placeToc();

  // Mirror the web part: a contents sidebar starts collapsed when the column
  // is too narrow to sit it beside the text. Above the content it always
  // starts open, which is what the web part does too.
  var toc = document.querySelector('.strata-toc-sidebar');
  if (toc && root.clientWidth <= 720) {
    toc.open = false;
  }
  /*
   * Colour mode follows the operating system until the reader chooses one, and
   * their choice is remembered from then on. Storage can throw in a private
   * window, so every read and write is guarded and the page simply falls back
   * to the system setting.
   */
  var MODE_KEY = 'markstrata-site-mode';
  var query = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function storedMode() {
    try {
      var saved = window.localStorage.getItem(MODE_KEY);
      return saved === 'light' || saved === 'dark' ? saved : null;
    } catch (error) {
      return null;
    }
  }

  function applyMode(mode) {
    root.setAttribute('data-strata-mode', mode);
    root.style.colorScheme = mode;
    document.documentElement.setAttribute('data-site-mode', mode);
    document.getElementById('mode').value = mode;
  }

  /* Decided in the head, before the first paint; this only keeps the controls
     and the listeners in step with it. */
  applyMode(window.__strataMode || storedMode() || (query && query.matches ? 'dark' : 'light'));

  if (query) {
    var follow = function () {
      if (!storedMode()) {
        applyMode(query.matches ? 'dark' : 'light');
        renderDiagrams();
      }
    };
    if (query.addEventListener) {
      query.addEventListener('change', follow);
    } else if (query.addListener) {
      query.addListener(follow);
    }
  }

  function bind(id, attribute) {
    var input = document.getElementById(id);
    input.addEventListener('change', function () {
      root.setAttribute(attribute, input.value);
      root.style.colorScheme = document.getElementById('mode').value;
      renderDiagrams();
    });
  }
  bind('theme', 'data-strata-theme');
  document.getElementById('mode').addEventListener('change', function () {
    var chosen = document.getElementById('mode').value;
    try {
      window.localStorage.setItem(MODE_KEY, chosen);
    } catch (error) {
      /* A private window still gets the change, just not the memory of it. */
    }
    applyMode(chosen);
    renderDiagrams();
  });
  bind('width', 'data-strata-width');
  bind('density', 'data-strata-density');

  function toggleClass(id, className) {
    var input = document.getElementById(id);
    input.addEventListener('change', function () {
      var blocks = document.querySelectorAll('.strata-code');
      for (var i = 0; i < blocks.length; i++) {
        blocks[i].classList.toggle(className, input.checked);
      }
    });
  }
  toggleClass('numbers', 'strata-code--numbered');
  toggleClass('wrap', 'strata-code--wrap');

  // Copy buttons, same behaviour as the web part.
  document.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('.strata-code-copy') : null;
    if (!button) { return; }
    var block = button.closest('.strata-code');
    var lines = block.querySelectorAll('.strata-code-line-text');
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
    var hosts = document.querySelectorAll('.strata-mermaid');
    for (var i = 0; i < hosts.length; i++) {
      if (sources[i] === undefined) {
        var pre = hosts[i].querySelector('pre.mermaid');
        sources[i] = pre ? pre.textContent : '';
      }
    }
    var key = document.getElementById('theme').value + '-' + document.getElementById('mode').value;
    var config = mermaidThemes[key];
    for (var j = 0; j < hosts.length; j++) {
      (function (host, source, index) {
        /* Configured per diagram, as the web part does it: fitting a gantt to
           its column needs the width of that column. */
        var style = window.getComputedStyle(host);
        var padding = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
        var usable = Math.max(0, Math.floor(host.clientWidth - padding));
        host.setAttribute('data-strata-diagram', 'fit');
        mermaid.initialize(Object.assign({}, MERMAID_CONFIG_FOR('fit', usable, MERMAID_BASE), config));
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
