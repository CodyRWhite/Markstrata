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
 * Since:     unreleased
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
    link.addEventListener('click', (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      const hash: number = target.indexOf('#');
      open(hash === -1 ? target : target.slice(0, hash),
        hash === -1 ? '' : target.slice(hash + 1));
    });
  });
}

/* A markdown file, whatever else the link carries. */
function isDocument(href: string): boolean {
  const path: string = href.split('#')[0].split('?')[0];
  return /\.(md|markdown)$/i.test(path);
}
