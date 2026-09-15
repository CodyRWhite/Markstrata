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
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

/* Breathing room under whatever is stuck above, so a heading scrolled to sits
   clear of it rather than against it. */
const HEADING_CLEARANCE: number = 16;

/**
 * Measures the chrome. Anything stuck to the top of the window and wide enough
 * to be a bar across it counts; the contents sidebar does not, because it sits
 * beside the text rather than over it, and neither does a small fixed control
 * like the button back to the top.
 */
export function chromeAbove(): number {
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

  public track(root: HTMLElement): void {
    this.stop();

    const apply = (): void => {
      root.style.setProperty('--strata-scroll-offset',
        `${chromeAbove() + HEADING_CLEARANCE}px`);
    };

    this.onResize = apply;
    window.addEventListener('resize', this.onResize, { passive: true });
    apply();
  }

  public stop(): void {
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
      this.onResize = undefined;
    }
  }
}
