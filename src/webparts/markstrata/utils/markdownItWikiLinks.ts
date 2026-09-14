/**
 * markdown-it plugin: wiki links, `[[Another page]]`.
 *
 * Registered before markdown-it's own `link` rule so the two brackets are
 * claimed here first. Left to markdown-it, `[[Page]]` is a link whose text is
 * `[Page]` and which has no destination, so it renders as literal brackets.
 *
 * The href is worked out by the caller, which is the only place that knows
 * where this document lives in the library.
 */

import { IMarkdownIt, IStateInline, MarkdownItPlugin } from './markdownItTypes';
import { parseWikiLink, wikiHref, IWikiTarget } from './wikiLinks';

export interface IWikiLinkOptions {
  /** Resolves a relative path the way this document's images are resolved. */
  resolve(src: string): string | undefined;
}

const OPEN: number = 0x5b; /* [ */

export function wikiLinkPlugin(md: IMarkdownIt, options?: unknown): void {
  const settings: IWikiLinkOptions = (options as IWikiLinkOptions)
    || { resolve: () => undefined };

  const rule = (state: IStateInline, silent: boolean): boolean => {
    const start: number = state.pos;
    if (state.src.charCodeAt(start) !== OPEN || state.src.charCodeAt(start + 1) !== OPEN) {
      return false;
    }

    const end: number = state.src.indexOf(']]', start + 2);
    if (end === -1 || end > state.posMax) {
      return false;
    }

    const inner: string = state.src.slice(start + 2, end);
    /* A newline inside means the brackets are not a link but two lines that
       happen to start and end with them. A bracket inside means the same:
       `[[1,2],[3,4]]` is an array, and the closing pair found above is the end
       of the second one rather than the end of a link. */
    if (/[\n[\]]/.test(inner)) {
      return false;
    }

    const target: IWikiTarget | undefined = parseWikiLink(inner);
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

  /* Before `link`, which would otherwise take the first bracket. */
  md.inline.ruler.before('link', 'strata_wiki_link', rule);
}

export const plugin: MarkdownItPlugin = wikiLinkPlugin;
