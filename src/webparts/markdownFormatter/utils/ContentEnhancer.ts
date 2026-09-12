/**
 * Post-render DOM work: copy buttons, safe external links, and the sidebar
 * table of contents.
 */

export interface ITocEntry {
  id: string;
  text: string;
  level: number;
}

const CHECK_ICON: string =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m20 6-11 11-5-5"/></svg>';

export class ContentEnhancer {
  private copyResetTimers: number[] = [];
  private headingObserver: IntersectionObserver | undefined;

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
   * Marks the entry for the heading currently in view. Uses an observer rather
   * than a scroll handler so it costs nothing while the reader is still.
   */
  public trackActiveHeading(content: HTMLElement, nav: HTMLElement): void {
    this.stopTracking();

    const links: HTMLAnchorElement[] = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
    if (links.length === 0 || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const byId: { [id: string]: HTMLAnchorElement } = {};
    links.forEach((link: HTMLAnchorElement) => {
      byId[decodeURIComponent(link.getAttribute('href') || '').substring(1)] = link;
    });

    const visible: string[] = [];

    this.headingObserver = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        entries.forEach((entry: IntersectionObserverEntry) => {
          const id: string = (entry.target as HTMLElement).id;
          const index: number = visible.indexOf(id);
          if (entry.isIntersecting && index === -1) {
            visible.push(id);
          } else if (!entry.isIntersecting && index !== -1) {
            visible.splice(index, 1);
          }
        });

        links.forEach((link: HTMLAnchorElement) => link.removeAttribute('aria-current'));

        // Highlight the topmost heading that is on screen.
        const first: HTMLAnchorElement | undefined = Object.keys(byId)
          .filter((id: string) => visible.indexOf(id) !== -1)
          .map((id: string) => byId[id])[0];
        if (first) {
          first.setAttribute('aria-current', 'true');
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );

    Object.keys(byId).forEach((id: string) => {
      const heading: HTMLElement | null = content.querySelector(`#${CSS.escape(id)}`);
      if (heading && this.headingObserver) {
        this.headingObserver.observe(heading);
      }
    });
  }

  public stopTracking(): void {
    if (this.headingObserver) {
      this.headingObserver.disconnect();
      this.headingObserver = undefined;
    }
  }

  public dispose(): void {
    this.copyResetTimers.forEach((timer: number) => window.clearTimeout(timer));
    this.copyResetTimers = [];
    this.stopTracking();
  }
}
