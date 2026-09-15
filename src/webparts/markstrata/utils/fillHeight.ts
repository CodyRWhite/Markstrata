/**
 * .SYNOPSIS
 * "Fill the available height": gives the web part at least the room below
 * where it starts, so a short document does not stop halfway down and leave
 * the page looking broken.
 *
 * .DESCRIPTION
 * This is what the setting costs. The room is the distance from where the web
 * part starts to the bottom of whatever is scrolling, and neither of those is
 * a number a stylesheet can reach. `100vh` is the tempting shortcut and it is
 * wrong on a SharePoint page, which scrolls an inner container under a header
 * and a command bar rather than the window.
 *
 * .USAGE
 *   import { HeightFiller } from './utils/fillHeight';
 *
 *   const height: HeightFiller = new HeightFiller();
 *   height.fill(webPartRoot);   // min-height = the room below, re-measured on resize
 *   height.stop();
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  scrolling.ts
 */

import { roomBelow } from './scrolling';

/* Below this there is not enough room below the web part to be worth filling,
   and forcing it would only push the document off the bottom of the screen. */
const FILL_MIN_HEIGHT: number = 200;

export class HeightFiller {
  private onResize: (() => void) | undefined;
  private frame: number | undefined;

  /**
   * A web part far enough down a long page has no room below it at all, and
   * gets nothing: filling is for the page whose content this is, not for
   * stretching a part that was placed under something else.
   */
  public fill(root: HTMLElement): void {
    this.stop();

    const fitToRoomBelow = (): void => {
      const room: number = Math.round(roomBelow(root));
      if (room < FILL_MIN_HEIGHT) {
        root.style.removeProperty('min-height');
        return;
      }
      root.style.minHeight = `${room}px`;
    };

    this.onResize = (): void => {
      if (this.frame !== undefined) {
        return;
      }
      this.frame = window.requestAnimationFrame(() => {
        this.frame = undefined;
        fitToRoomBelow();
      });
    };

    window.addEventListener('resize', this.onResize, { passive: true });
    fitToRoomBelow();
  }

  public stop(): void {
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
      this.onResize = undefined;
    }
    if (this.frame !== undefined) {
      window.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
  }
}
