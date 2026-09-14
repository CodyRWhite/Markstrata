/**
 * Fenced code block rendering.
 *
 * Produces the markup code.css styles: an optional header carrying the
 * language label, an optional filename, a copy button, and one block element
 * per source line so line numbers can be CSS counters in a sticky gutter.
 *
 * Highlighting runs through highlight.js but none of its stylesheets are
 * imported - the token classes are coloured by syntax.css from theme
 * variables, which is what lets one rendered block follow the selected theme.
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
 */
export function parseInfo(info: string): IFenceInfo {
  const trimmed: string = (info || '').trim();
  if (!trimmed) {
    return { lang: '', filename: '' };
  }

  const titleMatch: RegExpExecArray | null = /\btitle\s*=\s*"([^"]+)"|\btitle\s*=\s*'([^']+)'/.exec(trimmed);
  const first: string = trimmed.split(/\s+/)[0];
  const colonIndex: number = first.indexOf(':');
  const flags: string[] = trimmed
    .split(/\s+/)
    .slice(1)
    .map((flag: string) => flag.toLowerCase());

  /* A fence that carries only a line spec has no language, and `{2,4-6}` is
     not one. */
  const language: string = /^\{/.test(first) ? '' : first;
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

  return parsed;
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
      const from: number = parseInt(range[1], 10);
      const to: number = parseInt(range[2], 10);
      /* Written either way round, because 6-4 is a slip, not a request for
         nothing. */
      for (let n: number = Math.min(from, to); n <= Math.max(from, to); n += 1) {
        lines.push(n);
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

export function renderCodeBlock(code: string, info: string, options: ICodeBlockOptions): string {
  const parsed: IFenceInfo = parseInfo(info);
  const lineNumbers: boolean = parsed.lineNumbers === undefined ? options.lineNumbers : parsed.lineNumbers;
  const wrap: boolean = parsed.wrap === undefined ? options.wrap : parsed.wrap;
  const source: string = code.replace(/\n$/, '');
  const highlighted: { html: string; language: string } = highlightCode(source, parsed.lang, options.highlight);

  // Joined with no separator: each line is a block element, so a newline
  // between them would render as an extra blank line inside the <pre>.
  const called: number[] = parsed.highlight || [];
  const lines: string = splitHighlightedLines(highlighted.html)
    .map((line: string, index: number) => {
      /* Numbered from one, the way a fence names them and a gutter shows them. */
      const marked: boolean = called.indexOf(index + 1) !== -1;
      const cls: string = marked ? 'strata-code-line strata-code-line--called' : 'strata-code-line';
      return `<span class="${cls}"><span class="strata-code-ln" aria-hidden="true"></span>` +
        `<span class="strata-code-line-text">${line}</span></span>`;
    })
    .join('');

  const classes: string[] = ['strata-code'];
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

  return (
    `<div class="${classes.join(' ')}"${parsed.lang ? ` data-lang="${escapeHtml(parsed.lang)}"` : ''}>` +
    header +
    `<pre class="strata-code-pre"><code class="${codeClass}">${lines}</code></pre>` +
    '</div>'
  );
}
