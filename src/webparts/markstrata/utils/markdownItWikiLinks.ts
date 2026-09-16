/**
 * .SYNOPSIS
 * markdown-it plugin: wiki links, `[[Another page]]`, and embeds, `![[a.png]]`.
 *
 * .DESCRIPTION
 * Registered before markdown-it's own `link` rule so the two brackets are
 * claimed here first. Left to markdown-it, `[[Page]]` is a link whose text is
 * `[Page]` and which has no destination, so it renders as literal brackets.
 *
 * The href is worked out by the caller, which is the only place that knows
 * where this document lives in the library.
 *
 * An embed is the same brackets with a `!` in front, and means "put the thing
 * here" rather than "link to it". A picture can be put here, so a picture is,
 * with Obsidian's `|300` and `|300x200` sizes honoured the same way the
 * equivalent markdown form's are. Anything else cannot: embedding another
 * document means fetching it, and nothing can be fetched while a string is
 * being turned into HTML. Those are rendered as a link that says it is an
 * embed, because a link that admits what it is can be followed, and a picture
 * frame with nothing in it cannot.
 *
 * .USAGE
 *   import { wikiLinkPlugin } from './utils/markdownItWikiLinks';
 *
 *   markdownIt.use(wikiLinkPlugin, {
 *     resolve: (path: string) => resolveAgainst(documentFolder, path)
 *   });
 *
 * .NOTES
 * Since:     0.0.14.0
 * Ships in:  the web part bundle
 * Requires:  markdownItTypes.ts, wikiLinks.ts
 */

import { IMarkdownIt, IStateInline, IToken, MarkdownItPlugin } from './markdownItTypes';
import { parseWikiLink, wikiHref, IWikiTarget } from './wikiLinks';
import { encodePath } from './imagePaths';

export interface IWikiLinkOptions {
  /** Resolves a relative path the way this document's images are resolved. */
  resolve(src: string): string | undefined;
}

const OPEN: number = 0x5b; /* [ */
const BANG: number = 0x21; /* ! */

/** What can actually be put on the page rather than linked to. */
const PICTURE: RegExp = /\.(?:png|jpe?g|gif|bmp|svg|webp|avif|ico)$/i;

/** Obsidian's size after the pipe: `|300` or `|300x200`. */
const SIZE: RegExp = /^\d+(?:\s*[x\u00d7]\s*\d+)?$/;

/** Where the brackets end, or -1 when this is not a pair of them. */
function endOfBrackets(state: IStateInline, from: number): number {
  const end: number = state.src.indexOf(']]', from);
  if (end === -1 || end > state.posMax) {
    return -1;
  }
  const inner: string = state.src.slice(from, end);
  /* A newline inside means the brackets are not a link but two lines that
     happen to start and end with them. A bracket inside means the same:
     `[[1,2],[3,4]]` is an array, and the closing pair found above is the end
     of the second one rather than the end of a link. */
  return /[\n[\]]/.test(inner) ? -1 : end;
}

export function wikiLinkPlugin(markdownIt: IMarkdownIt, options?: unknown): void {
  const settings: IWikiLinkOptions = (options as IWikiLinkOptions)
    || { resolve: () => undefined };

  const rule = (state: IStateInline, silent: boolean): boolean => {
    const start: number = state.pos;
    if (state.src.charCodeAt(start) !== OPEN || state.src.charCodeAt(start + 1) !== OPEN) {
      return false;
    }

    const end: number = endOfBrackets(state, start + 2);
    if (end === -1) {
      return false;
    }

    const target: IWikiTarget | undefined = parseWikiLink(state.src.slice(start + 2, end));
    if (!target) {
      return false;
    }

    if (!silent) {
      const open = state.push('link_open', 'a', 1);
      if (open.attrSet) {
        open.attrSet('href', wikiHref(target, settings.resolve));
        open.attrSet('class', 'strata-wiki-link');
      }

      const text = state.push('text', '', 0);
      text.content = target.label;

      state.push('link_close', 'a', -1);
    }

    state.pos = end + 2;
    return true;
  };

  /*
   * An embed, `![[picture.png]]` or `![[Another note]]`.
   *
   * A picture becomes an ordinary image token, so that the pipeline's own
   * image handling - resolving the source against this document's folder, the
   * sizes written after a pipe, lazy loading, the click to see it full size -
   * all apply to it without being written twice. Left as it was, the `!` was
   * printed as a stray character and the size was read as the link's wording,
   * so `![[Engelbart.jpg|100]]` rendered as a link reading "100".
   */
  const embed = (state: IStateInline, silent: boolean): boolean => {
    const start: number = state.pos;
    if (
      state.src.charCodeAt(start) !== BANG ||
      state.src.charCodeAt(start + 1) !== OPEN ||
      state.src.charCodeAt(start + 2) !== OPEN
    ) {
      return false;
    }

    const end: number = endOfBrackets(state, start + 3);
    if (end === -1) {
      return false;
    }

    const target: IWikiTarget | undefined = parseWikiLink(state.src.slice(start + 3, end));
    if (!target) {
      return false;
    }

    if (!silent) {
      if (PICTURE.test(target.page)) {
        pushPicture(state, target);
      } else {
        pushStandIn(state, target, settings);
      }
    }

    state.pos = end + 2;
    return true;
  };

  /* Before `link`, which would otherwise take the first bracket, and before
     `image`, which would otherwise take the `!` and the one after it. */
  markdownIt.inline.ruler.before('link', 'strata_wiki_embed', embed);
  markdownIt.inline.ruler.before('link', 'strata_wiki_link', rule);
}

/**
 * A picture, as the image token the rest of the pipeline already knows.
 *
 * The size is handed on in the alt text, `name|300x200`, which is the shape
 * MarkdownProcessor already reads off a markdown image written Obsidian's way.
 * The source is left relative and unresolved for the same reason: the image
 * renderer resolves every other picture in the document and has to resolve
 * this one the same way, or an embed and a picture beside it would disagree
 * about which folder they are in.
 */
function pushPicture(state: IStateInline, target: IWikiTarget): void {
  const sized: boolean = SIZE.test(target.label);
  const alt: string = sized ? `${target.page}|${target.label}` : target.label;

  const token: IToken = state.push('image', 'img', 0);
  if (token.attrSet) {
    token.attrSet('src', encodePath(target.page));
    /* Written now and rewritten by the renderer from the children below,
       which is where markdown-it keeps an image's alt text. */
    token.attrSet('alt', '');
  }
  token.content = alt;

  const caption: IToken = new state.Token('text', '', 0);
  caption.content = alt;
  token.children = [caption];
}

/**
 * Everything that is not a picture: another document, a PDF, a sound file.
 *
 * None of them can be embedded here. Putting one on the page means fetching
 * it, and a render is a string going in and a string coming out with no
 * chance to ask SharePoint for anything. So the document says what it is and
 * links to it, rather than showing an empty frame that looks like a picture
 * that failed to load.
 */
function pushStandIn(state: IStateInline, target: IWikiTarget, settings: IWikiLinkOptions): void {
  const open: IToken = state.push('link_open', 'a', 1);
  if (open.attrSet) {
    open.attrSet('href', wikiHref(target, settings.resolve));
    open.attrSet('class', 'strata-wiki-link strata-wiki-embed');
    /* Said to a reader who cannot see the styling, and to a theme that wants
       to mark it. An embed that quietly became an ordinary link would be this
       web part pretending it had done something it cannot do. */
    open.attrSet('data-embed', 'true');
  }

  const text: IToken = state.push('text', '', 0);
  text.content = target.label;

  state.push('link_close', 'a', -1);
}

export const plugin: MarkdownItPlugin = wikiLinkPlugin;
