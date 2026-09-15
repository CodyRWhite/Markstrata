/**
 * .SYNOPSIS
 * How far down the screen a heading has to land to clear whatever is stuck
 * above it.
 *
 * .DESCRIPTION
 * A stylesheet can only guess at this, and the guess was 24px, which is right
 * for a bare page and wrong everywhere else: the documentation site puts a
 * header and a controls bar across the top, and a SharePoint page has a header
 * and a command bar of its own. Clicking a contents entry sent the heading to
 * 24px from the top of the window and the chrome then covered it, which reads
 * as scrolling too far.
 *
 * .USAGE
 *   import { ScrollOffset, chromeAbove } from './utils/chromeOffset';
 *
 *   const offset: ScrollOffset = new ScrollOffset();
 *   offset.track(webPartRoot);   // sets --strata-scroll-offset on the root
 *   offset.stop();
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

/* Breathing room under whatever is stuck above, so a heading scrolled to sits
   clear of it rather than against it. */
const HEADING_CLEARANCE: number = 16;

/**
 * Every element on the page except the ones inside `ours`.
 *
 * Whole subtrees are refused rather than each element in them being visited
 * and discarded, which is the difference between walking the page and walking
 * the page plus every paragraph, list item, table cell and code line of the
 * document the web part is showing. A long document is most of the page.
 */
function elementsAround(ours: HTMLElement | undefined): HTMLElement[] {
  const walker: TreeWalker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node: Node): number => node === ours
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    }
  );

  const found: HTMLElement[] = [];
  while (walker.nextNode()) {
    found.push(walker.currentNode as HTMLElement);
  }
  return found;
}

/**
 * Measures the chrome. Anything stuck to the top of the window and wide enough
 * to be a bar across it counts; the contents sidebar does not, because it sits
 * beside the text rather than over it, and neither does a small fixed control
 * like the button back to the top.
 *
 * `ours` is the web part's own root, and it is skipped for two reasons. The
 * page's chrome is the page's, by definition - and the web part's own table
 * headers are sticky and are positioned at the very offset being measured, so
 * a wide one is a bar across the page as far as the rule below is concerned,
 * and the offset it would contribute to is its own.
 *
 * Asking an element where it sits means resolving its style, so what this
 * costs is the number of elements it looks at. On a SharePoint page holding a
 * long document, most of them are the document.
 */
export function chromeAbove(ours?: HTMLElement): number {
  const width: number = window.innerWidth;
  const elements: HTMLElement[] = elementsAround(ours);

  let bottom: number = 0;
  elements.forEach((element: HTMLElement) => {
    const style: CSSStyleDeclaration = window.getComputedStyle(element);
    if (style.position !== 'sticky' && style.position !== 'fixed') {
      return;
    }
    const rect: DOMRect = element.getBoundingClientRect();
    /* Across the top of the window rather than beside the text: a bar is wide
       and shallow, which a contents sidebar and a corner button are not. */
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
     * all and every heading still landed under the chrome. Its own top offset
     * plus its height is where it comes to rest.
     */
    const offset: number = parseFloat(style.top);
    if (!isNaN(offset) && offset >= 0 && offset < window.innerHeight * 0.4) {
      bottom = Math.max(bottom, offset + rect.height);
    }
  });

  return Math.round(bottom);
}

/**
 * Publishes that measurement as a custom property, so a heading scrolled to by
 * any route clears the chrome: the contents, a link from another page, or the
 * browser restoring a fragment on load. A value the stylesheet can read rather
 * than a scroll this code performs, because only one of those covers the cases
 * nobody wrote code for.
 */
export class ScrollOffset {
  private onResize: (() => void) | undefined;
  private pending: number | undefined;

  public track(root: HTMLElement): void {
    this.stop();

    const apply = (): void => {
      this.pending = undefined;
      root.style.setProperty('--strata-scroll-offset',
        `${chromeAbove(root) + HEADING_CLEARANCE}px`);
    };

    /*
     * Dragging a window edge raises resize continuously - tens of events
     * between two frames - and measuring on each one measured the same page
     * over and over to produce the same answer, because nothing the browser
     * has not drawn yet can have moved. One measurement per frame is the most
     * that can tell you anything different.
     */
    this.onResize = (): void => {
      if (this.pending !== undefined) {
        return;
      }
      this.pending = window.requestAnimationFrame(apply);
    };

    window.addEventListener('resize', this.onResize, { passive: true });
    apply();
  }

  public stop(): void {
    if (this.pending !== undefined) {
      window.cancelAnimationFrame(this.pending);
      this.pending = undefined;
    }
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
      this.onResize = undefined;
    }
  }
}
