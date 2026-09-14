/**
 * Post-render DOM work: copy buttons, safe external links, and the sidebar
 * table of contents.
 */

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

const CHECK_ICON: string =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m20 6-11 11-5-5"/></svg>';

const IMAGE_ICON: string =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<rect x="3" y="4" width="18" height="14" rx="2"/>'
  + '<circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5-9 8"/></svg>';

/* Drawn at twice the diagram's size, so the copy is still sharp when it is
   pasted into a deck or a document and scaled back up. */
const DIAGRAM_COPY_SCALE: number = 2;

export class ContentEnhancer {
  private copyResetTimers: number[] = [];
  private onScroll: (() => void) | undefined;
  private scrollFrame: number | undefined;
  private zoomOverlay: HTMLElement | undefined;
  private zoomOpener: HTMLImageElement | undefined;
  private zoomKeydown: ((event: KeyboardEvent) => void) | undefined;
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
  public attachDiagramCopyButtons(container: HTMLElement): void {
    const hosts: HTMLElement[] = Array.prototype.slice.call(
      container.querySelectorAll('.strata-mermaid')
    );

    hosts.forEach((host: HTMLElement) => {
      /* The host is rebuilt whenever the diagram re-renders, so an old button
         is stale rather than already wired. */
      const existing: HTMLElement | null = host.querySelector('.strata-diagram-copy');
      if (existing && existing.parentElement) {
        existing.parentElement.removeChild(existing);
      }
      if (!host.querySelector('svg')) {
        return;
      }

      const button: HTMLButtonElement = document.createElement('button');
      button.type = 'button';
      button.className = 'strata-code-btn strata-diagram-copy';
      button.setAttribute('aria-label', 'Copy this diagram as an image');
      button.innerHTML = IMAGE_ICON + '<span class="strata-code-btn-label">Copy</span>';
      button.addEventListener('click', (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.copyDiagram(host, button);
      });
      host.appendChild(button);
    });
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
    const svg: SVGSVGElement | null = host.querySelector('svg');
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

    const update = (): void => {
      let active: { link: HTMLAnchorElement; heading: HTMLElement } = tracked[0];
      tracked.forEach((entry) => {
        if (entry.heading.getBoundingClientRect().top <= ACTIVE_HEADING_LINE) {
          active = entry;
        }
      });

      tracked.forEach((entry) => entry.link.removeAttribute('aria-current'));
      active.link.setAttribute('aria-current', 'true');
    };

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
      if (allowZoom) {
        this.makeZoomable(image);
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

    image.addEventListener('click', () => this.openZoom(image));
    image.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.openZoom(image);
      }
    });
  }

  /*
   * The overlay is built inside the themed root rather than on the body, so it
   * is painted from the same --strata-* values as the document behind it and
   * follows a reader's theme choice without being told about it.
   */
  private openZoom(image: HTMLImageElement): void {
    this.closeZoom();

    const root: HTMLElement = (image.closest('.strata-root') as HTMLElement) || document.body;

    const overlay: HTMLElement = document.createElement('div');
    overlay.className = 'strata-zoom';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', image.getAttribute('alt') || 'Image');

    const full: HTMLImageElement = document.createElement('img');
    full.src = image.currentSrc || image.src;
    full.alt = image.getAttribute('alt') || '';
    overlay.appendChild(full);

    const close: HTMLButtonElement = document.createElement('button');
    close.type = 'button';
    close.className = 'strata-zoom-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u2715';
    overlay.appendChild(close);

    /* Anywhere outside the picture closes it, which is what people try first. */
    overlay.addEventListener('click', (event: MouseEvent) => {
      if (event.target !== full) {
        this.closeZoom();
      }
    });

    this.zoomKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        this.closeZoom();
      }
    };
    document.addEventListener('keydown', this.zoomKeydown);

    this.zoomOpener = image;
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
    /* Back to the image that was opened, so the keyboard does not lose its
       place in the document. */
    if (this.zoomOpener) {
      this.zoomOpener.focus();
      this.zoomOpener = undefined;
    }
  }

  public dispose(): void {
    this.copyResetTimers.forEach((timer: number) => window.clearTimeout(timer));
    this.copyResetTimers = [];
    this.stopTracking();
    this.stopFilling();
    this.closeZoom();
  }
}
