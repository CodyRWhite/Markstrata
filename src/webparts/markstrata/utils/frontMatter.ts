/**
 * .SYNOPSIS
 * YAML frontmatter, taken off the front of a document.
 *
 * .DESCRIPTION
 * Markdown has no concept of frontmatter: `---` is a thematic break, and a
 * `---` under a line of text is a setext underline. So a file carrying the
 * block every static site generator puts there renders as a horizontal rule
 * followed by an enormous heading made of its own metadata, which then leads
 * the table of contents, above the document's real title.
 *
 * That is not a reading of the file anyone would choose, and it arrives
 * unasked: Obsidian writes frontmatter for its properties, and so do Hugo,
 * Jekyll and Docusaurus. Someone moving a folder of notes into a document
 * library has not opted into anything.
 *
 * The block is removed from what gets rendered, and what it held is offered
 * back to the caller for the file footer, which is already where this document
 * says who wrote a thing and when.
 *
 * The parsing is deliberately shallow. A full YAML parser is a large
 * dependency and a parser is an attack surface; all that is wanted is the
 * handful of scalar keys a document actually sets, and anything else is
 * skipped rather than guessed at.
 *
 * .USAGE
 *   import { splitFrontMatter } from './utils/frontMatter';
 *
 *   const { body, data } = splitFrontMatter(markdown);
 *   processor.render(body);          // the document, without its frontmatter
 *   console.log(data.title, data.author, data.tags);
 *
 * .NOTES
 * Since:     0.0.14.0
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

export interface IFrontMatter {
  title?: string;
  author?: string;
  description?: string;
  tags?: string[];
}

export interface ISplitDocument {
  /** The document with any frontmatter removed. */
  body: string;
  /** What the frontmatter held, empty when there was none. */
  data: IFrontMatter;
}

/*
 * Frontmatter is only frontmatter at the very top of the file. A `---` further
 * down is a thematic break and has to stay one.
 *
 * A byte order mark survives a round trip through some editors and would
 * otherwise stop the block being recognised at all.
 */
const OPENING: RegExp = /^\uFEFF?(?:---|\+\+\+)[ \t]*\r?\n/;

/** Only these are read; the rest of the block is dropped with it. */
const SCALARS: string[] = ['title', 'author', 'description'];
const LISTS: string[] = ['tags', 'keywords'];

export function splitFrontMatter(source: string): ISplitDocument {
  const text: string = source || '';
  const open: RegExpMatchArray | null = text.match(OPENING);
  if (!open) {
    return { body: text, data: {} };
  }

  const fence: string = open[0].trim();
  const rest: string = text.slice(open[0].length);
  /* The closing fence has to be the same one that opened, on its own line.
     Escaped, because a TOML fence is three plus signs and a plus is a
     quantifier: unescaped, `+++` is not a pattern matching `+++`. */
  const escaped: string = fence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const close: RegExp = new RegExp(`(^|\\n)${escaped}[ \\t]*(\\r?\\n|$)`);
  const end: RegExpMatchArray | null = rest.match(close);

  /* An opening fence with no closing one is a thematic break and a document,
     not a broken block: leaving it alone is the safer reading. */
  if (!end || end.index === undefined) {
    return { body: text, data: {} };
  }

  const block: string = rest.slice(0, end.index);
  const body: string = rest.slice(end.index + end[0].length);
  return { body: body, data: parse(block) };
}

function parse(block: string): IFrontMatter {
  const data: IFrontMatter = {};

  block.split(/\r?\n/).forEach((line: string) => {
    /* Only top level keys. An indented line belongs to a nested structure this
       does not read, and treating it as a key would invent values. */
    const match: RegExpMatchArray | null = line.match(/^([A-Za-z][A-Za-z0-9_-]*)[ \t]*:[ \t]*(.*)$/);
    if (!match) {
      return;
    }

    const key: string = match[1].toLowerCase();
    const value: string = match[2].trim();
    if (!value) {
      return;
    }

    if (SCALARS.indexOf(key) !== -1) {
      (data as { [name: string]: unknown })[key] = unquote(value);
      return;
    }

    if (LISTS.indexOf(key) !== -1) {
      const items: string[] = readList(value);
      if (items.length) {
        data.tags = (data.tags || []).concat(items);
      }
    }
  });

  return data;
}

/** `[one, two]` or `one, two`, which is how tags are usually written. */
function readList(written: string): string[] {
  const inner: string = written.replace(/^\[/, '').replace(/\]$/, '');
  return inner
    .split(',')
    .map((item: string) => unquote(item.trim()))
    .filter((item: string) => item.length > 0);
}

function unquote(value: string): string {
  const quoted: RegExpMatchArray | null = value.match(/^(['"])([\s\S]*)\1$/);
  return quoted ? quoted[2] : value;
}
