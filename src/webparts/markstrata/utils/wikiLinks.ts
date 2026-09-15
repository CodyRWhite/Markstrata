/*
 * Wiki links: [[Another page]].
 *
 * Not markdown. CommonMark has no such thing and GitHub renders it only inside
 * a GitHub Wiki, but Obsidian, Logseq, Foam, Dendron and every wiki since the
 * first one write links this way, and a folder of notes moved into a document
 * library arrives full of them. Left alone they render as literal brackets,
 * which is the one outcome nobody wants.
 *
 * Four shapes, all of them borrowed rather than invented:
 *
 *   [[Deploy runbook]]                a page in the same folder
 *   [[Deploy runbook|how we ship]]    the same page, worded for the sentence
 *   [[Deploy runbook#Rollback]]       straight to a heading in that page
 *   [[#Rollback]]                     a heading in this document
 *
 * Whether the target exists cannot be answered here. Finding out means asking
 * SharePoint, which is a request per link and cannot happen while a string is
 * being rendered, so a link is written for every one of them and a missing
 * page is a 404 when it is followed. Marking them as broken without checking
 * would be worse than saying nothing.
 */

/** How a heading becomes the id that markdown-it-anchor gave it. */
import { encodePath } from './imagePaths';

export function headingAnchor(heading: string): string {
  return encodeURIComponent(
    heading.trim().toLowerCase().replace(/\s+/g, '-')
  );
}

export interface IWikiTarget {
  /** The page, empty when the link points inside this document. */
  page: string;
  /** The heading within it, empty when the link points at the page itself. */
  heading: string;
  /** What the link should read as. */
  label: string;
}

/**
 * Splits the inside of a `[[...]]` into its parts.
 *
 * The label is split off first, on the last pipe, so a page whose name
 * contains one is still named correctly.
 */
export function parseWikiLink(inner: string): IWikiTarget | undefined {
  const text: string = (inner || '').trim();
  if (!text) {
    return undefined;
  }

  const pipe: number = text.lastIndexOf('|');
  const target: string = (pipe === -1 ? text : text.slice(0, pipe)).trim();
  const label: string = pipe === -1 ? '' : text.slice(pipe + 1).trim();

  const hash: number = target.indexOf('#');
  const page: string = (hash === -1 ? target : target.slice(0, hash)).trim();
  const heading: string = hash === -1 ? '' : target.slice(hash + 1).trim();

  if (!page && !heading) {
    return undefined;
  }

  return {
    page: page,
    heading: heading,
    /* Unlabelled, a link reads as what it points at: the heading when it is
       one in this document, the page otherwise. */
    label: label || (page ? target.replace('#', ' › ') : heading)
  };
}

/**
 * The href for a target, given how this document's own relative paths resolve.
 *
 * `resolve` is the same function images are given, so a wiki link and an image
 * beside it in the text agree about where "the folder this document is in"
 * means. A page name with no extension gets `.md`, since that is what it is.
 */
export function wikiHref(
  target: IWikiTarget,
  resolve: (path: string) => string | undefined
): string {
  if (!target.page) {
    return `#${headingAnchor(target.heading)}`;
  }

  const named: string = /\.[a-z0-9]+$/i.test(target.page) ? target.page : `${target.page}.md`;
  /* Encoded here because a wiki target is read straight out of the document.
     A markdown link is percent-encoded by markdown-it before any rule sees it,
     and the resolver documents that it passes its input through untouched, so
     an unencoded space would reach the href as a space. */
  const file: string = encodePath(named);
  const resolved: string | undefined = resolve(file);
  const href: string = resolved === undefined ? file : resolved;
  return target.heading ? `${href}#${headingAnchor(target.heading)}` : href;
}

/**
 * The folder part of a resolved href, which is what a listing is asked for.
 *
 * Returns an empty string for anything that is not a path into the library:
 * a fragment, or a link that went somewhere of its own accord.
 */
export function folderOf(href: string): string {
  if (!href || href.charAt(0) !== '/') {
    return '';
  }
  const path: string = href.split('#')[0].split('?')[0];
  const lastSlash: number = path.lastIndexOf('/');
  return lastSlash <= 0 ? '' : path.slice(0, lastSlash);
}

/** The file name a href ends in, decoded back to how SharePoint reports it. */
export function fileOf(href: string): string {
  if (!href) {
    return '';
  }
  const path: string = href.split('#')[0].split('?')[0];
  const name: string = path.slice(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(name);
  } catch {
    /* A name that is not valid percent-encoding is compared as written. */
    return name;
  }
}

/**
 * Groups hrefs by the folder that would answer for them, so a document full of
 * links to the same folder costs one listing rather than one request each.
 */
export function byFolder(hrefs: string[]): { [folder: string]: string[] } {
  const groups: { [folder: string]: string[] } = {};
  hrefs.forEach((href: string) => {
    const folder: string = folderOf(href);
    if (!folder) {
      return;
    }
    groups[folder] = (groups[folder] || []).concat(fileOf(href));
  });
  return groups;
}
