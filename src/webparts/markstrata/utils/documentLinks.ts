/**
 * .SYNOPSIS
 * Where the links in a rendered document point, and what happens when one is
 * followed.
 *
 * .USAGE
 *   import { secureExternalLinks, followDocumentLinks } from './utils/documentLinks';
 *
 *   secureExternalLinks(article);
 *   followDocumentLinks(article, documentFolder, (path, heading) => openDocument(path, heading));
 *
 *   // and the clicks, including an anchor into the document on screen
 *   watcher.watch(open, (heading) => landOnHeading(article, heading, true));
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  imagePaths.ts
 */

import { resolveAgainst } from './imagePaths';
import { fetchableUrl } from './remoteDocuments';

/** Opens off-site links in a new tab without handing over window.opener. */
export function secureExternalLinks(container: HTMLElement): void {
  const links: HTMLAnchorElement[] = Array.prototype.slice.call(
    container.querySelectorAll('a[href]')
  );
  links.forEach((link: HTMLAnchorElement) => {
    const href: string = link.getAttribute('href') || '';
    if (href.indexOf('#') === 0 || href.length === 0) {
      return;
    }
    if (link.hostname && link.hostname !== window.location.hostname) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

/**
 * Makes a link to another markdown document open in the web part.
 *
 * Two things, because they are the same question asked twice.
 *
 * First, where a relative link points. A document says `[deploy](deploy.md)`
 * meaning the folder it is in, but the browser resolves that against the page
 * it is on - a .aspx in SitePages - and lands somewhere the document never
 * meant. Images have been resolved against the document's own folder since the
 * beginning; links never were. They are now, whatever they point at, so a
 * relative link to a PDF finds it too.
 *
 * Second, what happens when one is followed. A link to a .md file used to hand
 * the reader the file itself: SharePoint offers raw markdown, or downloads it.
 * `open` is called instead, and the web part loads that document where it
 * stands.
 *
 * Only a plain left click is taken. Ctrl, Shift, the middle button and the
 * rest are how people open things in a new tab, and taking those away would be
 * worse than what this fixes. The href is left on the element and pointing at
 * the real file, so those still work.
 */
export function followDocumentLinks(
  container: HTMLElement,
  base: string | undefined,
  open?: (path: string, heading: string) => void
): void {
  const links: HTMLAnchorElement[] = Array.prototype.slice.call(
    container.querySelectorAll('a[href]')
  );

  links.forEach((link: HTMLAnchorElement) => {
    const href: string = link.getAttribute('href') || '';
    if (!href) {
      return;
    }

    /* An anchor into this document. Left to the browser this is not a scroll:
       a SharePoint page's router treats a fragment as a navigation, takes the
       reader back to the configured document and leaves the fragment on the
       address, pointing at a heading that document has not got. So it is
       marked here and the click is taken below, the same way a click on a
       document link already is.

       The contents list keeps its own handler and its own smooth scroll, so
       its links are left alone. */
    if (href.charAt(0) === '#') {
      if (!(link.closest && link.closest('.strata-toc'))) {
        link.classList.add('strata-anchor-link');
      }
      return;
    }
    /* Somebody else's site, and none of this applies. Read from the element
       rather than from the string: the browser has already worked out what the
       href means, which is the question being asked.

       Unless the document itself came from somebody else's site. A web part
       reading from a URL is showing a document whose neighbours are all on
       that same server, so a link to one of them is not an outside link, it is
       the rest of the wiki. Only that server counts: a link from it to
       anywhere else is still an outside link. */
    if (link.hostname && link.hostname !== window.location.hostname
      && !sameServerAs(base, link.href)) {
      return;
    }

    const resolved: string | undefined = base ? resolveAgainst(base, href) : undefined;
    if (resolved) {
      link.setAttribute('href', resolved);
    }

    const target: string = resolved || href;
    if (!open || !isDocument(target)) {
      return;
    }

    link.classList.add('strata-doc-link');
  });
}

/**
 * Takes the click on a document link before the page can.
 *
 * One listener, on the window, in the capture phase, and both of those are the
 * whole point. A modern SharePoint page is a single-page application with a
 * router listening for clicks on the document, and capture runs from the root
 * downwards - so a listener on the link itself, in any phase, runs after a
 * listener on the document, whatever order they were added in. Bubbling lost
 * to it and capturing on the element lost to it too: the router put the .md
 * file's address in the address bar and handed the reader the download this
 * exists to replace, while the document opened underneath, which is what made
 * it look as though a double click worked and a single click did not.
 *
 * The window is above the document on that path, so this runs first, and
 * stopping the event there means the router never learns it happened.
 *
 * A listener that outlives a render has to be taken down again, which is why
 * this is an object and not another line in the function above.
 */
export class DocumentLinkWatcher {
  private onClick: ((event: MouseEvent) => void) | undefined;

  public watch(
    open: (path: string, heading: string) => void,
    onAnchor?: (heading: string) => void
  ): void {
    this.stop();

    this.onClick = (event: MouseEvent): void => {
      /* Only a plain left click. Ctrl, Shift, the middle button and the rest
         are how people open things in a new tab, and the href is still on the
         element and still pointing at the real file so those keep working. */
      if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target: Element | null = event.target as Element;
      if (!target || !target.closest) {
        return;
      }

      /* An anchor into the document on screen. Taken before the router for the
         same reason a document link is, and stopped whether or not the heading
         turns out to be there: a link to a heading this document has not got
         should do nothing, which is a great deal better than it sending the
         reader home. */
      const anchor: HTMLAnchorElement | null =
        target.closest('a.strata-anchor-link') as HTMLAnchorElement | null;
      if (anchor) {
        event.preventDefault();
        event.stopPropagation();
        const named: string = (anchor.getAttribute('href') || '').slice(1);
        if (named && onAnchor) {
          onAnchor(named);
        }
        return;
      }

      const link: HTMLAnchorElement | null =
        target.closest('a.strata-doc-link') as HTMLAnchorElement | null;
      if (!link) {
        return;
      }

      const href: string = link.getAttribute('href') || '';
      if (!href) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const hash: number = href.indexOf('#');
      open(asPath(hash === -1 ? href : href.slice(0, hash)),
        hash === -1 ? '' : href.slice(hash + 1));
    };

    window.addEventListener('click', this.onClick, true);
  }

  public stop(): void {
    if (this.onClick) {
      window.removeEventListener('click', this.onClick, true);
      this.onClick = undefined;
    }
  }
}

/**
 * A href is a URL and SharePoint wants a path, and between the two is every
 * space in every file name anybody has ever used.
 *
 * The href has to stay encoded: it is what the browser follows when somebody
 * opens the link in a new tab, and it is left on the element for exactly that.
 * What is handed over to be fetched is a server-relative path, which is what
 * SharePoint reports and what it expects back - it does its own encoding, so
 * an already-encoded path is asked for twice and found never.
 *
 * Nothing in a document with an ASCII name showed this: "deploy.md" is the
 * same string either way. "Deploy notes.md" is not, and a wiki of any size is
 * full of the second kind.
 */
function asPath(href: string): string {
  /* Unless it is not a path at all. A document fetched from a URL links to
     documents on that same server, so a href here can be a whole address, and
     an address stays an address: it is handed to fetch, which wants it
     encoded, and decoding it would hand over a URL with spaces in it. */
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href)) {
    return href;
  }
  try {
    return decodeURIComponent(href);
  } catch {
    /* Not valid percent-encoding, so it was never encoded: use it as written
       rather than refusing to open a document over a stray per cent sign. */
    return href;
  }
}

/* A markdown file, whatever else the link carries. */
function isDocument(href: string): boolean {
  const path: string = href.split('#')[0].split('?')[0];
  return /\.(md|markdown)$/i.test(path);
}


/**
 * Whether a link points at the same server the document came from.
 *
 * `fetchableUrl` is applied to both sides, so a link written as GitHub's blob
 * page counts as being on the raw host the document was read from. That is the
 * address a browser gives you when you copy a link to a file, and the two are
 * the same document store wearing two names; refusing it would mean the link
 * people actually paste is the one that does not work.
 */
function sameServerAs(base: string | undefined, href: string): boolean {
  if (!base) {
    return false;
  }
  const from: string = originOf(fetchableUrl(base));
  return !!from && originOf(fetchableUrl(href)) === from;
}

/** The scheme and host at the front of an address, or empty. */
function originOf(url: string): string {
  const found: RegExpExecArray | null = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i.exec(url || '');
  return found ? found[0].toLowerCase() : '';
}
