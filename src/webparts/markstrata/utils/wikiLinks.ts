/**
 * .SYNOPSIS
 * Wiki links: [[Another page]].
 *
 * .DESCRIPTION
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
 *
 * .USAGE
 *   import { parseWikiLink, wikiHref } from './utils/wikiLinks';
 *
 *   const target = parseWikiLink('Deploy runbook#Rollback');
 *   const href: string = wikiHref(target, (path) => resolveAgainst(folder, path));
 *
 * .NOTES
 * Since:     0.0.14.0
 * Ships in:  the web part bundle
 * Requires:  imagePaths.ts
 */

import { encodePath } from './imagePaths';

/*
 * Everything a heading may keep in its id: digits, unqualified letters, a
 * space, a hyphen and an underscore, plus the ranges where the letters of
 * every other alphabet live. Everything else - the colon in "Step 1: Install",
 * the hash in "C# and .NET", the apostrophe and the question mark in "What's
 * new?" - comes out.
 *
 * Written as ranges rather than as `\p{L}`, which needs a newer compilation
 * target than SharePoint Framework pins. The ranges deliberately stop short of
 * U+2000, so curly quotes, dashes and ellipses are punctuation here as well.
 */
const NOT_IN_A_SLUG: RegExp =
  /[^0-9a-z \-_\u00c0-\u1fff\u2c00-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]/g;

/**
 * How a heading becomes the id it can be linked to.
 *
 * GitHub's rule, which VS Code and Obsidian follow as well: lower case, drop
 * the punctuation, spaces to hyphens. The point of matching it is that an
 * anchor is written by hand, in another document, often by somebody reading
 * the page on GitHub, and a link that works there has to work here.
 *
 * This is the one place the rule lives. The heading ids, the entries in a
 * generated table of contents and the target of a `[[Page#Heading]]` all come
 * through here, and a heading whose id is made one way and linked another way
 * is a link to nothing.
 */
export function headingSlug(heading: string): string {
  return (heading || '')
    .trim()
    .toLowerCase()
    .replace(NOT_IN_A_SLUG, '')
    .replace(/ /g, '-');
}

/** The same, kept under the name the rest of the web part already calls it. */
export function headingAnchor(heading: string): string {
  return headingSlug(heading);
}

/**
 * The id a heading used to get, before the move to GitHub's rule.
 *
 * Every `[[Page#Heading]]` and `#anchor` already written in a library was
 * written against this one, and changing the rule would have broken all of
 * them at once. A heading still answers to its old id as well, so those links
 * keep landing; this is what works out what to call it.
 */
export function legacyHeadingAnchor(heading: string): string {
  return encodeURIComponent(
    (heading || '').trim().toLowerCase().replace(/\s+/g, '-')
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
  /* The backslash in `[[Page\|label]]` belongs to the pipe, not to the page.
     Obsidian documents that escaped form as the way to write a wiki link
     inside a table, where a bare pipe would end the cell, so it is the shape
     most links in a table arrive in. Left on, it reaches the href as `%5C`
     and every one of those links points at a file that cannot exist. */
  const written: string = pipe === -1 ? text : text.slice(0, pipe).replace(/\\$/, '');
  const target: string = written.trim();
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
  const folder: string = lastSlash <= 0 ? '' : path.slice(0, lastSlash);

  /* Decoded, exactly as fileOf below decodes the name beside it: this is
     handed to SharePoint to list, and SharePoint does its own encoding. A
     library called "Shared Documents" - which is most of them - was asked for
     as "Shared%20Documents", found nothing, and every link in it went
     unchecked without anything to show for it. */
  try {
    return decodeURIComponent(folder);
  } catch {
    return folder;
  }
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
