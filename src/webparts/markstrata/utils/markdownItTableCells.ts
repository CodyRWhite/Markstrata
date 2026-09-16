/**
 * .SYNOPSIS
 * markdown-it plugin: the cells of a table row, split the way GitHub splits them.
 *
 * .DESCRIPTION
 * markdown-it-multimd-table brings rowspan, colspan and multiline cells, which
 * this web part uses and documents, and it splits a row into cells itself
 * rather than the way CommonMark's own table does. Three things it does
 * differently are wrong rather than merely different, and all three are quiet:
 *
 *   A single backtick in a cell swallowed the rest of the row. The scanner
 *   reads a backtick as opening a code span and ignores every pipe until the
 *   closing one, so a row with an odd number of backticks ran to the end of
 *   the line as one cell. GitHub's own documentation of tables uses exactly
 *   that table - a column of characters, one row per character, one of them a
 *   backtick - so it is not a corner case.
 *
 *   `\|` inside a code span kept its backslash, and the reader saw `\|` where
 *   the document meant `|`. An escaped pipe is the only escape a table cell
 *   has, and the backslash is meant to come off before the cell is read as
 *   markdown, which is the one place a code span cannot undo it.
 *
 *   A row with the wrong number of cells stayed that way. A short row left the
 *   table ragged and a long one put a cell under no heading at all, which also
 *   walked the sortable columns out of step with their headers. Every other
 *   renderer pads a short row and ignores the excess of a long one.
 *
 * So the rows are read again here, from the document, and only put right where
 * they are wrong. A row the plugin got right is left exactly as the plugin
 * built it, along with everything it can do that this cannot: a row carrying a
 * rowspan or a colspan, and a row written across several lines, are its
 * business and are not touched.
 *
 * .USAGE
 *   import { tableCellPlugin } from './utils/markdownItTableCells';
 *
 *   markdownIt.use(markdownItMultimdTable, { ... });
 *   markdownIt.use(tableCellPlugin);
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  markdownItTypes.ts, markdown-it-multimd-table
 */

import { IMarkdownIt, IStateCore, IToken, TokenConstructor } from './markdownItTypes';

/** A separator cell: the dashes, equals, colons and pluses a table is ruled with. */
const SEPARATOR: RegExp = /^:?(-+|=+):?\+?$/;

/** What one cell of a row is, once the row has been split. */
interface ICell {
  open: number;
  inline: number;
  close: number;
}

/** A row, as the tokens that make it up. */
interface IRow {
  open: number;
  close: number;
  tag: string;
  cells: ICell[];
}

/**
 * The ranges of a line that are inside a code span.
 *
 * Paired the way markdown-it pairs them: a run of n backticks is closed by the
 * next run of exactly n. A run that never finds its closer is not a code span
 * and is just a backtick, which is the whole of the first bug - the table
 * plugin treats one as opening a span that then runs to the end of the line.
 */
function codeSpans(line: string): [number, number][] {
  const runs: [number, number][] = [];
  for (let index: number = 0; index < line.length; index++) {
    if (line.charAt(index) !== '`') {
      continue;
    }
    if (index > 0 && line.charAt(index - 1) === '\\') {
      continue;
    }
    const start: number = index;
    while (index + 1 < line.length && line.charAt(index + 1) === '`') {
      index++;
    }
    runs.push([start, index + 1]);
  }

  const spans: [number, number][] = [];
  for (let index: number = 0; index < runs.length; index++) {
    const length: number = runs[index][1] - runs[index][0];
    for (let next: number = index + 1; next < runs.length; next++) {
      if (runs[next][1] - runs[next][0] === length) {
        spans.push([runs[index][0], runs[next][1]]);
        index = next;
        break;
      }
    }
  }
  return spans;
}

/** Is this position inside one of those ranges? */
function inSpan(spans: [number, number][], position: number): boolean {
  return spans.some((span: [number, number]) => position >= span[0] && position < span[1]);
}

/**
 * Splits one line of a table into its cells.
 *
 * On an unescaped pipe that is not inside a code span, with the one pipe a row
 * may open with and the one it may close with dropped, which is what every
 * other renderer does and what lets `| a | b |` and `a | b` mean the same row.
 */
export function splitRow(line: string): string[] {
  const spans: [number, number][] = codeSpans(line);
  const bounds: number[] = [];

  for (let index: number = 0; index < line.length; index++) {
    if (line.charAt(index) !== '|' || inSpan(spans, index)) {
      continue;
    }
    let slashes: number = 0;
    while (index - slashes - 1 >= 0 && line.charAt(index - slashes - 1) === '\\') {
      slashes++;
    }
    if (slashes % 2 === 0) {
      bounds.push(index);
    }
  }

  if (bounds.length === 0) {
    return [];
  }

  const cells: string[] = [];
  const opens: boolean = line.slice(0, bounds[0]).trim() === '';
  const closes: boolean = line.slice(bounds[bounds.length - 1] + 1).trim() === '';

  const first: number = opens ? 0 : -1;
  const last: number = closes ? bounds.length - 1 : bounds.length;

  for (let index: number = first; index < last; index++) {
    const from: number = index === -1 ? 0 : bounds[index] + 1;
    const to: number = index + 1 < bounds.length ? bounds[index + 1] : line.length;
    cells.push(line.slice(from, to).trim());
  }

  return cells;
}

/**
 * Takes the backslash off an escaped pipe.
 *
 * Done before the cell is read as markdown, because that is the only point at
 * which it can be: inside a code span markdown-it reads no escapes at all, so
 * `` `\|` `` reached the reader with the backslash still on it.
 */
export function unescapePipes(text: string): string {
  return text.replace(/\\\|/g, '|');
}

/** Is this line the one that rules the table, and so says how wide it is? */
function isSeparator(line: string): boolean {
  const cells: string[] = splitRow(line);
  return cells.length > 0 && cells.every((cell: string) => SEPARATOR.test(cell));
}

/** How many columns a cell covers, which a colspan can make more than one. */
function width(token: IToken): number {
  const colspan: string | null = token.attrGet('colspan');
  const value: number = colspan ? parseInt(colspan, 10) : 1;
  return value > 0 ? value : 1;
}

export function tableCellPlugin(markdownIt: IMarkdownIt): void {
  const rule = (state: IStateCore): void => {
    const lines: string[] = state.src.split('\n');

    for (let index: number = 0; index < state.tokens.length; index++) {
      if (state.tokens[index].type !== 'table_open') {
        continue;
      }
      const close: number = closeOf(state.tokens, index, 'table_close');
      if (close !== -1) {
        repair(state.tokens, state.Token, index, close, lines);
        index = close;
      }
    }
  };

  /* After block parsing and before inline parsing, while a cell is still the
     text that was written rather than a parsed tree. */
  markdownIt.core.ruler.after('block', 'strata_table_cells', rule);
}

/** The index of the token that closes the one at `open`. */
function closeOf(tokens: IToken[], open: number, type: string): number {
  for (let index: number = open + 1; index < tokens.length; index++) {
    if (tokens[index].type === type && tokens[index].level === tokens[open].level) {
      return index;
    }
  }
  return -1;
}

/** Everything that needs doing to one table. */
function repair(
  tokens: IToken[],
  Token: TokenConstructor,
  open: number,
  close: number,
  lines: string[]
): void {
  const rows: IRow[] = readRows(tokens, open, close);
  if (rows.length === 0) {
    return;
  }

  /* An escaped pipe is content in every row, whatever else is done below. */
  rows.forEach((row: IRow) => {
    row.cells.forEach((cell: ICell) => {
      tokens[cell.inline].content = unescapePipes(tokens[cell.inline].content);
    });
  });

  const columns: number = columnsOf(tokens[open], lines);
  if (columns === 0) {
    return;
  }

  /* A rowspan makes a later row legitimately short, and this cannot tell that
     row from one that is short by mistake. The plugin that wrote the rowspan
     can, so the whole table is left to it. */
  const spanned: boolean = rows.some((row: IRow) =>
    row.cells.some((cell: ICell) => tokens[cell.open].attrGet('rowspan') !== null));
  if (spanned) {
    return;
  }

  /* Back to front, so that rebuilding one row does not move the next. */
  for (let index: number = rows.length - 1; index >= 0; index--) {
    rebuildIfWrong(tokens, Token, rows[index], rows[0], columns, lines);
  }
}

/** The rows of a table, each as the tokens that make it up. */
function readRows(tokens: IToken[], open: number, close: number): IRow[] {
  const rows: IRow[] = [];

  for (let index: number = open + 1; index < close; index++) {
    if (tokens[index].type !== 'tr_open') {
      continue;
    }
    const rowClose: number = closeOf(tokens, index, 'tr_close');
    if (rowClose === -1) {
      continue;
    }

    const cells: ICell[] = [];
    let tag: string = 'td';
    for (let inner: number = index + 1; inner < rowClose; inner++) {
      const type: string = tokens[inner].type;
      if (type !== 'td_open' && type !== 'th_open') {
        continue;
      }
      tag = tokens[inner].tag;
      const cellClose: number = closeOf(tokens, inner, `${tag}_close`);
      if (cellClose === -1 || cellClose !== inner + 2) {
        /* A cell holding blocks rather than one line of text is a multiline
           cell, which is the plugin's own feature and not this one's. */
        return rows;
      }
      cells.push({ open: inner, inline: inner + 1, close: cellClose });
      inner = cellClose;
    }

    rows.push({ open: index, close: rowClose, tag: tag, cells: cells });
    index = rowClose;
  }

  return rows;
}

/**
 * How many columns the table has, read from the line that rules it.
 *
 * From the separator rather than from the header row, because the header is a
 * row like any other and can be the one that was split wrongly. Every other
 * renderer counts the columns the same way.
 */
function columnsOf(table: IToken, lines: string[]): number {
  const map: [number, number] | null = table.map;
  if (!map) {
    return 0;
  }
  for (let line: number = map[0]; line < map[1] && line < lines.length; line++) {
    if (isSeparator(lines[line])) {
      return splitRow(lines[line]).length;
    }
  }
  return 0;
}

/** Rebuilds one row, if reading it again gives something different. */
function rebuildIfWrong(
  tokens: IToken[],
  Token: TokenConstructor,
  row: IRow,
  header: IRow,
  columns: number,
  lines: string[]
): void {
  const map: [number, number] | null = tokens[row.open].map;
  /* A row written across several lines belongs to the plugin's multiline
     feature, which stitches it together itself. */
  if (!map || map[1] - map[0] !== 1 || map[0] >= lines.length) {
    return;
  }
  /* A colspan is the plugin's own `||`, and how wide that row is is its
     answer to give. */
  if (row.cells.some((cell: ICell) => width(tokens[cell.open]) !== 1)) {
    return;
  }

  const written: string[] = splitRow(lines[map[0]]);
  if (written.length === 0) {
    return;
  }

  const wanted: string[] = [];
  for (let index: number = 0; index < columns; index++) {
    wanted.push(unescapePipes(index < written.length ? written[index] : ''));
  }

  const current: string[] = row.cells.map((cell: ICell) => tokens[cell.inline].content);
  if (current.length === wanted.length && current.every((text: string, at: number) => text === wanted[at])) {
    return;
  }

  tokens.splice(row.open + 1, row.close - row.open - 1, ...cellTokens(tokens, Token, row, header, wanted));
}

/** The tokens for a rebuilt row, aligned the way its headings are. */
function cellTokens(
  tokens: IToken[],
  Token: TokenConstructor,
  row: IRow,
  header: IRow,
  wanted: string[]
): IToken[] {
  const sample: IToken | undefined = row.cells.length ? tokens[row.cells[0].open] : undefined;
  const level: number = sample ? sample.level : tokens[row.open].level + 1;
  const built: IToken[] = [];

  wanted.forEach((text: string, index: number) => {
    const open: IToken = made(Token, `${row.tag}_open`, row.tag, 1, level);
    /* The alignment lives on the heading of the column, put there from the
       separator line, so a rebuilt cell reads it off the heading above it. */
    const heading: ICell | undefined = header.cells[index];
    const style: string | null = heading ? tokens[heading.open].attrGet('style') : null;
    if (style) {
      open.attrSet('style', style);
    }
    built.push(open);

    const inline: IToken = made(Token, 'inline', '', 0, level + 1);
    inline.content = text;
    inline.children = [];
    inline.map = tokens[row.open].map;
    built.push(inline);

    built.push(made(Token, `${row.tag}_close`, row.tag, -1, level));
  });

  return built;
}

/*
 * A new token, built through markdown-it's own constructor rather than by hand,
 * so it carries whatever a token is expected to carry. A core rule is handed
 * the constructor on the state, which is why it is passed down here.
 */
function made(Token: TokenConstructor, type: string, tag: string, nesting: number, level: number): IToken {
  const token: IToken = new Token(type, tag, nesting);
  token.level = level;
  return token;
}

export const plugin: (markdownIt: IMarkdownIt) => void = tableCellPlugin;
