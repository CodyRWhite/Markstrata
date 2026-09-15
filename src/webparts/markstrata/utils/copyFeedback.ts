/**
 * .SYNOPSIS
 * What a copy button says after it has been pressed.
 *
 * .DESCRIPTION
 * Shared by the code blocks and the diagrams, which copy different things in
 * different ways and then need to say the same thing about it. The timers that
 * put the button back are owned here, so nothing is left running when the web
 * part goes away.
 *
 * .USAGE
 *   import { CopyFeedback } from './utils/copyFeedback';
 *
 *   const feedback: CopyFeedback = new CopyFeedback();
 *   feedback.show(button, true);                    // 'Copied', with a tick
 *   feedback.show(button, false, 'Cannot copy');
 *   feedback.dispose();
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

const CHECK_ICON: string =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m20 6-11 11-5-5"/></svg>';

export class CopyFeedback {
  private timers: number[] = [];

  public show(button: HTMLButtonElement, success: boolean,
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
    this.timers.push(timer);
  }

  public dispose(): void {
    this.timers.forEach((timer: number) => window.clearTimeout(timer));
    this.timers = [];
  }
}
