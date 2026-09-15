/**
 * .SYNOPSIS
 * Runs the web part's own ContentEnhancer on a static site page.
 *
 * .DESCRIPTION
 * The site used to carry a second, simpler copy of this behaviour, which
 *
 * drifted from the web part every time the web part changed. Bundling the real
 *
 * class means the pages cannot claim a behaviour the product does not have.
 *
 * .USAGE
 *   // Bundled into the site pages by demo/build-demo.js, not imported by hand.
 *   window.strataEnhance(document.querySelector('.strata-root'));
 *
 * .NOTES
 * Since:     0.0.14.0
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  ContentEnhancer.ts
 */

import { ContentEnhancer } from '../src/webparts/markstrata/utils/ContentEnhancer';

const enhancer: ContentEnhancer = new ContentEnhancer();

function enhance(): void {
  const article: HTMLElement | null = document.querySelector('.strata-content');
  const root: HTMLElement | null = document.querySelector('.strata-root');
  if (!article || !root) {
    return;
  }

  enhancer.attachCopyButtons(article);
  enhancer.secureExternalLinks(article);
  enhancer.enhanceImages(article, true);
  enhancer.enhanceTables(article, true);
  enhancer.attachBackToTop(root, 'right');
  /* The site puts a header and a controls bar across the top, so a heading
     scrolled to has to clear both. */
  enhancer.trackScrollOffset(root);

  /* The contents is already in the page; this is what makes it follow the
     reading position, which is the half that cannot be written to a file. */
  const nav: HTMLElement | null = document.querySelector('.strata-toc-sidebar .strata-toc, .strata-toc-inline .strata-toc');
  if (nav) {
    enhancer.trackActiveHeading(article, nav);
  }
}

/*
 * Re-run when the page's own controls move the contents, since moving the
 * panel between the sidebar and the text replaces the element being tracked.
 */
(globalThis as unknown as { strataEnhance?: () => void }).strataEnhance = enhance;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhance);
} else {
  enhance();
}
