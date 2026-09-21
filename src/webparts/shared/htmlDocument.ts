/**
 * .SYNOPSIS
 * Takes an HTML file apart into the three things a web part can use: its
 * content, its styles, and its title.
 *
 * .DESCRIPTION
 * An author points the HTML web part at a file, and that file is usually a
 * whole document rather than a fragment: a doctype, a head with a title and a
 * `<style>` block, and a body. None of that can be handed to a page as it
 * stands, and one part of it cannot be handed over at all.
 *
 * WHY THE STYLES COME OUT FIRST
 * Because the sanitiser removes them, and silently. Measured rather than
 * assumed:
 *
 *   <style>.a{color:red}</style><p>hi</p>   ->  <p>hi</p>
 *   <p style="color:red">hi</p>             ->  <p style="color:red">hi</p>
 *
 * So a per-element style attribute survives sanitising and a `<style>` block
 * does not. Sanitise first and an author's stylesheet is gone with no error,
 * which is the whole of what they wrote to make the document look like
 * anything. The blocks are lifted out here, handed back separately, and the
 * caller scopes them with scopeCss before putting them on the page.
 *
 * That is also why the styles are returned unscoped. This function knows what
 * an HTML file holds; it does not know what root the web part will render into,
 * and the two web parts on one page need different ones.
 *
 * WHICH WAY THIS FAILS
 * A `<style>` block this misses is one the sanitiser then deletes: the styling
 * is lost, nothing runs. Something extracted that was not really a style block
 * becomes a CSS rule in a sheet the author already controls, scoped to their
 * own content. Neither is an escalation, and the first is the direction to fail
 * in.
 *
 * A closing tag cannot appear inside a `<style>` element - the HTML parser ends
 * the element at the first `</style`, whatever follows it - so reading to the
 * first close is what a browser does too, and a regular expression is the right
 * shape for once.
 *
 * .USAGE
 *   import { splitHtmlDocument } from './htmlDocument';
 *   import { scopeCss } from './scopedCss';
 *
 *   const parts = splitHtmlDocument(raw);
 *   article.innerHTML = parts.body;                    // already sanitised
 *   sheet.textContent = scopeCss(parts.css, root);     // scoped by the caller
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  the HTML web part bundle
 * Requires:  htmlSanitiser.ts
 */

import { sanitiseRenderedHtml } from '../markstrata/utils/htmlSanitiser';

/** A `<style>` element and everything up to its first closing tag. */
const STYLE_BLOCK: RegExp = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;

/** A `<title>`, for naming an export when the file has no heading. */
const TITLE: RegExp = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i;

export interface IHtmlDocument {
  /** The document's content, sanitised and ready for the page. */
  body: string;
  /**
   * Every rule from every `<style>` block in the file, in the order they
   * appeared, and not yet scoped: only the caller knows what to scope them to.
   */
  css: string;
  /** What the file called itself, if it called itself anything. */
  title: string | undefined;
}

/**
 * An HTML file, split into what can be shown and what has to be scoped.
 *
 * Sanitising happens here rather than in the caller so there is one path in and
 * no way to render the body without it having been through this.
 */
export function splitHtmlDocument(raw: string): IHtmlDocument {
  if (!raw) {
    return { body: '', css: '', title: undefined };
  }

  const styles: string[] = [];
  /* Collected and removed in one pass. Removed as well as collected because
     the sanitiser would drop them anyway and leaving them in would put the
     rules through twice for anything that survived. */
  const withoutStyles: string = raw.replace(
    STYLE_BLOCK,
    (all: string, inner: string): string => {
      styles.push(inner);
      return '';
    }
  );

  return {
    body: sanitiseRenderedHtml(withoutStyles),
    css: styles.join('\n').trim(),
    title: titleOf(raw)
  };
}

/**
 * The document's title, tidied.
 *
 * Entities are not decoded and markup inside is not read: a title is text, and
 * this is used to name an export, not to render anything. Anything that is not
 * plainly text is dropped rather than guessed at.
 */
export function titleOf(raw: string): string | undefined {
  const found: RegExpExecArray | null = TITLE.exec(raw || '');
  if (!found) {
    return undefined;
  }
  const text: string = found[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : undefined;
}
