/**
 * markdown-it plugin: blockquote callouts.
 *
 * Recognises
 *   > [!NOTE]                       GitHub alert
 *   > [!tip] Custom title           Obsidian callout with a title
 *   > [!warning]- Collapsed         Obsidian foldable callout (- closed, + open)
 *   > text ...
 *   {.is-info}                      Wiki.js class, handled by markdown-it-attrs
 *
 * and renders them all as the markup callouts.css expects. Anything that is
 * not a known callout type is left alone and stays an ordinary blockquote.
 */

import { resolveCallout, buildIcon, FOLD_ICON, ICalloutType } from './callouts';
import { IMarkdownIt, IStateCore, IToken } from './markdownItTypes';

export interface ICalloutMeta {
  type: string;
  title: string;
  icon: string;
  fold: string;
}

const MARKER: RegExp = /^\s{0,3}\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/;

/** Finds the blockquote_close that matches the open token at `start`. */
function findClose(tokens: IToken[], start: number): number {
  const level: number = tokens[start].level;
  for (let index: number = start + 1; index < tokens.length; index++) {
    if (tokens[index].type === 'blockquote_close' && tokens[index].level === level) {
      return index;
    }
  }
  return -1;
}

function toCallout(tokens: IToken[], openIndex: number, meta: ICalloutMeta): void {
  const closeIndex: number = findClose(tokens, openIndex);
  if (closeIndex === -1) {
    return;
  }
  tokens[openIndex].type = 'mdf_callout_open';
  tokens[openIndex].meta = { callout: meta };
  // The close renderer needs the same meta to know which tag to close.
  tokens[closeIndex].type = 'mdf_callout_close';
  tokens[closeIndex].meta = { callout: meta };
}

/**
 * Runs straight after block parsing, while inline tokens still hold raw text.
 * Editing `content` at this point is far safer than rewriting an already
 * parsed child list.
 */
function calloutRule(state: IStateCore): void {
  const tokens: IToken[] = state.tokens;

  for (let index: number = 0; index < tokens.length; index++) {
    if (tokens[index].type !== 'blockquote_open') {
      continue;
    }

    const paragraph: IToken = tokens[index + 1];
    const inline: IToken = tokens[index + 2];
    if (!paragraph || paragraph.type !== 'paragraph_open' || !inline || inline.type !== 'inline') {
      continue;
    }

    const lines: string[] = inline.content.split('\n');
    const match: RegExpExecArray | null = MARKER.exec(lines[0]);
    if (!match) {
      continue;
    }

    const definition: ICalloutType | undefined = resolveCallout(match[1]);
    if (!definition) {
      continue;
    }

    const meta: ICalloutMeta = {
      type: definition.type,
      title: (match[3] || '').trim() || definition.title,
      icon: definition.icon,
      fold: match[2] || ''
    };

    const body: string = lines.slice(1).join('\n').replace(/^\s+/, '');
    if (body.length === 0) {
      // Title-only callout: drop the now empty paragraph entirely.
      tokens.splice(index + 1, 3);
    } else {
      inline.content = body;
    }

    toCallout(tokens, index, meta);
  }
}

/**
 * Wiki.js compatibility. markdown-it-attrs has put `class="is-info"` on the
 * blockquote by the time this runs, so there is no text to strip - only the
 * class to translate.
 */
function legacyClassRule(state: IStateCore): void {
  const tokens: IToken[] = state.tokens;

  for (let index: number = 0; index < tokens.length; index++) {
    if (tokens[index].type !== 'blockquote_open') {
      continue;
    }

    const classes: string = tokens[index].attrGet('class') || '';
    let matched: ICalloutType | undefined;

    classes.split(/\s+/).forEach((name: string) => {
      if (!matched && name.indexOf('is-') === 0) {
        matched = resolveCallout(name);
      }
    });

    if (matched) {
      toCallout(tokens, index, { type: matched.type, title: matched.title, icon: matched.icon, fold: '' });
    }
  }
}

export function calloutPlugin(markdownIt: IMarkdownIt): void {
  markdownIt.core.ruler.after('block', 'mdf_callout', calloutRule);

  // markdown-it-attrs registers `curly_attributes` before `linkify`; sit after
  // it when it is present so the class is already on the token.
  const ruleNames: string[] = markdownIt.core.ruler.__rules__
    ? markdownIt.core.ruler.__rules__.map((rule: { name: string }) => rule.name)
    : [];
  if (ruleNames.indexOf('curly_attributes') !== -1) {
    markdownIt.core.ruler.after('curly_attributes', 'mdf_legacy_callout', legacyClassRule);
  } else {
    markdownIt.core.ruler.before('linkify', 'mdf_legacy_callout', legacyClassRule);
  }

  markdownIt.renderer.rules.mdf_callout_open = (tokens: IToken[], index: number): string => {
    const meta: ICalloutMeta = (tokens[index].meta as { callout: ICalloutMeta }).callout;
    const foldable: boolean = meta.fold === '+' || meta.fold === '-';

    let title: string;
    try {
      title = markdownIt.renderInline(meta.title);
    } catch {
      // A title that cannot be parsed as inline markdown is still shown, as text.
      title = markdownIt.utils.escapeHtml(meta.title);
    }

    const parts: string[] = [];
    parts.push(
      foldable
        ? `<details class="strata-callout strata-callout--foldable" data-callout="${meta.type}"${
            meta.fold === '+' ? ' open' : ''
          }>`
        : `<div class="strata-callout" data-callout="${meta.type}">`
    );
    parts.push(`<${foldable ? 'summary' : 'div'} class="strata-callout-title">`);
    parts.push(`<span class="strata-callout-icon">${buildIcon(meta.icon)}</span>`);
    parts.push(`<span class="strata-callout-title-text">${title}</span>`);
    if (foldable) {
      parts.push(`<span class="strata-callout-fold">${FOLD_ICON}</span>`);
    }
    parts.push(`</${foldable ? 'summary' : 'div'}>`);
    parts.push('<div class="strata-callout-content">');

    return parts.join('');
  };

  markdownIt.renderer.rules.mdf_callout_close = (tokens: IToken[], index: number): string => {
    const meta: ICalloutMeta | undefined = (tokens[index].meta as { callout?: ICalloutMeta } | undefined)?.callout;
    const foldable: boolean = !!meta && (meta.fold === '+' || meta.fold === '-');
    return `</div></${foldable ? 'details' : 'div'}>`;
  };
}
