/**
 * .SYNOPSIS
 * What an author has configured on the HTML web part, as one shape.
 *
 * .DESCRIPTION
 * Apart on its own because two files need it and neither should have to import
 * the other for it: the web part, which owns the values, and the property
 * pane, which draws them.
 *
 * Most of what an author sets is not about HTML at all - where the file comes
 * from, the theme, the toolbar, how an export is laid out - and that half
 * lives in IStrataWebPartProps, which the markdown web part shares. What is
 * left here is what only means something to an HTML document: how much of the
 * page it is allowed to be part of, where its stylesheet comes from, whether
 * its scripts run, and how tall it is.
 *
 * WHY THE STYLESHEET HAS A SOURCE OF ITS OWN
 * Because one look should serve several documents. A team with twenty HTML
 * pages in a library does not want the same stylesheet pasted into twenty web
 * parts, and an author editing one document should not be able to change how
 * the other nineteen look by accident. So the stylesheet is chosen the same
 * three ways the document is, separately from it, and a document's own
 * `<style>` blocks still apply on top of whatever it names.
 *
 * WHY THERE IS NO "allow HTML" SETTING
 * The markdown web part has one, because there markup inside the document is
 * an exception to what the document is. Here the document is HTML, so a switch
 * allowing it would be a switch allowing the web part to do its job. What this
 * part does instead is sanitise every time, in every mode but one, and that
 * one is the frame with scripts turned on - where the sandbox is the safety
 * and the pane says so.
 *
 * .USAGE
 *   import { IMarkstrataHtmlWebPartProps } from './htmlWebPartProps';
 *
 *   export default class MarkstrataHtmlWebPart
 *     extends StrataWebPart<IMarkstrataHtmlWebPartProps> { }
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  the HTML web part bundle
 * Requires:  strataWebPartProps.ts, HtmlViewRenderer.ts
 */

import { IStrataWebPartProps } from '../shared/strataWebPartProps';
import { HtmlRenderMode, HtmlHeight } from './utils/HtmlViewRenderer';

/** Where the shared stylesheet comes from, if there is one. */
export type CssSource = 'none' | 'manual' | 'library' | 'url';

export interface IMarkstrataHtmlWebPartProps extends IStrataWebPartProps {
  /**
   * The HTML itself.
   *
   * Named for what it holds rather than called "content", because the property
   * pane shows the name to an author and the search index carries it.
   * StrataWebPart reaches it through its documentText accessor.
   */
  htmlContent: string;

  // ------------------------------------------------------------- the stylesheet

  cssSource: CssSource;
  /** Typed into the pane, for a look that belongs to this one web part. */
  cssContent: string;
  /** A stylesheet in a library, which is how several web parts share one. */
  selectedStyleLibrary: string;
  selectedStyleFolder: string;
  selectedStyleFile: string;
  /** A stylesheet at an address, for one kept outside SharePoint. */
  cssFileUrl: string;

  // ------------------------------------------------------------ how it is drawn

  /**
   * How much of the page the document is allowed to be part of. The three
   * answers are different bargains rather than three ways of doing one thing;
   * HtmlViewRenderer sets out what each one costs and gives.
   */
  renderMode: HtmlRenderMode;

  /**
   * Whether the author's own scripts run.
   *
   * Off by default, and only offered in frame mode, because a sandboxed frame
   * is the only place a script can run without being able to reach the page
   * around it or the reader's SharePoint session. Turning it on also means the
   * document is no longer sanitised, since a sanitiser is what would remove
   * the scripts; that is the trade, and the pane says it plainly.
   */
  runScripts: boolean;

  /** Let the document run to the edges rather than sit in the reading measure. */
  fullBleed: boolean;

  /**
   * What decides the document's height.
   *
   * "Full window" is the same setting as fillHeight in the shared properties,
   * which is what the theme and the layout already read. The web part keeps the
   * two in step rather than showing an author two controls that can disagree.
   */
  heightMode: HtmlHeight;
  /** How tall, in pixels, when the height is fixed. */
  fixedHeight: number;

  /**
   * Whether the document is drawn at all on a narrow screen.
   *
   * Not SharePoint's mobile app and not Outlook's email view: there is no API
   * in SPFx that says which of those a web part is being drawn in, so nothing
   * here claims to know. This is a width, and it is what an author usually
   * means - a document laid out wide is better hidden than squeezed.
   */
  showOnNarrowScreens: boolean;
}
