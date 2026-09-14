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
  /*
   * useMaxWidth would fit the chart to the column by scaling the whole SVG,
   * which scales the text with it: a gantt lays out wider than the column it
   * sits in, so the labels arrived on screen a good deal smaller than the size
   * set above and no amount of raising that number fixed it reliably, because
   * the scale depends on the column. Off, the chart keeps its natural size and
   * the text is exactly the size it says; extras.css lets a wide one scroll.
   */
  gantt: { useMaxWidth: false, barHeight: 24, barGap: 6, fontSize: GANTT_TEXT_SIZE },
  themeCSS: GANTT_TEXT_CSS
};
