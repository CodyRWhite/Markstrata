/**
 * The button back to the top of the document: where it sits, whether it is
 * there at all, and the button itself.
 */

/**
 * A side rather than a corner, because the corner is decided for it: the
 * button belongs at the bottom of the screen, and the only real question is
 * which side of the reading column it sits beside. Left suits a page whose own
 * chrome lives on the right, and the other way round.
 */
export type BackToTop = 'off' | 'left' | 'right';

/* Roughly a screenful of reading scrolled past, so the button appears when
   getting back has become a journey rather than a flick of the wheel. */
const APPEARS_AFTER: number = 600;

/**
 * A button back to the top of the document, once there is a top to go back to.
 *
 * It scrolls the web part into view rather than the page to its origin,
 * because the web part is a section of somebody's page and may not be the
 * first thing on it; scrolling to the top of the document is what "back to
 * top" means from inside one. Using scrollIntoView also means the right thing
 * moves whether the window scrolls or, as on a SharePoint page, an inner
 * container does.
 */
export class BackToTopButton {
  private button: HTMLElement | undefined;
  private onScroll: (() => void) | undefined;
  private frame: number | undefined;

  public attach(root: HTMLElement, position: BackToTop): void {
    this.stop();
    if (position === 'off') {
      return;
    }

    const button: HTMLButtonElement = document.createElement('button');
    button.type = 'button';
    button.className = 'strata-to-top';
    button.setAttribute('data-strata-side', position);
    button.setAttribute('aria-label', 'Back to the top of the document');
    button.title = 'Back to the top';
    button.textContent = '↑';
    /* Out of the tab order and out of the reading order until it can do
       something, so a keyboard lands on it only when it is on screen. */
    button.hidden = true;

    button.addEventListener('click', () => {
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      /* Sending focus back to where reading restarts, rather than leaving it
         on a button that is about to disappear. */
      const first: HTMLElement | null = root.querySelector('.strata-content');
      if (first) {
        first.setAttribute('tabindex', '-1');
        first.focus({ preventScroll: true });
      }
    });

    root.appendChild(button);
    this.button = button;

    const update = (): void => {
      /* Above the top of the screen by more than a screenful of reading is far
         enough that getting back matters. */
      const above: number = -root.getBoundingClientRect().top;
      button.hidden = above < APPEARS_AFTER;
    };

    this.onScroll = (): void => {
      if (this.frame !== undefined) {
        return;
      }
      this.frame = window.requestAnimationFrame(() => {
        this.frame = undefined;
        update();
      });
    };

    document.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
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
    if (this.button) {
      this.button.remove();
      this.button = undefined;
    }
  }
}
