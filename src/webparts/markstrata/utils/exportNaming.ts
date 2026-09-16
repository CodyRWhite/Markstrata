/**
 * .SYNOPSIS
 * What an exported document calls itself, and where it says it came from.
 *
 * .DESCRIPTION
 * The cover of an export carries three things: a title, the place the document
 * lives, and the date it was taken. None of them is difficult and all of them
 * are easy to get subtly wrong, which is why they are here rather than inline
 * in the middle of the DOM building: the rules can be read, and they can be
 * tested without a browser.
 *
 * A document's title is its first heading, because that is what the document
 * itself says it is called. Only when it has no heading does the file name
 * stand in, and then without its extension, because `deploy.md` is a file and
 * "deploy" is a document.
 *
 * Where it came from is the path with the parts nobody needs taken off the
 * front. `/sites/it-wiki/Documents/Runbooks/deploy.md` is a true answer and a
 * useless one: the managed path and the site name are the same on every
 * document in the wiki, so they say nothing about this one.
 *
 * .USAGE
 *   import { documentTitle, sourceLabel } from './utils/exportNaming';
 *
 *   documentTitle(article, 'deploy.md');   // 'Deploying the service'
 *   sourceLabel('/sites/it-wiki/Documents/Runbooks/deploy.md');
 *   // 'Documents / Runbooks / deploy.md'
 *
 * .NOTES
 * Since:     0.0.20.0
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

/**
 * SharePoint's managed paths: the segment before a site's own name.
 *
 * A tenant can be configured with others, and one that is will simply keep the
 * segment, which is a longer label rather than a wrong one.
 */
const MANAGED_PATHS: string[] = ['sites', 'teams', 'personal'];

/**
 * What the document calls itself.
 *
 * The first heading, whatever level it is: a document that opens at `##`
 * rather than `#` is still opening with its title. The heading's own permalink
 * comes off first, because it is a `#` this web part added for the reader
 * rather than a character the author wrote.
 *
 * `fallback` is the file name, used only when there is no heading at all.
 */
export function documentTitle(
  article: HTMLElement | undefined,
  fallback: string
): string {
  const heading: HTMLElement | null = article
    ? article.querySelector('h1, h2, h3, h4, h5, h6')
    : null;

  if (heading) {
    const written: string = headingText(heading);
    if (written) {
      return written;
    }
  }

  return withoutExtension(fallback) || 'Document';
}

/**
 * A heading's words, without the anchor this web part puts beside it.
 *
 * Read from a clone so that removing the anchor does not remove it from the
 * document on screen, which is still being read.
 */
function headingText(heading: HTMLElement): string {
  const copy: HTMLElement = heading.cloneNode(true) as HTMLElement;
  const anchors: HTMLElement[] = Array.prototype.slice.call(
    copy.querySelectorAll('.strata-anchor')
  );
  anchors.forEach((anchor: HTMLElement) => {
    if (anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }
  });
  return (copy.textContent || '').replace(/\s+/g, ' ').trim();
}

/** `deploy.md` is a file; "deploy" is a document. */
function withoutExtension(name: string): string {
  return (name || '').replace(/\.[a-z0-9]+$/i, '').trim();
}

/**
 * Where the document lives, said the shortest way that still says it.
 *
 * The managed path and the site name come off the front, because they are the
 * same on every document in a wiki and so distinguish none of them. What is
 * left is the library and the folders inside it, which is what somebody
 * holding the printout wants in order to find the thing again.
 *
 * An address keeps its host and loses its scheme: the host is the part that
 * says whose document this is.
 *
 * Anything that is not a path is handed back as it came, because a label is
 * not worth failing an export over.
 */
export function sourceLabel(path: string): string {
  const written: string = (path || '').trim();
  if (!written) {
    return '';
  }

  const asUrl: RegExpExecArray | null = /^[a-z][a-z0-9+.-]*:\/\/([^/]+)(\/.*)?$/i.exec(written);
  if (asUrl) {
    const rest: string[] = segments(decodeOrKeep(asUrl[2] || ''));
    return [asUrl[1]].concat(rest).join(' / ');
  }

  if (written.charAt(0) !== '/') {
    return decodeOrKeep(written);
  }

  const parts: string[] = segments(decodeOrKeep(written));
  /* `/sites/it-wiki/...` loses two segments, `/Documents/...` loses none. */
  const managed: boolean = parts.length > 2
    && MANAGED_PATHS.indexOf(parts[0].toLowerCase()) !== -1;
  const kept: string[] = managed ? parts.slice(2) : parts;

  return (kept.length ? kept : parts).join(' / ');
}

/** The date an export was taken, written the way the reader's browser writes one. */
export function exportDate(when: Date): string {
  try {
    return when.toLocaleDateString(undefined, {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch {
    /* A browser that will not format a date is not a reason to lose the cover. */
    return when.toISOString().slice(0, 10);
  }
}

function segments(path: string): string[] {
  return path.split('/').filter((part: string) => part.length > 0);
}

function decodeOrKeep(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
