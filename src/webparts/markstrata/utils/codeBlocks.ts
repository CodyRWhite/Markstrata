/**
 * .SYNOPSIS
 * Fenced code block rendering.
 *
 * .DESCRIPTION
 * Produces the markup code.css styles: an optional header carrying the
 * language label, an optional filename, a copy button, and one block element
 * per source line so line numbers can be CSS counters in a sticky gutter.
 *
 * Highlighting runs through highlight.js but none of its stylesheets are
 * imported - the token classes are coloured by syntax.css from theme
 * variables, which is what lets one rendered block follow the selected theme.
 *
 * A fence that names a `src` has no body to render yet. Rendering is a string
 * going in and a string coming out, so the address is not fetched here: the
 * block is drawn waiting, carrying the address on the element, and remoteCode
 * fills it in once the document is on the page.
 *
 * .USAGE
 *   import { renderCodeBlock, renderCodeLines, parseInfo } from './utils/codeBlocks';
 *
 *   const html: string = renderCodeBlock(source, 'ts {2,4-6}', {
 *     highlight: true, showHeader: true, showLineNumbers: true
 *   });
 *
 *   // The line elements on their own, for a block being filled in later:
 *   const lines: string = renderCodeLines(fetched, 'ts', true, [2, 4]);
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

// `lib/common` carries ~35 languages instead of highlight.js' full 190+, which
// keeps roughly a megabyte out of the bundle. The extras below are the ones a
// SharePoint audience actually pastes that common leaves out - add more the
// same way if your content needs them.
import hljs from 'highlight.js/lib/common';
import powershell from 'highlight.js/lib/languages/powershell';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import dos from 'highlight.js/lib/languages/dos';
import http from 'highlight.js/lib/languages/http';

hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('dos', dos);
hljs.registerLanguage('http', http);

export interface ICodeBlockOptions {
  highlight: boolean;
  showHeader: boolean;
  lineNumbers: boolean;
  wrap: boolean;
}

/**
 * The attribute a block carries its unfetched address on, and the class that
 * says it is still waiting. Named here because remoteCode.ts reads both and
 * code.css styles the second, and three copies of a string is two too many.
 */
export const CODE_SOURCE_ATTRIBUTE: string = 'data-strata-code-src';
export const CODE_LOADING_CLASS: string = 'strata-code--loading';

/**
 * How many lines a waiting block should hold room for, from the line range on
 * its address.
 *
 * A block that fills grows from one line of prose to the height of a file, and
 * everything below it moves down - which, for a reader who followed a link to
 * a heading further down the page, means the place they were taken to slides
 * away under them. An address that names `#L10-L20` has already said how tall
 * the block will be, so the room is taken before the fetch rather than after.
 *
 * An address with no range cannot say, and that block does still move when it
 * fills. Nothing here can know the length of a file it has not read.
 */
export function reservedLines(src: string): number {
  const found: RegExpExecArray | null = /#L(\d+)(?:-L?(\d+))?$/i.exec(src || '');
  if (!found || !found[2]) {
    return 0;
  }
  return Math.abs(parseInt(found[2], 10) - parseInt(found[1], 10)) + 1;
}

const LANGUAGE_LABELS: { [alias: string]: string } = {
  bash: 'Bash',
  c: 'C',
  cpp: 'C++',
  cs: 'C#',
  csharp: 'C#',
  css: 'CSS',
  diff: 'Diff',
  dockerfile: 'Dockerfile',
  go: 'Go',
  graphql: 'GraphQL',
  html: 'HTML',
  ini: 'INI',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  kotlin: 'Kotlin',
  less: 'Less',
  lua: 'Lua',
  makefile: 'Makefile',
  markdown: 'Markdown',
  md: 'Markdown',
  objectivec: 'Objective-C',
  perl: 'Perl',
  php: 'PHP',
  plaintext: 'Text',
  powershell: 'PowerShell',
  ps1: 'PowerShell',
  python: 'Python',
  py: 'Python',
  r: 'R',
  ruby: 'Ruby',
  rb: 'Ruby',
  rust: 'Rust',
  rs: 'Rust',
  scss: 'SCSS',
  shell: 'Shell',
  sh: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  text: 'Text',
  toml: 'TOML',
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  vbnet: 'VB.NET',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML'
};

const COPY_ICON: string =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<rect x="9" y="9" width="12" height="12" rx="2"/>' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface IFenceInfo {
  lang: string;
  filename: string;
  /** Per-fence override of the wrap setting; undefined means "use the default". */
  wrap?: boolean;
  /** Per-fence override of the line number setting. */
  lineNumbers?: boolean;
  /** 1-based source lines to call out, from a `{2,4-6}` on the fence. */
  highlight?: number[];
  /** Where the code is, from a `src="..."` on the fence. */
  src?: string;
}

/**
 * Parses a fence info string:
 *
 *   ```ts                     language only
 *   ```ts title="app.ts"      language plus a filename in the header
 *   ```ts:app.ts              the shorthand some editors use
 *   ```python wrap            soft-wrap this block whatever the web part default
 *   ```python nowrap numbers  and the opposites, per block
 *   ```js {2,4-6}             call out those lines, as Docusaurus and VitePress do
 *   ```ts src="https://..."   fetch the code from there instead of writing a body
 */
export function parseInfo(info: string): IFenceInfo {
  const trimmed: string = (info || '').trim();
  if (!trimmed) {
    return { lang: '', filename: '' };
  }

  const titleMatch: RegExpExecArray | null = /\btitle\s*=\s*"([^"]+)"|\btitle\s*=\s*'([^']+)'/.exec(trimmed);
  const srcMatch: RegExpExecArray | null = /\bsrc\s*=\s*"([^"]+)"|\bsrc\s*=\s*'([^']+)'/.exec(trimmed);
  const first: string = trimmed.split(/\s+/)[0];
  /* A fence that carries only a line spec has no language, and `{2,4-6}` is
     not one. Nor is `title="app.ts"` or `src="https://..."`: a fence may open
     with either of those and no language at all, and taking the first word
     regardless put the whole attribute into the header as a language label.
     The `lang:file` shorthand is off for those too, or the colon in `https://`
     would be read as the one that separates the two. */
  const attribute: boolean = /^\{/.test(first) || /^[a-z-]+\s*=/i.test(first);
  const colonIndex: number = attribute ? -1 : first.indexOf(':');
  const flags: string[] = trimmed
    .split(/\s+/)
    .slice(1)
    .map((flag: string) => flag.toLowerCase());

  const language: string = attribute ? '' : first;
  const parsed: IFenceInfo = {
    lang: (colonIndex > 0 ? language.slice(0, colonIndex) : language).toLowerCase(),
    filename: titleMatch ? titleMatch[1] || titleMatch[2] : colonIndex > 0 ? first.slice(colonIndex + 1) : ''
  };

  if (flags.indexOf('wrap') !== -1) {
    parsed.wrap = true;
  } else if (flags.indexOf('nowrap') !== -1) {
    parsed.wrap = false;
  }

  if (flags.indexOf('numbers') !== -1 || flags.indexOf('linenums') !== -1) {
    parsed.lineNumbers = true;
  } else if (flags.indexOf('nonumbers') !== -1 || flags.indexOf('nolinenums') !== -1) {
    parsed.lineNumbers = false;
  }

  const lines: number[] = parseHighlightedLines(trimmed);
  if (lines.length) {
    parsed.highlight = lines;
  }

  if (srcMatch) {
    parsed.src = srcMatch[1] || srcMatch[2];
    /* A block showing somebody else's file wants to say which file, and the
       address already says it. A `title=` on the fence still wins: an author
       who named it meant that name. */
    if (!parsed.filename) {
      parsed.filename = fileNameOf(parsed.src);
    }
  }

  return parsed;
}

/**
 * The file name at the end of an address, for the header of a block that is
 * showing a file from one.
 *
 * Decoded, because a path with a space in it arrives written `%20` and a
 * header reading `Deploy%20notes.ts` says the encoding rather than the name.
 * An address that decodes to nothing keeps what it had.
 */
function fileNameOf(src: string): string {
  const withoutFragment: string = src.split('#')[0].split('?')[0];
  const last: string = withoutFragment.slice(withoutFragment.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(last) || last;
  } catch {
    return last;
  }
}

/**
 * Reads `{2,4-6}` off a fence into the lines it names.
 *
 * Out of range numbers are kept rather than checked here, because the fence
 * string does not know how long the block is; a line that is not there simply
 * matches nothing when the block is rendered.
 */
export function parseHighlightedLines(info: string): number[] {
  const braces: RegExpExecArray | null = /\{([\d\s,-]+)\}/.exec(info || '');
  if (!braces) {
    return [];
  }

  const lines: number[] = [];
  braces[1].split(',').forEach((part: string) => {
    const range: RegExpMatchArray | null = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const first: number = parseInt(range[1], 10);
      const last: number = parseInt(range[2], 10);
      /* Written either way round, because 6-4 is a slip, not a request for
         nothing. */
      for (let line: number = Math.min(first, last); line <= Math.max(first, last); line += 1) {
        lines.push(line);
      }
      return;
    }
    const single: number = parseInt(part.trim(), 10);
    if (!isNaN(single)) {
      lines.push(single);
    }
  });

  return lines.filter((line: number, index: number) =>
    line > 0 && lines.indexOf(line) === index);
}

export function languageLabel(lang: string): string {
  if (!lang) {
    return 'Text';
  }
  return LANGUAGE_LABELS[lang] || lang.toUpperCase();
}

/**
 * Splits highlighted HTML into one string per source line, reopening any spans
 * that were still open at the line break. Without this, wrapping each line in
 * its own element would tear highlight.js' multi-line spans apart.
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  const pattern: RegExp = /<span[^>]*>|<\/span>|\n/g;
  let buffer: string = '';
  let cursor: number = 0;
  let match: RegExpExecArray | null = pattern.exec(html);

  while (match !== null) {
    buffer += html.slice(cursor, match.index);
    cursor = pattern.lastIndex;

    if (match[0] === '\n') {
      lines.push(buffer + open.map(() => '</span>').join(''));
      buffer = open.join('');
    } else if (match[0] === '</span>') {
      open.pop();
      buffer += match[0];
    } else {
      open.push(match[0]);
      buffer += match[0];
    }

    match = pattern.exec(html);
  }

  buffer += html.slice(cursor);
  lines.push(buffer + open.map(() => '</span>').join(''));

  return lines;
}

function highlightCode(code: string, lang: string, enabled: boolean): { html: string; language: string } {
  if (enabled && lang && hljs.getLanguage(lang)) {
    try {
      return { html: hljs.highlight(code, { language: lang, ignoreIllegals: true }).value, language: lang };
    } catch {
      // An unhighlightable block is still worth showing, just as plain text.
    }
  }
  return { html: escapeHtml(code), language: lang };
}

/**
 * The line elements for a block's code, without the block around them.
 *
 * Split out because a fence with a `src` is rendered twice: once empty while
 * the address is being fetched, and once with what came back. The second pass
 * has the block already on the page and only needs these to put inside it, so
 * this is the half the two share.
 */
export function renderCodeLines(
  code: string,
  lang: string,
  highlight: boolean,
  called: number[]
): string {
  const source: string = code.replace(/\n$/, '');
  const highlighted: { html: string; language: string } = highlightCode(source, lang, highlight);

  // Joined with no separator: each line is a block element, so a newline
  // between them would render as an extra blank line inside the <pre>.
  return splitHighlightedLines(highlighted.html)
    .map((line: string, index: number) => {
      /* Numbered from one, the way a fence names them and a gutter shows them. */
      const marked: boolean = called.indexOf(index + 1) !== -1;
      const className: string = marked
        ? 'strata-code-line strata-code-line--called' : 'strata-code-line';
      return `<span class="${className}"><span class="strata-code-ln" aria-hidden="true"></span>` +
        `<span class="strata-code-line-text">${line}</span></span>`;
    })
    .join('');
}

export function renderCodeBlock(code: string, info: string, options: ICodeBlockOptions): string {
  const parsed: IFenceInfo = parseInfo(info);
  const lineNumbers: boolean = parsed.lineNumbers === undefined ? options.lineNumbers : parsed.lineNumbers;
  const wrap: boolean = parsed.wrap === undefined ? options.wrap : parsed.wrap;
  const called: number[] = parsed.highlight || [];

  /* A `src` is only a source when there is nothing else to show. An author who
     typed a body meant the body, and quietly dropping what they wrote in
     favour of a file somewhere else is the one outcome nobody would choose. */
  const waiting: boolean = !!parsed.src && code.trim().length === 0;
  const lines: string = waiting ? '' : renderCodeLines(code, parsed.lang, options.highlight, called);

  const classes: string[] = ['strata-code'];
  if (waiting) {
    classes.push(CODE_LOADING_CLASS);
  }
  if (options.showHeader) {
    classes.push('strata-code--has-header');
  }
  if (lineNumbers) {
    classes.push('strata-code--numbered');
  }
  if (wrap) {
    classes.push('strata-code--wrap');
  }
  /* Dimming the rest only reads as deliberate when something is called out. */
  if (called.length) {
    classes.push('strata-code--calling');
  }

  const copyButton: string =
    '<div class="strata-code-actions">' +
    '<button type="button" class="strata-code-btn strata-code-copy" aria-label="Copy code to clipboard">' +
    COPY_ICON +
    '<span class="strata-code-btn-label">Copy</span></button></div>';

  const header: string = options.showHeader
    ? '<div class="strata-code-header">' +
      `<span class="strata-code-lang">${escapeHtml(languageLabel(parsed.lang))}</span>` +
      (parsed.filename ? `<span class="strata-code-filename">${escapeHtml(parsed.filename)}</span>` : '') +
      copyButton +
      '</div>'
    : copyButton;

  const codeClass: string = `hljs${parsed.lang ? ` language-${escapeHtml(parsed.lang)}` : ''}`;

  /* The address and the line spec ride on the element rather than in a table
     kept beside it: the block that has to be filled in is the one the reader
     can see, and the DOM is where it is. Read back by remoteCode.ts. */
  const attributes: string = (parsed.lang ? ` data-lang="${escapeHtml(parsed.lang)}"` : '')
    + (waiting ? ` ${CODE_SOURCE_ATTRIBUTE}="${escapeHtml(parsed.src as string)}"` : '')
    + (waiting && called.length ? ` data-strata-code-called="${called.join(',')}"` : '')
    + (waiting && !options.highlight ? ' data-strata-code-plain="true"' : '');

  /* An inline custom property rather than a height: code.css turns it into one
     using the same line height and code font size the block itself is drawn
     with, so the room reserved is the room the lines will take in whichever
     theme is on. */
  const reserve: number = waiting ? reservedLines(parsed.src as string) : 0;
  const note: string = waiting
    ? `<div class="strata-code-note"${reserve ? ` style="--strata-code-reserve:${reserve}"` : ''}>`
      + `${escapeHtml(waitingNote(parsed.src as string))}</div>`
    : '';

  return (
    `<div class="${classes.join(' ')}"${attributes}>` +
    header +
    `<pre class="strata-code-pre"><code class="${codeClass}">${lines}</code></pre>` +
    note +
    '</div>'
  );
}

/**
 * What a block says while its address is still being fetched.
 *
 * It names the host rather than saying "loading", because the interesting part
 * of the wait is which server is being waited on: that is the one that will
 * refuse, and the reader can tell at a glance whether it is one they can reach.
 */
function waitingNote(src: string): string {
  const host: RegExpExecArray | null = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(src);
  return host ? `Loading this code from ${host[1]}` : 'Loading this code';
}
