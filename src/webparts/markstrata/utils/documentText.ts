/*
 * The prose of a rendered document, as opposed to everything else in it.
 *
 * Kept apart from readingTime.ts on purpose: the arithmetic there is plain
 * strings and numbers and is unit tested as such, while pulling the words out
 * of a rendered document is a DOM question and is checked in the browser.
 */
import { countWords, readingTimeLabel } from './readingTime';

/**
 * The words a person actually reads.
 *
 * Code is not read at prose speed and a diagram's source is not read at all,
 * so both come out, along with the contents list and the captions, which are
 * labels rather than text.
 */
export function prose(article: HTMLElement): string {
  const copy: HTMLElement = article.cloneNode(true) as HTMLElement;
  const skip: HTMLElement[] = Array.prototype.slice.call(
    copy.querySelectorAll('pre, code, .strata-mermaid, .strata-toc, figcaption')
  );
  skip.forEach((node: HTMLElement) => node.remove());
  return copy.textContent || '';
}

/**
 * How long the document takes to read.
 *
 * Returns an empty string for a document with nothing to read, so the toolbar
 * shows nothing rather than "1 min read" over an empty page.
 */
export function readingTime(article: HTMLElement): string {
  return readingTimeLabel(countWords(prose(article)));
}
