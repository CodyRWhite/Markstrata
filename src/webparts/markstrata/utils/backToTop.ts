/**
 * Where the back to top button sits, or whether it is there at all.
 *
 * A side rather than a corner, because the corner is decided for it: the
 * button belongs at the bottom of the screen, and the only real question is
 * which side of the reading column it sits beside. Left suits a page whose
 * own chrome lives on the right, and the other way round.
 */
export type BackToTop = 'off' | 'left' | 'right';
