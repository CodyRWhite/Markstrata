/**
 * .SYNOPSIS
 * Turns `![[Quarterly report.docx]]` into a card with a preview in it.
 *
 * .DESCRIPTION
 * The DOM half of officeEmbeds.ts: that file works out addresses and kinds,
 * this one builds what the reader sees.
 *
 * Two passes, because they can be answered at different times. The card is
 * built straight away out of what the link already says - the name, the kind of
 * file, and the address to open it at - so a reader has something useful
 * immediately and has it even if everything after this fails. The preview
 * frame needs the file's unique id, which is a request to SharePoint, so it
 * arrives afterwards and slots into a space the card has already left for it.
 *
 * Nothing here decides whether the reader may see the document. The frame is
 * SharePoint's own page and it answers with the reader's own session, so
 * somebody who may not open the file sees SharePoint say so rather than seeing
 * the contents. That is the whole reason the preview is a frame rather than
 * anything this project renders itself.
 *
 * .USAGE
 *   import { buildOfficeCards } from './utils/officeCards';
 *
 *   void buildOfficeCards(article, webUrl, (path) => sharePoint.getFileId(path));
 *
 * .NOTES
 * Since:     0.0.18.8
 * Ships in:  the web part bundle
 * Requires:  officeEmbeds.ts
 */

import { OfficeKind, embedAddress, nameFromHref, officeKind } from './officeEmbeds';

/** Asked for a file's unique id, by server-relative path. */
export type FileIdLookup = (path: string) => Promise<string | undefined>;

/**
 * A href is a URL and SharePoint wants a path.
 *
 * The same distinction as everywhere else in this project: what is on the
 * element is percent-encoded because a href has to be, and what is asked of
 * SharePoint is decoded because SharePoint encodes paths itself.
 */
function asPath(href: string): string {
  const withoutSuffix: string = href.split('#')[0].split('?')[0];
  try {
    return decodeURIComponent(withoutSuffix);
  } catch {
    return withoutSuffix;
  }
}

/**
 * Replaces every Office embed in `container` with a card, then fills in the
 * previews as their ids come back.
 *
 * One request per distinct file rather than one per link, because a document
 * that shows the same spreadsheet twice should ask about it once.
 */
export async function buildOfficeCards(
  container: HTMLElement,
  webUrl: string,
  lookup: FileIdLookup
): Promise<void> {
  const embeds: HTMLAnchorElement[] = Array.prototype.slice.call(
    container.querySelectorAll('a.strata-wiki-embed[data-embed="true"]')
  );

  const frames: { [path: string]: HTMLIFrameElement[] } = {};

  embeds.forEach((link: HTMLAnchorElement) => {
    const href: string = link.getAttribute('href') || '';
    const kind: OfficeKind | undefined = officeKind(href);
    if (!kind) {
      /* Some other kind of file. It keeps the marked link it already had,
         which is the honest thing to show for something this cannot preview. */
      return;
    }

    const card: HTMLElement = buildCard(link, href, kind);
    const holder: HTMLElement | null = card.querySelector('.strata-office-preview');

    /* A card replaces the paragraph the embed sits in when that paragraph
       holds nothing else, so an embed on a line of its own does not leave an
       empty paragraph wrapped round a block element. */
    const parent: HTMLElement | null = link.parentElement;
    if (parent && parent.tagName === 'P' && parent.childNodes.length === 1) {
      if (parent.parentNode) {
        parent.parentNode.replaceChild(card, parent);
      }
    } else if (link.parentNode) {
      link.parentNode.replaceChild(card, link);
    }

    if (holder) {
      const path: string = asPath(href);
      const frame: HTMLIFrameElement = document.createElement('iframe');
      frame.className = 'strata-office-frame';
      frame.setAttribute('title', `Preview of ${nameFromHref(href)}`);
      frame.setAttribute('loading', 'lazy');
      holder.appendChild(frame);
      frames[path] = (frames[path] || []).concat([frame]);
    }
  });

  const paths: string[] = Object.keys(frames);
  if (!paths.length || !webUrl) {
    return;
  }

  await Promise.all(paths.map(async (path: string): Promise<void> => {
    let id: string | undefined;
    try {
      id = await lookup(path);
    } catch {
      /* Asked and refused, or asked and the file is not there. Either way the
         card keeps its name and its link, which is what a reader needs. */
      id = undefined;
    }

    const address: string = embedAddress(webUrl, id || '');
    frames[path].forEach((frame: HTMLIFrameElement) => {
      if (!address) {
        /* No frame at all rather than an empty one: a blank box reads as a
           document that is empty, which is a different and wrong thing. */
        if (frame.parentElement) {
          frame.parentElement.setAttribute('data-strata-no-preview', 'true');
        }
        if (frame.parentNode) {
          frame.parentNode.removeChild(frame);
        }
        return;
      }
      frame.setAttribute('src', address);
    });
  }));
}

function buildCard(link: HTMLAnchorElement, href: string, kind: OfficeKind): HTMLElement {
  const card: HTMLElement = document.createElement('figure');
  card.className = 'strata-office';
  card.setAttribute('data-office', kind.toLowerCase());

  const head: HTMLElement = document.createElement('figcaption');
  head.className = 'strata-office-head';

  const name: HTMLElement = document.createElement('span');
  name.className = 'strata-office-name';
  /* What the author wrote after the pipe, where they wrote one; the file name
     otherwise. */
  name.textContent = (link.textContent || '').trim() || nameFromHref(href);
  head.appendChild(name);

  const open: HTMLAnchorElement = document.createElement('a');
  open.className = 'strata-office-open';
  open.setAttribute('href', href);
  /* A new tab, because the document being read is the page, and SharePoint
     opening Word over the top of it loses the reader's place. */
  open.setAttribute('target', '_blank');
  open.setAttribute('rel', 'noopener noreferrer');
  open.textContent = `Open in ${kind}`;
  head.appendChild(open);

  card.appendChild(head);

  const preview: HTMLElement = document.createElement('div');
  preview.className = 'strata-office-preview';
  card.appendChild(preview);

  return card;
}
