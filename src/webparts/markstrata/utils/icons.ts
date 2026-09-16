/**
 * .SYNOPSIS
 * The toolbar's icons.
 *
 * .DESCRIPTION
 * Drawn here as inline SVG rather than pulled from a font or a package: the
 * web part loads nothing from a CDN, and an icon font would be a second
 * request and a flash of the wrong glyph before it arrived.
 *
 * All of them are 24x24 outlines on the same grid and inherit `currentColor`,
 * so one rule in the stylesheet sizes and colours the lot, and each follows
 * the theme it is sitting in without being told.
 *
 * .USAGE
 *   import { CLOCK_ICON, themeIcon } from './utils/icons';
 *
 *   pill.innerHTML = CLOCK_ICON;
 *   // The mask needs an id of its own, or two web parts animate as one:
 *   button.innerHTML = themeIcon(`${uid}-mode-mask`);
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

const SVG_OPEN: string =
  '<svg class="strata-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">';

/** A clock, for how long the document takes to read. */
export const CLOCK_ICON: string =
  `${SVG_OPEN}<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

/** Circular arrows, for fetching the file again. */
export const RELOAD_ICON: string =
  `${SVG_OPEN}<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>`;

/** A clock turning back, for the versions of a file. */
export const HISTORY_ICON: string =
  `${SVG_OPEN}<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>` +
  '<path d="M12 8v4l3 2"/></svg>';

/** A printer. */
export const PRINT_ICON: string =
  `${SVG_OPEN}<path d="M7 9V3h10v6"/><path d="M7 19H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>` +
  '<path d="M7 15h10v6H7z"/></svg>';

/*
 * Arrows to the four corners: the thing under them, opened out to the window.
 *
 * Written without the strata-icon class the toolbar icons carry, because it is
 * used on the small buttons over a diagram and inside a code block header,
 * which `.strata-code-btn svg` sizes instead. Shared by both of those so the
 * same drawing means the same thing wherever a reader meets it.
 */
export const EXPAND_ICON: string =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<path d="M9 3H3v6M21 9V3h-6M15 21h6v-6M3 15v6h6"/>'
  + '<path d="m3 3 6 6M21 3l-6 6M21 21l-6-6M3 21l6-6"/></svg>';

/*
 * The colour-mode toggle: one drawing that moves between a sun and a moon
 * rather than two glyphs that swap.
 *
 * The disc is the whole of it. A mask circle parked off the right edge does
 * nothing, so the disc reads as a sun; slide that circle over the disc and the
 * bite it takes out leaves a crescent. The beams fade and turn as it goes. All
 * of the movement is in the stylesheet, so a reader who has asked for less of
 * it gets the end state and none of the travel.
 *
 * The mask needs an id, and two web parts on one page would otherwise both
 * point at the first one's mask and animate together, so the caller passes a
 * unique one in.
 */
export function themeIcon(maskId: string): string {
  return `${SVG_OPEN}<mask id="${maskId}">` +
    '<rect x="0" y="0" width="24" height="24" fill="#fff" stroke="none"/>' +
    '<circle class="strata-theme-bite" cx="26" cy="10" r="6" fill="#000" stroke="none"/>' +
    '</mask>' +
    `<circle class="strata-theme-disc" cx="12" cy="12" r="6" fill="currentColor" stroke="none" mask="url(#${maskId})"/>` +
    '<g class="strata-theme-beams">' +
    '<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>' +
    '</g></svg>';
}
