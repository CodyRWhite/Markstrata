/**
 * Post-render DOM work: copy buttons, safe external links, images, the sidebar
 * table of contents, reading time and the button back to the top.
 */
import { countWords, readingTimeLabel } from './readingTime';
import { BackToTop } from './backToTop';
import { byFolder, folderOf, fileOf } from './wikiLinks';
import { ColumnKind, ISortableRow, columnKind, sortedOrder } from './tables';

export interface ITocEntry {
  id: string;
  text: string;
  level: number;
}

/** Distance from the top of the viewport that counts as "being read". */
const ACTIVE_HEADING_LINE: number = 120;

/** Breathing room under a sticky contents sidebar, so it is not flush. */
const SIDEBAR_BOTTOM_GAP: number = 24;

/* Below this there is no useful contents left, and shrinking further only
   makes the scrollbar the whole control. */
const SIDEBAR_MIN_HEIGHT: number = 180;

/* Below this there is not enough room below the web part to be worth filling,
   and forcing it would only push the document off the bottom of the screen. */
const FILL_MIN_HEIGHT: number = 200;

/* Roughly a screenful of reading scrolled past, so the button appears when
   getting back has become a journey rather than a flick of the wheel. */
const BACK_TO_TOP_AFTER: number = 600;

/* Breathing room under whatever is stuck above, so a heading scrolled to sits
   clear of it rather than against it. */
const HEADING_CLEARANCE: number = 16;

/* Close enough to the end to call it the end. Sub-pixel scroll positions and
   zoom mean the arithmetic rarely lands exactly on the bottom. */
const BOTTOM_SLACK: number = 4;

const CHECK_ICON: string =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m20 6-11 11-5-5"/></svg>';

const IMAGE_ICON: string =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<rect x="3" y="4" width="18" height="14" rx="2"/>'
  + '<circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5-9 8"/></svg>';

/* Arrows to the four corners: the diagram, opened out to the window. */
const EXPAND_ICON: string =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<path d="M9 3H3v6M21 9V3h-6M15 21h6v-6M3 15v6h6"/>'
  + '<path d="m3 3 6 6M21 3l-6 6M21 21l-6-6M3 21l6-6"/></svg>';

/* Drawn at twice the diagram's size, so the copy is still sharp when it is
   pasted into a deck or a document and scaled back up. */
const DIAGRAM_COPY_SCALE: number = 2;

export class ContentEnhancer {
  private copyResetTimers: number[] = [];
  private onScroll: (() => void) | undefined;
  private scrollFrame: number | undefined;
  private zoomOverlay: HTMLElement | undefined;
  private zoomOpener: HTMLElement | undefined;
  /** Watches each table's box, because whether it fits decides how it behaves. */
  private tableFit: ResizeObserver | undefined;
  private zoomKeydown: ((event: KeyboardEvent) => void) | undefined;
  private backToTop: HTMLElement | undefined;
  private onBackToTopScroll: (() => void) | undefined;
  private backToTopFrame: number | undefined;
  private onChromeResize: (() => void) | undefined;
  private onResize: (() => void) | undefined;
  private resizeFrame: number | undefined;

  /** Wires every copy button inside `container` exactly once. */
  public attachCopyButtons(container: HTMLElement): void {
    const buttons: HTMLElement[] = Array.prototype.slice.call(container.querySelectorAll('.strata-code-copy'));

    buttons.forEach((button: HTMLElement) => {
      if (button.getAttribute('data-strata-wired') === 'true') {
        return;
      }
      button.setAttribute('data-strata-wired', 'true');

      button.addEventListener('click', (event: Event) => {
        event.preventDefault();
        event.stopPropagation();

        const block: HTMLElement | null = button.closest('.strata-code') as HTMLElement;
        if (!block) {
          return;
        }

        this.copy(this.readCode(block), button as HTMLButtonElement);
      });
    });
  }

  /**
   * Puts a copy button on every diagram, which copies it as a PNG.
   *
   * A diagram is the one thing on the page nobody can usefully copy out: the
   * text is markup, and selecting it gets the source rather than the picture.
   * A raster is what a deck or a document wants anyway.
   */
  public attachDiagramTools(container: HTMLElement, allowZoom: boolean): void {
    const hosts: HTMLElement[] = Array.prototype.slice.call(
      container.querySelectorAll('.strata-mermaid')
    );

    hosts.forEach((host: HTMLElement) => {
      /* The host is rebuilt whenever the diagram re-renders, so old buttons are
         stale rather than already wired. */
      const existing: HTMLElement | null = host.querySelector('.strata-diagram-tools');
      if (existing && existing.parentElement) {
        existing.parentElement.removeChild(existing);
      }
      if (!host.querySelector('svg')) {
        return;
      }

      const tools: HTMLElement = document.createElement('div');
      tools.className = 'strata-diagram-tools';

      if (allowZoom) {
        const open: HTMLButtonElement = document.createElement('button');
        open.type = 'button';
        open.className = 'strata-code-btn strata-diagram-open';
        open.setAttribute('aria-label', 'Open this diagram full size');
        open.innerHTML = EXPAND_ICON + '<span class="strata-code-btn-label">Expand</span>';
        open.addEventListener('click', (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          this.openDiagram(host);
        });
        tools.appendChild(open);
      }

      const copy: HTMLButtonElement = document.createElement('button');
      copy.type = 'button';
      copy.className = 'strata-code-btn strata-diagram-copy';
      copy.setAttribute('aria-label', 'Copy this diagram as an image');
      copy.innerHTML = IMAGE_ICON + '<span class="strata-code-btn-label">Copy</span>';
      copy.addEventListener('click', (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.copyDiagram(host, copy);
      });
      tools.appendChild(copy);

      host.appendChild(tools);

      /* The drawing itself opens too, because that is what a reader tries
         first on something too small to read. The host is not made a button:
         it holds buttons of its own, and a control inside a control is a thing
         neither a screen reader nor a keyboard can describe. The buttons above
         are what the keyboard uses. */
      if (allowZoom) {
        host.classList.add('strata-zoomable');
        host.addEventListener('click', (event: Event) => {
          const target: HTMLElement = event.target as HTMLElement;
          if (target && target.closest('button, a')) {
            return;
          }
          this.openDiagram(host);
        });
      }
    });
  }

  /*
   * A diagram, as big as the window will allow.
   *
   * The drawing is copied rather than moved, so the document keeps its own,
   * and copied as SVG rather than drawn to a bitmap: it is vector, and the
   * whole reason for opening it is to read labels that were too small.
   *
   * Mermaid sizes its SVG with an inline max-width and a fixed height; both
   * have to go or the copy opens at exactly the size that was too small to
   * read. What stays is the viewBox, which is what lets it scale to the space.
   *
   * It is given a background of its own because a diagram carries none: a
   * light-theme diagram is drawn in dark ink, and on the overlay's black that
   * is an empty rectangle.
   */
  private openDiagram(host: HTMLElement): void {
    const svg: SVGSVGElement | null = host.querySelector(':scope > svg');
    if (!svg) {
      return;
    }

    const panel: HTMLElement = document.createElement('div');
    panel.className = 'strata-zoom-diagram';

    const copy: SVGSVGElement = svg.cloneNode(true) as SVGSVGElement;
    copy.removeAttribute('style');
    copy.removeAttribute('width');
    copy.removeAttribute('height');
    panel.appendChild(copy);

    /* Sized without any of that, an SVG in a flex box has nothing to be as
       wide as and collapses to nothing - measured, not guessed. So the panel
       is given the drawing's proportions and told to be as big as it can:
       width and height caps then settle which of the two the window runs out
       of first. The proportions come from the viewBox, or from what the
       diagram measures on the page when it has none. */
    const box: DOMRect = svg.getBoundingClientRect();
    const view: number[] = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/)
      .map((part: string) => Number(part));
    const wide: number = view.length === 4 && view[2] > 0 ? view[2] : box.width;
    const tall: number = view.length === 4 && view[3] > 0 ? view[3] : box.height;
    if (wide > 0 && tall > 0) {
      panel.style.aspectRatio = `${wide} / ${tall}`;
    }

    const title: Element | null = svg.querySelector('title');
    this.openZoom(host, panel, (title && title.textContent) || 'Diagram');
  }

  /**
   * Draws the diagram's SVG onto a canvas and puts the result on the clipboard.
   *
   * The SVG carries its own stylesheet, which mermaid generates inside it, so
   * it stands on its own once it is serialised. What it does not carry is the
   * page's background, and a diagram drawn in light text on nothing pastes as
   * light text on black, so the host's own background colour is painted first.
   */
  private async copyDiagram(host: HTMLElement, button: HTMLButtonElement): Promise<void> {
    /* Not just any svg inside: the buttons over the diagram carry icons of
       their own, and one of those is the first one in the markup if the tools
       are ever built before the drawing. */
    const svg: SVGSVGElement | null = host.querySelector(':scope > svg');
    if (!svg) {
      this.showResult(button, false, 'No diagram');
      return;
    }

    try {
      const blob: Blob = await ContentEnhancer.diagramToPng(host, svg);
      const clipboard: Clipboard = navigator.clipboard;
      const CopyItem: typeof ClipboardItem | undefined =
        (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;

      if (!clipboard || !clipboard.write || !CopyItem || !window.isSecureContext) {
        throw new Error('the clipboard cannot take an image here');
      }
      await clipboard.write([new CopyItem({ 'image/png': blob })]);
      this.showResult(button, true);
    } catch {
      this.showResult(button, false, 'Cannot copy');
    }
  }

  private static diagramToPng(host: HTMLElement, svg: SVGSVGElement): Promise<Blob> {
    const box: DOMRect = svg.getBoundingClientRect();
    const width: number = Math.max(1, Math.round(box.width));
    const height: number = Math.max(1, Math.round(box.height));

    /* A clone, because the copy needs explicit pixel dimensions and the one on
       the page is sized by the layout. */
    const clone: SVGSVGElement = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const markup: string = new XMLSerializer().serializeToString(clone);
    const source: string = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
    const background: string = window.getComputedStyle(host).backgroundColor;

    return new Promise((resolve, reject) => {
      const image: HTMLImageElement = new Image();
      image.onload = () => {
        const canvas: HTMLCanvasElement = document.createElement('canvas');
        canvas.width = width * DIAGRAM_COPY_SCALE;
        canvas.height = height * DIAGRAM_COPY_SCALE;
        const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
        if (!context) {
          reject(new Error('no 2d context'));
          return;
        }
        if (background && background !== 'transparent' && background.indexOf('0)') === -1) {
          context.fillStyle = background;
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob: Blob | null) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('the diagram could not be drawn'));
          }
        }, 'image/png');
      };
      image.onerror = () => reject(new Error('the diagram could not be read'));
      image.src = source;
    });
  }

  /**
   * Line numbers are CSS counters, so the text in the DOM is already the plain
   * source - each line element just needs its newline put back.
   */
  private readCode(block: HTMLElement): string {
    const lines: HTMLElement[] = Array.prototype.slice.call(block.querySelectorAll('.strata-code-line-text'));
    if (lines.length > 0) {
      return lines.map((line: HTMLElement) => line.textContent || '').join('\n');
    }
    const code: HTMLElement | null = block.querySelector('code');
    return code ? code.textContent || '' : '';
  }

  private copy(text: string, button: HTMLButtonElement): void {
    const done = (success: boolean): void => this.showResult(button, success);

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        () => done(true),
        () => done(this.legacyCopy(text))
      );
      return;
    }

    done(this.legacyCopy(text));
  }

  /**
   * Where the visible area ends, in viewport coordinates.
   *
   * The window's own height is only right when the window is what scrolls. A
   * SharePoint page scrolls an inner container that sits under a header and a
   * command bar, so the bottom of that container is what bounds the sidebar,
   * not the bottom of the window. Whichever is higher up the screen wins,
   * which is correct either way round.
   */
  private static visibleBottom(element: HTMLElement): number {
    let bottom: number = window.innerHeight;
    let parent: HTMLElement | null = element.parentElement;

    while (parent && parent !== document.body) {
      if (ContentEnhancer.scrolls(parent)) {
        bottom = Math.min(bottom, parent.getBoundingClientRect().bottom);
      }
      parent = parent.parentElement;
    }

    return bottom;
  }

  /** True if `element` is the thing a wheel gesture over it would move. */
  private static scrolls(element: HTMLElement): boolean {
    const style: CSSStyleDeclaration = window.getComputedStyle(element);
    return /(auto|scroll|overlay)/.test(style.overflowY)
      && element.scrollHeight > element.clientHeight;
  }

  /** The nearest ancestor that scrolls, or undefined when the window does. */
  private static scroller(element: HTMLElement): HTMLElement | undefined {
    let parent: HTMLElement | null = element.parentElement;

    while (parent && parent !== document.body) {
      if (ContentEnhancer.scrolls(parent)) {
        return parent;
      }
      parent = parent.parentElement;
    }

    return undefined;
  }

  /**
   * How much visible room there is from where `element` starts to the bottom
   * of the area that is actually scrolling.
   *
   * Measured from the top of the scrollable content rather than from the
   * element's position on screen, so the answer does not change as the page is
   * scrolled: a min-height that grew every time the reader scrolled down would
   * push the document further away with every wheel click.
   */
  private static roomBelow(element: HTMLElement): number {
    const scroller: HTMLElement | undefined = ContentEnhancer.scroller(element);
    const top: number = scroller ? scroller.getBoundingClientRect().top : 0;
    const scrolled: number = scroller ? scroller.scrollTop : window.pageYOffset;
    const above: number = element.getBoundingClientRect().top - top + scrolled;

    return ContentEnhancer.visibleBottom(element) - top - above;
  }

  /**
   * Gives `root` at least the height of the room below it, and keeps it there
   * as the window is resized.
   *
   * This is what "fill the available height" costs: the room is the distance
   * from where the web part starts to the bottom of whatever is scrolling, and
   * neither of those is a number a stylesheet can reach. `100vh` is the
   * tempting shortcut and it is wrong on a SharePoint page, which scrolls an
   * inner container under a header and a command bar rather than the window.
   *
   * A web part far enough down a long page has no room below it at all, and
   * gets nothing: filling is for the page whose content this is, not for
   * stretching a part that was placed under something else.
   */
  public fillHeight(root: HTMLElement): void {
    this.stopFilling();

    const fit = (): void => {
      const room: number = Math.round(ContentEnhancer.roomBelow(root));
      if (room < FILL_MIN_HEIGHT) {
        root.style.removeProperty('min-height');
        return;
      }
      root.style.minHeight = `${room}px`;
    };

    this.onResize = (): void => {
      if (this.resizeFrame !== undefined) {
        return;
      }
      this.resizeFrame = window.requestAnimationFrame(() => {
        this.resizeFrame = undefined;
        fit();
      });
    };

    window.addEventListener('resize', this.onResize, { passive: true });
    fit();
  }

  public stopFilling(): void {
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
      this.onResize = undefined;
    }
    if (this.resizeFrame !== undefined) {
      window.cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = undefined;
    }
  }

  private legacyCopy(text: string): boolean {
    try {
      const area: HTMLTextAreaElement = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok: boolean = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }

  private showResult(button: HTMLButtonElement, success: boolean,
    failure: string = 'Press Ctrl+C'): void {
    const label: HTMLElement | null = button.querySelector('.strata-code-btn-label');
    const icon: string = button.innerHTML;

    button.setAttribute('data-state', success ? 'done' : 'error');
    if (label) {
      label.textContent = success ? 'Copied' : failure;
    }
    if (success) {
      const svg: Element | null = button.querySelector('svg');
      if (svg) {
        svg.outerHTML = CHECK_ICON;
      }
    }

    const timer: number = window.setTimeout(() => {
      button.removeAttribute('data-state');
      button.innerHTML = icon;
    }, 2000);
    this.copyResetTimers.push(timer);
  }

  /** Opens off-site links in a new tab without handing over window.opener. */
  public secureExternalLinks(container: HTMLElement): void {
    const links: HTMLAnchorElement[] = Array.prototype.slice.call(container.querySelectorAll('a[href]'));
    links.forEach((link: HTMLAnchorElement) => {
      const href: string = link.getAttribute('href') || '';
      if (href.indexOf('#') === 0 || href.length === 0) {
        return;
      }
      if (link.hostname && link.hostname !== window.location.hostname) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  /**
   * Reads headings out of the rendered content. Built from the DOM rather than
   * from a `[[toc]]` marker so the sidebar works for any document.
   */
  public collectHeadings(container: HTMLElement, maxLevel: number): ITocEntry[] {
    const selector: string = ['h1', 'h2', 'h3', 'h4']
      .slice(0, Math.max(1, Math.min(4, maxLevel)))
      .join(',');
    const headings: HTMLElement[] = Array.prototype.slice.call(container.querySelectorAll(selector));

    return headings
      .filter((heading: HTMLElement) => !!heading.id)
      .map((heading: HTMLElement) => {
        const clone: HTMLElement = heading.cloneNode(true) as HTMLElement;
        const anchor: Element | null = clone.querySelector('.strata-anchor');
        if (anchor) {
          anchor.remove();
        }
        return {
          id: heading.id,
          text: (clone.textContent || '').trim(),
          level: parseInt(heading.tagName.substring(1), 10)
        };
      })
      .filter((entry: ITocEntry) => entry.text.length > 0);
  }

  /**
   * Takes over a contents the document wrote for itself, if it has one.
   *
   * A document can say what its contents are, either with `[[toc]]` or by
   * hand as a list of links under a Contents heading. Until now the sidebar
   * ignored both and generated its own from the headings, so a document that
   * had gone to the trouble showed two tables of contents: its own, in the
   * text, and ours beside it.
   *
   * An authored one wins, because it is a decision. A hand-written list is
   * often a deliberate subset, leaving out the headings that are not worth
   * navigating to, and `[[toc]]` is at least an explicit request.
   *
   * The entries are handed back for buildToc rather than the markup being
   * moved, so an adopted contents gets the same indentation, smooth scrolling
   * and reading position tracking as a generated one.
   *
   * Returns undefined when the document has no contents of its own, which is
   * the caller's signal to generate from the headings instead.
   */
  public adoptAuthoredToc(container: HTMLElement): ITocEntry[] | undefined {
    const authored: { list: HTMLElement; heading?: HTMLElement } | undefined =
      this.findAuthoredToc(container);
    if (!authored) {
      return undefined;
    }

    const entries: ITocEntry[] = this.tocEntriesFrom(authored.list, container);
    /* A list of links that go nowhere in this document is not a contents, and
       removing it would lose whatever it actually was. */
    if (!entries.length) {
      return undefined;
    }

    if (authored.heading) {
      authored.heading.remove();
    }
    authored.list.remove();
    return entries;
  }

  private findAuthoredToc(container: HTMLElement):
    { list: HTMLElement; heading?: HTMLElement } | undefined {
    /* What [[toc]] leaves behind. */
    const generated: HTMLElement | null = container.querySelector('.strata-toc');
    if (generated) {
      return { list: generated };
    }

    /* A list of in-page links under a heading that says what it is. */
    const headings: HTMLElement[] =
      Array.prototype.slice.call(container.querySelectorAll('h1,h2,h3,h4'));

    for (let i: number = 0; i < headings.length; i += 1) {
      const heading: HTMLElement = headings[i];
      const text: string = (heading.textContent || '').replace(/^#/, '').trim();
      if (!/^(table of )?contents$/i.test(text) && !/^on this page$/i.test(text)) {
        continue;
      }

      const next: Element | null = heading.nextElementSibling;
      if (next && (next.tagName === 'UL' || next.tagName === 'OL')
        && this.isLinkList(next as HTMLElement)) {
        return { list: next as HTMLElement, heading: heading };
      }
    }

    return undefined;
  }

  /* Every link has to point inside this document, or it is a list of links
     that happens to sit under an unlucky heading. */
  private isLinkList(list: HTMLElement): boolean {
    const links: HTMLAnchorElement[] = Array.prototype.slice.call(list.querySelectorAll('a'));
    if (!links.length) {
      return false;
    }
    return links.every((link: HTMLAnchorElement) =>
      (link.getAttribute('href') || '').charAt(0) === '#');
  }

  private tocEntriesFrom(list: HTMLElement, container: HTMLElement): ITocEntry[] {
    const links: HTMLAnchorElement[] = Array.prototype.slice.call(list.querySelectorAll('a'));

    return links
      .map((link: HTMLAnchorElement) => {
        const id: string = (link.getAttribute('href') || '').slice(1);
        /* Nesting is how an authored contents shows depth. */
        let level: number = 1;
        let node: HTMLElement | null = link.parentElement;
        while (node && node !== list) {
          if (node.tagName === 'UL' || node.tagName === 'OL') {
            level += 1;
          }
          node = node.parentElement;
        }
        return { id: id, text: (link.textContent || '').trim(), level: level };
      })
      .filter((entry: ITocEntry) => {
        if (!entry.id || !entry.text) {
          return false;
        }
        /* A link to a heading that is not here would scroll nowhere. */
        try {
          return !!container.querySelector(`#${CSS.escape(entry.id)}`);
        } catch {
          return false;
        }
      });
  }

  /** Builds the contents list and scrolls smoothly instead of jumping the page. */
  public buildToc(entries: ITocEntry[], container: HTMLElement): HTMLElement | undefined {
    if (entries.length === 0) {
      return undefined;
    }

    const nav: HTMLElement = document.createElement('nav');
    nav.className = 'strata-toc';
    nav.setAttribute('aria-label', 'Table of contents');

    const baseLevel: number = Math.min.apply(
      null,
      entries.map((entry: ITocEntry) => entry.level)
    );
    const list: HTMLElement = document.createElement('ul');

    entries.forEach((entry: ITocEntry) => {
      const item: HTMLElement = document.createElement('li');
      item.style.paddingLeft = `${(entry.level - baseLevel) * 12}px`;

      const link: HTMLAnchorElement = document.createElement('a');
      link.href = `#${entry.id}`;
      link.textContent = entry.text;
      link.addEventListener('click', (event: Event) => {
        const target: HTMLElement | null = container.querySelector(`#${CSS.escape(entry.id)}`);
        if (target) {
          event.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      item.appendChild(link);
      list.appendChild(item);
    });

    nav.appendChild(list);
    return nav;
  }

  /**
   * Marks the entry for the heading currently being read.
   *
   * Deliberately not an IntersectionObserver keyed on a narrow band: a heading
   * scrolled to the very top - which is exactly what clicking an entry does -
   * sits outside such a band, so nothing at all would be highlighted. This
   * takes the last heading that has passed the reading line, which is well
   * defined at the top of the document, at the bottom, and everywhere between.
   */
  /**
   * How far down the screen a heading has to land to clear whatever is stuck
   * above it.
   *
   * A stylesheet can only guess at this, and the guess was 24px, which is
   * right for a bare page and wrong everywhere else: the documentation site
   * puts a header and a controls bar across the top, and a SharePoint page has
   * a header and a command bar of its own. Clicking a contents entry sent the
   * heading to 24px from the top of the window and the chrome then covered it,
   * which reads as scrolling too far.
   *
   * So it is measured. Anything stuck to the top of the window and wide enough
   * to be a bar across it counts; the contents sidebar does not, because it
   * sits beside the text rather than over it, and neither does a small fixed
   * control like the button back to the top.
   */
  public static chromeAbove(): number {
    const width: number = window.innerWidth;
    const elements: HTMLElement[] = Array.prototype.slice.call(
      document.querySelectorAll('body *')
    );

    let bottom: number = 0;
    elements.forEach((element: HTMLElement) => {
      const style: CSSStyleDeclaration = window.getComputedStyle(element);
      if (style.position !== 'sticky' && style.position !== 'fixed') {
        return;
      }
      const rect: DOMRect = element.getBoundingClientRect();
      /* Across the top of the window rather than beside the text: a bar is
         wide and shallow, which a contents sidebar and a corner button are
         not. */
      const isBar: boolean = rect.width > width * 0.6
        && rect.height < window.innerHeight * 0.4;
      if (!isBar) {
        return;
      }

      if (style.position === 'fixed') {
        if (rect.top <= 1 && rect.bottom > 0) {
          bottom = Math.max(bottom, rect.bottom);
        }
        return;
      }

      /*
       * A sticky bar has to be measured by where it will sit, not where it is.
       * Measured on a page at rest it has not stuck yet and is wherever the
       * document put it, which is why measuring the rectangle found nothing at
       * all and every heading still landed under the chrome. Its own top
       * offset plus its height is where it comes to rest.
       */
      const offset: number = parseFloat(style.top);
      if (!isNaN(offset) && offset >= 0 && offset < window.innerHeight * 0.4) {
        bottom = Math.max(bottom, offset + rect.height);
      }
    });

    return Math.round(bottom);
  }

  /**
   * Publishes that measurement as a custom property, so a heading scrolled to
   * by any route clears the chrome: the contents, a link from another page, or
   * the browser restoring a fragment on load. A value the stylesheet can read
   * rather than a scroll this code performs, because only one of those covers
   * the cases nobody wrote code for.
   */
  public trackScrollOffset(root: HTMLElement): void {
    this.stopScrollOffset();

    const apply = (): void => {
      const chrome: number = ContentEnhancer.chromeAbove();
      root.style.setProperty('--strata-scroll-offset',
        `${chrome + HEADING_CLEARANCE}px`);
    };

    this.onChromeResize = apply;
    window.addEventListener('resize', this.onChromeResize, { passive: true });
    apply();
  }

  public stopScrollOffset(): void {
    if (this.onChromeResize) {
      window.removeEventListener('resize', this.onChromeResize);
      this.onChromeResize = undefined;
    }
  }

  public trackActiveHeading(content: HTMLElement, nav: HTMLElement): void {
    this.stopTracking();

    const links: HTMLAnchorElement[] = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
    const tracked: { link: HTMLAnchorElement; heading: HTMLElement }[] = [];

    links.forEach((link: HTMLAnchorElement) => {
      const id: string = decodeURIComponent(link.getAttribute('href') || '').substring(1);
      const heading: HTMLElement | null = id ? content.querySelector(`#${CSS.escape(id)}`) : null;
      if (heading) {
        tracked.push({ link: link, heading: heading });
      }
    });

    if (tracked.length === 0) {
      return;
    }

    const mark = (active: { link: HTMLAnchorElement }): void => {
      tracked.forEach((entry) => entry.link.removeAttribute('aria-current'));
      active.link.setAttribute('aria-current', 'true');
    };

    const update = (): void => {
      /*
       * At the end of the document, whatever is last is what is being read.
       *
       * A heading is marked when it passes the reading line, which needs a
       * screenful of document below it to get there. The last few headings
       * never have one: the page runs out first, so they could not be marked
       * by scrolling and the highlight stuck several entries short of the end.
       */
      if (atBottom()) {
        mark(tracked[tracked.length - 1]);
        return;
      }

      let active: { link: HTMLAnchorElement; heading: HTMLElement } = tracked[0];
      tracked.forEach((entry) => {
        if (entry.heading.getBoundingClientRect().top <= ACTIVE_HEADING_LINE) {
          active = entry;
        }
      });

      mark(active);
    };

    /* Whichever thing actually scrolls: the window, or the inner container a
       SharePoint page scrolls under its own chrome. */
    const atBottom = (): boolean => {
      const scroller: HTMLElement | undefined = ContentEnhancer.scroller(content);
      const position: number = scroller ? scroller.scrollTop : window.scrollY;
      const visible: number = scroller ? scroller.clientHeight : window.innerHeight;
      const total: number = scroller
        ? scroller.scrollHeight : document.documentElement.scrollHeight;
      return position + visible >= total - BOTTOM_SLACK;
    };

    /*
     * Marked on the way in as well as by the scroll that follows.
     *
     * Near the end of a document there may be no scroll left to make, so
     * clicking one of the last entries moved nothing and changed nothing:
     * from the reader's side the contents simply ignored them.
     */
    tracked.forEach((entry) => {
      entry.link.addEventListener('click', () => mark(entry));
    });

    /*
     * How tall the sidebar may be, measured rather than assumed.
     *
     * The stylesheet can only guess: it caps at the viewport height less a
     * fixed allowance for whatever sits above the web part. On a SharePoint
     * page that allowance is wrong, because the page scrolls an inner
     * container under a header and a command bar of its own, so the contents
     * were cut off well short of the space actually available.
     *
     * The sidebar's own position tells the truth. Whatever chrome is above it,
     * the room it has is the distance from its top edge to the bottom of the
     * window, and that is true while it is sticky and while it is not.
     */
    const sidebar: HTMLElement | null = nav.closest('.strata-toc-sidebar');
    const fitSidebar = (): void => {
      if (!sidebar) {
        return;
      }
      const top: number = sidebar.getBoundingClientRect().top;
      const room: number = ContentEnhancer.visibleBottom(sidebar) - top - SIDEBAR_BOTTOM_GAP;
      sidebar.style.maxHeight = `${Math.max(SIDEBAR_MIN_HEIGHT, Math.round(room))}px`;
    };

    this.onScroll = (): void => {
      if (this.scrollFrame !== undefined) {
        return;
      }
      this.scrollFrame = window.requestAnimationFrame(() => {
        this.scrollFrame = undefined;
        fitSidebar();
        update();
      });
    };

    // Captured on the document: a SharePoint page scrolls an inner container,
    // not the window, and scroll events do not bubble.
    document.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
    fitSidebar();
    update();
  }

  public stopTracking(): void {
    if (this.onScroll) {
      document.removeEventListener('scroll', this.onScroll, true);
      window.removeEventListener('resize', this.onScroll);
      this.onScroll = undefined;
    }
    if (this.scrollFrame !== undefined) {
      window.cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = undefined;
    }
  }

  /**
   * Gives images their caption and, optionally, a full size view.
   *
   * Both are done here rather than in the markdown pipeline because both turn
   * on where an image sits: a caption only makes sense for an image that is a
   * block of its own, and an image inside a link has somewhere to go already.
   * Those are questions about the rendered document, not about the tokens.
   */
  public enhanceImages(container: HTMLElement, allowZoom: boolean): void {
    this.closeZoom();

    const images: HTMLImageElement[] =
      Array.prototype.slice.call(container.querySelectorAll('img'));

    images.forEach((image: HTMLImageElement) => {
      this.captionImage(image);
      this.markBlockImage(image);
      if (allowZoom) {
        this.makeZoomable(image);
      }
    });
  }

  /*
   * Marks the block an image sits in, so the page's alignment setting has
   * something to align.
   *
   * The class goes on the container rather than the image, because aligning is
   * text-align on the block: putting it on the image would need :has() to
   * reach the parent, and the browsers this has to run in are not a set worth
   * guessing at.
   *
   * An image inside a sentence is left out. It sits on the baseline of the
   * text around it, and centring the paragraph to move the picture would take
   * the sentence with it.
   */
  private markBlockImage(image: HTMLImageElement): void {
    const block: HTMLElement | null = image.closest('figure') || image.parentElement;
    if (!block) {
      return;
    }
    if (block.tagName === 'P' && (block.textContent || '').trim().length > 0) {
      return;
    }
    if (block.tagName !== 'P' && block.tagName !== 'FIGURE') {
      return;
    }

    block.classList.add('strata-image-block');

    /* A document can say where one picture goes, written the way every other
       class is: ![alt](x.png){.center}. Moved to the block for the same reason
       the marker is. */
    ['left', 'center', 'centre', 'right'].forEach((side: string) => {
      if (image.classList.contains(side)) {
        image.classList.remove(side);
        block.setAttribute('data-strata-align', side === 'centre' ? 'center' : side);
      }
    });
  }

  /*
   * An image's title is markdown's caption, and until now it was only a
   * tooltip: invisible on a touch screen, and gone from a printed page.
   *
   * Only an image that is a paragraph on its own becomes a figure. The other
   * kind sits mid-sentence, where lifting it out into a block would break the
   * sentence around it.
   */
  private captionImage(image: HTMLImageElement): void {
    const title: string = image.getAttribute('title') || '';
    const paragraph: HTMLElement | null = image.parentElement;
    if (!title || !paragraph || paragraph.tagName !== 'P' || !paragraph.parentNode) {
      return;
    }
    /* Text beside it means the image is part of a sentence. */
    if ((paragraph.textContent || '').trim().length > 0) {
      return;
    }
    if (paragraph.querySelectorAll('img').length !== 1) {
      return;
    }

    const figure: HTMLElement = document.createElement('figure');
    figure.className = 'strata-figure';
    /* Moved wholesale, so an image wrapped in a link keeps its link. */
    while (paragraph.firstChild) {
      figure.appendChild(paragraph.firstChild);
    }

    const caption: HTMLElement = document.createElement('figcaption');
    caption.textContent = title;
    figure.appendChild(caption);

    /* The caption says it now, so the tooltip would only repeat it. */
    image.removeAttribute('title');
    paragraph.parentNode.insertBefore(figure, paragraph);
    paragraph.remove();
  }

  private makeZoomable(image: HTMLImageElement): void {
    /* A linked image already does something when clicked. */
    if (image.closest('a')) {
      return;
    }

    image.classList.add('strata-zoomable');
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label',
      `${image.getAttribute('alt') || 'Image'}: select to see it full size`);

    const open: () => void = () => this.openZoom(image, ContentEnhancer.fullImage(image),
      image.getAttribute('alt') || 'Image');
    image.addEventListener('click', open);
    image.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  }

  /** The same picture again, at whatever size the window allows. */
  private static fullImage(image: HTMLImageElement): HTMLImageElement {
    const full: HTMLImageElement = document.createElement('img');
    full.src = image.currentSrc || image.src;
    full.alt = image.getAttribute('alt') || '';
    return full;
  }

  /*
   * The overlay is built inside the themed root rather than on the body, so it
   * is painted from the same --strata-* values as the document behind it and
   * follows a reader's theme choice without being told about it.
   *
   * What it shows is passed in: a picture at its own size, or a diagram scaled
   * up. Everything else about it - dismissing, the keyboard, where focus goes
   * afterwards - is the same either way, which is the point of it taking a
   * node rather than an image.
   */
  private openZoom(opener: HTMLElement, content: HTMLElement, label: string): void {
    this.closeZoom();

    const root: HTMLElement = (opener.closest('.strata-root') as HTMLElement) || document.body;

    const overlay: HTMLElement = document.createElement('div');
    overlay.className = 'strata-zoom';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', label);
    overlay.appendChild(content);

    const close: HTMLButtonElement = document.createElement('button');
    close.type = 'button';
    close.className = 'strata-zoom-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u2715';
    overlay.appendChild(close);

    /* Anywhere outside what was opened closes it, which is what people try
       first. Measured by containment rather than by identity, because a
       diagram is a panel with a drawing inside it. */
    overlay.addEventListener('click', (event: MouseEvent) => {
      if (!content.contains(event.target as Node)) {
        this.closeZoom();
      }
    });

    this.zoomKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        this.closeZoom();
      }
    };
    document.addEventListener('keydown', this.zoomKeydown);

    this.zoomOpener = opener;
    this.zoomOverlay = overlay;
    root.appendChild(overlay);
    close.focus();
  }

  private closeZoom(): void {
    if (this.zoomKeydown) {
      document.removeEventListener('keydown', this.zoomKeydown);
      this.zoomKeydown = undefined;
    }
    if (this.zoomOverlay) {
      this.zoomOverlay.remove();
      this.zoomOverlay = undefined;
    }
    /* Back to what was opened, so the keyboard does not lose its place in the
       document. */
    if (this.zoomOpener) {
      this.zoomOpener.focus();
      this.zoomOpener = undefined;
    }
  }

  /**
   * How long the document takes to read, from the text a person actually
   * reads: code is not read at prose speed, and a diagram's source is not read
   * at all. Both are taken out before counting.
   *
   * Returns an empty string for a document with nothing to read, so the
   * toolbar shows nothing rather than "1 min read" over an empty page.
   */
  public readingTime(article: HTMLElement): string {
    const copy: HTMLElement = article.cloneNode(true) as HTMLElement;
    const skip: HTMLElement[] = Array.prototype.slice.call(
      copy.querySelectorAll('pre, code, .strata-mermaid, .strata-toc, figcaption')
    );
    skip.forEach((node: HTMLElement) => node.remove());
    return readingTimeLabel(countWords(copy.textContent || ''));
  }

  /**
   * A button back to the top of the document, once there is a top to go back
   * to.
   *
   * It scrolls the web part into view rather than the page to its origin,
   * because the web part is a section of somebody's page and may not be the
   * first thing on it; scrolling to the top of the document is what "back to
   * top" means from inside one. Using scrollIntoView also means the right
   * thing moves whether the window scrolls or, as on a SharePoint page, an
   * inner container does.
   */
  public attachBackToTop(root: HTMLElement, position: BackToTop): void {
    this.stopBackToTop();
    if (position === 'off') {
      return;
    }

    const button: HTMLButtonElement = document.createElement('button');
    button.type = 'button';
    button.className = 'strata-to-top';
    button.setAttribute('data-strata-side', position);
    button.setAttribute('aria-label', 'Back to the top of the document');
    button.title = 'Back to the top';
    button.textContent = '\u2191';
    /* Out of the tab order and out of the reading order until it can do
       something, so a keyboard lands on it only when it is on screen. */
    button.hidden = true;

    button.addEventListener('click', () => {
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      /* Sending focus back to where reading restarts, rather than leaving it on
         a button that is about to disappear. */
      const first: HTMLElement | null = root.querySelector('.strata-content');
      if (first) {
        first.setAttribute('tabindex', '-1');
        first.focus({ preventScroll: true });
      }
    });

    root.appendChild(button);
    this.backToTop = button;

    const update = (): void => {
      /* Above the top of the screen by more than a screenful of reading is
         far enough that getting back matters. */
      const above: number = -root.getBoundingClientRect().top;
      button.hidden = above < BACK_TO_TOP_AFTER;
    };

    this.onBackToTopScroll = (): void => {
      if (this.backToTopFrame !== undefined) {
        return;
      }
      this.backToTopFrame = window.requestAnimationFrame(() => {
        this.backToTopFrame = undefined;
        update();
      });
    };

    document.addEventListener('scroll', this.onBackToTopScroll, { capture: true, passive: true });
    window.addEventListener('resize', this.onBackToTopScroll, { passive: true });
    update();
  }

  public stopBackToTop(): void {
    if (this.onBackToTopScroll) {
      document.removeEventListener('scroll', this.onBackToTopScroll, true);
      window.removeEventListener('resize', this.onBackToTopScroll);
      this.onBackToTopScroll = undefined;
    }
    if (this.backToTopFrame !== undefined) {
      window.cancelAnimationFrame(this.backToTopFrame);
      this.backToTopFrame = undefined;
    }
    if (this.backToTop) {
      this.backToTop.remove();
      this.backToTop = undefined;
    }
  }

  /**
   * Makes a long table readable: its header stays in view, and a reader can
   * sort by a column.
   *
   * The header is a plain sticky one, which has a condition nothing in the
   * stylesheet can see. A table is wrapped in a box that scrolls sideways so a
   * wide one does not stretch the page, and a scroll box is what a sticky cell
   * sticks to - so inside it the header sticks to a box that never scrolls
   * downwards, which is to say it never sticks at all. The box is only needed
   * when the table is actually wider than the column, so each is measured and
   * the ones that fit are let out of it. That is a measurement, so it is redone
   * when the column changes width.
   */
  public enhanceTables(container: HTMLElement, allowSort: boolean): void {
    const wraps: HTMLElement[] = Array.prototype.slice.call(
      container.querySelectorAll('.strata-table-scroll')
    );
    if (wraps.length === 0) {
      return;
    }

    this.stopTableFit();
    const fit: (wrap: HTMLElement) => void = (wrap: HTMLElement) => {
      const table: HTMLTableElement | null = wrap.querySelector(':scope > table');
      if (!table) {
        return;
      }
      /* A pixel of slack: a table that fits exactly can measure a hair wider
         than its box through rounding, and would then be caged for nothing. */
      const fits: boolean = table.scrollWidth <= wrap.clientWidth + 1;
      wrap.classList.toggle('strata-table-scroll--fits', fits);
    };

    wraps.forEach(fit);

    if (typeof ResizeObserver !== 'undefined') {
      this.tableFit = new ResizeObserver((entries: ResizeObserverEntry[]) => {
        entries.forEach((entry: ResizeObserverEntry) => fit(entry.target as HTMLElement));
      });
      wraps.forEach((wrap: HTMLElement) => (this.tableFit as ResizeObserver).observe(wrap));
    }

    if (allowSort) {
      wraps.forEach((wrap: HTMLElement) => {
        const table: HTMLTableElement | null = wrap.querySelector(':scope > table');
        if (table) {
          this.makeSortable(table);
        }
      });
    }
  }

  private stopTableFit(): void {
    if (this.tableFit) {
      this.tableFit.disconnect();
      this.tableFit = undefined;
    }
  }

  /*
   * A table can be sorted when its shape survives its rows being reordered.
   * A merged cell does not: a row that spans two of them means something about
   * its neighbours, and moving it away from them turns a table into a mess. So
   * a table holding one is left exactly as the document wrote it.
   */
  private makeSortable(table: HTMLTableElement): void {
    const head: HTMLTableRowElement | null = table.querySelector(':scope > thead > tr');
    const body: HTMLTableSectionElement | null = table.querySelector(':scope > tbody');
    if (!head || !body || body.rows.length < 2) {
      return;
    }
    if (table.querySelector('[colspan], [rowspan]')) {
      return;
    }

    const headers: HTMLTableCellElement[] = Array.prototype.slice.call(head.cells);
    const rows: HTMLTableRowElement[] = Array.prototype.slice.call(body.rows);
    if (headers.length === 0
      || rows.some((row: HTMLTableRowElement) => row.cells.length !== headers.length)) {
      return;
    }

    table.classList.add('strata-table-sortable');

    headers.forEach((cell: HTMLTableCellElement, column: number) => {
      /* The whole cell is the target, but a button inside it is what carries
         the name, the focus and the pressing: a th with a click handler is not
         a control to anything that is not a mouse. */
      const button: HTMLButtonElement = document.createElement('button');
      button.type = 'button';
      button.className = 'strata-th-sort';
      while (cell.firstChild) {
        button.appendChild(cell.firstChild);
      }

      const arrow: HTMLElement = document.createElement('span');
      arrow.className = 'strata-th-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      button.appendChild(arrow);

      cell.appendChild(button);
      cell.setAttribute('aria-sort', 'none');
      button.addEventListener('click', () => this.sortBy(table, headers, rows, column));
    });
  }

  /*
   * Three states rather than two: up, down, and back to the order the document
   * wrote. A reader who sorted a table of steps by name has no other way back
   * to the steps in order, short of reloading the page.
   */
  private sortBy(
    table: HTMLTableElement,
    headers: HTMLTableCellElement[],
    rows: HTMLTableRowElement[],
    column: number
  ): void {
    const was: string = headers[column].getAttribute('aria-sort') || 'none';
    const now: string = was === 'none' ? 'ascending' : (was === 'ascending' ? 'descending' : 'none');

    headers.forEach((cell: HTMLTableCellElement, index: number) => {
      cell.setAttribute('aria-sort', index === column ? now : 'none');
    });

    const body: HTMLTableSectionElement = rows[0].parentElement as HTMLTableSectionElement;
    if (now === 'none') {
      rows.forEach((row: HTMLTableRowElement) => body.appendChild(row));
      return;
    }

    const values: string[] = rows.map(
      (row: HTMLTableRowElement) => (row.cells[column].textContent || '').trim()
    );
    const kind: ColumnKind = columnKind(values);
    const sortable: ISortableRow[] = values.map((value: string, index: number) => ({
      value: value,
      index: index
    }));

    sortedOrder(sortable, kind, now === 'descending')
      .forEach((index: number) => body.appendChild(rows[index]));
  }

  /**
   * Marks wiki links whose target is not in the library, the way Obsidian
   * marks an unresolved link.
   *
   * Done after rendering rather than during it, because it needs SharePoint
   * and rendering is a string going in and a string coming out. Links are
   * grouped by folder first, so a document pointing at its neighbours costs
   * one listing rather than one request per link.
   *
   * A folder that cannot be read leaves its links alone. Not knowing whether
   * a page is there is different from knowing it is not, and a reader without
   * access to a folder must not be told the author's links are broken.
   */
  public async validateWikiLinks(
    container: HTMLElement,
    listFolder: (folder: string) => Promise<string[] | undefined>
  ): Promise<void> {
    const links: HTMLAnchorElement[] =
      Array.prototype.slice.call(container.querySelectorAll('a.strata-wiki-link'));
    /* A link into this document points at a heading, which is already either
       there or not without asking anybody. */
    const outward: HTMLAnchorElement[] = links.filter((link: HTMLAnchorElement) =>
      folderOf(link.getAttribute('href') || '') !== '');
    if (!outward.length) {
      return;
    }

    const folders: string[] = Object.keys(
      byFolder(outward.map((link: HTMLAnchorElement) => link.getAttribute('href') || ''))
    );

    const listings: { [folder: string]: string[] | undefined } = {};
    await Promise.all(folders.map((folder: string) =>
      listFolder(folder).then((names: string[] | undefined) => {
        listings[folder] = names;
      })
    ));

    outward.forEach((link: HTMLAnchorElement) => {
      const href: string = link.getAttribute('href') || '';
      const names: string[] | undefined = listings[folderOf(href)];
      if (!names) {
        return;
      }
      const wanted: string = fileOf(href).toLowerCase();
      /* SharePoint file names are not case sensitive, so neither is this. */
      if (names.some((name: string) => name.toLowerCase() === wanted)) {
        return;
      }
      link.classList.add('strata-wiki-link--missing');
      /* Worded for what was actually established: the file was not in the
         listing, which covers both not being there and not being visible to
         this reader. */
      link.title = `${fileOf(href)} was not found in this library`;

      /* The styling says it to anyone who can see it; this says it to anyone
         who cannot. Inside the link, so it is read out with the link text. */
      if (!link.querySelector('.strata-missing-note')) {
        const note: HTMLElement = document.createElement('span');
        note.className = 'strata-missing-note';
        note.textContent = ' (page not found)';
        link.appendChild(note);
      }
    });
  }

  public dispose(): void {
    this.copyResetTimers.forEach((timer: number) => window.clearTimeout(timer));
    this.copyResetTimers = [];
    this.stopTracking();
    this.stopFilling();
    this.closeZoom();
    this.stopBackToTop();
    this.stopScrollOffset();
    this.stopTableFit();
  }
}
