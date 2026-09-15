/**
 * .SYNOPSIS
 * The overlay that shows one thing at the size of the window.
 *
 * .DESCRIPTION
 * It takes a node and a label rather than an image, because a picture and a
 * diagram want to be shown differently and dismissed identically. Everything
 * here is the identical half: the ground behind it, Escape, a click outside,
 * and giving focus back to whatever was opened.
 *
 * It is built inside the themed root rather than on the body, so it is painted
 * from the same --strata-* values as the document behind it and follows a
 * reader's theme choice without being told about it.
 *
 * .USAGE
 *   import { ZoomOverlay } from './utils/zoomOverlay';
 *
 *   const zoom: ZoomOverlay = new ZoomOverlay();
 *   zoom.open(image, fullSizeCopy, 'Diagram of the pipeline');
 *   zoom.close();
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

export class ZoomOverlay {
  private overlay: HTMLElement | undefined;
  private opener: HTMLElement | undefined;
  private onKeydown: ((event: KeyboardEvent) => void) | undefined;

  public open(opener: HTMLElement, content: HTMLElement, label: string): void {
    this.close();

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
    close.textContent = '✕';
    overlay.appendChild(close);

    /* Anywhere outside what was opened closes it, which is what people try
       first. Measured by containment rather than by identity, because a
       diagram is a panel with a drawing inside it. */
    overlay.addEventListener('click', (event: MouseEvent) => {
      if (!content.contains(event.target as Node)) {
        this.close();
      }
    });

    this.onKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this.onKeydown);

    this.opener = opener;
    this.overlay = overlay;
    root.appendChild(overlay);
    close.focus();
  }

  public close(): void {
    if (this.onKeydown) {
      document.removeEventListener('keydown', this.onKeydown);
      this.onKeydown = undefined;
    }
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = undefined;
    }
    /* Back to what was opened, so the keyboard does not lose its place in the
       document. */
    if (this.opener) {
      this.opener.focus();
      this.opener = undefined;
    }
  }
}
