/**
 * .SYNOPSIS
 * What is actually scrolling, and how much room there is inside it.
 *
 * .DESCRIPTION
 * Every answer here exists because the window is not the scroller on a
 * SharePoint page: it scrolls an inner container that sits under a header and
 * a command bar. Anything measured against `window.innerHeight` is right on a
 * bare page and wrong on a real one, so the container is found and measured
 * instead. The sidebar, the fill-height setting and the reading position all
 * ask the same question, which is why they ask it in one place.
 *
 * WHY THE WALK IS NOT parentElement
 * The HTML web part can render a document inside a shadow root, and the
 * topmost element in one has no parentElement at all: its parent is the
 * ShadowRoot, which is not an Element. A walk written with parentElement stops
 * dead at that boundary, finds no scrolling container, and quietly answers as
 * though the window were the scroller - which is the wrong answer on every
 * real SharePoint page. `enclosing` steps out through the shadow host instead,
 * so the same measurement works whether the document is in the page's own DOM
 * or behind a boundary.
 *
 * .USAGE
 *   import { roomBelow, scroller } from './scrolling';
 *
 *   const room: number = roomBelow(webPartRoot);
 *   const container: HTMLElement | undefined = scroller(article);
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  both web part bundles
 * Requires:  nothing else in this project
 */

/**
 * The element one step out from this one, crossing a shadow boundary.
 *
 * Inside a shadow root the topmost element's parentElement is null even though
 * something plainly encloses it, so the root's host is taken instead. Anywhere
 * else this is parentElement and nothing more.
 */
export function enclosing(element: HTMLElement): HTMLElement | undefined {
  if (element.parentElement) {
    return element.parentElement;
  }

  /* A Document has no host, so this is undefined outside a shadow tree, which
     ends the walk exactly where parentElement would have ended it. */
  const root: Node = element.getRootNode();
  return ((root as ShadowRoot).host as HTMLElement) || undefined;
}

/**
 * Where the visible area ends, in viewport coordinates.
 *
 * The window's own height is only right when the window is what scrolls. The
 * bottom of a scrolling container is what bounds anything inside it. Whichever
 * is higher up the screen wins, which is correct either way round.
 */
export function visibleBottom(element: HTMLElement): number {
  let bottom: number = window.innerHeight;
  let parent: HTMLElement | undefined = enclosing(element);

  while (parent && parent !== document.body) {
    if (scrolls(parent)) {
      bottom = Math.min(bottom, parent.getBoundingClientRect().bottom);
    }
    parent = enclosing(parent);
  }

  return bottom;
}

/** True if `element` is the thing a wheel gesture over it would move. */
export function scrolls(element: HTMLElement): boolean {
  const style: CSSStyleDeclaration = window.getComputedStyle(element);
  return /(auto|scroll|overlay)/.test(style.overflowY)
    && element.scrollHeight > element.clientHeight;
}

/** The nearest ancestor that scrolls, or undefined when the window does. */
export function scroller(element: HTMLElement): HTMLElement | undefined {
  let parent: HTMLElement | undefined = enclosing(element);

  while (parent && parent !== document.body) {
    if (scrolls(parent)) {
      return parent;
    }
    parent = enclosing(parent);
  }

  return undefined;
}

/**
 * How much visible room there is from where `element` starts to the bottom of
 * the area that is actually scrolling.
 *
 * Measured from the top of the scrollable content rather than from the
 * element's position on screen, so the answer does not change as the page is
 * scrolled: a min-height that grew every time the reader scrolled down would
 * push the document further away with every wheel click.
 */
export function roomBelow(element: HTMLElement): number {
  const container: HTMLElement | undefined = scroller(element);
  const top: number = container ? container.getBoundingClientRect().top : 0;
  const scrolled: number = container ? container.scrollTop : window.pageYOffset;
  const above: number = element.getBoundingClientRect().top - top + scrolled;

  return visibleBottom(element) - top - above;
}
