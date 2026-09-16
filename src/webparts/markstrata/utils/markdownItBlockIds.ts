/**
 * .SYNOPSIS
 * markdown-it plugin: Obsidian block identifiers, `Some text. ^37066d`.
 *
 * .DESCRIPTION
 * Obsidian lets a paragraph, a list item, a quote or a table be named, by
 * putting a caret and a short identifier at the end of it:
 *
 *   The build fails on a clean checkout. ^37066d
 *
 *   | Service | Host |
 *   |---------|------|
 *   | Orders  | db01 |
 *   ^hosts
 *
 * The marker is Obsidian's way of saying "this block, specifically", and
 * `[[Runbook#^37066d]]` links to it. Obsidian hides the marker and puts the
 * name on the block. Here the marker was shown to the reader, as a stray
 * `^37066d` at the end of a sentence, and the link that named it had nothing
 * to find.
 *
 * Now the marker comes off and the block carries the name as its `id`, put
 * through the same slug function a heading id goes through, so that a link
 * written `[[Runbook#^37066d]]` and the block it names agree on what it is
 * called without either having to know about the other.
 *
 * A heading is left alone. A heading already has an id, made from its own
 * words and linked to as `[[Runbook#Rollback]]`, and replacing it would break
 * that and the table of contents with it.
 *
 * .USAGE
 *   import { blockIdPlugin } from './utils/markdownItBlockIds';
 *
 *   markdownIt.use(blockIdPlugin);
 *
 * .NOTES
 * Since:     0.0.18.6
 * Ships in:  the web part bundle
 * Requires:  markdownItTypes.ts, wikiLinks.ts
 */

import { IMarkdownIt, IStateCore, IToken } from './markdownItTypes';
import { headingSlug } from './wikiLinks';

/*
 * At the end of the block, after a space or on a line of its own. Obsidian
 * allows letters, numbers and dashes in the name.
 *
 * The space in front is what keeps this off a footnote reference and off a
 * superscript: `[^1]` has a bracket in front of the caret and `x^2^` has a
 * letter, and neither is the end of a block anyway.
 */
const MARKER: RegExp = /(^|\n|[ \t])\^([A-Za-z0-9-]+)[ \t]*$/;

/** The blocks a name goes on. A heading has one of its own already. */
function canCarryId(token: IToken): boolean {
  return token.nesting === 1 && token.type.indexOf('heading') !== 0;
}

/**
 * The block an inline token belongs to.
 *
 * A list item is named rather than the paragraph inside it, because in a tight
 * list that paragraph is hidden and renders no tag at all: the name would have
 * gone on an element that never reaches the page.
 */
function ownerOf(tokens: IToken[], inlineIndex: number): number {
  const open: number = inlineIndex - 1;
  if (open < 0 || !canCarryId(tokens[open])) {
    return -1;
  }
  if (tokens[open].type === 'paragraph_open' && open > 0 && tokens[open - 1].type === 'list_item_open') {
    return open - 1;
  }
  return open;
}

/**
 * The block before this one, for a name written on a line of its own.
 *
 * That is how a table or a list is named, since neither has a last line a
 * marker could be put on the end of. The marker arrives as a paragraph of its
 * own, and what it names is whatever closed just before it.
 */
function previousBlock(tokens: IToken[], paragraphOpen: number): number {
  const closing: number = paragraphOpen - 1;
  if (closing < 0 || tokens[closing].nesting !== -1) {
    return -1;
  }
  for (let index: number = closing - 1; index >= 0; index--) {
    if (tokens[index].nesting === 1 && tokens[index].level === tokens[closing].level) {
      return canCarryId(tokens[index]) ? index : -1;
    }
  }
  return -1;
}

function blockIdRule(state: IStateCore): void {
  const tokens: IToken[] = state.tokens;

  /* Backwards, because naming a block on a line of its own takes that line's
     three tokens out of the stream. */
  for (let index: number = tokens.length - 1; index >= 0; index--) {
    const inline: IToken = tokens[index];
    if (inline.type !== 'inline') {
      continue;
    }

    const found: RegExpExecArray | null = MARKER.exec(inline.content);
    if (!found) {
      continue;
    }

    const name: string = headingSlug(found[2]);
    if (!name) {
      continue;
    }

    const remaining: string = inline.content.slice(0, found.index);
    if (remaining.trim() === '' && tokens[index - 1] && tokens[index - 1].type === 'paragraph_open') {
      const named: number = previousBlock(tokens, index - 1);
      /* Nothing in front of it to name, so it names nothing. Left where it is
         rather than removed: a marker on the page can be seen and fixed, and a
         line that quietly disappears cannot. */
      if (named === -1) {
        continue;
      }
      if (!tokens[named].attrGet('id')) {
        tokens[named].attrSet('id', name);
      }
      /* The marker was the whole paragraph, so the paragraph goes with it. An
         empty one left behind is a gap on the page nobody wrote. Three tokens
         shorter, the walk carries on from the token before the paragraph. */
      tokens.splice(index - 1, 3);
      index -= 1;
      continue;
    }

    const owner: number = ownerOf(tokens, index);
    if (owner === -1) {
      continue;
    }

    inline.content = remaining;
    if (!tokens[owner].attrGet('id')) {
      tokens[owner].attrSet('id', name);
    }
  }
}

export function blockIdPlugin(markdownIt: IMarkdownIt): void {
  /* While an inline token is still the text that was written: taking the
     marker off here is one edit to a string, rather than a search through a
     tree that has already been parsed. */
  markdownIt.core.ruler.after('block', 'strata_block_id', blockIdRule);
}

export const plugin: (markdownIt: IMarkdownIt) => void = blockIdPlugin;
