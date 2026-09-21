/**
 * .SYNOPSIS
 * Builds the document that goes inside the HTML web part's frame, and the
 * sandbox attribute that decides what it is allowed to do.
 *
 * .DESCRIPTION
 * Frame mode is the strongest of the three ways the HTML web part can render a
 * document. The document is a document of its own rather than part of the
 * SharePoint page, so the author's CSS cannot reach the page and the page's CSS
 * cannot reach the author's document, and it is the only mode in which the
 * author's own scripts can run at all.
 *
 * WHAT THE TWO SANDBOXES ARE, AND WHY THEY DIFFER
 * The sandbox is the whole of the safety here, so it is spelled out rather
 * than tuned:
 *
 *   scripts off  allow-same-origin allow-popups allow-popups-to-escape-sandbox
 *                allow-top-navigation-by-user-activation
 *   scripts on   allow-scripts allow-popups allow-popups-to-escape-sandbox
 *
 * allow-same-origin and allow-scripts are never granted together. Together
 * they are not a sandbox at all: a script in the frame could reach the page
 * around it, read the reader's SharePoint session, and remove its own sandbox
 * attribute. That combination is the one thing this module will not build.
 *
 * With scripts off, allow-same-origin is safe and worth having, because there
 * is no script in the frame to make any use of it - and it lets the web part
 * measure the document's height, which is what "fit content" needs. With
 * scripts on the frame is an opaque origin instead: nothing in it can see the
 * page, and the page cannot see in, which is also why "fit content" is not
 * offered in that mode.
 *
 * allow-top-navigation-by-user-activation is granted only with scripts off. It
 * is what lets a link to a neighbouring document replace the page the reader is
 * on rather than open a tab, and the "by user activation" half means a real
 * click is required. With scripts on it is withheld: a script could rewrite a
 * link's address and then the reader's own click would carry them off to it.
 *
 * WHY THE MARKUP IS NOT SANITISED WHEN SCRIPTS ARE ON
 * Because the scripts are the point of that mode, and a sanitiser removes
 * them. That is a deliberate trade and it is why the setting is off by
 * default, why it exists in this mode only, and why the pane says plainly what
 * turning it on means. With scripts off, every mode sanitises.
 *
 * WHY THE DOCUMENT IS ASSEMBLED THROUGH DOMParser
 * Because a DOMParser document is inert: nothing in it runs, and no picture,
 * stylesheet or frame in it is fetched. Assigning the same markup to a live
 * element's innerHTML would start loading its images, and an `onerror` on one
 * of those would run the author's script in the page rather than in the frame
 * - the exact escalation this mode exists to prevent. So the links are
 * rewritten and the ids are added in a document that cannot do anything, and
 * only the serialised result reaches the frame.
 *
 * WHICH WAY THIS FAILS
 * A link this fails to rewrite opens in the frame, which loses the toolbar and
 * the way back but reaches nowhere it should not. A sandbox flag this fails to
 * grant makes something not work. Neither is an escalation, and a flag granted
 * that should not have been is the only failure that would be - which is why
 * the two attributes are literals here rather than assembled from the options.
 *
 * .USAGE
 *   import { frameDocument, frameSandbox } from '../../shared/htmlFrame';
 *
 *   frame.setAttribute('sandbox', frameSandbox(scripts));
 *   frame.srcdoc = frameDocument(raw, {
 *     scripts: scripts, base: folderUrl, css: authorCss,
 *     documentExtensions: HTML_DOCUMENTS,
 *     documentAddress: (path) => addressFor(path)
 *   });
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  the HTML web part bundle
 * Requires:  headingIds.ts
 */

import { ensureHeadingIds } from './headingIds';

/**
 * What the frame may do with scripts off.
 *
 * A literal rather than a list built up from the options, so that reading this
 * file tells you exactly what a frame is permitted to do. See the header for
 * why each one is here.
 */
const SANDBOX_WITHOUT_SCRIPTS: string =
  'allow-same-origin allow-popups allow-popups-to-escape-sandbox '
  + 'allow-top-navigation-by-user-activation';

/**
 * And with scripts on. No allow-same-origin, because a script that had it
 * could take the sandbox off; no top navigation, because a script could
 * rewrite what the reader is about to click.
 */
const SANDBOX_WITH_SCRIPTS: string =
  'allow-scripts allow-popups allow-popups-to-escape-sandbox';

export interface IFrameOptions {
  /** Whether the author's own scripts are allowed to run. */
  scripts: boolean;
  /**
   * The folder the document came from, so its relative links and pictures
   * resolve against the library rather than against the srcdoc frame, which
   * has no address of its own to resolve anything against.
   */
  base?: string;
  /** A stylesheet to put in front of the author's, usually the shared one. */
  css?: string;
  /** Which extensions count as a neighbouring document worth opening here. */
  documentExtensions: RegExp;
  /**
   * Turns a document's path into the address that opens it on this page.
   * Undefined leaves document links alone, which is right wherever the page
   * would not honour such an address.
   */
  documentAddress?: (path: string) => string;
  /**
   * A contents list to put at the top of the document, already built and
   * serialised. It goes inside the frame because nothing outside one can
   * scroll it: a sidebar in the page has no way to reach a heading in here.
   */
  contents?: string;
}

/** What the frame is allowed to do. See the header for each flag. */
export function frameSandbox(scripts: boolean): string {
  return scripts ? SANDBOX_WITH_SCRIPTS : SANDBOX_WITHOUT_SCRIPTS;
}

/**
 * The whole document to put in the frame's srcdoc.
 *
 * `raw` is the author's file. It has already been sanitised by the caller when
 * scripts are off, and deliberately has not been when they are on.
 */
export function frameDocument(raw: string, options: IFrameOptions): string {
  /* Inert: nothing here runs and nothing here is fetched. See the header. */
  const parsed: Document = new DOMParser().parseFromString(raw || '', 'text/html');

  addBase(parsed, options.base);
  addStyles(parsed, options.css);
  ensureHeadingIds(parsed.body);
  retargetLinks(parsed, options);
  addContents(parsed, options.contents);

  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}

/**
 * A `<base>`, first in the head so everything after it resolves against it.
 *
 * Without one, every relative address in the document is resolved against the
 * page the frame is on rather than against the folder the document came from,
 * which is how a picture beside a document in a library comes out broken.
 */
function addBase(parsed: Document, base: string | undefined): void {
  if (!base) {
    return;
  }
  const element: HTMLBaseElement = parsed.createElement('base');
  element.setAttribute('href', base);
  parsed.head.insertBefore(element, parsed.head.firstChild);
}

/**
 * The shared stylesheet, in front of whatever the author wrote.
 *
 * In front rather than after, so that an author's own rule wins where the two
 * say different things about the same element. The document is theirs.
 */
function addStyles(parsed: Document, css: string | undefined): void {
  if (!css) {
    return;
  }
  const style: HTMLStyleElement = parsed.createElement('style');
  style.textContent = css;
  /* After the base, before the author's own head content. */
  const base: Element | null = parsed.head.querySelector('base');
  parsed.head.insertBefore(style, base ? base.nextSibling : parsed.head.firstChild);
}

/** The contents list, first thing in the body, where a reader looks for it. */
function addContents(parsed: Document, contents: string | undefined): void {
  if (!contents) {
    return;
  }
  const holder: HTMLElement = parsed.createElement('div');
  holder.innerHTML = contents;
  parsed.body.insertBefore(holder, parsed.body.firstChild);
}

/**
 * Decides, for every link in the document, where a click on it should land.
 *
 * A frame is a bad place for a reader to end up: it has no address bar, no
 * back button of its own and none of the web part's toolbar, so a link that
 * simply replaced the frame would strand them. Every link that leaves the
 * document therefore leaves the frame as well.
 */
function retargetLinks(parsed: Document, options: IFrameOptions): void {
  const links: HTMLAnchorElement[] =
    Array.prototype.slice.call(parsed.querySelectorAll('a[href]'));

  links.forEach((link: HTMLAnchorElement) => {
    const href: string = link.getAttribute('href') || '';

    /* A fragment is a move within this document, which is the one kind of
       click the frame itself should handle. */
    if (href.length === 0 || href.charAt(0) === '#') {
      return;
    }

    const neighbour: string | undefined = documentPath(href, options);
    if (neighbour !== undefined && options.documentAddress) {
      openInTheWindow(link, options.documentAddress(neighbour), options.scripts);
      return;
    }

    openInATab(link);
  });
}

/**
 * The path part of a link to a neighbouring document, or undefined when the
 * link is not one.
 *
 * Only a relative address counts. A link that named a server named a document
 * somewhere else, and opening somebody else's document inside this web part
 * would say it was this library's.
 */
function documentPath(href: string, options: IFrameOptions): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.charAt(0) === '/'
    || href.indexOf('//') === 0) {
    return undefined;
  }

  const path: string = href.split('#')[0].split('?')[0];
  return options.documentExtensions.test(path) ? href : undefined;
}

/**
 * A neighbouring document, opened in the window the reader is already in.
 *
 * This is the whole point of following links: the reader stays where they
 * are and the web part draws the next document. Only with scripts off, where
 * the frame has been granted top navigation by user activation. With scripts
 * on it is a new tab instead, because a script in the frame could have
 * rewritten this address after it was set.
 */
function openInTheWindow(link: HTMLAnchorElement, address: string, scripts: boolean): void {
  link.setAttribute('href', address);
  if (scripts) {
    openInATab(link);
    return;
  }
  link.setAttribute('target', '_parent');
  link.removeAttribute('rel');
}

/** Anywhere else: a new tab, and no handle back on this one. */
function openInATab(link: HTMLAnchorElement): void {
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener noreferrer');
}
