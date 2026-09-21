/**
 * .SYNOPSIS
 * Read mode for the HTML web part: an author's HTML document, drawn inline, in
 * a shadow root or in a frame, inside the chrome every Markstrata document has.
 *
 * .DESCRIPTION
 * The markdown web part turns a source text into HTML and then renders it.
 * Here the author's file already is HTML, so the work is not rendering it but
 * deciding how much of the page it is allowed to be part of. That is the render
 * mode, and the three answers are genuinely different bargains rather than
 * three ways of doing the same thing:
 *
 *   Inline      The document becomes part of the page. Markstrata's own
 *               typography styles it, so it looks like a Markstrata document,
 *               and every enhancement works: zoomable pictures, sortable
 *               tables, a contents sidebar, links that open here. The author's
 *               stylesheet is rewritten to apply only inside this web part, so
 *               it cannot restyle the page around it - but a rule the scoping
 *               cannot narrow is the weak spot of this mode, and the page's own
 *               styles do reach in.
 *
 *   Shadow DOM  The document goes behind a boundary. The author's stylesheet
 *               needs no rewriting because the boundary is what contains it,
 *               and the page's CSS cannot reach in either, so the document
 *               looks exactly as the author wrote it. Markstrata's typography
 *               does not reach in, which is the trade: the author owns the
 *               look entirely. Inherited properties do cross a boundary, so
 *               the theme's colours and text size still arrive, and an author
 *               can use var(--strata-...) to match the page deliberately.
 *               Everything built from the rendered document still works,
 *               because the enhancements are handed the element inside the
 *               root rather than the page.
 *
 *   Frame       The document becomes a document of its own, in a sandboxed
 *               frame, and is the only mode in which the author's scripts can
 *               run. Nothing in the page can reach it and nothing in it can
 *               reach the page - which is also what it costs: no zoomable
 *               pictures, no sortable tables, and a contents list that has to
 *               be put inside the frame to be able to scroll anything. See
 *               htmlFrame.ts for what the sandbox does and does not allow.
 *
 * WHAT IS SHARED WITH THE MARKDOWN WEB PART
 * All the furniture: the toolbar, the theme controls, the trail of followed
 * documents, the contents list and the source footer are DocumentChrome, so a
 * reader moving between the two parts on one page cannot tell them apart by
 * the chrome. What differs is exactly the middle.
 *
 * WHICH WAY THIS FAILS
 * A document drawn in a weaker mode than the author asked for would be a
 * silent loss of isolation, so the mode is read once and every branch below is
 * explicit about which one it is in. There is no fallback from frame to inline:
 * a frame that will not build draws nothing and says so.
 *
 * .USAGE
 *   const view = new HtmlViewRenderer(enhancer, callbacks);
 *   view.render(container, htmlFileContent, options);
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  the HTML web part bundle
 * Requires:  documentChrome.ts, htmlDocument.ts, scopedCss.ts, headingIds.ts,
 *            htmlFrame.ts, ContentEnhancer.ts, documentLinks.ts,
 *            headingLanding.ts
 */

import { ContentEnhancer, ITocEntry } from '../../markstrata/utils/ContentEnhancer';
import { landOnHeading } from '../../markstrata/utils/headingLanding';
import { HTML_DOCUMENTS } from '../../markstrata/utils/documentLinks';
import {
  DocumentChrome,
  IChromeOptions,
  IChromeCallbacks
} from '../../shared/documentChrome';
import { splitHtmlDocument, IHtmlDocument } from '../../shared/htmlDocument';
import { scopeCss } from '../../shared/scopedCss';
import { ensureHeadingIds } from '../../shared/headingIds';
import { frameDocument, frameSandbox } from '../../shared/htmlFrame';

export type HtmlRenderMode = 'inline' | 'shadow' | 'frame';

/** What decides how tall the document is allowed to be. */
export type HtmlHeight = 'fit' | 'fixed' | 'window';

/** The chrome's options, plus the ones only an HTML document has. */
export interface IHtmlViewOptions extends IChromeOptions {
  renderMode: HtmlRenderMode;
  /**
   * A stylesheet from outside the document, so that several HTML web parts on
   * several pages can be given one look from one file. It goes in front of the
   * document's own `<style>` blocks, which means an author's inline rule wins
   * where the two disagree.
   */
  sharedCss?: string;
  /** Whether the author's own scripts run. Frame mode only, off by default. */
  runScripts: boolean;
  /** Let the document run to the edges rather than sit in the reading measure. */
  fullBleed: boolean;
  heightMode: HtmlHeight;
  /** How tall, in pixels, when the height is fixed. */
  fixedHeight: number;
  /** Whether the document is drawn at all on a narrow screen. */
  showOnNarrowScreens: boolean;
  /**
   * Turns a neighbouring document's path into the address that opens it on
   * this page. Frame mode needs this as a plain address, because nothing in a
   * frame can call back out to a handler.
   */
  documentAddress?: (path: string) => string;
}

/**
 * The little that is put inside a shadow root before the author's stylesheet.
 *
 * Deliberately almost nothing. The point of shadow mode is that the author's
 * CSS decides how the document looks, so this fixes only the two things that
 * are wrong rather than merely unstyled: a picture wider than the column, and
 * a block of code that will not wrap and so widens the whole page.
 */
const SHADOW_RESET: string = [
  ':host { display: block; }',
  'img, svg, video, canvas, iframe { max-width: 100%; }',
  'pre { overflow-x: auto; }',
  'table { max-width: 100%; }'
].join('\n');

export class HtmlViewRenderer {
  private enhancer: ContentEnhancer;
  private chrome: DocumentChrome;
  /**
   * What the author's stylesheet is narrowed to in inline mode. Unique per
   * renderer, because two HTML web parts on one page must not restyle each
   * other.
   */
  private readonly scope: string = `strata-html-${Math.random().toString(36).substring(2, 8)}`;
  /**
   * The element the search index should read the document's text from.
   *
   * Kept because the web part cannot find it: in shadow mode it is behind a
   * boundary the page's own querySelector cannot see through, and in frame
   * mode it is the inert copy rather than anything on the page at all.
   */
  private indexed: HTMLElement | undefined;

  constructor(enhancer: ContentEnhancer, callbacks: IChromeCallbacks) {
    this.enhancer = enhancer;
    this.chrome = new DocumentChrome(enhancer, callbacks, HTML_DOCUMENTS);
  }

  /** Where the document's text is, for the search index. See `indexed`. */
  public indexedContent(): HTMLElement | undefined {
    return this.indexed;
  }

  /**
   * The document on its own, for the editor's live preview.
   *
   * The same three modes as the page, and the page's own code path rather than
   * a second way of drawing a document: a preview that rendered differently
   * would be worth less than no preview, because an author would tune a
   * document against one renderer and ship it to another.
   *
   * What is switched off is everything that is about a page rather than about
   * the document: the toolbar, the contents list, the source footer, the
   * button back to the top, and following a link - which in a preview would
   * carry the author away from the text they are writing.
   *
   * ONE THING THE PREVIEW CANNOT SHOW
   * A document whose scripts run. They are paused for anybody editing the
   * page, so the caller hands this runScripts off, and with them off the
   * document is sanitised - which is the right way round, but it does mean an
   * author who has turned scripts on is previewing the cleaned-up document and
   * has to leave edit mode to see the real one. The banner above the editor
   * says so.
   */
  public preview(container: HTMLElement, raw: string, options: IHtmlViewOptions): void {
    this.render(container, raw, {
      ...options,
      showToolbar: false,
      tocPosition: 'off',
      showSourceInfo: false,
      backToTop: 'off',
      openDocumentName: undefined,
      onGoToCrumb: undefined,
      openDocument: undefined,
      documentAddress: undefined,
      shareAddress: undefined,
      landOnHeading: undefined,
      /* As tall as it is, inside a box the editor has already sized. A height
         set here would fight the pane. */
      heightMode: 'fit',
      /* The preview is in a column, never at the edges of the page. */
      fullBleed: false,
      /* Drawn for somebody who is editing the page, which is what pauses the
         scripts: an author's document is not running while they are writing
         it. */
      isPageEditing: true,
      showOnNarrowScreens: true
    });
  }

  public render(container: HTMLElement, raw: string, options: IHtmlViewOptions): void {
    this.enhancer.stopTracking();
    this.indexed = undefined;

    const host: HTMLElement = this.chrome.mountHost(container, options);
    host.setAttribute('data-strata-html', options.renderMode);
    host.setAttribute('data-strata-bleed', String(options.fullBleed));
    /* The width itself is in html.css, because a media query cannot be
       written per instance. This says only whether that query applies. */
    host.setAttribute('data-strata-narrow', options.showOnNarrowScreens ? 'show' : 'hide');

    let toolbar: HTMLElement | undefined;
    if (options.showToolbar) {
      toolbar = this.chrome.buildToolbar(options);
      host.appendChild(toolbar);
    }
    if (options.openDocumentName && options.onGoToCrumb) {
      (toolbar || host).appendChild(this.chrome.buildOpenDocumentBar(options));
    }

    const layout: HTMLElement = document.createElement('div');
    layout.className = 'strata-layout';
    if (options.tocPosition === 'left' || options.tocPosition === 'right') {
      layout.setAttribute('data-strata-toc', options.tocPosition);
    }
    host.appendChild(layout);

    /* Read before anything is drawn, because in every mode but one the styles
       have to come out of the file before it is sanitised: the sanitiser
       removes a <style> block and says nothing. See htmlDocument.ts. */
    const scripts: boolean = options.renderMode === 'frame' && options.runScripts;
    const parts: IHtmlDocument = splitHtmlDocument(raw || '');

    if (options.renderMode === 'frame') {
      this.drawInAFrame(host, layout, toolbar, raw || '', parts, scripts, options);
    } else if (options.renderMode === 'shadow') {
      this.drawBehindABoundary(host, layout, toolbar, parts, options);
    } else {
      this.drawInThePage(host, layout, toolbar, parts, options);
    }

    this.enhancer.trackScrollOffset(host);

    if (options.heightMode === 'window') {
      this.enhancer.fillHeight(host);
    } else {
      this.enhancer.stopFilling();
    }

    this.chrome.noteRenderedMode(options.resolvedMode);
  }

  // ------------------------------------------------------------------ inline

  /**
   * The document as part of the page: Markstrata's typography styles it, every
   * enhancement reaches it, and the author's stylesheet is narrowed so that it
   * cannot reach anything else.
   */
  private drawInThePage(host: HTMLElement, layout: HTMLElement,
    toolbar: HTMLElement | undefined, parts: IHtmlDocument,
    options: IHtmlViewOptions): void {
    const article: HTMLElement = this.article(parts.body, options);
    article.classList.add(this.scope);

    /* The stylesheet before the document, so a rule in it applies to what
       follows without the document having to be in the page first. Scoped to
       this article and nothing else: an author's `body { background: black }`
       becomes a rule about their own document. */
    const css: string = [options.sharedCss || '', parts.css].join('\n').trim();
    if (css) {
      layout.appendChild(this.stylesheet(scopeCss(css, `.${this.scope}`)));
    }

    layout.appendChild(article);
    this.finishInThePage(host, layout, article, toolbar, options);
  }

  // ------------------------------------------------------------- shadow root

  /**
   * The document behind a boundary: the author's stylesheet needs no rewriting
   * because nothing can carry it out, and nothing in the page can style what
   * is in here either.
   */
  private drawBehindABoundary(host: HTMLElement, layout: HTMLElement,
    toolbar: HTMLElement | undefined, parts: IHtmlDocument,
    options: IHtmlViewOptions): void {
    const mount: HTMLElement = document.createElement('div');
    mount.className = 'strata-shadow';
    layout.appendChild(mount);

    /* Open rather than closed. Closed would hide the document from the page's
       own scripts, which sounds stronger and is not: the styling boundary is
       the same either way, and closed would stop anything on the page - a
       print stylesheet, an accessibility tool, the browser's own find -
       reaching a document a reader is meant to be reading. */
    const root: ShadowRoot = mount.attachShadow({ mode: 'open' });
    root.appendChild(this.stylesheet(SHADOW_RESET));

    const css: string = [options.sharedCss || '', parts.css].join('\n').trim();
    if (css) {
      root.appendChild(this.stylesheet(css));
    }

    const article: HTMLElement = this.article(parts.body, options);
    root.appendChild(article);

    /* The enhancements are given the element inside the root rather than the
       page, so every one of them works: they all take a container and ask it
       for its own children.

       The mount is handed over as well, because the contents list goes in the
       layout and the layout holds the mount, not the article. Without it the
       list is inserted before a node the layout has never heard of, which
       throws and takes the render with it. */
    this.finishInThePage(host, layout, article, toolbar, options, mount);
  }

  // -------------------------------------------------------------------- frame

  /**
   * The document as a document of its own.
   *
   * Nothing in the page can reach into a sandboxed frame, so everything the
   * chrome would normally read from the rendered article is read here from an
   * inert copy instead: the same markup, parsed where nothing can run, which
   * is what gives the contents list and the reading time real values.
   */
  private drawInAFrame(host: HTMLElement, layout: HTMLElement,
    toolbar: HTMLElement | undefined, raw: string, parts: IHtmlDocument,
    scripts: boolean, options: IHtmlViewOptions): void {
    /* Sanitised unless the author's scripts are meant to run, in which case
       removing them is removing the setting. The sandbox is the safety there,
       and htmlFrame.ts says exactly what it allows. */
    const content: string = scripts ? raw : this.frameBody(parts);

    /* An inert parse of what is about to go into the frame, for the two things
       the chrome needs to read from a document: its headings and its prose.
       Inert because a live element would start fetching the pictures in it,
       and an onerror on one of those is the author's script running in the
       page rather than in the frame. */
    const measured: HTMLElement = inertBody(content);
    ensureHeadingIds(measured);
    this.indexed = measured;

    const contents: string | undefined = this.contentsForAFrame(measured, options);

    const frame: HTMLIFrameElement = document.createElement('iframe');
    frame.className = 'strata-frame';
    frame.setAttribute('title', documentName(options));
    frame.setAttribute('sandbox', frameSandbox(scripts));
    /* Nothing in a sandboxed frame should be reaching the network for
       anything it was not given, and a referrer would tell whatever it does
       reach which SharePoint page it came from. */
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('loading', 'lazy');
    frame.srcdoc = frameDocument(content, {
      scripts: scripts,
      base: options.documentBase,
      css: options.sharedCss,
      contents: contents,
      documentExtensions: HTML_DOCUMENTS,
      documentAddress: options.documentAddress
    });

    this.applyHeight(frame, options);
    layout.appendChild(frame);

    /* Measured from the inert copy, because there is no reaching into the
       frame to count what is in it. */
    this.chrome.fillReadingTime(toolbar, measured);

    if (options.showSourceInfo && options.fileMetadata) {
      host.appendChild(this.chrome.buildSourceInfo(options.fileMetadata,
        { title: parts.title }));
    }

    if (options.heightMode === 'fit') {
      this.fitTheFrame(frame, scripts);
    }
  }

  /**
   * The contents list for a frame, serialised to go inside it.
   *
   * It has to be in the frame: an entry in a sidebar out in the page has no way
   * to scroll a heading that is in a document of its own, so a sidebar would be
   * a list of links that do nothing. Inside, they are ordinary same-document
   * anchors and the browser handles them.
   */
  private contentsForAFrame(measured: HTMLElement,
    options: IHtmlViewOptions): string | undefined {
    if (options.tocPosition === 'off') {
      return undefined;
    }

    const authored: ITocEntry[] | undefined = this.enhancer.adoptAuthoredToc(measured);
    const entries: ITocEntry[] = authored
      || this.enhancer.collectHeadings(measured, options.tocMaxLevel);
    const nav: HTMLElement | undefined = this.enhancer.buildToc(entries, measured);
    return nav ? nav.outerHTML : undefined;
  }

  /**
   * Fits the frame to the document in it, once.
   *
   * Only possible with scripts off, where the frame shares the page's origin
   * and can be read - there being no script in it to make any use of that. With
   * scripts on the frame is an opaque origin and its height is unknowable from
   * out here, which is why the pane does not offer "fit content" in that case.
   */
  private fitTheFrame(frame: HTMLIFrameElement, scripts: boolean): void {
    if (scripts) {
      return;
    }

    const measure: () => void = () => {
      try {
        const inside: Document | null = frame.contentDocument;
        if (!inside || !inside.body) {
          return;
        }
        /* scrollHeight of the documentElement rather than the body: a body
           with margins collapses to less than the document it holds. */
        const height: number = Math.max(
          inside.documentElement.scrollHeight,
          inside.body.scrollHeight
        );
        if (height > 0) {
          frame.style.height = `${height}px`;
        }
      } catch {
        /* A frame that cannot be read keeps the height the stylesheet gave
           it. A document that will not measure is not a reason to lose it. */
      }
    };

    frame.addEventListener('load', measure);
    measure();
  }

  // ------------------------------------------------------------------ shared

  /** The article element, with the document in it or with the empty message. */
  private article(body: string, options: IHtmlViewOptions): HTMLElement {
    const article: HTMLElement = document.createElement('article');
    article.className = 'strata-content';

    if (!body || body.trim().length === 0) {
      const empty: HTMLElement = document.createElement('div');
      empty.className = 'strata-empty';
      empty.textContent = 'No HTML to show yet. Edit this web part to pick a file or type some content.';
      article.appendChild(empty);
      return article;
    }

    article.innerHTML = body;
    /* Before anything reads the headings. An HTML file written by hand usually
       has no ids, and without them the contents list comes out empty and no
       link can reach a section. */
    ensureHeadingIds(article);
    this.applyHeight(article, options);
    return article;
  }

  /**
   * Everything that is the same for inline and shadow: the contents, the
   * footer, and the enhancements that read the rendered document.
   */
  private finishInThePage(host: HTMLElement, layout: HTMLElement, article: HTMLElement,
    toolbar: HTMLElement | undefined, options: IHtmlViewOptions,
    standIn?: HTMLElement): void {
    this.indexed = article;
    this.chrome.addToc(layout, article, host, options, standIn);

    if (options.showSourceInfo && options.fileMetadata) {
      host.appendChild(this.chrome.buildSourceInfo(options.fileMetadata, {}));
    }

    this.enhancer.secureExternalLinks(article);
    this.enhancer.followDocumentLinks(
      article,
      options.documentBase,
      options.openDocument,
      (heading: string) => { landOnHeading(article, heading, true); },
      HTML_DOCUMENTS
    );
    this.enhancer.enhanceImages(article, options.enableImageZoom !== false);
    this.enhancer.enhanceTables(article, options.enableTableSort !== false);

    this.chrome.fillReadingTime(toolbar, article);
    this.enhancer.attachBackToTop(host, options.backToTop || 'off');

    if (options.landOnHeading) {
      landOnHeading(article, options.landOnHeading);
    }
  }

  /** A `<style>` element holding exactly the rules given. */
  private stylesheet(css: string): HTMLStyleElement {
    const style: HTMLStyleElement = document.createElement('style');
    style.textContent = css;
    return style;
  }

  /**
   * How tall the document is allowed to be.
   *
   * "Fit content" is the absence of a height rather than a value, so nothing
   * is set for it: a document is as tall as it is. The other two are lengths,
   * and the stylesheet supplies the scrolling that a fixed height implies.
   */
  private applyHeight(element: HTMLElement, options: IHtmlViewOptions): void {
    if (options.heightMode === 'fixed') {
      element.style.height = `${Math.max(1, options.fixedHeight)}px`;
      element.setAttribute('data-strata-height', 'fixed');
      return;
    }
    element.setAttribute('data-strata-height', options.heightMode);
  }

  /**
   * The sanitised document, with its own styles put back at the top.
   *
   * splitHtmlDocument lifts the `<style>` blocks out because the sanitiser
   * would silently delete them. In a frame there is nothing to scope them to
   * and nothing for them to leak into, so they simply go back in front of the
   * document they belong to.
   */
  private frameBody(parts: IHtmlDocument): string {
    if (!parts.css) {
      return parts.body;
    }
    return `<style>\n${parts.css}\n</style>\n${parts.body}`;
  }
}

/** A frame needs a name a screen reader can announce it by. */
function documentName(options: IHtmlViewOptions): string {
  const named: string = options.openDocumentName
    || (options.fileMetadata ? options.fileMetadata.name : '');
  return named ? `${named}, as a document` : 'The document';
}

/**
 * The document's body, parsed where nothing in it can run or load.
 *
 * DOMParser is the whole point: assigning the same markup to a live element
 * starts fetching its pictures, and an `onerror` on one of those would run the
 * author's script in the page.
 */
function inertBody(html: string): HTMLElement {
  return new DOMParser().parseFromString(html || '', 'text/html').body;
}
