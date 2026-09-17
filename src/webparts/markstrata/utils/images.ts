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
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  zoomOverlay.ts
 */

import { ZoomOverlay } from './zoomOverlay';
import { PictureZoom } from './pictureZoom';

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
    zoom.open(image, zoomablePicture(image), image.getAttribute('alt') || 'Image');
  image.addEventListener('click', open);
  image.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
}

/**
 * The same picture again, at whatever size the window allows, and able to be
 * zoomed past that.
 *
 * A panel rather than the picture on its own, because a picture zoomed in has
 * to be clipped by something and panned inside something, and because the
 * controls have to sit somewhere that is not over the document.
 *
 * The panel carries `strata-zoom-backdrop`, which the overlay reads as "this
 * part is background": the empty area beside the picture dismisses the way the
 * dark surround always has, while the picture and the buttons do not.
 *
 * Nothing disposes of the controller. Every listener it adds is on the panel
 * or the picture, and the overlay removes both when it closes, so they go with
 * it; a dispose hook here would be a second thing to keep in step with the
 * first for no gain.
 */
function zoomablePicture(image: HTMLImageElement): HTMLElement {
  const panel: HTMLElement = document.createElement('div');
  panel.className = 'strata-zoom-picture strata-zoom-backdrop';

  const full: HTMLImageElement = document.createElement('img');
  full.src = image.currentSrc || image.src;
  full.alt = image.getAttribute('alt') || '';
  panel.appendChild(full);

  const zoom: PictureZoom = new PictureZoom(panel, full);
  panel.appendChild(zoomControls(zoom));

  /* After the picture is in the page, so the first draw measures a picture
     that has a size. */
  full.addEventListener('load', () => zoom.attach());
  if (full.complete) {
    zoom.attach();
  }

  return panel;
}

/** The buttons, which are what a keyboard has instead of a wheel. */
function zoomControls(zoom: PictureZoom): HTMLElement {
  const controls: HTMLElement = document.createElement('div');
  controls.className = 'strata-zoom-controls';

  const button = (label: string, glyph: string, press: () => void): void => {
    const control: HTMLButtonElement = document.createElement('button');
    control.type = 'button';
    control.className = 'strata-zoom-control';
    control.setAttribute('aria-label', label);
    control.textContent = glyph;
    control.addEventListener('click', (event: Event) => {
      /* Or the overlay reads the press as a click on the background. */
      event.stopPropagation();
      press();
    });
    controls.appendChild(control);
  };

  button('Zoom in', '+', () => zoom.zoomBy(1.5));
  button('Zoom out', '\u2212', () => zoom.zoomBy(1 / 1.5));
  button('Fit to the window', '\u21ba', () => zoom.reset());

  return controls;
}
