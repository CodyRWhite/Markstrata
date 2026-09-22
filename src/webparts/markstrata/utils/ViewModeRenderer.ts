/**
 * .SYNOPSIS
 * Read mode: the rendered markdown, inside the chrome that surrounds every
 * Markstrata document.
 *
 * .DESCRIPTION
 * What is markdown-specific lives here: the processor call, the frontmatter,
 * the diagrams, the wiki link checking, the remote fences and the Office
 * embeds. Everything around the document - the toolbar, the theme controls,
 * the trail of followed documents, the contents list and the source footer -
 * is DocumentChrome, which the HTML web part draws from as well.
 *
 * .USAGE
 *   import { ViewModeRenderer } from './utils/ViewModeRenderer';
 *
 *   const view: ViewModeRenderer = new ViewModeRenderer(processor, mermaid, enhancer, {
 *     onReload: () => load(), onShowVersions: () => versions(),
 *     onThemeOverride: (family, mode) => override(family, mode), onExport: () => exportPdf()
 *   });
 *   view.render(container, markdown, options);
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  MarkdownProcessor.ts, MermaidRenderer.ts, mermaidConfig.ts,
 *            ContentEnhancer.ts, documentChrome.ts, documentLinks.ts,
 *            frontMatter.ts, headingLanding.ts
 */

import { MarkdownProcessor } from './MarkdownProcessor';
import { MermaidRenderer } from './MermaidRenderer';
import { DiagramWidth } from './mermaidConfig';
import { ContentEnhancer } from './ContentEnhancer';
import { landOnHeading } from './headingLanding';
import { MARKDOWN_DOCUMENTS } from './documentLinks';
import {
  DocumentChrome,
  IChromeOptions,
  IChromeCallbacks
} from '../../shared/documentChrome';
import { splitFrontMatter, IFrontMatter } from './frontMatter';

/** The chrome's options, plus the ones only a markdown document has. */
export interface IViewOptions extends IChromeOptions {
  enableMermaid: boolean;
  /** What a diagram does when it wants more width than the column gives. */
  diagramWidth?: DiagramWidth;
  /* Given only when there is a library behind the page to ask. */
  listFolder?: (folder: string) => Promise<string[] | undefined>;
  /**
   * How a fence that named a `src` reaches that address. Given by the host,
   * because only the host knows whether it is talking to SharePoint or to a
   * stand-in; without it such a fence stays as it rendered, saying which
   * server it was waiting for.
   */
  fetchCode?: (url: string) => Promise<string>;
  /**
   * Asked for a file's unique id, so an `![[Report.docx]]` embed can be drawn
   * with SharePoint's own preview in it. Undefined leaves those embeds as the
   * marked links they render as.
   */
  officeFileId?: (path: string) => Promise<string | undefined>;
  /** The site the page is on, server relative: the preview is addressed from it. */
  webUrl?: string;
}

/** The chrome's callbacks, which read mode adds nothing to. */
export type IViewCallbacks = IChromeCallbacks;

export class ViewModeRenderer {
  private processor: MarkdownProcessor;
  private mermaid: MermaidRenderer;
  private enhancer: ContentEnhancer;
  private chrome: DocumentChrome;

  constructor(
    processor: MarkdownProcessor,
    mermaid: MermaidRenderer,
    enhancer: ContentEnhancer,
    callbacks: IViewCallbacks
  ) {
    this.processor = processor;
    this.mermaid = mermaid;
    this.enhancer = enhancer;
    this.chrome = new DocumentChrome(enhancer, callbacks, MARKDOWN_DOCUMENTS);
  }

  public render(container: HTMLElement, markdown: string, options: IViewOptions): void {
    this.enhancer.stopTracking();
    const host: HTMLElement = this.chrome.mountHost(container, options);

    let toolbar: HTMLElement | undefined;
    if (options.showToolbar) {
      toolbar = this.chrome.buildToolbar(options);
      host.appendChild(toolbar);
    }

    /* Inside the toolbar, on a line of its own under the controls and above
       the rule that closes it. The trail is part of the same furniture - it
       says where the reader is, the controls say what they can do about it -
       and a line between them would separate two halves of one thing. The
       toolbar wraps, so a full-width child falls to its own row.

       Without a toolbar there is nothing to sit inside, and it stands where
       the toolbar would have been. */
    if (this.chrome.shouldDrawTrail(options)) {
      (toolbar || host).appendChild(this.chrome.buildOpenDocumentBar(options));
    }

    const layout: HTMLElement = document.createElement('div');
    layout.className = 'strata-layout';
    if (options.tocPosition === 'left' || options.tocPosition === 'right') {
      layout.setAttribute('data-strata-toc', options.tocPosition);
    }

    const article: HTMLElement = document.createElement('article');
    article.className = 'strata-content';

    if (!markdown || markdown.trim().length === 0) {
      const empty: HTMLElement = document.createElement('div');
      empty.className = 'strata-empty';
      empty.textContent = 'No markdown to show yet. Edit this web part to pick a file or type some content.';
      article.appendChild(empty);
    } else {
      article.innerHTML = this.processor.render(markdown);
    }

    /* Read here rather than inside the processor, because the footer wants the
       values and the processor only hands back HTML. */
    const front: IFrontMatter = splitFrontMatter(markdown || '').data;

    // The sidebar has to be built from the rendered article, so render first
    // and insert the aside in front of it afterwards.
    layout.appendChild(article);
    host.appendChild(layout);

    this.chrome.addToc(layout, article, host, options);

    if (options.showSourceInfo && options.fileMetadata) {
      host.appendChild(this.chrome.buildSourceInfo(options.fileMetadata, front));
    }

    this.enhancer.attachCopyButtons(article);
    /* After the article is in the page, because which blocks get a full size
       view is decided by measuring them rather than by reading the markdown. */
    this.enhancer.attachCodeZoom(article, options.enableImageZoom !== false);
    this.enhancer.secureExternalLinks(article);
    this.enhancer.followDocumentLinks(
      article,
      options.documentBase,
      options.openDocument,
      /* An anchor into this document scrolls here rather than being handed to
         the page's router, which would take the reader back to the configured
         document with the fragment still on the address. Smoothly, so it
         arrives the way the contents list already arrives. */
      (heading: string) => { landOnHeading(article, heading, true); },
      undefined,
      /* A link to another page in this site collection carries the trail away
         with it, so a wiki built as a page per document keeps its breadcrumbs
         across the navigation. */
      this.chrome.onwardTrail(options)
    );
    this.enhancer.enhanceImages(article, options.enableImageZoom !== false);
    this.enhancer.enhanceTables(article, options.enableTableSort !== false);

    this.chrome.fillReadingTime(toolbar, article);

    this.enhancer.attachBackToTop(host, options.backToTop || 'off');
    /* So a heading scrolled to clears whatever SharePoint has stuck above the
       web part, by any route: the contents, a link, or a restored fragment. */
    this.enhancer.trackScrollOffset(host);

    /* A link that named a heading in another document: the document is here
       now, so this is the moment it can be scrolled to. The offset above is
       what keeps it clear of the chrome, so it has to be set first. */
    if (options.landOnHeading) {
      /* By every spelling the name might have, not just the one written. A
         wiki link arrives already slugged; a heading named on the page's own
         address arrives as somebody typed it, so `#Rollback` was looked up as
         `Rollback` and matched nothing, and the reader was left at the top of
         the right document. */
      landOnHeading(article, options.landOnHeading);
    }

    /* Left to settle in on its own: the document is readable while this is in
       flight, and a link that turns out to be missing is marked when the
       answer arrives rather than the page waiting on it. */
    if (options.listFolder) {
      void this.enhancer.validateWikiLinks(article, options.listFolder);
    }

    /* Also left to settle in on its own. The card is drawn synchronously with
       everything a reader needs on it; only the preview inside it waits on
       SharePoint, and a document is readable without it. */
    if (options.officeFileId && options.webUrl) {
      void this.enhancer.buildOfficeCards(article, options.webUrl, options.officeFileId);
    }

    /* And the same bargain for a fence that named an address: the block is
       drawn waiting, the document is readable around it, and the code arrives
       when the other server answers. A fence that named a line range has
       already reserved the height it will need, so the document around it does
       not move when it fills. */
    if (options.fetchCode) {
      void this.enhancer.fillRemoteCode(article, options.fetchCode)
        /* Round again, because a block that was one line of prose when the
           blocks were measured is now as tall as a file. */
        .then(() => this.enhancer.attachCodeZoom(article, options.enableImageZoom !== false));
    }

    if (options.enableMermaid) {
      void this.mermaid.render(article, options.settings.themeFamily, options.resolvedMode,
        options.diagramWidth)
        .then(() => this.enhancer.attachDiagramTools(article, options.enableImageZoom !== false));
    }

    /* Read by the next render to tell a mode the reader just chose from one
       the page simply opened with. */
    this.chrome.noteRenderedMode(options.resolvedMode);

    // Last, so the height is measured against the finished layout.
    if (options.settings.fillHeight) {
      this.enhancer.fillHeight(host);
    } else {
      this.enhancer.stopFilling();
    }
  }
}
