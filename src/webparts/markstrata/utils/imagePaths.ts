/**
 * .SYNOPSIS
 * Resolving relative image sources against the folder the markdown came from.
 *
 * .DESCRIPTION
 * Kept apart from the processor so it can be reasoned about and tested on its
 * own: the encoding rules here are the fiddly part, and getting them wrong
 * shows up as a broken image rather than an error.
 *
 * .USAGE
 *   import { resolveAgainst, encodePath, folderOf } from './utils/imagePaths';
 *
 *   resolveAgainst('/sites/team/Runbooks', 'images/flow.png');
 *   //  -> '/sites/team/Runbooks/images/flow.png'
 *
 *   // A document fetched from a URL resolves against that URL:
 *   resolveAgainst('https://example.com/docs', 'images/flow.png');
 *   //  -> 'https://example.com/docs/images/flow.png'
 *
 *   // Returns undefined when the source already points somewhere of its own:
 *   resolveAgainst(base, 'https://example.com/a.png');   // undefined
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

/**
 * True when `source` points somewhere of its own accord and must be left alone:
 * an absolute URL, a protocol-relative one, a data URI, a fragment, or an
 * already server-relative path.
 */
export function isAbsoluteSource(source: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(source) ||   // http:, https:, data:, mailto:
    source.indexOf('//') === 0 ||            // protocol-relative
    source.charAt(0) === '/' ||              // already server-relative
    source.charAt(0) === '#'
  );
}

/**
 * Encodes a raw SharePoint path one segment at a time.
 *
 * `encodeURI` is not enough: it leaves `#`, `?` and `&` alone, and all three
 * are legal in SharePoint file and folder names. A folder genuinely called
 * "Q&A" would otherwise truncate the URL at the ampersand.
 */
export function encodePath(rawPath: string): string {
  return rawPath
    .split('/')
    .map((segment) => (segment ? encodeURIComponent(segment) : segment))
    .join('/');
}

/**
 * Joins a relative `source` onto `basePath`, honouring `.` and `..`.
 *
 * The base is one of two things and they are encoded differently.
 *
 * A SharePoint path arrives raw, the way SharePoint reports it, and is encoded
 * here. A base that carries a scheme and a host came out of a URL somebody
 * typed into the property pane and is already encoded, so it is left alone:
 * run through encodePath it became `/https%3A/host/...`, a path on the
 * SharePoint site rather than an address on the other server, with every %20
 * in it turned into %2520 on the way. Every relative link and every relative
 * picture in a document fetched from a URL pointed at that, and every one of
 * them was a 404.
 *
 * The source arrives already percent-encoded either way, because markdown-it
 * encodes it before any render rule sees it, so it is passed through untouched.
 *
 * Returns undefined when the source should be left as it is.
 */
export function resolveAgainst(basePath: string, source: string): string | undefined {
  if (!source || !basePath || isAbsoluteSource(source)) {
    return undefined;
  }

  /* Split off `https://host` so the walking below only ever handles path
     segments, and put it back at the end. Empty for a SharePoint path, which
     leaves that case exactly as it was. */
  const origin: string = originOf(basePath);
  const folders: string = origin ? basePath.slice(origin.length) : encodePath(basePath);

  const base: string[] = folders.split('/').filter((part) => part.length > 0);
  const [path, suffix] = splitSuffix(source);

  for (const segment of path.split('/')) {
    if (segment === '.' || segment === '') {
      continue;
    }
    if (segment === '..') {
      // Refuse to climb past the site: a source with enough ../ to escape is
      // more likely a mistake than an attempt to reach the server root.
      if (base.length === 0) {
        return undefined;
      }
      base.pop();
      continue;
    }
    base.push(segment);
  }

  return origin + '/' + base.join('/') + suffix;
}

/**
 * The `https://host` at the front of a base, or empty when there is none.
 *
 * A port is part of the host and stays with it. Anything else - a SharePoint
 * server-relative path, a bare folder name - has no origin and is walked as a
 * path, which is what this file did for everything before a document could be
 * fetched from somewhere other than SharePoint.
 */
function originOf(basePath: string): string {
  const found: RegExpExecArray | null = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.exec(basePath);
  return found ? found[0] : '';
}

/** Keeps any ?query or #fragment out of the segment walking. */
function splitSuffix(source: string): [string, string] {
  const firstMark: number = Math.min(
    ...['?', '#'].map((mark) => {
      const found: number = source.indexOf(mark);
      return found === -1 ? source.length : found;
    })
  );
  return [source.slice(0, firstMark), source.slice(firstMark)];
}

/** The folder part of a file's path: everything before the last separator. */
export function folderOf(filePath: string): string {
  const lastSlash: number = filePath.lastIndexOf('/');
  return lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
}
