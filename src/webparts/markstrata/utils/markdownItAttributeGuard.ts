/**
 * .SYNOPSIS
 * markdown-it plugin: keeps markdown-it-attrs from eating a trailing `{word}`.
 *
 * .DESCRIPTION
 * markdown-it-attrs reads a brace group at the end of a block as an attribute
 * list, and it takes the braces before it looks at what is inside them. What
 * it cannot use it throws away, so a block that merely ends in braces loses
 * them and whatever they held:
 *
 *   - The shell uses ${HOME}      became  <li>The shell uses $</li>
 *   # Config {env}                became  <h1>Config</h1>
 *   | home | ${HOME} |            became  <td>home</td><td>$</td>
 *   \begin{align} ... \end{align} lost its closing {align}
 *
 * Nothing warned, and nothing on the page said a word had been dropped. Shell
 * variables, LaTeX environments, template placeholders and config keys are
 * what a runbook is made of, and all four end a line in braces.
 *
 * Removing the plugin is not the answer, because `{.class}` and `{#id}` are a
 * documented feature of this web part and a document out there is using them.
 * So the plugin is left in place and only told about the braces it can
 * actually use: a group whose every part is a class, an id or a `key=value`
 * pair. Anything else is not an attribute list, it is text that happens to end
 * in braces, and it stays text.
 *
 * The narrowing is done by moving that text out of reach rather than by
 * teaching the plugin a new rule, which it has no hook for. Every pattern the
 * plugin matches ends at the last plain text child of a block, so the braces
 * are split off into a `text_special` token just before it runs. It looks
 * straight past that token, and markdown-it's own `text_join` rule - which
 * runs after, and is how markdown-it carries its own escapes through - joins
 * it back into the text beside it, so the reader sees the line exactly as it
 * was written.
 *
 * .USAGE
 *   import { attributeGuardPlugin } from './utils/markdownItAttributeGuard';
 *
 *   markdownIt.use(markdownItAttrs, { ... });
 *   markdownIt.use(attributeGuardPlugin);   // after, it sits in front of it
 *
 * .NOTES
 * Since:     0.0.18.5
 * Ships in:  the web part bundle
 * Requires:  markdownItTypes.ts, markdown-it-attrs
 */

import { IMarkdownIt, IStateCore, IToken } from './markdownItTypes';

/**
 * One part of a brace group that markdown-it-attrs can really use: a class,
 * a css module, an id, or a `key=value` pair. A bare word is none of those,
 * which is the whole of the bug: `{env}` parses as a nameless attribute, is
 * then dropped for not being allowed, and takes the text with it.
 */
const ATTRIBUTE: RegExp = /^(?:\.{1,2}[^\s.#=]\S*|#[^\s.#=]\S*|[^\s=]+=\S*)$/;

/** A quoted value can hold spaces, which would otherwise split a pair in two. */
const QUOTED: RegExp = /"[^"]*"/g;

/** Is this what the inside of a brace group has to look like to be attributes? */
function isAttributeList(inner: string): boolean {
  const parts: string[] = inner.replace(QUOTED, '""').split(/\s+/).filter((part: string) => part.length > 0);
  return parts.length > 0 && parts.every((part: string) => ATTRIBUTE.test(part));
}

/**
 * Where a trailing brace group starts, or -1.
 *
 * Read the way markdown-it-attrs reads it: from the last opening brace in the
 * string to the first closing brace after it, which has to be the last
 * character. That is the group the plugin would take, so it is the group that
 * has to be judged.
 */
function trailingGroup(content: string): number {
  const open: number = content.lastIndexOf('{');
  if (open === -1) {
    return -1;
  }
  const close: number = content.indexOf('}', open + 1);
  return close === content.length - 1 ? open : -1;
}

/**
 * The child markdown-it-attrs would read: the last one carrying plain text.
 *
 * Whitespace-only text is skipped, because a heading with a permalink has a
 * space token after its words, and anything that is not text is skipped for
 * the same reason the plugin skips it - the anchor the heading plugin appended
 * is not what the document ends with.
 */
function lastTextChild(children: IToken[]): number {
  for (let index: number = children.length - 1; index >= 0; index--) {
    const child: IToken = children[index];
    if (child.type === 'text' && child.content.trim() !== '') {
      return index;
    }
    if (child.type !== 'text' && child.nesting === 0 && child.type !== 'softbreak') {
      /* A code span or maths ends the search: the plugin refuses to read
         attributes out of one, and so does this. */
      return -1;
    }
  }
  return -1;
}

export function attributeGuardPlugin(markdownIt: IMarkdownIt): void {
  const guard = (state: IStateCore): void => {
    state.tokens.forEach((token: IToken) => {
      const children: IToken[] | null = token.children;
      if (token.type !== 'inline' || !children || children.length === 0) {
        return;
      }

      const index: number = lastTextChild(children);
      if (index === -1) {
        return;
      }

      const child: IToken = children[index];
      const open: number = trailingGroup(child.content);
      if (open === -1 || isAttributeList(child.content.slice(open + 1, child.content.length - 1))) {
        return;
      }

      const literal: IToken = new state.Token('text_special', '', 0);
      literal.content = child.content.slice(open);
      /* The text before it is left where it was, even when it is empty. A
         block whose only child is the braces would otherwise still answer one
         of the plugin's "this whole line is an attribute list" patterns. */
      child.content = child.content.slice(0, open);
      children.splice(index + 1, 0, literal);
    });
  };

  /* In front of markdown-it-attrs, which registers itself before `linkify`.
     Without that plugin there is nothing to guard against. */
  const names: string[] = markdownIt.core.ruler.__rules__
    ? markdownIt.core.ruler.__rules__.map((rule: { name: string }) => rule.name)
    : [];
  if (names.indexOf('curly_attributes') === -1) {
    return;
  }
  markdownIt.core.ruler.before('curly_attributes', 'strata_attribute_guard', guard);
}

export const plugin: (markdownIt: IMarkdownIt) => void = attributeGuardPlugin;
