/**
 * .SYNOPSIS
 * The two web parts' tiles: a document open in an editor, at an angle.
 *
 * .DESCRIPTION
 * SharePoint shows these in the web part toolbox and on the full-page apps
 * picker, where the alternatives are a Fluent glyph and a grey gradient
 * placeholder. Both documents are invented - a fictional service, made-up
 * commands - and each exercises what its own web part renders, so a tile
 * doubles as a list of what you get.
 *
 * Colours are VS Code's Dark+, one of the three themes the web parts ship,
 * because a product whose pitch is "themed like the editors you write it in"
 * may as well argue that in an editor's own palette.
 *
 * WHY TWO TILES AND NOT ONE
 * Because a toolbox showing the same picture twice tells an author nothing
 * about which of the two entries they want, and the rename that gave them two
 * names was for exactly that. So one shows markdown source and the other shows
 * HTML source, and a glance separates them before the labels are read.
 *
 * WHY A COLOUR PER LINE RATHER THAN PER TOKEN
 * Because at this size a line is a few millimetres tall and the tilt resamples
 * every glyph: syntax colouring inside a line would be noise. The documents
 * below are written so that each line is mostly one kind of thing, which is
 * what makes a colour per line read as syntax rather than as a mistake.
 *
 * .USAGE
 *   const { tileHtml, MARKDOWN, HTML } = require('./webpart-tile');
 *
 *   tileHtml(glyphUri, MARKDOWN);   // the markdown web part's tile
 *   tileHtml(glyphUri, HTML);       // the HTML web part's
 *
 *   // Drawn in a headless browser by scripts/build-brand.js and saved as JPEGs.
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  nothing else in this project
 */

const MARKDOWN = [
  ['h', '# Atlas API deployment guide'], ['', ''],
  ['t', 'Bringing a new **region** online, and the checks'],
  ['t', 'that catch a bad rollout before customers do.'], ['', ''],
  ['q', '> [!WARNING] Drain the old pool first'],
  ['q', '> Traffic will not shift until it is empty.'], ['', ''],
  ['h', '## Install the service'], ['', ''],
  ['f', '```bash'],
  ['c', 'npm install --production'],
  ['c', 'pm2 start atlas --instances 4'],
  ['c', 'curl -sf localhost:8080/healthz'],
  ['f', '```'], ['', ''],
  ['h', '## Verify'], ['', ''],
  ['l', '- [x] Health endpoint returning 200'],
  ['l', '- [x] Metrics flowing to the dashboard'],
  ['l', '- [ ] Runbook linked from the wiki'], ['', ''],
  ['t', '| Check   | Expected | Actual |'],
  ['t', '|---------|----------|--------|'],
  ['t', '| Latency | < 120 ms | 94 ms  |'],
  ['t', '| Workers | 4        | 4      |'], ['', ''],
  ['h', '## Rollback'], ['', ''],
  ['t', 'Re-point the alias to the previous release'],
  ['t', 'with `atlas deploy --rollback`.'], ['', ''],
  ['q', '> [!TIP] Keep the old pool for an hour'],
  ['q', '> Cheaper than a cold start.']
];

/*
 * An HTML document, for the HTML web part's tile.
 *
 * A whole file rather than a fragment, because that is what somebody points
 * the web part at, and with a <style> block in it because the stylesheet is
 * half of what that web part is about. The kinds are chosen so that each line
 * is one thing: a tag line, a line of text, a selector, a declaration.
 *
 *   g  a tag           m  a comment
 *   t  text            s  a CSS selector or at-rule
 *   a  an attribute    d  a CSS declaration
 */
const HTML = [
  ['g', '<!doctype html>'],
  ['g', '<html lang="en">'],
  ['g', '<head>'],
  ['g', '  <title>Atlas API deployment guide</title>'],
  ['g', '  <style>'],
  ['s', '    .warning {'],
  ['d', '      border-left: 4px solid #e3a008;'],
  ['d', '      padding: 8px 14px;'],
  ['s', '    }'],
  ['s', '    table.checks td.ok {'],
  ['d', '      color: #2f855a;'],
  ['s', '    }'],
  ['g', '  </style>'],
  ['g', '</head>'],
  ['g', '<body>'],
  ['g', '  <h1>Atlas API deployment guide</h1>'], ['', ''],
  ['m', '  <!-- Drain the old pool before shifting -->'],
  ['g', '  <p class="warning">'],
  ['t', '    Traffic will not move until it is empty.'],
  ['g', '  </p>'], ['', ''],
  ['g', '  <h2>Verify</h2>'],
  ['g', '  <table class="checks">'],
  ['g', '    <tr><th>Check</th><th>Actual</th></tr>'],
  ['a', '    <tr><td>Latency</td><td class="ok">94 ms</td></tr>'],
  ['a', '    <tr><td>Workers</td><td class="ok">4</td></tr>'],
  ['g', '  </table>'], ['', ''],
  ['g', '  <p>Rolling back: <a href="rollback.html">the'],
  ['t', '  same steps, read backwards</a>.</p>'],
  ['g', '</body>'],
  ['g', '</html>']
];

/*
 * VS Code Dark+, and the kinds of both documents in one table: one palette is
 * what makes the two tiles read as two views of the same product rather than
 * as two products.
 */
const DARK_PLUS = {
  bg: '#1e1e1e', gutter: '#858585', glow: 'rgba(86, 156, 214, .08)',
  // Markdown
  h: '#569cd6', t: '#d4d4d4', q: '#ce9178', f: '#ce9178', c: '#b5cea8', l: '#c586c0',
  // HTML
  g: '#569cd6', a: '#9cdcfe', m: '#6a9955', s: '#d7ba7d', d: '#9cdcfe'
};

/* The tilt is the whole effect: no blur is applied, and what softness there is
   at the receding edge comes from the transform resampling the text. Rendering
   above the final size and scaling down is what keeps that edge tight. */
const ROTATE_Y = -28;
const ROTATE_X = 4;

function tileHtml(markUri, lines) {
  const body = (lines || MARKDOWN).map(([kind, line], index) =>
    `<div class="ln"><span class="n">${index + 1}</span>`
    + `<span style="color:${DARK_PLUS[kind] || DARK_PLUS.t}">`
    + `${(line || ' ').replace(/</g, '&lt;')}</span></div>`).join('');

  return `<style>
    * { box-sizing: border-box; } body { margin: 0; }
    .tile { width: 100%; height: 100%; overflow: hidden; position: relative;
            background: ${DARK_PLUS.bg}; perspective: 520px; perspective-origin: 78% 45%; }
    .screen { position: absolute; inset: -18% -14% -18% -4%; background: ${DARK_PLUS.bg};
              transform: rotateY(${ROTATE_Y}deg) rotateX(${ROTATE_X}deg) scale(1.02); }
    .code { position: absolute; inset: 0; padding: 16px 20px; color: ${DARK_PLUS.t};
            font: 10.5px/1.72 ui-monospace, "Cascadia Code", Menlo, monospace; }
    .ln { white-space: pre; }
    .n { display: inline-block; width: 17px; margin-right: 10px; text-align: right;
         color: ${DARK_PLUS.gutter}; opacity: .7; }
    .glow { position: absolute; inset: 0; pointer-events: none;
            background: radial-gradient(ellipse 66% 58% at 70% 46%, ${DARK_PLUS.glow}, transparent 72%); }
    .vig { position: absolute; inset: 0; pointer-events: none;
           box-shadow: inset 0 0 58px 8px rgba(0, 0, 0, .42); }
    .mark { position: absolute; right: 13px; bottom: 11px; height: 30px;
            filter: drop-shadow(0 2px 8px rgba(0, 0, 0, .8)); }
  </style>
  <div class="tile">
    <div class="screen"><div class="code">${body}</div></div>
    <div class="glow"></div><div class="vig"></div>
    <img class="mark" src="${markUri}">
  </div>`;
}

module.exports = { tileHtml, MARKDOWN, HTML, WIDTH: 400, HEIGHT: 300, SUPERSAMPLE: 3 };
