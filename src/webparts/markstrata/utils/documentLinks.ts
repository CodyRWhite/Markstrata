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
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  imagePaths.ts
 */

import { resolveAgainst } from './imagePaths';

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
    if (!href || href.charAt(0) === '#') {
      return;
    }
    /* Somebody else's site, and none of this applies. Read from the element
       rather than from the string: the browser has already worked out what the
       href means, which is the question being asked. */
    if (link.hostname && link.hostname !== window.location.hostname) {
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

  public watch(open: (path: string, heading: string) => void): void {
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
      const link: HTMLAnchorElement | null = target && target.closest
        ? (target.closest('a.strata-doc-link') as HTMLAnchorElement | null)
        : null;
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
