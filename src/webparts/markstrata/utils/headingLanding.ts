/**
 * .SYNOPSIS
 * Finding the heading a link named, and scrolling to it.
 *
 * .DESCRIPTION
 * Two things went wrong with an anchor, and both ended with the reader looking
 * at the top of a document rather than at the heading they asked for.
 *
 * A heading was looked up by exactly the text the link carried. A wiki link has
 * already been slugged, so `[[Runbook#Rollback]]` asked for `rollback` and
 * found it; a heading named on the page's own address has not, so
 * `?strataDoc=Runbook.md%23Rollback` asked for `Rollback`, which is the id of
 * nothing. The rule for what a heading is called lives in wikiLinks.ts and is
 * asked here, in every spelling, rather than each caller slugging and hoping.
 *
 * And an anchor inside the document was left to the browser. On a SharePoint
 * page that is not a scroll: it is a navigation, the page's own router sees it,
 * and the reader is returned to the configured document with the fragment still
 * on the address. That is why a `[[#Rollback]]` put `wiki.aspx#Rollback` in the
 * address bar and went home. The click is taken here instead, the same way a
 * click on a document link already is.
 *
 * Nothing here writes to the address bar. The web part deliberately keeps its
 * history entries at the page's own URL so SharePoint's router treats them as
 * the same page, and putting a fragment on the address would hand the router
 * exactly the navigation this is avoiding.
 *
 * .USAGE
 *   import { findHeading, landOnHeading } from './utils/headingLanding';
 *
 *   const heading = findHeading(article, 'Rollback');   // the <h2 id="rollback">
 *   landOnHeading(article, 'Step 1: Install', true);    // found and scrolled
 *
 * .NOTES
 * Since:     0.0.19.4
 * Ships in:  the web part bundle
 * Requires:  wikiLinks.ts
 */

import { headingTargets } from './wikiLinks';

/**
 * The element a named heading refers to, or undefined when it is not here.
 *
 * Every spelling the name might have is tried in turn and the first that is on
 * the page wins. A link to a heading in another document is not this function's
 * failure: it answers for the document in front of it.
 */
export function findHeading(
  container: HTMLElement,
  heading: string
): HTMLElement | undefined {
  const wanted: string[] = headingTargets(heading);

  for (let index: number = 0; index < wanted.length; index++) {
    const found: HTMLElement | undefined = byId(container, wanted[index]);
    if (found) {
      return found;
    }
  }

  return undefined;
}

/**
 * Scrolls to a named heading, and says whether there was one.
 *
 * Smoothly, which is what the contents list already does, so a heading reached
 * by clicking a link in the text and one reached by clicking it in the
 * contents arrive the same way.
 */
export function landOnHeading(
  container: HTMLElement,
  heading: string,
  smooth?: boolean
): boolean {
  const found: HTMLElement | undefined = findHeading(container, heading);
  if (!found) {
    return false;
  }

  found.scrollIntoView(
    smooth ? { behavior: 'smooth', block: 'start' } : { block: 'start' }
  );
  return true;
}

/**
 * One id, looked up without letting a name that is not a valid selector throw.
 *
 * A heading id can hold anything a heading held, so it is escaped where the
 * browser can escape it. Where it cannot, an id that will not parse is an id
 * nothing matches rather than a reason to stop drawing the page.
 */
function byId(container: HTMLElement, id: string): HTMLElement | undefined {
  try {
    /* Called on CSS rather than lifted off it: detached from the object it
       belongs to, this throws in some engines, and it is inside the try for
       the same reason the query is. There is no window at all under the test
       runner, where escaping the few characters that would end the selector is
       enough to keep it parseable. */
    const escaped: string =
      typeof window !== 'undefined' && window.CSS && window.CSS.escape
        ? window.CSS.escape(id)
        : id.replace(/["\\\]]/g, '\\$&');

    return (container.querySelector(`#${escaped}`) as HTMLElement | null) || undefined;
  } catch {
    return undefined;
  }
}
