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

const root = path.join(__dirname, '..');
const outDir = path.join(__dirname, 'dist');
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

function build() {
  compileProcessor();

  const { MarkdownProcessor } = require(path.join(libDir, 'MarkdownProcessor.js'));
  const processor = new MarkdownProcessor({ showLineNumbers: true, allowHtml: true });

  const sample = process.argv[2]
    ? fs.readFileSync(path.resolve(sampleArgument()), 'utf8')
    : fs.readFileSync(path.join(root, 'samples', 'kitchen-sink.md'), 'utf8');

  const html = processor.render(sample);
  const page = template(readCss(), html, buildToc(html));

  fs.mkdirSync(outDir, { recursive: true });
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
    const text = match[3].replace(/<[^>]+>/g, '').trim();
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
  return `<aside class="mdf-toc-sidebar">
      <div class="mdf-toc-heading">On this page</div>
      <nav class="mdf-toc" aria-label="Table of contents"><ul>${links}</ul></nav>
    </aside>`;
}

function sampleArgument() {
  return process.argv[2];
}

function template(css, content, toc) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Markdown Formatter - theme preview</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous">
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
    <div class="mdf-layout">
      ${toc}
      <article class="mdf-content" id="content">
${content}
      </article>
    </div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.min.js"></script>
<script>
(function () {
  var root = document.getElementById('root');
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
    var dark = document.getElementById('mode').value === 'dark';
    mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' });
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
