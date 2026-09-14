/*
 * How long a document takes to read.
 *
 * Split from the element it is measured on so the arithmetic can be tested
 * without a browser: pulling the prose out of a rendered document is a DOM
 * question and is checked there, while what counts as a word and how the
 * number is worded are decided here.
 */

/*
 * Adults read prose at somewhere between 200 and 260 words a minute, and the
 * figure only has to be close enough to answer "have I got time for this now".
 * 220 sits in the middle of the range rather than flattering the reader.
 */
export const WORDS_PER_MINUTE: number = 220;

/*
 * Counted on whitespace rather than with a word pattern, so that a hyphenated
 * term, a file path or a version number counts once, which is how long it
 * takes to read one.
 */
export function countWords(text: string): number {
  const trimmed: string = (text || '').trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

/** Always at least a minute: "0 min read" tells a reader nothing. */
export function readingMinutes(words: number): number {
  if (words <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Empty for a document with no prose, so the toolbar shows nothing at all. */
export function readingTimeLabel(words: number): string {
  const minutes: number = readingMinutes(words);
  return minutes === 0 ? '' : `${minutes} min read`;
}
