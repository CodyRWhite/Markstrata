/**
 * .SYNOPSIS
 * How wide the contents sidebar is, when it is a sidebar at all.
 *
 * .DESCRIPTION
 * Stacked above the content in a narrow column the setting does not apply: the
 * contents are full width there, which is the only thing that makes sense.
 *
 * .USAGE
 *   import { tocWidthCss, tocWidthForUnit, TOC_WIDTH_RANGES } from './utils/tocWidth';
 *
 *   tocWidthCss('fixed', 'em', 15);   // '15em'
 *   tocWidthCss('auto', 'em', 15);    // 'auto'
 *
 * .NOTES
 * Since:     0.0.12.0
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

export type TocWidthMode = 'auto' | 'fixed';
export type TocWidthUnit = 'em' | '%' | 'px' | 'vw';

export interface ITocWidthRange {
  min: number;
  max: number;
  step: number;
  /** Used when switching to this unit, so the sidebar stays a sane size. */
  fallback: number;
}

/*
 * A range per unit, because a number that means a comfortable sidebar in one
 * unit is absurd in another: 240 is right in px and nonsense in em.
 */
export const TOC_WIDTH_RANGES: { [unit: string]: ITocWidthRange } = {
  em: { min: 8, max: 34, step: 1, fallback: 15 },
  '%': { min: 12, max: 45, step: 1, fallback: 22 },
  px: { min: 140, max: 560, step: 10, fallback: 240 },
  vw: { min: 6, max: 30, step: 1, fallback: 16 }
};

/** The CSS length for a setting, or 'auto' to let the content decide. */
export function tocWidthCss(mode: TocWidthMode, unit: TocWidthUnit, value: number): string {
  if (mode === 'auto') {
    return 'auto';
  }
  const range: ITocWidthRange = TOC_WIDTH_RANGES[unit];
  if (!range) {
    return 'auto';
  }
  /* Clamped rather than trusted: the number survives a change of unit, and a
     typed value arrives from a text box that accepts anything. */
  const safe: number = Math.min(range.max, Math.max(range.min, Math.round(value)));
  return `${safe}${unit}`;
}

/** Keeps the number sensible when the unit changes under it. */
export function tocWidthForUnit(unit: TocWidthUnit, current: number): number {
  const range: ITocWidthRange = TOC_WIDTH_RANGES[unit];
  if (!range) {
    return current;
  }
  return current >= range.min && current <= range.max ? current : range.fallback;
}
