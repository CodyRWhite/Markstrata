/**
 * .SYNOPSIS
 * Everything done to a document after the markdown has been turned into HTML.
 *
 * .DESCRIPTION
 * This is a facade, not an implementation: each behaviour lives in a file of
 * its own beside this one, and what is here is the list of them, the objects
 * that outlive a single render, and one place to shut all of it down again.
 *
 * It is a class rather than a set of loose functions because of that lifetime.
 * A scroll listener, a resize observer, an open overlay and a pending timer
 * all have to be findable when the web part goes away, and a caller holding
 * one enhancer is a simpler bargain than a caller remembering to stop six
 * separate things.
 *
 * .USAGE
 *   import { ContentEnhancer } from './utils/ContentEnhancer';
 *
 *   const enhancer: ContentEnhancer = new ContentEnhancer();
 *   enhancer.attachCopyButtons(article);
 *   enhancer.enhanceImages(article, true);
 *   enhancer.trackActiveHeading(article, nav);
 *
 *   // Once, when the web part goes away:
 *   enhancer.dispose();
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  backToTop.ts, chromeOffset.ts, codeCopy.ts, contents.ts,
 *            copyFeedback.ts, diagramTools.ts, documentLinks.ts,
 *            fillHeight.ts, remoteCode.ts, codeZoom.ts
 */

import { BackToTop, BackToTopButton } from './backToTop';
import { ScrollOffset, chromeAbove } from './chromeOffset';
import { attachCopyButtons, copyToClipboard } from './codeCopy';
import { attachCodeZoom } from './codeZoom';
import { HeadingTracker, ITocEntry, adoptAuthoredToc, buildToc, collectHeadings } from './contents';
import { CopyFeedback } from './copyFeedback';
import { attachDiagramTools } from './diagramTools';
import { DocumentLinkWatcher, followDocumentLinks, secureExternalLinks } from './documentLinks';
import { HeightFiller } from './fillHeight';
import { enhanceImages } from './images';
import { FileIdLookup, buildOfficeCards } from './officeCards';
import { validateWikiLinks } from './linkCheck';
import { readingTime } from './documentText';
import { FetchCode, fillRemoteCode } from './remoteCode';
import { TableTools } from './tableTools';
import { ZoomOverlay } from './zoomOverlay';

/* Re-exported because callers ask this file for it: the contents entry is part
   of the enhancer's vocabulary wherever it is defined. */
export { ITocEntry } from './contents';

export class ContentEnhancer {
  private readonly zoom: ZoomOverlay = new ZoomOverlay();
  private readonly feedback: CopyFeedback = new CopyFeedback();
  private readonly headings: HeadingTracker = new HeadingTracker();
  private readonly offset: ScrollOffset = new ScrollOffset();
  private readonly height: HeightFiller = new HeightFiller();
  private readonly toTop: BackToTopButton = new BackToTopButton();
  private readonly tables: TableTools = new TableTools();
  private readonly documentLinks: DocumentLinkWatcher = new DocumentLinkWatcher();

  // ------------------------------------------------------------------ code

  /** Wires every copy button inside `container` exactly once. */
  public attachCopyButtons(container: HTMLElement): void {
    attachCopyButtons(container, this.feedback);
  }

  /**
   * Puts `text` on the clipboard and says so on `button`, the same way a code
   * block's Copy does. Here rather than in the renderer because the thing that
   * tells the reader it worked lives here.
   */
  public copyToClipboard(text: string, button: HTMLButtonElement): void {
    copyToClipboard(text, button, this.feedback);
  }

  /** Puts Expand and Copy over every diagram. */
  public attachDiagramTools(container: HTMLElement, allowZoom: boolean): void {
    attachDiagramTools(container, allowZoom, this.zoom, this.feedback);
  }

  /** Fetches the code for every fence that named an address instead of a body. */
  public async fillRemoteCode(container: HTMLElement, fetchCode: FetchCode): Promise<void> {
    return fillRemoteCode(container, fetchCode);
  }

  /** Offers a full size view of the blocks that have more to show than they show. */
  public attachCodeZoom(container: HTMLElement, allowZoom: boolean): void {
    attachCodeZoom(container, allowZoom, this.zoom);
  }

  // ----------------------------------------------------------------- links

  /** Opens off-site links in a new tab without handing over window.opener. */
  public secureExternalLinks(container: HTMLElement): void {
    secureExternalLinks(container);
  }

  /** Points relative links at the document's folder, and follows .md links. */
  public followDocumentLinks(
    container: HTMLElement,
    base: string | undefined,
    open?: (path: string, heading: string) => void
  ): void {
    followDocumentLinks(container, base, open);
    /* Marking the links is per render; catching the click is not, and has to
       be taken down again when the web part goes away. */
    if (open) {
      this.documentLinks.watch(open);
    } else {
      this.documentLinks.stop();
    }
  }

  /** Marks wiki links whose target is not in the library. */
  /**
   * Turns an `![[Report.docx]]` embed into a card with SharePoint's own
   * preview in it and the way into the editor beside it.
   */
  public async buildOfficeCards(
    container: HTMLElement, webUrl: string, lookup: FileIdLookup
  ): Promise<void> {
    await buildOfficeCards(container, webUrl, lookup);
  }

  public async validateWikiLinks(
    container: HTMLElement,
    listFolder: (folder: string) => Promise<string[] | undefined>
  ): Promise<void> {
    return validateWikiLinks(container, listFolder);
  }

  // -------------------------------------------------------------- contents

  /** Reads headings out of the rendered content. */
  public collectHeadings(container: HTMLElement, maxLevel: number): ITocEntry[] {
    return collectHeadings(container, maxLevel);
  }

  /** Takes over a contents the document wrote for itself, if it has one. */
  public adoptAuthoredToc(container: HTMLElement): ITocEntry[] | undefined {
    return adoptAuthoredToc(container);
  }

  /** Builds the contents list from entries of either origin. */
  public buildToc(entries: ITocEntry[], container: HTMLElement): HTMLElement | undefined {
    return buildToc(entries, container);
  }

  /** Marks the entry for the heading currently being read. */
  public trackActiveHeading(content: HTMLElement, nav: HTMLElement): void {
    this.headings.track(content, nav);
  }

  public stopTracking(): void {
    this.headings.stop();
  }

  // ----------------------------------------------------------- the page it
  //                                                              sits on

  /** How far down the screen a heading has to land to clear the chrome. */
  public static chromeAbove(): number {
    return chromeAbove();
  }

  /** Publishes that measurement as a custom property for the stylesheet. */
  public trackScrollOffset(root: HTMLElement): void {
    this.offset.track(root);
  }

  public stopScrollOffset(): void {
    this.offset.stop();
  }

  /** Gives `root` at least the height of the room below it. */
  public fillHeight(root: HTMLElement): void {
    this.height.fill(root);
  }

  public stopFilling(): void {
    this.height.stop();
  }

  /** A button back to the top, once there is a top to go back to. */
  public attachBackToTop(root: HTMLElement, position: BackToTop): void {
    this.toTop.attach(root, position);
  }

  public stopBackToTop(): void {
    this.toTop.stop();
  }

  // -------------------------------------------------------- the document

  /** Captions, alignment and, optionally, a full size view. */
  public enhanceImages(container: HTMLElement, allowZoom: boolean): void {
    enhanceImages(container, allowZoom, this.zoom);
  }

  /** A header that stays in view, and optionally sorting. */
  public enhanceTables(container: HTMLElement, allowSort: boolean): void {
    this.tables.enhance(container, allowSort);
  }

  /** How long the document takes to read, from the prose in it. */
  public readingTime(article: HTMLElement): string {
    return readingTime(article);
  }

  // ---------------------------------------------------------------- close

  public dispose(): void {
    this.feedback.dispose();
    this.headings.stop();
    this.height.stop();
    this.zoom.close();
    this.toTop.stop();
    this.offset.stop();
    this.tables.stop();
    this.documentLinks.stop();
  }
}
