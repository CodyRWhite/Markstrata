/**
 * .SYNOPSIS
 * Opening a code block at the size of the window.
 *
 * .DESCRIPTION
 * The same overlay a picture and a Mermaid diagram already use, given a copy
 * of the block instead of an image. A block capped short or medium is the
 * obvious case - it is showing ten lines of a hundred - but a block wider than
 * the column, or longer than the window, has the same problem without anybody
 * having asked for a cap.
 *
 * Which blocks get the control is decided from the rendered block, never from
 * the markdown. The rule, in full:
 *
 *   a block offers Expand when its <pre> has more to show than it is showing,
 *   in either direction, or when the block is taller than the window.
 *
 * That is one measurement covering all three cases. A capped block scrolls
 * vertically, so it overflows. A block with lines longer than the column
 * scrolls sideways, so it overflows. A block with no cap and two hundred lines
 * overflows nothing, because it is as tall as its code, and is caught by the
 * second half instead. A two line fence that fits is caught by none of it and
 * is left alone, which is the point: a control on every tiny fence is clutter,
 * and clutter on the thing a document is mostly made of is worse than clutter
 * anywhere else.
 *
 * Measured once per render, after the article is in the page. It is not
 * re-measured when the window changes size: a block that becomes too wide for
 * a narrower window keeps whatever it was given until the next render, which
 * is a smaller wrong than a resize observer on every code block on the page.
 *
 * The copy in the overlay is a clone with its cap and its buttons taken off.
 * The buttons because a cloned button is a button with no listener on it, and
 * one that looks like Copy and does nothing is worse than no Copy at all. The
 * block underneath still has its own, and the text in the overlay is real text
 * that selects.
 *
 * .USAGE
 *   import { attachCodeZoom } from './utils/codeZoom';
 *
 *   attachCodeZoom(article, allowZoom, zoomOverlay);
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  codeBlocks.ts, icons.ts, zoomOverlay.ts
 */

import { languageLabel } from './codeBlocks';
import { EXPAND_ICON } from './icons';
import { ZoomOverlay } from './zoomOverlay';

/** Slack, in CSS pixels, against sub-pixel layout rounding. */
const FITS_WITHIN: number = 2;

export function attachCodeZoom(
  container: HTMLElement,
  allowZoom: boolean,
  zoom: ZoomOverlay
): void {
  const blocks: HTMLElement[] = Array.prototype.slice.call(
    container.querySelectorAll('.strata-code')
  );

  blocks.forEach((block: HTMLElement) => {
    /* Wired per render, and a render rebuilds the article, so a block already
       carrying the control is one this pass has already reached: a remote
       fence fills in later and brings this round a second time. */
    if (block.getAttribute('data-strata-zoom') === 'true') {
      return;
    }
    if (!allowZoom || !worthOpening(block)) {
      return;
    }
    block.setAttribute('data-strata-zoom', 'true');

    const actions: HTMLElement | null = block.querySelector('.strata-code-actions');
    if (actions) {
      /* First in the group, as it is over a diagram: Expand then Copy. */
      actions.insertBefore(expandButton(block, zoom), actions.firstChild);
    }

    /* And the block itself, because that is what a reader tries first on
       something they can see is cut off. The button above is what the keyboard
       uses, since a <pre> is not something to tab to. */
    block.classList.add('strata-code--zoomable');
    block.addEventListener('click', (event: Event) => {
      const target: HTMLElement = event.target as HTMLElement;
      if (target && target.closest('button, a')) {
        return;
      }
      /* A drag that selected some of the code ends in a click, and swallowing
         the selection to open an overlay would make the code unselectable. */
      const selection: Selection | null = window.getSelection();
      if (selection && !selection.isCollapsed) {
        return;
      }
      openBlock(block, zoom);
    });
  });
}

/**
 * Whether this block has more to show than it is showing.
 *
 * Both directions, because a block capped short and a block whose lines run
 * past the column are the same complaint. The last test catches the third
 * case, a block that overflows nothing because it was never capped and is
 * simply longer than the screen.
 */
function worthOpening(block: HTMLElement): boolean {
  const pre: HTMLElement | null = block.querySelector('.strata-code-pre');
  if (!pre) {
    return false;
  }
  return overflows({
    scrollHeight: pre.scrollHeight,
    clientHeight: pre.clientHeight,
    scrollWidth: pre.scrollWidth,
    clientWidth: pre.clientWidth,
    blockHeight: block.getBoundingClientRect().height,
    windowHeight: window.innerHeight
  });
}

/** What a block measures, for the rule below to read. */
export interface ICodeExtent {
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
  blockHeight: number;
  windowHeight: number;
}

/**
 * The rule itself, taking numbers rather than an element.
 *
 * Split out so it can be checked without a browser. jsdom has no layout, so
 * every one of these is zero there and a test written against an element would
 * be testing nothing while reading as though it tested something - which is
 * worse than no test. Given the numbers, the three cases are ordinary
 * arithmetic and can be stated one at a time.
 *
 * Measuring is still the browser's job, and the harness still drives the whole
 * thing against real blocks in all three themes.
 */
export function overflows(extent: ICodeExtent): boolean {
  /* Capped, so there is more below the fold of the block. */
  if (extent.scrollHeight > extent.clientHeight + FITS_WITHIN) {
    return true;
  }
  /* Long lines, so there is more to the right of it. */
  if (extent.scrollWidth > extent.clientWidth + FITS_WITHIN) {
    return true;
  }
  /* Neither, but taller than the window: a two hundred line block with no cap
     overflows nothing, because it is exactly as tall as its code. */
  return extent.blockHeight > extent.windowHeight;
}

function expandButton(block: HTMLElement, zoom: ZoomOverlay): HTMLButtonElement {
  const open: HTMLButtonElement = document.createElement('button');
  open.type = 'button';
  open.className = 'strata-code-btn strata-code-expand';
  open.setAttribute('aria-label', `Open this ${describe(block)} full size`);
  open.innerHTML = EXPAND_ICON + '<span class="strata-code-btn-label">Expand</span>';
  open.addEventListener('click', (event: Event) => {
    event.preventDefault();
    /* So the block's own handler does not take the same click and open it a
       second time. The same reason the copy button stops its click. */
    event.stopPropagation();
    openBlock(block, zoom);
  });
  return open;
}

/*
 * The block again, with nothing capping it.
 *
 * A clone rather than the block itself, so the document keeps its own and is
 * unchanged when the overlay closes. The height classes come off because the
 * whole point is to see the rest; the buttons come off because a cloned button
 * has no listener behind it.
 */
function openBlock(block: HTMLElement, zoom: ZoomOverlay): void {
  const panel: HTMLElement = document.createElement('div');
  panel.className = 'strata-zoom-code';

  const copy: HTMLElement = block.cloneNode(true) as HTMLElement;
  copy.classList.remove('strata-code--short', 'strata-code--medium',
    'strata-code--zoomable');
  copy.removeAttribute('data-strata-zoom');
  const actions: HTMLElement | null = copy.querySelector('.strata-code-actions');
  if (actions) {
    actions.remove();
  }
  panel.appendChild(copy);

  zoom.open(block, panel, describe(block));
}

/** What the overlay calls itself, for a reader who cannot see it. */
function describe(block: HTMLElement): string {
  const filename: HTMLElement | null = block.querySelector('.strata-code-filename');
  const named: string = filename ? (filename.textContent || '').trim() : '';
  if (named) {
    return named;
  }
  const lang: string = block.getAttribute('data-lang') || '';
  return `${languageLabel(lang)} code block`;
}
