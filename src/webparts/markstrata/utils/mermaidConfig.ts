/*
 * The mermaid configuration, minus the palette.
 *
 * It lives on its own because two places initialise mermaid: the web part,
 * through MermaidRenderer, and the documentation site's static pages, which
 * render their diagrams in an inline script rather than loading the renderer
 * class. The site used to carry its own copy of this object, so a change made
 * for the web part reached a deployed page and not the demo.
 *
 * Nothing here imports mermaid itself, which keeps it compilable by the site
 * build on its own, without the web part's ambient typings.
 */

/*
 * Gantt charts draw their labels at 10px (the time axis) and 11px (task names
 * and section titles), which is unreadable next to body text.
 *
 * Two things have to be said to fix it, and the first alone is not enough.
 *
 * Mermaid's `gantt.fontSize` sets the size the layout is measured at but is
 * not what ends up in the SVG: the generated stylesheet sizes the text by the
 * diagram's id, an id selector, which beats anything we can write in our own
 * stylesheet. themeCSS is appended to that same generated stylesheet, so it is
 * the lever that changes what is drawn, and gantt.fontSize keeps the geometry
 * in step with it.
 *
 * The size is above body text on purpose. A gantt lays itself out wider than
 * its container and useMaxWidth then scales the whole SVG down to fit, so the
 * text lands on screen smaller than it is written here. At the widths a
 * SharePoint column gives, the scale runs around 0.875, which is what turned
 * an earlier 13px into 11px beside 15px body text.
 */
const GANTT_TEXT_SIZE: number = 16;

export const GANTT_TEXT_CSS: string = [
  `.tick text { font-size: ${GANTT_TEXT_SIZE}px; }`,
  `.taskText, .sectionTitle, text[class*="taskTextOutside"] { font-size: ${GANTT_TEXT_SIZE}px; }`
].join('\n');

export const MERMAID_BASE_CONFIG: { [key: string]: unknown } = {
  startOnLoad: false,
  /*
   * strict escapes HTML in diagram text and disables click bindings;
   * htmlLabels off means labels can never become markup at all. Mermaid still
   * wraps long label text without them, and still honours <br/> by splitting
   * the label across tspans.
   */
  securityLevel: 'strict',
  htmlLabels: false,
  flowchart: {
    htmlLabels: false, curve: 'basis', padding: 12, useMaxWidth: true, wrappingWidth: 220
  },
  sequence: { useMaxWidth: true },
  gantt: { barHeight: 24, barGap: 6, fontSize: GANTT_TEXT_SIZE },
  themeCSS: GANTT_TEXT_CSS
};

/**
 * What a diagram does when it wants more width than the column gives it.
 *
 * A gantt is the one that runs into this: it lays out from its time axis and
 * its labels rather than wrapping, so it asks for more room than an article
 * column usually has.
 *
 * - `fit`    lay the chart out at the column width, so the axis is compressed
 *            and the text stays the size it is set to. No scrollbar.
 * - `scroll` keep the natural width and let the box scroll sideways.
 * - `scale`  shrink the whole drawing to fit, text included. This is mermaid's
 *            own default and the reason gantt labels read so small.
 */
export type DiagramWidth = 'fit' | 'scroll' | 'scale';

/**
 * The config for one diagram. `available` is the usable width of the box the
 * diagram is going into, and is only consulted when fitting.
 *
 * `base` is passed in rather than read from module scope so the compiled
 * function can be serialised into the documentation site's pages, which render
 * their diagrams in an inline script and have no module system to import from.
 */
export function mermaidConfigFor(width: DiagramWidth, available: number,
  base: { [key: string]: unknown }): { [key: string]: unknown } {
  const gantt: { [key: string]: unknown } = {
    ...(base.gantt as { [key: string]: unknown })
  };

  if (width === 'scale') {
    gantt.useMaxWidth = true;
  } else {
    gantt.useMaxWidth = false;
    /* A hidden or not-yet-laid-out box measures zero; scrolling is the safer
       thing to fall back on, since it never shrinks the text. */
    if (width === 'fit' && available > 0) {
      gantt.useWidth = available;
    }
  }

  return { ...base, gantt: gantt };
}
