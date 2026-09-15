/**
 * .SYNOPSIS
 * The table of contents: where its entries come from, what it is built into,
 * and which one is being read.
 *
 * .USAGE
 *   import { collectHeadings, adoptAuthoredToc, buildToc, HeadingTracker } from './utils/contents';
 *
 *   // A contents the document wrote for itself wins over one built from headings.
 *   const entries: ITocEntry[] = adoptAuthoredToc(article) || collectHeadings(article, 3);
 *   const nav: HTMLElement | undefined = buildToc(entries, article);
 *
 *   const tracker: HeadingTracker = new HeadingTracker();
 *   tracker.track(article, nav);
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  scrolling.ts
 */

import { scroller, visibleBottom } from './scrolling';

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

/* Close enough to the end to call it the end. Sub-pixel scroll positions and
   zoom mean the arithmetic rarely lands exactly on the bottom. */
const BOTTOM_SLACK: number = 4;

/**
 * Reads headings out of the rendered content. Built from the DOM rather than
 * from a `[[toc]]` marker so the sidebar works for any document.
 */
export function collectHeadings(container: HTMLElement, maxLevel: number): ITocEntry[] {
  const selector: string = ['h1', 'h2', 'h3', 'h4']
    .slice(0, Math.max(1, Math.min(4, maxLevel)))
    .join(',');
  const headings: HTMLElement[] =
    Array.prototype.slice.call(container.querySelectorAll(selector));

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
 * A document can say what its contents are, either with `[[toc]]` or by hand
 * as a list of links under a Contents heading. A sidebar that ignored both and
 * generated its own from the headings left a document that had gone to the
 * trouble showing two tables of contents: its own, in the text, and ours
 * beside it.
 *
 * An authored one wins, because it is a decision. A hand-written list is often
 * a deliberate subset, leaving out the headings that are not worth navigating
 * to, and `[[toc]]` is at least an explicit request.
 *
 * The entries are handed back for buildToc rather than the markup being moved,
 * so an adopted contents gets the same indentation, smooth scrolling and
 * reading position tracking as a generated one.
 *
 * Returns undefined when the document has no contents of its own, which is the
 * caller's signal to generate from the headings instead.
 */
export function adoptAuthoredToc(container: HTMLElement): ITocEntry[] | undefined {
  const authored: { list: HTMLElement; heading?: HTMLElement } | undefined =
    findAuthoredToc(container);
  if (!authored) {
    return undefined;
  }

  const entries: ITocEntry[] = tocEntriesFrom(authored.list, container);
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

function findAuthoredToc(container: HTMLElement):
  { list: HTMLElement; heading?: HTMLElement } | undefined {
  /* What [[toc]] leaves behind. */
  const generated: HTMLElement | null = container.querySelector('.strata-toc');
  if (generated) {
    return { list: generated };
  }

  /* A list of in-page links under a heading that says what it is. */
  const headings: HTMLElement[] =
    Array.prototype.slice.call(container.querySelectorAll('h1,h2,h3,h4'));

  for (let index: number = 0; index < headings.length; index += 1) {
    const heading: HTMLElement = headings[index];
    const text: string = (heading.textContent || '').replace(/^#/, '').trim();
    if (!/^(table of )?contents$/i.test(text) && !/^on this page$/i.test(text)) {
      continue;
    }

    const next: Element | null = heading.nextElementSibling;
    if (next && (next.tagName === 'UL' || next.tagName === 'OL')
      && isLinkList(next as HTMLElement)) {
      return { list: next as HTMLElement, heading: heading };
    }
  }

  return undefined;
}

/* Every link has to point inside this document, or it is a list of links that
   happens to sit under an unlucky heading. */
function isLinkList(list: HTMLElement): boolean {
  const links: HTMLAnchorElement[] = Array.prototype.slice.call(list.querySelectorAll('a'));
  if (!links.length) {
    return false;
  }
  return links.every((link: HTMLAnchorElement) =>
    (link.getAttribute('href') || '').charAt(0) === '#');
}

function tocEntriesFrom(list: HTMLElement, container: HTMLElement): ITocEntry[] {
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
export function buildToc(entries: ITocEntry[], container: HTMLElement): HTMLElement | undefined {
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
 * Marks the entry for the heading currently being read, and keeps the sidebar
 * to the height it actually has.
 *
 * Deliberately not an IntersectionObserver keyed on a narrow band: a heading
 * scrolled to the very top - which is exactly what clicking an entry does -
 * sits outside such a band, so nothing at all would be highlighted. This takes
 * the last heading that has passed the reading line, which is well defined at
 * the top of the document, at the bottom, and everywhere between.
 */
export class HeadingTracker {
  private onScroll: (() => void) | undefined;
  private frame: number | undefined;

  public track(content: HTMLElement, nav: HTMLElement): void {
    this.stop();

    const links: HTMLAnchorElement[] =
      Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
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

    /* Whichever thing actually scrolls: the window, or the inner container a
       SharePoint page scrolls under its own chrome. */
    const atBottom = (): boolean => {
      const container: HTMLElement | undefined = scroller(content);
      const position: number = container ? container.scrollTop : window.scrollY;
      const visible: number = container ? container.clientHeight : window.innerHeight;
      const total: number = container
        ? container.scrollHeight : document.documentElement.scrollHeight;
      return position + visible >= total - BOTTOM_SLACK;
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

    /*
     * Marked on the way in as well as by the scroll that follows.
     *
     * Near the end of a document there may be no scroll left to make, so
     * clicking one of the last entries moved nothing and changed nothing: from
     * the reader's side the contents simply ignored them.
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
      const room: number = visibleBottom(sidebar) - top - SIDEBAR_BOTTOM_GAP;
      sidebar.style.maxHeight = `${Math.max(SIDEBAR_MIN_HEIGHT, Math.round(room))}px`;
    };

    this.onScroll = (): void => {
      if (this.frame !== undefined) {
        return;
      }
      this.frame = window.requestAnimationFrame(() => {
        this.frame = undefined;
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

  public stop(): void {
    if (this.onScroll) {
      document.removeEventListener('scroll', this.onScroll, true);
      window.removeEventListener('resize', this.onScroll);
      this.onScroll = undefined;
    }
    if (this.frame !== undefined) {
      window.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
  }
}
