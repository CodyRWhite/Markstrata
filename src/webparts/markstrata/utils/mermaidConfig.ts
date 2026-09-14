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
 * and section titles). A flowchart scales its whole SVG to the container, so
 * its text grows with the column; a gantt re-lays the chart out instead and
 * keeps those sizes at any width, which leaves them close to unreadable.
 *
 * Mermaid's own `gantt.fontSize` does not reach these elements. Its generated
 * stylesheet targets them by the diagram's id, an id selector, which beats
 * anything we can write in our own stylesheet. themeCSS is appended to that
 * same generated stylesheet, which is why it is the one lever that works.
 */
export const GANTT_TEXT_CSS: string = [
  '.tick text { font-size: 13px; }',
  '.taskText, .sectionTitle, text[class*="taskTextOutside"] { font-size: 13px; }'
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
  gantt: { useMaxWidth: true, barHeight: 22, barGap: 6 },
  themeCSS: GANTT_TEXT_CSS
};
