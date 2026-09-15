/*
 * The two things a reader wants to do with a diagram: see it bigger, and take
 * it away.
 *
 * Both sit in a group over the drawing, revealed on hover and always there to
 * a keyboard that has reached them. The host is never made a button itself: it
 * holds these, and a control inside a control is a thing neither a screen
 * reader nor a keyboard can describe.
 */
import { CopyFeedback } from './copyFeedback';
import { ZoomOverlay } from './zoomOverlay';

const IMAGE_ICON: string =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<rect x="3" y="4" width="18" height="14" rx="2"/>'
  + '<circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5-9 8"/></svg>';

/* Arrows to the four corners: the diagram, opened out to the window. */
const EXPAND_ICON: string =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<path d="M9 3H3v6M21 9V3h-6M15 21h6v-6M3 15v6h6"/>'
  + '<path d="m3 3 6 6M21 3l-6 6M21 21l-6-6M3 21l6-6"/></svg>';

/* Drawn at twice the diagram's size, so the copy is still sharp when it is
   pasted into a deck or a document and scaled back up. */
const COPY_SCALE: number = 2;

export function attachDiagramTools(
  container: HTMLElement,
  allowZoom: boolean,
  zoom: ZoomOverlay,
  feedback: CopyFeedback
): void {
  const hosts: HTMLElement[] = Array.prototype.slice.call(
    container.querySelectorAll('.strata-mermaid')
  );

  hosts.forEach((host: HTMLElement) => {
    /* The host is rebuilt whenever the diagram re-renders, so old buttons are
       stale rather than already wired. */
    const existing: HTMLElement | null = host.querySelector('.strata-diagram-tools');
    if (existing && existing.parentElement) {
      existing.parentElement.removeChild(existing);
    }
    if (!host.querySelector('svg')) {
      return;
    }

    const tools: HTMLElement = document.createElement('div');
    tools.className = 'strata-diagram-tools';

    if (allowZoom) {
      const open: HTMLButtonElement = document.createElement('button');
      open.type = 'button';
      open.className = 'strata-code-btn strata-diagram-open';
      open.setAttribute('aria-label', 'Open this diagram full size');
      open.innerHTML = EXPAND_ICON + '<span class="strata-code-btn-label">Expand</span>';
      open.addEventListener('click', (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        openDiagram(host, zoom);
      });
      tools.appendChild(open);
    }

    const copy: HTMLButtonElement = document.createElement('button');
    copy.type = 'button';
    copy.className = 'strata-code-btn strata-diagram-copy';
    copy.setAttribute('aria-label', 'Copy this diagram as an image');
    copy.innerHTML = IMAGE_ICON + '<span class="strata-code-btn-label">Copy</span>';
    copy.addEventListener('click', (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      void copyDiagram(host, copy, feedback);
    });
    tools.appendChild(copy);

    host.appendChild(tools);

    /* The drawing itself opens too, because that is what a reader tries first
       on something too small to read. The buttons above are what the keyboard
       uses, since a drawing cannot be tabbed to. */
    if (allowZoom) {
      host.classList.add('strata-zoomable');
      host.addEventListener('click', (event: Event) => {
        const target: HTMLElement = event.target as HTMLElement;
        if (target && target.closest('button, a')) {
          return;
        }
        openDiagram(host, zoom);
      });
    }
  });
}

/*
 * A diagram, as big as the window will allow.
 *
 * The drawing is copied rather than moved, so the document keeps its own, and
 * copied as SVG rather than drawn to a bitmap: it is vector, and the whole
 * reason for opening it is to read labels that were too small.
 *
 * Mermaid sizes its SVG with an inline max-width and a width attribute; both
 * have to go or the copy opens at exactly the size that was too small to read.
 * What stays is the viewBox, which is what lets it scale to the space.
 *
 * It is given a background of its own because a diagram carries none: a
 * light-theme diagram is drawn in dark ink, and on the overlay's black that is
 * an empty rectangle.
 */
function openDiagram(host: HTMLElement, zoom: ZoomOverlay): void {
  const svg: SVGSVGElement | null = host.querySelector(':scope > svg');
  if (!svg) {
    return;
  }

  const panel: HTMLElement = document.createElement('div');
  panel.className = 'strata-zoom-diagram';

  const copy: SVGSVGElement = svg.cloneNode(true) as SVGSVGElement;
  copy.removeAttribute('style');
  copy.removeAttribute('width');
  copy.removeAttribute('height');
  panel.appendChild(copy);

  /* Sized without any of that, an SVG in a flex box has nothing to be as wide
     as and collapses to nothing - measured, not guessed. So the panel is given
     the drawing's proportions and told to be as big as it can: width and
     height caps then settle which of the two the window runs out of first. The
     proportions come from the viewBox, or from what the diagram measures on
     the page when it has none. */
  const drawn: DOMRect = svg.getBoundingClientRect();
  const view: number[] = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/)
    .map((part: string) => Number(part));
  const wide: number = view.length === 4 && view[2] > 0 ? view[2] : drawn.width;
  const tall: number = view.length === 4 && view[3] > 0 ? view[3] : drawn.height;
  if (wide > 0 && tall > 0) {
    panel.style.aspectRatio = `${wide} / ${tall}`;
  }

  const title: Element | null = svg.querySelector('title');
  zoom.open(host, panel, (title && title.textContent) || 'Diagram');
}

/**
 * Draws the diagram's SVG onto a canvas and puts the result on the clipboard.
 *
 * A diagram is the one thing on the page nobody can usefully copy out: the
 * text is markup, and selecting it gets the source rather than the picture. A
 * raster is what a deck or a document wants anyway.
 */
async function copyDiagram(
  host: HTMLElement,
  button: HTMLButtonElement,
  feedback: CopyFeedback
): Promise<void> {
  /* Not just any svg inside: the buttons over the diagram carry icons of their
     own, and one of those is the first one in the markup if the tools are ever
     built before the drawing. */
  const svg: SVGSVGElement | null = host.querySelector(':scope > svg');
  if (!svg) {
    feedback.show(button, false, 'No diagram');
    return;
  }

  try {
    const blob: Blob = await diagramToPng(host, svg);
    const clipboard: Clipboard = navigator.clipboard;
    const CopyItem: typeof ClipboardItem | undefined =
      (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;

    if (!clipboard || !clipboard.write || !CopyItem || !window.isSecureContext) {
      throw new Error('the clipboard cannot take an image here');
    }
    await clipboard.write([new CopyItem({ 'image/png': blob })]);
    feedback.show(button, true);
  } catch {
    feedback.show(button, false, 'Cannot copy');
  }
}

/*
 * The SVG carries its own stylesheet, which mermaid generates inside it, so it
 * stands on its own once it is serialised. What it does not carry is the
 * page's background, and a diagram drawn in light text on nothing pastes as
 * light text on black, so the host's own background colour is painted first.
 */
function diagramToPng(host: HTMLElement, svg: SVGSVGElement): Promise<Blob> {
  const drawn: DOMRect = svg.getBoundingClientRect();
  const width: number = Math.max(1, Math.round(drawn.width));
  const height: number = Math.max(1, Math.round(drawn.height));

  /* A clone, because the copy needs explicit pixel dimensions and the one on
     the page is sized by the layout. */
  const clone: SVGSVGElement = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const markup: string = new XMLSerializer().serializeToString(clone);
  const source: string = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  const background: string = window.getComputedStyle(host).backgroundColor;

  return new Promise((resolve, reject) => {
    const image: HTMLImageElement = new Image();
    image.onload = () => {
      const canvas: HTMLCanvasElement = document.createElement('canvas');
      canvas.width = width * COPY_SCALE;
      canvas.height = height * COPY_SCALE;
      const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
      if (!context) {
        reject(new Error('no 2d context'));
        return;
      }
      if (background && background !== 'transparent' && background.indexOf('0)') === -1) {
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob: Blob | null) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('the diagram could not be drawn'));
        }
      }, 'image/png');
    };
    image.onerror = () => reject(new Error('the diagram could not be read'));
    image.src = source;
  });
}
