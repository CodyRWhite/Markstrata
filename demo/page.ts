/*
 * What a static page of the documentation site runs once it has loaded.
 *
 * The pages are rendered ahead of time, but everything the web part does after
 * rendering is behaviour, not markup: the copy button on a code block, the
 * contents following the reading position, a picture opening full size, the
 * button back to the top. None of that survives being written to a file.
 *
 * So the real class is bundled and called here, rather than the site growing
 * its own copy of each behaviour. It had one for the contents and nothing for
 * the rest, which is how the documentation page ended up with a sidebar that
 * did not track and code blocks nobody could copy from, while the demo page
 * beside it had both.
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
