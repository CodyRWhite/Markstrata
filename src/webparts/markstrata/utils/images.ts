/**
 * .SYNOPSIS
 * What happens to a picture after the markdown has been rendered.
 *
 * .DESCRIPTION
 * All of it is done here rather than in the markdown pipeline because all of
 * it turns on where the image sits: a caption only makes sense for an image
 * that is a block of its own, an image inside a link has somewhere to go
 * already, and aligning is a property of the block rather than of the picture.
 * Those are questions about the rendered document, not about the tokens.
 *
 * .USAGE
 *   import { enhanceImages } from './utils/images';
 *
 *   enhanceImages(article, allowZoom, zoomOverlay);
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  zoomOverlay.ts
 */

import { ZoomOverlay } from './zoomOverlay';

export function enhanceImages(
  container: HTMLElement,
  allowZoom: boolean,
  zoom: ZoomOverlay
): void {
  zoom.close();

  const images: HTMLImageElement[] =
    Array.prototype.slice.call(container.querySelectorAll('img'));

  images.forEach((image: HTMLImageElement) => {
    captionImage(image);
    markBlockImage(image);
    if (allowZoom) {
      makeZoomable(image, zoom);
    }
  });
}

/*
 * Marks the block an image sits in, so the page's alignment setting has
 * something to align.
 *
 * The class goes on the container rather than the image, because aligning is
 * text-align on the block: putting it on the image would need :has() to reach
 * the parent, and the browsers this has to run in are not a set worth guessing
 * at.
 *
 * An image inside a sentence is left out. It sits on the baseline of the text
 * around it, and centring the paragraph to move the picture would take the
 * sentence with it.
 */
function markBlockImage(image: HTMLImageElement): void {
  const block: HTMLElement | null = image.closest('figure') || image.parentElement;
  if (!block) {
    return;
  }
  if (block.tagName === 'P' && (block.textContent || '').trim().length > 0) {
    return;
  }
  if (block.tagName !== 'P' && block.tagName !== 'FIGURE') {
    return;
  }

  block.classList.add('strata-image-block');

  /* A document can say where one picture goes, written the way every other
     class is: ![alt](x.png){.center}. Moved to the block for the same reason
     the marker is. */
  ['left', 'center', 'centre', 'right'].forEach((side: string) => {
    if (image.classList.contains(side)) {
      image.classList.remove(side);
      block.setAttribute('data-strata-align', side === 'centre' ? 'center' : side);
    }
  });
}

/*
 * An image's title is markdown's caption, and on its own it is only a tooltip:
 * invisible on a touch screen, and gone from a printed page.
 *
 * Only an image that is a paragraph on its own becomes a figure. The other
 * kind sits mid-sentence, where lifting it out into a block would break the
 * sentence around it.
 */
function captionImage(image: HTMLImageElement): void {
  const title: string = image.getAttribute('title') || '';
  const paragraph: HTMLElement | null = image.parentElement;
  if (!title || !paragraph || paragraph.tagName !== 'P' || !paragraph.parentNode) {
    return;
  }
  /* Text beside it means the image is part of a sentence. */
  if ((paragraph.textContent || '').trim().length > 0) {
    return;
  }
  if (paragraph.querySelectorAll('img').length !== 1) {
    return;
  }

  const figure: HTMLElement = document.createElement('figure');
  figure.className = 'strata-figure';
  /* Moved wholesale, so an image wrapped in a link keeps its link. */
  while (paragraph.firstChild) {
    figure.appendChild(paragraph.firstChild);
  }

  const caption: HTMLElement = document.createElement('figcaption');
  caption.textContent = title;
  figure.appendChild(caption);

  /* The caption says it now, so the tooltip would only repeat it. */
  image.removeAttribute('title');
  paragraph.parentNode.insertBefore(figure, paragraph);
  paragraph.remove();
}

function makeZoomable(image: HTMLImageElement, zoom: ZoomOverlay): void {
  /* A linked image already does something when clicked. */
  if (image.closest('a')) {
    return;
  }

  image.classList.add('strata-zoomable');
  image.tabIndex = 0;
  image.setAttribute('role', 'button');
  image.setAttribute('aria-label',
    `${image.getAttribute('alt') || 'Image'}: select to see it full size`);

  const open: () => void = () =>
    zoom.open(image, fullImage(image), image.getAttribute('alt') || 'Image');
  image.addEventListener('click', open);
  image.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
}

/** The same picture again, at whatever size the window allows. */
function fullImage(image: HTMLImageElement): HTMLImageElement {
  const full: HTMLImageElement = document.createElement('img');
  full.src = image.currentSrc || image.src;
  full.alt = image.getAttribute('alt') || '';
  return full;
}
