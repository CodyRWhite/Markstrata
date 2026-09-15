/**
 * .SYNOPSIS
 * The web part's tile: a markdown document open in an editor, at an angle.
 *
 * .DESCRIPTION
 * SharePoint shows this in the web part toolbox and on the full-page apps
 * picker, where the alternatives are a Fluent glyph and a grey gradient
 * placeholder. The document is invented - a fictional service, made-up
 * commands - and exercises a heading, bold, a callout, a fenced block, a task
 * list and a table, so the tile doubles as a list of what the web part renders.
 *
 * Colours are VS Code's Dark+, one of the three themes the web part ships,
 * because a product whose pitch is "themed like the editors you write it in"
 * may as well argue that in an editor's own palette.
 *
 * .USAGE
 *   const { tileHtml } = require('./webpart-tile');
 *
 *   // Drawn in a headless browser by scripts/build-brand.js and saved as a JPEG.
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  nothing else in this project
 */

const LINES = [
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

/* VS Code Dark+. */
const DARK_PLUS = {
  bg: '#1e1e1e', gutter: '#858585', glow: 'rgba(86, 156, 214, .08)',
  h: '#569cd6', t: '#d4d4d4', q: '#ce9178', f: '#ce9178', c: '#b5cea8', l: '#c586c0'
};

/* The tilt is the whole effect: no blur is applied, and what softness there is
   at the receding edge comes from the transform resampling the text. Rendering
   above the final size and scaling down is what keeps that edge tight. */
const ROTATE_Y = -28;
const ROTATE_X = 4;

function tileHtml(markUri) {
  const body = LINES.map(([kind, line], index) =>
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

module.exports = { tileHtml, WIDTH: 400, HEIGHT: 300, SUPERSAMPLE: 3 };
