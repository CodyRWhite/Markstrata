/*
 * Resolving relative image sources against the folder the markdown came from.
 *
 * Kept apart from the processor so it can be reasoned about and tested on its
 * own: the encoding rules here are the fiddly part, and getting them wrong
 * shows up as a broken image rather than an error.
 */

/**
 * True when `src` points somewhere of its own accord and must be left alone:
 * an absolute URL, a protocol-relative one, a data URI, a fragment, or an
 * already server-relative path.
 */
export function isAbsoluteSource(src: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(src) ||   // http:, https:, data:, mailto:
    src.indexOf('//') === 0 ||            // protocol-relative
    src.charAt(0) === '/' ||              // already server-relative
    src.charAt(0) === '#'
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
 * Joins a relative `src` onto `basePath`, honouring `.` and `..`.
 *
 * The base arrives raw, the way SharePoint reports it, and is encoded here.
 * The src arrives already percent-encoded, because markdown-it encodes it
 * before any render rule sees it, so it is passed through untouched - encoding
 * it again would turn every %20 into %2520.
 *
 * Returns undefined when the src should be left as it is.
 */
export function resolveAgainst(basePath: string, src: string): string | undefined {
  if (!src || !basePath || isAbsoluteSource(src)) {
    return undefined;
  }

  const base: string[] = encodePath(basePath).split('/').filter((part) => part.length > 0);
  const [path, suffix] = splitSuffix(src);

  for (const segment of path.split('/')) {
    if (segment === '.' || segment === '') {
      continue;
    }
    if (segment === '..') {
      // Refuse to climb past the site: a src with enough ../ to escape is
      // more likely a mistake than an attempt to reach the server root.
      if (base.length === 0) {
        return undefined;
      }
      base.pop();
      continue;
    }
    base.push(segment);
  }

  return '/' + base.join('/') + suffix;
}

/** Keeps any ?query or #fragment out of the segment walking. */
function splitSuffix(src: string): [string, string] {
  const cut: number = Math.min(
    ...['?', '#'].map((mark) => {
      const at: number = src.indexOf(mark);
      return at === -1 ? src.length : at;
    })
  );
  return [src.slice(0, cut), src.slice(cut)];
}

/** The folder part of a file's path: everything before the last separator. */
export function folderOf(filePath: string): string {
  const at: number = filePath.lastIndexOf('/');
  return at === -1 ? '' : filePath.slice(0, at);
}
