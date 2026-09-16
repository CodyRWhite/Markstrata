/**
 * .SYNOPSIS
 * markdown-it plugin: Obsidian comments, `%%not for the reader%%`.
 *
 * .DESCRIPTION
 * Obsidian hides anything between a pair of double percent signs, inline or
 * over several lines:
 *
 *   Ready to ship %%ask Dave first%%
 *
 *   %%
 *   Rewrite this section before anybody sees it.
 *   %%
 *
 * It is where an author writes what the reader is not meant to read: a note to
 * themselves, a name, a number they have not checked. Rendered here it was
 * shown verbatim, so moving a folder of notes into a document library
 * published every one of those notes along with the documents.
 *
 * Nothing gates this. A comment is the author saying this is not for the page,
 * and there is no reading of it under which showing it anyway is what they
 * wanted.
 *
 * An unclosed `%%` is left alone rather than hiding the rest of the document.
 * Obsidian comments out everything after it, which is the same shape of
 * failure as a table row being swallowed: a document that quietly comes back
 * shorter than it is. A stray marker showing is the smaller harm and the one
 * that can be seen and fixed.
 *
 * .USAGE
 *   import { commentPlugin } from './utils/markdownItComments';
 *
 *   markdownIt.use(commentPlugin);
 *
 * .NOTES
 * Since:     0.0.18.5
 * Ships in:  the web part bundle
 * Requires:  markdownItTypes.ts
 */

import { IMarkdownIt, IStateBlock, IStateInline, IToken } from './markdownItTypes';

const MARKER: string = '%%';
const PERCENT: number = 0x25; /* % */

/** The line as the block parser reads it: from its indent to its end. */
function lineText(state: IStateBlock, line: number): string {
  return state.src.slice(state.bMarks[line] + state.sCount[line], state.eMarks[line]);
}

/**
 * A comment written on lines of its own, which is the form that has to be
 * claimed at block level: left to the inline rule it would leave an empty
 * paragraph where the comment was.
 */
function blockRule(state: IStateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const first: string = lineText(state, startLine).trim();
  if (first.slice(0, 2) !== MARKER) {
    return false;
  }

  let last: number = -1;

  /* `%%aside%%` alone on its line closes on that line. Anything after the
     closing marker is text, and a line with text on it is a paragraph that
     happens to contain a comment, which the inline rule takes care of. */
  if (first.length >= 4 && first.slice(-2) === MARKER) {
    last = startLine;
  } else {
    for (let line: number = startLine + 1; line < endLine; line++) {
      const text: string = lineText(state, line).trim();
      if (text.slice(-2) === MARKER && (line > startLine + 1 || text.length >= 2)) {
        last = line;
        break;
      }
    }
  }

  /* Nothing closes it, so nothing is hidden. */
  if (last === -1) {
    return false;
  }

  if (!silent) {
    const token: IToken = state.push('strata_comment', '', 0);
    token.content = state.getLines(startLine, last + 1, 0, false);
    token.markup = MARKER;
    token.map = [startLine, last + 1];
  }

  state.line = last + 1;
  return true;
}

/** A comment inside a line of prose. */
function inlineRule(state: IStateInline, silent: boolean): boolean {
  const start: number = state.pos;
  if (state.src.charCodeAt(start) !== PERCENT || state.src.charCodeAt(start + 1) !== PERCENT) {
    return false;
  }

  const end: number = state.src.indexOf(MARKER, start + 2);
  if (end === -1 || end + 2 > state.posMax) {
    return false;
  }
  /* A comment inside a sentence is inside one line of it. Running over a line
     ending would let an unclosed marker swallow the paragraph under it. */
  if (state.src.slice(start, end).indexOf('\n') !== -1) {
    return false;
  }

  if (!silent) {
    const token: IToken = state.push('strata_comment', '', 0);
    token.content = state.src.slice(start + 2, end);
    token.markup = MARKER;
  }

  state.pos = end + 2;
  return true;
}

export function commentPlugin(markdownIt: IMarkdownIt): void {
  markdownIt.block.ruler.before('fence', 'strata_comment', blockRule, {
    /* A comment may be written straight under a paragraph, which is where an
       author's note about that paragraph belongs. */
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  });
  markdownIt.inline.ruler.before('escape', 'strata_comment', inlineRule);

  /* Kept as a token rather than dropped, so the comment is still in the token
     stream for anything that walks it, and rendered as nothing. */
  markdownIt.renderer.rules.strata_comment = (): string => '';
}

export const plugin: (markdownIt: IMarkdownIt) => void = commentPlugin;
