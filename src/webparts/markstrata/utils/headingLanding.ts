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
 * A third thing went wrong on a page that had not finished arriving. The scroll
 * happens the moment the document is drawn, and pictures above the heading have
 * not loaded yet, so they are a line tall when it scrolls and several hundred
 * pixels tall a moment later. Everything below them, the heading included, is
 * pushed down the page, and the reader who followed a link to a section is
 * left a screen or two above it. A heading landed on without animation is
 * therefore held where it landed while the content above it settles, and let
 * go the moment the reader scrolls or touches the page themselves.
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

  /* Instant, by name, because a page whose stylesheet asks for smooth scrolling
     would otherwise animate this one too, and the heading could not be measured
     where it landed. */
  found.scrollIntoView({ behavior: (smooth ? 'smooth' : 'instant') as ScrollBehavior, block: 'start' });

  /* A smooth scroll is a reader's own click and is already moving; it is the
     one that arrives with the page as it is. */
  if (!smooth) {
    holdWhileSettling(container, found, heading);
  }
  return true;
}

/** The landing being held right now, if any: its name, and how to let go of it. */
let held: { heading: string; release: () => void } | undefined;

/**
 * The name of the heading currently being held, or undefined when nothing is.
 *
 * A document can be drawn twice before the reader has touched it: once when it
 * arrives, and again when the host's own first render follows. The second
 * draw replaces the elements the first landed on, and the heading, which is
 * handed over once, is already spent. Asking here lets that draw land on the
 * same heading again, for as long as the hold would have lasted.
 */
export function heldHeading(): string | undefined {
  return held ? held.heading : undefined;
}

/** How long a landing is held, at most. A page still moving after this is not settling. */
const HOLD_MS: number = 6000;

/** What a reader does to take the page back from a hold. */
const TAKEOVER: string[] = ['wheel', 'touchstart', 'mousedown', 'keydown', 'pointerdown'];

/** The heading's distance from the top of the window right now. */
function topOf(heading: HTMLElement): number {
  return heading.getBoundingClientRect().top;
}

/**
 * Keeps a heading where it was landed on while what is above it changes height.
 *
 * Pictures and diagrams above the heading arrive after the scroll and move it.
 * Whenever the document's size changes, or a picture in it finishes loading,
 * the heading is put back if it has drifted. It stops for good when the reader
 * scrolls or presses anything, when the time allowed runs out, or when the
 * document has been taken out of the page.
 */
function holdWhileSettling(container: HTMLElement, target: HTMLElement, name: string): void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return;
  }

  const landedAt: number = topOf(target);
  const observer: ResizeObserver | undefined = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => { restore(); })
    : undefined;

  let timer = 0;
  /* A landing that replaces another lets go of it first. */
  if (held) { held.release(); }

  const stop = (): void => {
    if (held && held.release === stop) { held = undefined; }
    if (observer) { observer.disconnect(); }
    window.clearTimeout(timer);
    container.removeEventListener('load', restore, true);
    container.removeEventListener('error', restore, true);
    TAKEOVER.forEach((name: string) => window.removeEventListener(name, stop, true));
  };

  function restore(): void {
    if (!container.isConnected || !target.isConnected) {
      stop();
      return;
    }
    if (Math.abs(topOf(target) - landedAt) > 1) {
      target.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
    }
  }

  held = { heading: name, release: stop };

  /* A picture's load does not bubble, so it is heard on the way down. */
  container.addEventListener('load', restore, true);
  container.addEventListener('error', restore, true);
  TAKEOVER.forEach((name: string) => window.addEventListener(name, stop, true));
  if (observer) {
    observer.observe(container);
    /* The article's own size changes when anything inside it does. */
    for (let child: Element | null = container.firstElementChild; child; child = child.nextElementSibling) {
      observer.observe(child);
    }
  }
  /* Gives up on its own, so a page that never settles is not held for ever. */
  timer = window.setTimeout(stop, HOLD_MS);
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
