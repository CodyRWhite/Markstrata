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

    this.onScroll = (): void => {
      if (this.scrollFrame !== undefined) {
        return;
      }
      this.scrollFrame = window.requestAnimationFrame(() => {
        this.scrollFrame = undefined;
        update();
      });
    };

    // Captured on the document: a SharePoint page scrolls an inner container,
    // not the window, and scroll events do not bubble.
    document.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
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

  public dispose(): void {
    this.copyResetTimers.forEach((timer: number) => window.clearTimeout(timer));
    this.copyResetTimers = [];
    this.stopTracking();
  }
}
