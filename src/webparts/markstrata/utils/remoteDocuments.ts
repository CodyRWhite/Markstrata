/**
 * .SYNOPSIS
 * Documents that live somewhere other than this tenant, and what it takes to
 * open one.
 *
 * .DESCRIPTION
 * The "File URL" source points the web part at a markdown file anywhere that
 * will answer. Everything relative inside that document then resolves against
 * the folder the URL is in, so a wiki link in it names a real address on that
 * server. Following one used to leave the page for the file itself, which on a
 * raw host means the reader gets markdown as plain text: the source of the
 * page they were reading rather than the page.
 *
 * Two things stand between a link and the document it names.
 *
 * The first is which address actually holds the markdown. A link somebody
 * copies out of GitHub is the blob page, `github.com/org/repo/blob/main/a.md`,
 * and that is an HTML page of GitHub's own with the document inside it. The
 * file itself is on raw.githubusercontent.com. So a GitHub address is
 * translated before it is fetched, and the reader never has to know there were
 * two of them.
 *
 * The second is that the other server decides. A browser will not let this
 * page read a response from another origin unless that server says so, and it
 * says so out of band, in a header nobody writing a wiki link can see. GitHub's
 * raw host allows it. A SharePoint tenant reached by URL from another tenant
 * does not. There is nothing to be done about that from here, so when it
 * happens the reader is told which of the two it was rather than being handed
 * "failed to fetch": one is a document that is not there, the other is a
 * document that is there and may not be read from this page.
 *
 * .USAGE
 *   import { isRemote, fetchableUrl, remoteFailure } from './utils/remoteDocuments';
 *
 *   if (isRemote(path)) {
 *     try {
 *       markdown = await SharePointService.fetchUrl(fetchableUrl(path));
 *     } catch (error) {
 *       throw new Error(remoteFailure(path, error));
 *     }
 *   }
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

/** An address of its own, rather than a path inside this tenant. */
export function isRemote(path: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(path || '');
}

/**
 * The address that actually returns the markdown.
 *
 * `github.com/org/repo/blob/<ref>/<path>` is a page about the file, not the
 * file. The same document is at `raw.githubusercontent.com/org/repo/<ref>/<path>`,
 * which returns the markdown itself and allows this page to read it. A link
 * written against either one therefore opens, which matters because the one
 * people copy is the blob page.
 *
 * `?raw=1` on a blob address means the same thing and is translated the same
 * way. Anything else is returned exactly as it arrived: guessing at other
 * hosts' URL shapes is how a fetch ends up pointed at a page nobody wrote.
 */
export function fetchableUrl(url: string): string {
  const address: string = url || '';
  const blob: RegExpExecArray | null =
    /^(https?:\/\/)(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i.exec(address);
  if (!blob) {
    return address;
  }

  /* The query is GitHub's, not the file's: ?raw=1 asked for exactly what this
     is about to fetch anyway, and a fragment is a line number on the blob
     page. Neither means anything to the raw host. */
  const withoutQuery: string = blob[4].split('?')[0].split('#')[0];
  return `${blob[1]}raw.githubusercontent.com/${blob[2]}/${blob[3]}/${withoutQuery}`;
}

/** The host an address is on, or empty when it has none to read. */
function hostOf(url: string): string {
  const found: RegExpExecArray | null = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url || '');
  return found ? found[1] : '';
}

/**
 * Why a remote document did not open, in words a reader can act on.
 *
 * A browser reports a blocked cross-origin read as a failed fetch and says no
 * more than that, on purpose: telling a page why it was refused would itself
 * leak something about the other server. So the two cases cannot be told apart
 * from the error, and the message says both rather than picking one and being
 * wrong half the time. What it must not do is say "not found", which sends
 * somebody to look for a file that is sitting right where they put it.
 *
 * `kind` is what the caller went looking for, and defaults to "document"
 * because that is what most of them want. A code fence naming a source file
 * says "file": it is showing somebody's code, not opening a page.
 */
export function remoteFailure(url: string, error: unknown, kind?: string): string {
  const host: string = hostOf(fetchableUrl(url)) || 'that server';
  const reported: string = (error as Error) && (error as Error).message
    ? (error as Error).message : '';

  /* An HTTP status came back, so the request was allowed and answered: the
     server's own answer is the more useful thing to repeat. */
  if (/HTTP \d/.test(reported)) {
    return reported;
  }

  /* "document" where a document was asked for, "file" in a code block, which
     is reading somebody's source rather than a page. The word is the caller's
     because only the caller knows which it asked for. */
  const what: string = kind || 'document';
  return `Could not read this ${what} from ${host}.`
    + ` Either it is not there, or ${host} does not allow pages on this site to`
    + ' read it. A server has to opt in to that and most do not.';
}
