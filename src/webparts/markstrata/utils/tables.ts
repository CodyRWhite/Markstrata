/**
 * .SYNOPSIS
 * Sorting a table a document wrote.
 *
 * .DESCRIPTION
 * A markdown table has no types: every cell is text, and what a column holds
 * has to be worked out from the column itself. So each is read as a whole -
 * numbers only if every filled cell in it is a number, dates only if every
 * filled cell is a date - and anything else is compared as text. A column of
 * mostly numbers with one "n/a" in it sorts as text, which is the honest answer
 * rather than a guess about where the odd one out belongs.
 *
 * Dates are deliberately narrow. `Date.parse` will take "5" and hand back the
 * fifth of May, and it reads 01/02/2024 as the second of January whether the
 * document meant that or the first of February - so a column written the other
 * way round would sort into a confident wrong order. Only shapes that mean one
 * thing are treated as dates; everything else is text, where the ordering is at
 * least the one the reader can see.
 *
 * .USAGE
 *   import { columnKind, sortedOrder } from './utils/tables';
 *
 *   const kind: ColumnKind = columnKind(values);        // number, date or text
 *   const order: number[] = sortedOrder(rows, kind, descending);
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

export type ColumnKind = 'number' | 'date' | 'text';

/* Written as a number by somebody rather than by a machine: thousands
   separators, a currency in front, a per cent sign behind. Grouping separators
   are dropped rather than interpreted, so a column written 1,5 for one and a
   half sorts as fifteen; the alternative is guessing at which convention a
   document follows from a single cell. */
const NUMERIC: RegExp = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/;
/* The sign stays where it is when the currency in front of it goes. */
const CURRENCY: RegExp = /^([-+]?)[$\u00A3\u20AC\u00A5]\s*/;

export function asNumber(text: string): number | undefined {
  const cleaned: string = text
    .trim()
    .replace(CURRENCY, '$1')
    .replace(/[\s,]/g, '')
    .replace(/%$/, '');
  return NUMERIC.test(cleaned) ? Number(cleaned) : undefined;
}

/* ISO, or a written month. Both say the same thing to everybody. */
const DATE_SHAPE: RegExp = new RegExp(
  '^\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2})?(?:Z|[-+]\\d{2}:?\\d{2})?)?$'
  + '|^\\d{1,2} [A-Za-z]{3,} \\d{4}$'
  + '|^[A-Za-z]{3,} \\d{1,2},? \\d{4}$'
);

export function asTime(text: string): number | undefined {
  const value: string = text.trim();
  if (!DATE_SHAPE.test(value)) {
    return undefined;
  }
  const parsed: number = Date.parse(value);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * What a column holds, from every filled cell in it.
 *
 * Empty cells say nothing about the type, so they are left out here and sorted
 * to the end later.
 */
export function columnKind(values: string[]): ColumnKind {
  const filled: string[] = values.filter((value: string) => value.trim().length > 0);
  if (filled.length === 0) {
    return 'text';
  }
  if (filled.every((value: string) => asNumber(value) !== undefined)) {
    return 'number';
  }
  if (filled.every((value: string) => asTime(value) !== undefined)) {
    return 'date';
  }
  return 'text';
}

/**
 * Orders two cells of a column of that kind.
 *
 * An empty cell sorts to the end in both directions rather than to the top in
 * one of them: a blank is missing information, and burying the rows that have
 * none is what somebody sorting a column is asking for either way. The caller
 * reverses the comparison for a descending sort, so this returns the empties
 * marked rather than ordered, and the caller leaves them where they are.
 */
export function compareCells(first: string, second: string, kind: ColumnKind): number {
  if (kind === 'number') {
    return (asNumber(first) as number) - (asNumber(second) as number);
  }
  if (kind === 'date') {
    return (asTime(first) as number) - (asTime(second) as number);
  }
  /* numeric: true so "item 2" comes before "item 10", which is the order a
     reader means by those names even though the text does not say so. */
  return first.trim()
    .localeCompare(second.trim(), undefined, { numeric: true, sensitivity: 'base' });
}

export interface ISortableRow {
  /** The cell being sorted on. */
  value: string;
  /** Where the row was before anything was sorted, to break ties by. */
  index: number;
}

/**
 * The order rows go in, as a list of their original positions.
 *
 * Ties keep the order the document had them in, so sorting by one column
 * leaves rows that match each other where the author put them rather than
 * shuffling them. Empty cells hold their positions at the end.
 */
export function sortedOrder(
  rows: ISortableRow[],
  kind: ColumnKind,
  descending: boolean
): number[] {
  const filled: ISortableRow[] = rows.filter((row: ISortableRow) => row.value.trim().length > 0);
  const blank: ISortableRow[] = rows.filter((row: ISortableRow) => row.value.trim().length === 0);

  const ordered: ISortableRow[] = filled.slice()
    .sort((first: ISortableRow, second: ISortableRow) => {
      const decided: number = compareCells(first.value, second.value, kind);
      if (decided !== 0) {
        return descending ? -decided : decided;
      }
      return first.index - second.index;
    });

  return ordered.concat(blank).map((row: ISortableRow) => row.index);
}
