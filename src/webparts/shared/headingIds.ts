/**
 * .SYNOPSIS
 * Gives every heading in a rendered document an id, so the contents list and
 * every kind of link have something to land on.
 *
 * .DESCRIPTION
 * The markdown web part never needed this: markdown-it puts an id on every
 * heading as it renders, made with GitHub's slug rule. An HTML document
 * somebody wrote by hand usually has none, and without them the contents list
 * comes out empty - collectHeadings only takes headings that have an id,
 * because an entry pointing at nothing is worse than a missing entry - and
 * `#fragment`, `?strataDoc=...#heading` and the sidebar all have nothing to
 * aim at.
 *
 * WHY THE AUTHOR'S OWN IDS ARE NEVER TOUCHED
 * An id the author wrote is part of their document: their own stylesheet may
 * select on it, their own links point at it, and anything already linking in
 * from outside was written against it. So an existing id is left exactly as it
 * is and only counted as taken. Only headings with nothing are given one.
 *
 * WHY THE SAME SLUG RULE AS MARKDOWN
 * headingSlug, the same function the markdown processor's anchors, its
 * `[[Page#Heading]]` links and its contents all use. A reader who moves from a
 * markdown document to an HTML one through a link should find that "Rolling
 * back" is `#rolling-back` in both, and a heading whose id is made one way and
 * linked another way is a link to nothing.
 *
 * A duplicate is numbered the way markdown-it-anchor numbers one, so a second
 * "Notes" is `notes-1` in either web part.
 *
 * WHICH WAY THIS FAILS
 * A heading this gives no id to is simply absent from the contents, which is
 * what already happens today. An id it invents that collides with something
 * else on the page would break a link, so every id already in the container is
 * counted before any is handed out, and the page's own ids outside the
 * container are not ours to know about - which is why the ids are slugs of the
 * heading text rather than anything generic like "section-1".
 *
 * .USAGE
 *   import { ensureHeadingIds } from '../../shared/headingIds';
 *
 *   article.innerHTML = sanitised;
 *   ensureHeadingIds(article);          // before the contents are collected
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  the HTML web part bundle
 * Requires:  wikiLinks.ts
 */

import { headingSlug } from '../markstrata/utils/wikiLinks';

const HEADINGS: string = 'h1,h2,h3,h4,h5,h6';

/**
 * A heading with no text to slug still gets an id, because a document that
 * numbers its sections with pictures is still a document somebody links into.
 */
const UNNAMED: string = 'section';

/**
 * Puts an id on every heading in the container that has none.
 *
 * Returns how many were given one, which is what tells a caller whether the
 * document arrived with its own anchors or not.
 */
export function ensureHeadingIds(container: HTMLElement): number {
  const taken: { [id: string]: boolean } = {};
  /* Every id in the container, not just the headings': an author's `<div
     id="notes">` would collide with a heading called Notes just as surely. */
  const existing: Element[] = Array.prototype.slice.call(container.querySelectorAll('[id]'));
  existing.forEach((element: Element) => { taken[element.id] = true; });

  const headings: HTMLElement[] =
    Array.prototype.slice.call(container.querySelectorAll(HEADINGS));

  let given: number = 0;
  headings.forEach((heading: HTMLElement, index: number) => {
    if (heading.id) {
      return;
    }
    const base: string = headingSlug(heading.textContent || '') || `${UNNAMED}-${index + 1}`;
    const id: string = nextFree(base, taken);
    heading.id = id;
    taken[id] = true;
    given = given + 1;
  });

  return given;
}

/**
 * The first spelling of a slug nothing has taken.
 *
 * Numbered from one, which is what markdown-it-anchor does, so a second
 * "Notes" is `notes-1` in an HTML document exactly as it is in a markdown one.
 */
function nextFree(base: string, taken: { [id: string]: boolean }): string {
  if (!taken[base]) {
    return base;
  }
  let suffix: number = 1;
  while (taken[`${base}-${suffix}`]) {
    suffix = suffix + 1;
  }
  return `${base}-${suffix}`;
}
