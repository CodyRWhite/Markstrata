/**
 * .SYNOPSIS
 * What a reader can do with a table the document wrote: read its header
 * halfway down, and sort by a column.
 *
 * .DESCRIPTION
 * The comparisons themselves are in tables.ts, which knows nothing about the
 * DOM and is unit tested on its own. This is the half that has to touch the
 * page.
 *
 * .USAGE
 *   import { TableTools } from './utils/tableTools';
 *
 *   const tables: TableTools = new TableTools();
 *   tables.enhance(article, allowSort);
 *   tables.stop();
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  tables.ts
 */

import { ColumnKind, ISortableRow, columnKind, sortedOrder } from './tables';

export class TableTools {
  /** Watches each table's box, because whether it fits decides how it behaves. */
  private fitObserver: ResizeObserver | undefined;

  /**
   * The header is a plain sticky one, which has a condition nothing in the
   * stylesheet can see. A table is wrapped in a box that scrolls sideways so a
   * wide one does not stretch the page, and a scroll box is what a sticky cell
   * sticks to - so inside it the header sticks to a box that never scrolls
   * downwards, which is to say it never sticks at all. The box is only needed
   * when the table is actually wider than the column, so each is measured and
   * the ones that fit are let out of it. That is a measurement, so it is
   * redone when the column changes width.
   */
  public enhance(container: HTMLElement, allowSort: boolean): void {
    const wraps: HTMLElement[] = Array.prototype.slice.call(
      container.querySelectorAll('.strata-table-scroll')
    );
    if (wraps.length === 0) {
      return;
    }

    this.stop();
    const letOutIfItFits: (wrap: HTMLElement) => void = (wrap: HTMLElement) => {
      const table: HTMLTableElement | null = wrap.querySelector(':scope > table');
      if (!table) {
        return;
      }
      /* A pixel of slack: a table that fits exactly can measure a hair wider
         than its box through rounding, and would then be caged for nothing. */
      const fits: boolean = table.scrollWidth <= wrap.clientWidth + 1;
      wrap.classList.toggle('strata-table-scroll--fits', fits);
    };

    wraps.forEach(letOutIfItFits);

    if (typeof ResizeObserver !== 'undefined') {
      this.fitObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
        entries.forEach((entry: ResizeObserverEntry) =>
          letOutIfItFits(entry.target as HTMLElement));
      });
      wraps.forEach((wrap: HTMLElement) =>
        (this.fitObserver as ResizeObserver).observe(wrap));
    }

    if (allowSort) {
      wraps.forEach((wrap: HTMLElement) => {
        const table: HTMLTableElement | null = wrap.querySelector(':scope > table');
        if (table) {
          makeSortable(table);
        }
      });
    }
  }

  public stop(): void {
    if (this.fitObserver) {
      this.fitObserver.disconnect();
      this.fitObserver = undefined;
    }
  }
}

/*
 * A table can be sorted when its shape survives its rows being reordered. A
 * merged cell does not: a row that spans two of them means something about its
 * neighbours, and moving it away from them turns a table into a mess. So a
 * table holding one is left exactly as the document wrote it.
 */
function makeSortable(table: HTMLTableElement): void {
  const head: HTMLTableRowElement | null = table.querySelector(':scope > thead > tr');
  const body: HTMLTableSectionElement | null = table.querySelector(':scope > tbody');
  if (!head || !body || body.rows.length < 2) {
    return;
  }
  if (table.querySelector('[colspan], [rowspan]')) {
    return;
  }

  const headers: HTMLTableCellElement[] = Array.prototype.slice.call(head.cells);
  const rows: HTMLTableRowElement[] = Array.prototype.slice.call(body.rows);
  if (headers.length === 0
    || rows.some((row: HTMLTableRowElement) => row.cells.length !== headers.length)) {
    return;
  }

  table.classList.add('strata-table-sortable');

  headers.forEach((cell: HTMLTableCellElement, column: number) => {
    /* The whole cell is the target, but a button inside it is what carries the
       name, the focus and the pressing: a th with a click handler is not a
       control to anything that is not a mouse. */
    const button: HTMLButtonElement = document.createElement('button');
    button.type = 'button';
    button.className = 'strata-th-sort';
    while (cell.firstChild) {
      button.appendChild(cell.firstChild);
    }

    const arrow: HTMLElement = document.createElement('span');
    arrow.className = 'strata-th-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    button.appendChild(arrow);

    cell.appendChild(button);
    cell.setAttribute('aria-sort', 'none');
    button.addEventListener('click', () => sortBy(headers, rows, column));
  });
}

/*
 * Three states rather than two: up, down, and back to the order the document
 * wrote. A reader who sorted a table of steps by name has no other way back to
 * the steps in order, short of reloading the page.
 */
function sortBy(
  headers: HTMLTableCellElement[],
  rows: HTMLTableRowElement[],
  column: number
): void {
  const sortedBefore: string = headers[column].getAttribute('aria-sort') || 'none';
  const sortedNow: string = sortedBefore === 'none'
    ? 'ascending'
    : (sortedBefore === 'ascending' ? 'descending' : 'none');

  headers.forEach((cell: HTMLTableCellElement, index: number) => {
    cell.setAttribute('aria-sort', index === column ? sortedNow : 'none');
  });

  const body: HTMLTableSectionElement = rows[0].parentElement as HTMLTableSectionElement;
  if (sortedNow === 'none') {
    rows.forEach((row: HTMLTableRowElement) => body.appendChild(row));
    return;
  }

  const values: string[] = rows.map(
    (row: HTMLTableRowElement) => (row.cells[column].textContent || '').trim()
  );
  const kind: ColumnKind = columnKind(values);
  const sortable: ISortableRow[] = values.map((value: string, index: number) => ({
    value: value,
    index: index
  }));

  sortedOrder(sortable, kind, sortedNow === 'descending')
    .forEach((index: number) => body.appendChild(rows[index]));
}
