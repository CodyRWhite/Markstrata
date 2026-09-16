/**
 * .SYNOPSIS
 * The document named in the page's address, so something outside the web part
 * can choose what it shows.
 *
 * .DESCRIPTION
 * A wiki has a menu, and a menu is links. Without this, every entry on a
 * SharePoint navigation bar can only point at the page, which shows whatever
 * one document the page was configured with, so the menu stops being a menu
 * after the first item: a reader gets to the home document and has to find
 * everything else by following links out of it.
 *
 * With it, a menu entry points at the page and names a document, and the web
 * part opens that document the way it opens one a reader followed a link to.
 * The configured document is still the page's own, and the bar above the
 * document still goes back to it.
 *
 * The value is read from the address bar, which means it is written by
 * whoever wrote the link, so it is checked rather than trusted. Only a
 * markdown file is accepted: the path is handed to SharePoint and fetched with
 * the reader's own session, so SharePoint decides what they may read, but a
 * renderer is not the place to point at arbitrary files either.
 *
 * .USAGE
 *   import { documentFromAddress, DOCUMENT_PARAMETER } from './utils/documentParameter';
 *
 *   // ?strataDoc=/sites/wiki/Shared%20Documents/Runbooks/Database.md
 *   // ?strataDoc=Runbooks/Database.md            relative to the configured document
 *   // ?strataDoc=Runbooks/Database.md%23Backups  and straight to a heading in it
 *   const wanted = documentFromAddress(window.location.search, folderOfTheConfiguredFile);
 *   if (wanted) {
 *     void navigator.open(wanted.path, wanted.heading, false);
 *   }
 *
 * .NOTES
 * Since:     0.0.18.4
 * Ships in:  the web part bundle
 * Requires:  imagePaths.ts
 */

import { resolveAgainst } from './imagePaths';

/**
 * Named rather than something short like `doc`, because this rides on a
 * SharePoint page's address beside SharePoint's own parameters and whatever
 * else a tenant puts there. A collision would be somebody else's bug to
 * suffer.
 */
export const DOCUMENT_PARAMETER: string = 'strataDoc';

export interface IWantedDocument {
  path: string;
  /** The heading to land on, empty when the link names none. */
  heading: string;
}

/**
 * Reads the document out of a query string.
 *
 * `base` is the folder the configured document lives in, so a menu can name a
 * document the short way, relative to it, rather than repeating the site and
 * library in every entry. An address that starts with a slash is taken as it
 * is, which is what somebody pasting a path from SharePoint will have.
 */
export function documentFromAddress(
  search: string,
  base: string | undefined
): IWantedDocument | undefined {
  if (!search) {
    return undefined;
  }

  let asked: string | null;
  try {
    asked = new URLSearchParams(search).get(DOCUMENT_PARAMETER);
  } catch {
    /* A query string that will not parse is one nobody meant. */
    return undefined;
  }
  if (!asked) {
    return undefined;
  }

  /*
   * The heading travels inside the value rather than as the address's own
   * fragment, because the fragment belongs to the page and SharePoint uses it.
   * It arrives encoded, which URLSearchParams has already undone - and that is
   * the difficulty: once decoded, a # that is part of a file name looks exactly
   * like the one separating the heading.
   *
   * So the split is made at the extension rather than at the first #. The
   * document part has to end in .md or .markdown, because that is the only
   * thing this can open, and everything after that is the heading. Splitting on
   * the first # instead meant a file called "What is #1 + why.md" was read as a
   * document called "What is " and refused for not being markdown, which is a
   * refusal with nothing in it a reader could act on.
   *
   * Non-greedy, so "notes.md#see-a.md" is notes.md and a heading rather than
   * one long file name. A folder that ends in .md still works, because the
   * match has to reach the end of the value and backtracks until it does.
   */
  const split: RegExpExecArray | null =
    /^(.*?\.(?:md|markdown))(?:#(.*))?$/i.exec(asked);
  if (!split) {
    return undefined;
  }
  const wanted: string = split[1];
  const heading: string = split[2] || '';

  /* A whole address, which a menu entry can only usefully carry when the page
     is already reading from one: the base it would otherwise be resolved
     against is a URL, and the documents around it are on that server. Left
     encoded, because it is fetched rather than looked up. */
  if (/^https?:\/\//i.test(wanted)) {
    return base && /^https?:\/\//i.test(base)
      ? { path: wanted, heading: heading }
      : undefined;
  }

  /* Absolute is used as written; anything else is resolved against the
     configured document's folder, the same way a link inside one is. */
  if (wanted.charAt(0) === '/') {
    return { path: wanted, heading: heading };
  }

  const resolved: string | undefined = base ? resolveAgainst(base, wanted) : undefined;
  if (!resolved) {
    return undefined;
  }
  return { path: asPath(resolved), heading: heading };
}

/**
 * A path, not a URL.
 *
 * resolveAgainst builds addresses for the browser to follow, so it encodes the
 * folder it resolves against - which leaves a path with an encoded folder and
 * an unencoded file name stuck together. What comes out of here is handed to
 * SharePoint to fetch, and SharePoint does its own encoding, so it wants the
 * plain path.
 *
 * This is the same mistake that stopped every wiki link to a file with a space
 * in its name from opening, one layer along. Writing it down here because the
 * next thing to resolve a path will meet it too.
 */
function asPath(resolved: string): string {
  try {
    return decodeURIComponent(resolved);
  } catch {
    return resolved;
  }
}

/**
 * The address a menu entry should point at, for a given page and document.
 *
 * Here so that the one place that builds these and the one place that reads
 * them cannot drift apart, and so the documentation can show a real example
 * rather than a hand-written guess at the format.
 */
export function addressForDocument(pageUrl: string, documentPath: string, heading?: string): string {
  const base: string = addressWithoutDocument(pageUrl);
  const value: string = heading ? `${documentPath}#${heading}` : documentPath;
  const separator: string = base.indexOf('?') === -1 ? '?' : '&';
  return `${base}${separator}${DOCUMENT_PARAMETER}=${encodeURIComponent(value)}`;
}

/**
 * The same page address with any document taken off it.
 *
 * A reader following links arrived at one of these, so the address to build
 * from already carries a document and appending a second would leave two of
 * the same parameter, with the browser free to read either. Also what the
 * address is for the page's own configured document: not an empty parameter,
 * no parameter.
 *
 * Everything else on the address is left where it is. A tenant puts its own
 * parameters on a page and they are not this code's to tidy up.
 */
export function addressWithoutDocument(pageUrl: string): string {
  const url: string = pageUrl || '';
  const mark: number = url.indexOf('?');
  if (mark === -1) {
    return url;
  }

  const hash: number = url.indexOf('#', mark);
  const query: string = hash === -1 ? url.slice(mark + 1) : url.slice(mark + 1, hash);
  const fragment: string = hash === -1 ? '' : url.slice(hash);

  const kept: string[] = query.split('&').filter((pair: string) =>
    pair.length > 0 && pair.split('=')[0] !== DOCUMENT_PARAMETER);

  const head: string = url.slice(0, mark);
  return kept.length ? `${head}?${kept.join('&')}${fragment}` : `${head}${fragment}`;
}
