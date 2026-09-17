/**
 * .SYNOPSIS
 * markdown-it plugin: links and pictures whose address has spaces in it.
 *
 * .DESCRIPTION
 * A link destination that is not wrapped in angle brackets may not contain a
 * space. That is CommonMark, and markdown-it is right to enforce it, but it
 * means the address a SharePoint page hands somebody cannot be pasted into a
 * link and left alone:
 *
 *   [ITP00024 - Access Control Plan](https://contoso.sharepoint.com/sites/
 *   ITPolicies/SitePages/ITP00024 - Access Control Plan.aspx)
 *
 * markdown-it reads the destination up to the first space, looks for the
 * closing bracket where the space is, does not find it, and abandons the link.
 * What reaches the page is the whole thing as literal text with a stray
 * autolinked fragment in the middle of it, which is a failure nobody reading
 * it can diagnose and nobody writing it expected.
 *
 * SharePoint names pages and files after their titles, so the spaces are not
 * an edge case in a wiki: they are most addresses.
 *
 * This rule is registered after markdown-it's own, so it is only ever offered
 * what CommonMark has already refused. That is the whole of its safety. A link
 * that renders today is parsed by the rule that parses it today, reaches this
 * one never, and cannot change: a working link has no space in its destination
 * in the first place, because a link with one does not work. Nothing here
 * competes with a title (`[x](y "Title")`), a nested bracket or an angle
 * bracket form, because markdown-it handles all three and this is not asked.
 *
 * What it refuses, so that a bracket followed by a parenthesis in ordinary
 * prose stays prose:
 *
 *   - a destination with no space in it - markdown-it declined for some other
 *     reason, and guessing at what is not this rule's business
 *   - a destination that spans a line break
 *   - a destination carrying a quote or an angle bracket, which is somebody
 *     writing a title or a bracketed address that went wrong elsewhere
 *   - a destination that does not read as an address: it has to open with a
 *     scheme, a slash, or a run of characters that ends in a file extension
 *
 * The spaces are encoded rather than the raw string being handed on, because
 * an href with a raw space in it is not a URL, and what a browser does with
 * one is its own business rather than something to rely on.
 *
 * .USAGE
 *   import { spacedLinkPlugin } from './utils/markdownItSpacedLinks';
 *
 *   markdownIt.use(spacedLinkPlugin);
 *
 *   [A page](https://contoso.sharepoint.com/sites/x/SitePages/A Page.aspx)
 *   ![A picture](screenshots/The first run.png)
 *
 * .NOTES
 * Since:     0.0.20.3
 * Ships in:  the web part bundle
 * Requires:  markdownItTypes.ts
 */

import { IMarkdownIt, IStateInline, IToken } from './markdownItTypes';

const BANG: number = 0x21; /* ! */
const OPEN_SQUARE: number = 0x5b; /* [ */
const CLOSE_SQUARE: number = 0x5d; /* ] */
const OPEN_ROUND: number = 0x28; /* ( */
const CLOSE_ROUND: number = 0x29; /* ) */
const BACKSLASH: number = 0x5c; /* \ */

/**
 * What counts as an address rather than as a sentence in brackets.
 *
 * Three shapes, and a destination has to be one of them:
 *
 *   https://host/…   an address, which is the SharePoint case
 *   /sites/…         server relative, which is how a link within a tenant is
 *                    often written
 *   Runbooks/A b.md  a relative path, which has to end in an extension so that
 *                    "(see the note below)" after a bracket is never mistaken
 *                    for one
 */
const ADDRESS: RegExp = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/)/i;
const RELATIVE_FILE: RegExp = /^[^\s?#][^?#]*\.[a-z0-9]{1,8}(?:[?#].*)?$/i;

/**
 * Whether this is a destination somebody meant, rather than prose that happens
 * to have a bracket and a parenthesis near each other.
 *
 * Exported because it is the whole judgement this plugin makes, and a
 * judgement worth reading is a judgement worth testing without a parser
 * around it.
 */
export function looksLikeAddress(destination: string): boolean {
  const written: string = destination.trim();
  if (!written || written.indexOf(' ') === -1) {
    return false;
  }
  /* A quote is a title and an angle bracket is the form markdown-it already
     reads. Either one here means this is not the rule for the job. */
  if (/["'<>]/.test(written)) {
    return false;
  }
  if (ADDRESS.test(written)) {
    return true;
  }
  return RELATIVE_FILE.test(written);
}

/**
 * The address as an href.
 *
 * Only the space is encoded. Everything else is left exactly as the author
 * wrote it, because a destination that reached this point has already been
 * through markdown-it's normalizer nowhere, and re-encoding a per cent sign
 * that is already an escape would break an address that was correct.
 */
export function encodeSpaces(destination: string): string {
  return destination.trim().replace(/ /g, '%20');
}

/**
 * Finds the `]` that closes the label opened at `start`.
 *
 * Nesting is counted so that `[see [1] here](…)` closes on the right bracket,
 * and an escaped bracket is skipped so that `[a \] b](…)` does too. Returns -1
 * when the label never closes, which is not a link at all.
 */
function labelEnd(state: IStateInline, start: number): number {
  let depth: number = 0;
  let index: number = start;

  while (index < state.posMax) {
    const code: number = state.src.charCodeAt(index);
    if (code === BACKSLASH) {
      index += 2;
      continue;
    }
    if (code === OPEN_SQUARE) {
      depth += 1;
    } else if (code === CLOSE_SQUARE) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
    index += 1;
  }

  return -1;
}

/**
 * The rule itself.
 *
 * Registered after markdown-it's `link`, so `silent` is the validation pass of
 * some rule that is still deciding. Claiming anything in that pass would let
 * this rule report a link where the real pass then produces none.
 */
function spacedLink(state: IStateInline, silent: boolean): boolean {
  if (silent) {
    return false;
  }

  const start: number = state.pos;
  const isImage: boolean = state.src.charCodeAt(start) === BANG;
  const bracket: number = isImage ? start + 1 : start;

  if (state.src.charCodeAt(bracket) !== OPEN_SQUARE) {
    return false;
  }

  const end: number = labelEnd(state, bracket);
  if (end === -1 || state.src.charCodeAt(end + 1) !== OPEN_ROUND) {
    return false;
  }

  /* To the closing parenthesis, and no further than the line. A destination
     that runs past a newline is a bracket and a parenthesis that happen to be
     near each other rather than a link somebody wrote. */
  const destinationStart: number = end + 2;
  let close: number = -1;
  for (let index: number = destinationStart; index < state.posMax; index += 1) {
    const code: number = state.src.charCodeAt(index);
    if (code === 0x0a) {
      return false;
    }
    if (code === OPEN_ROUND) {
      return false;
    }
    if (code === CLOSE_ROUND) {
      close = index;
      break;
    }
  }
  if (close === -1) {
    return false;
  }

  const destination: string = state.src.slice(destinationStart, close);
  if (!looksLikeAddress(destination)) {
    return false;
  }

  const href: string = encodeSpaces(destination);
  const label: string = state.src.slice(bracket + 1, end);

  if (isImage) {
    /*
     * A picture's alt text is not the attribute set here: markdown-it's image
     * renderer rebuilds it by flattening the token's children, so a picture
     * handed no children has no alt whatever this sets. The label is parsed
     * into them for that, which is what markdown-it's own image rule does.
     */
    const token: IToken = state.push('image', 'img', 0);
    token.attrSet('src', href);
    token.attrSet('alt', '');
    token.content = label;
    const children: IToken[] = [];
    state.md.inline.parse(label, state.md, state.env, children);
    token.children = children;
  } else {
    const open: IToken = state.push('link_open', 'a', 1);
    open.attrSet('href', href);

    /* The label is markdown in its own right, so it is parsed rather than
       pushed as text: [**bold** page](…) has to keep its bold. */
    const wasPos: number = state.pos;
    const wasMax: number = state.posMax;
    state.pos = bracket + 1;
    state.posMax = end;
    state.md.inline.tokenize(state);
    state.pos = wasPos;
    state.posMax = wasMax;

    state.push('link_close', 'a', -1);
  }

  state.pos = close + 1;
  return true;
}

export function spacedLinkPlugin(markdownIt: IMarkdownIt): void {
  /*
   * After `link`, which is what makes this safe: markdown-it gets first
   * refusal on everything, and this rule only ever sees what it turned down.
   */
  markdownIt.inline.ruler.after('link', 'strata_spaced_link', spacedLink);
}
