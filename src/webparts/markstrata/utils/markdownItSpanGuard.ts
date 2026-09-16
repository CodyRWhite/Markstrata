/**
 * .SYNOPSIS
 * markdown-it plugin: keeps markdown-it-attrs from deleting the cell after a
 * `||`.
 *
 * .DESCRIPTION
 * A doubled pipe is how a MultiMarkdown table says a cell runs across the
 * column to its right, and it is a documented feature here. It lost the cell
 * that came next:
 *
 *   | a | b | c |
 *   |---|---|---|
 *   | spans two || third |
 *
 * rendered as `<td colspan="2">spans two</td>` and nothing else. `third` was
 * not mis-placed or mis-spanned, it was gone from the page, with nothing said
 * about it - the same class of failure as a swallowed table row, and worse,
 * because a table with a column missing still reads as a table.
 *
 * It is markdown-it-attrs, not the table plugin. attrs has its own way of
 * writing a span, `| 2 {colspan=2} | 22 | 222 | 2222 |`, where the author
 * writes every cell and the covered ones have to be hidden afterwards. Its
 * "tables tbody calculate" pattern does that hiding, and it hides by blanking
 * the token's content, so the text is destroyed rather than merely not drawn.
 *
 * MultiMarkdown's `||` is the other way round: the covered cell is never
 * written, and the plugin has already set colspan by the time attrs looks. So
 * attrs finds a span, assumes the row still holds the cells that span covers,
 * and hides a real one.
 *
 * Neither plugin can be dropped - both syntaxes are documented - so attrs is
 * shown a row it has no work to do in. A colspan that is already on a cell
 * before attrs runs can only have come from the table plugin, because attrs
 * has not run yet; it is set aside as `1` for the length of that rule and put
 * back after. attrs then sees an ordinary row, and its own `{colspan=2}` is
 * untouched, because that attribute does not exist until attrs creates it.
 *
 * Restoring is conditional: if the value is no longer the `1` that was left
 * there, attrs has set one of its own on the same cell and that is the
 * author's most recent word on it.
 *
 * .USAGE
 *   // After markdown-it-attrs is registered, so its rule exists to hang off.
 *   markdownIt.use(markdownItAttrs, ...);
 *   markdownIt.use(spanGuardPlugin);
 *
 * .NOTES
 * Since:     0.0.18.7
 * Ships in:  the web part bundle
 * Requires:  markdownItTypes.ts, and markdown-it-attrs registered first
 */

import { IMarkdownIt, IStateCore, IToken } from './markdownItTypes';

/** What a cell's real colspan is parked under while attrs runs. */
interface ISetAside {
  strataColspan?: string;
}

const CELL_TYPES: string[] = ['td_open', 'th_open'];
const PARKED: string = '1';

function isCell(token: IToken): boolean {
  return CELL_TYPES.indexOf(token.type) !== -1;
}

export function spanGuardPlugin(markdownIt: IMarkdownIt): void {
  markdownIt.core.ruler.before('curly_attributes', 'strata_span_guard',
    (state: IStateCore): void => {
      state.tokens.forEach((token: IToken) => {
        if (!isCell(token)) {
          return;
        }
        const colspan: string | null = token.attrGet('colspan');
        if (colspan === null || colspan === PARKED) {
          return;
        }
        (token.meta as ISetAside) = Object.assign({}, token.meta, {
          strataColspan: colspan
        });
        token.attrSet('colspan', PARKED);
      });
    });

  markdownIt.core.ruler.after('curly_attributes', 'strata_span_restore',
    (state: IStateCore): void => {
      state.tokens.forEach((token: IToken) => {
        const parked: ISetAside = (token.meta || {}) as ISetAside;
        if (!isCell(token) || parked.strataColspan === undefined) {
          return;
        }
        /* Only when attrs left it alone. A cell written with `||` and with an
           explicit {colspan=} on it as well is nobody's normal document, but
           if it happens the one the author typed wins. */
        if (token.attrGet('colspan') === PARKED) {
          token.attrSet('colspan', parked.strataColspan);
        }
        delete parked.strataColspan;
      });
    });
}
