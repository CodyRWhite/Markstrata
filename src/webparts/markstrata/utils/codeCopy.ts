/*
 * The copy button on a code block.
 *
 * What gets copied is the source, not what is on screen: line numbers are CSS
 * counters, so the text in the DOM is already clean and each line element only
 * needs its newline put back.
 */
import { CopyFeedback } from './copyFeedback';

/** Wires every copy button inside `container` exactly once. */
export function attachCopyButtons(container: HTMLElement, feedback: CopyFeedback): void {
  const buttons: HTMLElement[] = Array.prototype.slice.call(
    container.querySelectorAll('.strata-code-copy')
  );

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

      copy(readCode(block), button as HTMLButtonElement, feedback);
    });
  });
}

function readCode(block: HTMLElement): string {
  const lines: HTMLElement[] = Array.prototype.slice.call(
    block.querySelectorAll('.strata-code-line-text')
  );
  if (lines.length > 0) {
    return lines.map((line: HTMLElement) => line.textContent || '').join('\n');
  }
  const code: HTMLElement | null = block.querySelector('code');
  return code ? code.textContent || '' : '';
}

function copy(text: string, button: HTMLButtonElement, feedback: CopyFeedback): void {
  const done = (success: boolean): void => feedback.show(button, success);

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(
      () => done(true),
      () => done(legacyCopy(text))
    );
    return;
  }

  done(legacyCopy(text));
}

/* For the pages the clipboard API will not serve: an http page, or an older
   browser. A textarea nobody can see, selected and copied from. */
function legacyCopy(text: string): boolean {
  try {
    const area: HTMLTextAreaElement = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied: boolean = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}
