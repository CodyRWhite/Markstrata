/**
 * .SYNOPSIS
 * The trail of documents a reader has walked, carried on the address so it
 * survives a whole page load.
 *
 * .DESCRIPTION
 * A wiki can be built two ways. One page whose web part swaps documents as
 * links are followed, which is what the trail in DocumentNavigator is for: the
 * page never unloads, so the trail can live in memory and in the history
 * entry. Or one SharePoint page per document, each holding a web part of its
 * own, which is the shape a wiki takes when its pages want their own
 * permissions, their own names in navigation and their own place in search.
 *
 * The second shape lost the trail at every click. A link to a .aspx page is a
 * navigation: the page unloads, the web part goes with it, and the one that
 * starts on the other side has no way of knowing where the reader came from.
 * The history entry the navigator writes is no help either, because that state
 * belongs to the entry it was pushed into and a new page makes a new one.
 *
 * So the trail travels in the query string, which is the one thing that
 * survives a navigation and arrives before the web part starts.
 *
 * WHY THE LINKS ARE REWRITTEN RATHER THAN THE CLICKS TAKEN
 * The obvious build is a click handler that appends the trail and then
 * navigates. This does not do that. The href is rewritten where the document
 * is rendered, so the address already carries the trail before anybody clicks
 * it - which means a middle click, a Ctrl click, "copy link address" and the
 * reader who opens it in a new tab tomorrow all carry the trail too, and the
 * web part never has to fight the page's own router for a click.
 *
 * WHAT IS AND IS NOT TAKEN
 * Only a .aspx page in the same site collection. Not the whole tenant: a page
 * title is written into the address by this, and a title from one site does
 * not belong in a URL pointing at another. A link out of the site navigates
 * exactly as it did before, with nothing added.
 *
 * HOW IT FAILS
 * Every way it can fail, it fails to no trail rather than to a wrong one. A
 * parameter that is missing, truncated by a length cap somewhere, or written
 * by hand into something that does not parse yields an empty trail and the bar
 * is drawn from what the page knows on its own. A crumb missing either half is
 * dropped rather than drawn as a link to nowhere.
 *
 * .USAGE
 *   import { trailFromSearch, withTrail, sameSiteCollection } from './pageTrail';
 *
 *   const arrived: IPageCrumb[] = trailFromSearch(window.location.search);
 *   const onward: IPageCrumb[] = arrived.concat([{ label: 'Deploy', url: here }]);
 *   link.setAttribute('href', withTrail(link.getAttribute('href'), onward));
 *
 * .NOTES
 * Since:     0.0.23.0
 * Ships in:  both web part bundles
 * Requires:  nothing
 */

/** One step in the trail: what it is called, and the page it goes back to. */
export interface IPageCrumb {
  label: string;
  url: string;
}

/** The query parameter the trail rides in. */
export const TRAIL_PARAMETER: string = 'strataTrail';

/**
 * How many crumbs are kept.
 *
 * A trail longer than this is a reader who has been wandering, and the near
 * end is the part they would use. The far end is dropped rather than the
 * whole thing refused, because a short trail is still a way back and an
 * address that grows without limit eventually stops being followed at all:
 * browsers, mail clients and SharePoint itself all cut a long URL somewhere.
 */
export const MAX_CRUMBS: number = 8;

/**
 * And a cap on the whole encoded string, because eight crumbs of ordinary
 * length and eight crumbs of pathological length are not the same address.
 * Measured on the encoded form, since that is what has to travel.
 */
const MAX_ENCODED: number = 1600;

/* A SharePoint page. Pages are what this follows; a document is somebody
   else's job, and is followed inside the web part rather than by leaving. */
export const PAGE_LINK: RegExp = /\.aspx$/i;

/*
 * Fields are joined by a comma and crumbs by a pipe, and every field is
 * percent-encoded first. Both separators are characters encodeURIComponent
 * always escapes, so neither can survive inside a field and the split is
 * unambiguous whatever anybody has called a page.
 */
const BETWEEN_FIELDS: string = ',';
const BETWEEN_CRUMBS: string = '|';

/** The trail as one string, ready to be a query parameter's value. */
export function encodeTrail(crumbs: IPageCrumb[]): string {
  const kept: IPageCrumb[] = crumbs
    .filter((crumb: IPageCrumb) => !!(crumb && crumb.label && crumb.url))
    .slice(-MAX_CRUMBS);

  const encoded: string = kept
    .map((crumb: IPageCrumb) =>
      `${encodeURIComponent(crumb.label)}${BETWEEN_FIELDS}${encodeURIComponent(crumb.url)}`)
    .join(BETWEEN_CRUMBS);

  /* Over the cap, drop from the far end one at a time rather than cutting the
     string, which would leave a half-written crumb for the other side to
     puzzle over. */
  if (encoded.length <= MAX_ENCODED) {
    return encoded;
  }
  return kept.length > 1 ? encodeTrail(kept.slice(1)) : '';
}

/** And back again, dropping anything that does not read as a crumb. */
export function decodeTrail(value: string | undefined): IPageCrumb[] {
  if (!value) {
    return [];
  }

  return value
    .split(BETWEEN_CRUMBS)
    .map((part: string) => {
      const comma: number = part.indexOf(BETWEEN_FIELDS);
      if (comma === -1) {
        return undefined;
      }
      try {
        return {
          label: decodeURIComponent(part.slice(0, comma)),
          url: decodeURIComponent(part.slice(comma + 1))
        };
      } catch {
        /* Not valid percent-encoding, so this crumb was not written by us.
           One bad crumb does not cost the rest of the trail. */
        return undefined;
      }
    })
    .filter((crumb: IPageCrumb | undefined): crumb is IPageCrumb =>
      !!crumb && !!crumb.label && isSafeAddress(crumb.url))
    .slice(-MAX_CRUMBS);
}

/**
 * Whether a crumb's address is one worth drawing a link to.
 *
 * The trail arrives on the address, so anybody can write one. A crumb is only
 * ever a way back to a page on this server, so a path is what is accepted and
 * everything else - another site, and `javascript:` above all - is refused
 * rather than rendered as a link somebody might click.
 */
function isSafeAddress(url: string): boolean {
  return url.charAt(0) === '/' && url.charAt(1) !== '/';
}

/** The trail on a page's own address. */
export function trailFromSearch(search: string): IPageCrumb[] {
  if (!search) {
    return [];
  }
  try {
    return decodeTrail(new URLSearchParams(search).get(TRAIL_PARAMETER) || undefined);
  } catch {
    return [];
  }
}

/**
 * An address with the trail written onto it, or with it taken off when the
 * trail is empty.
 *
 * Whatever else the address carries is left alone: a page addressed with
 * `?strataDoc=` keeps it, because the two answer different questions - which
 * document to draw, and how the reader got here.
 */
export function withTrail(url: string, crumbs: IPageCrumb[]): string {
  const hash: number = url.indexOf('#');
  const fragment: string = hash === -1 ? '' : url.slice(hash);
  const address: string = hash === -1 ? url : url.slice(0, hash);

  const query: number = address.indexOf('?');
  const path: string = query === -1 ? address : address.slice(0, query);

  /*
   * Spliced by hand rather than read into URLSearchParams and written back
   * out. Reading a query in and serialising it again is value-preserving but
   * not spelling-preserving: it would re-encode every other parameter into the
   * form URLSearchParams prefers, and `strataDoc` is deliberately written with
   * its slashes and accents left alone so the address stays something a person
   * can read. Only this parameter is touched; every other one comes through
   * byte for byte.
   */
  const others: string[] = (query === -1 ? '' : address.slice(query + 1))
    .split('&')
    .filter((part: string) => part && part.indexOf(`${TRAIL_PARAMETER}=`) !== 0);

  const encoded: string = encodeTrail(crumbs);
  /* Encoded once more on the way in, so the per cent signs of the escapes
     inside it are escapes of their own and reading the parameter back hands
     over exactly the string encodeTrail produced. */
  const written: string[] = encoded
    ? others.concat([`${TRAIL_PARAMETER}=${encodeURIComponent(encoded)}`])
    : others;

  return `${path}${written.length ? `?${written.join('&')}` : ''}${fragment}`;
}

/**
 * The site collection a server-relative path is in: `/sites/wiki`, `/teams/ops`
 * or `` for a path on the root site.
 *
 * Read from the shape of the path rather than asked of SharePoint, because
 * this is wanted while a link is being drawn and an answer that needs the
 * network is not an answer at that moment.
 */
export function siteCollectionOf(path: string): string {
  const match: RegExpExecArray | null = /^\/(sites|teams)\/([^/?#]+)/i.exec(path);
  return match ? `/${match[1].toLowerCase()}/${decodeURIComponent(match[2]).toLowerCase()}` : '';
}

/** Whether two server-relative paths are in the same site collection. */
export function sameSiteCollection(here: string, there: string): boolean {
  return siteCollectionOf(here) === siteCollectionOf(there);
}
