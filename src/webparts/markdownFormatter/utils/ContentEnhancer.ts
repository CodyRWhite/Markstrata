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

export class ContentEnhancer {
  private copyResetTimers: number[] = [];
  private onScroll: (() => void) | undefined;
  private scrollFrame: number | undefined;

  /** Wires every copy button inside `container` exactly once. */
  public attachCopyButtons(container: HTMLElement): void {
    const buttons: HTMLElement[] = Array.prototype.slice.call(container.querySelectorAll('.mdf-code-copy'));

    buttons.forEach((button: HTMLElement) => {
      if (button.getAttribute('data-mdf-wired') === 'true') {
        return;
      }
      button.setAttribute('data-mdf-wired', 'true');

      button.addEventListener('click', (event: Event) => {
        event.preventDefault();
        event.stopPropagation();

        const block: HTMLElement | null = button.closest('.mdf-code') as HTMLElement;
        if (!block) {
          return;
        }

        this.copy(this.readCode(block), button as HTMLButtonElement);
      });
    });
  }

  /**
   * Line numbers are CSS counters, so the text in the DOM is already the plain
   * source - each line element just needs its newline put back.
   */
  private readCode(block: HTMLElement): string {
    const lines: HTMLElement[] = Array.prototype.slice.call(block.querySelectorAll('.mdf-code-line-text'));
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

  private showResult(button: HTMLButtonElement, success: boolean): void {
    const label: HTMLElement | null = button.querySelector('.mdf-code-btn-label');
    const icon: string = button.innerHTML;

    button.setAttribute('data-state', success ? 'done' : 'error');
    if (label) {
      label.textContent = success ? 'Copied' : 'Press Ctrl+C';
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
        const anchor: Element | null = clone.querySelector('.mdf-anchor');
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
    nav.className = 'mdf-toc';
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
