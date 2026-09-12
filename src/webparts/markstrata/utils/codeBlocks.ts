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
}

/**
 * Parses a fence info string:
 *
 *   ```ts                     language only
 *   ```ts title="app.ts"      language plus a filename in the header
 *   ```ts:app.ts              the shorthand some editors use
 *   ```python wrap            soft-wrap this block whatever the web part default
 *   ```python nowrap numbers  and the opposites, per block
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

  const parsed: IFenceInfo = {
    lang: (colonIndex > 0 ? first.slice(0, colonIndex) : first).toLowerCase(),
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

  return parsed;
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
  const lines: string = splitHighlightedLines(highlighted.html)
    .map(
      (line: string) =>
        `<span class="ink-code-line"><span class="ink-code-ln" aria-hidden="true"></span>` +
        `<span class="ink-code-line-text">${line}</span></span>`
    )
    .join('');

  const classes: string[] = ['ink-code'];
  if (options.showHeader) {
    classes.push('ink-code--has-header');
  }
  if (lineNumbers) {
    classes.push('ink-code--numbered');
  }
  if (wrap) {
    classes.push('ink-code--wrap');
  }

  const copyButton: string =
    '<div class="ink-code-actions">' +
    '<button type="button" class="ink-code-btn ink-code-copy" aria-label="Copy code to clipboard">' +
    COPY_ICON +
    '<span class="ink-code-btn-label">Copy</span></button></div>';

  const header: string = options.showHeader
    ? '<div class="ink-code-header">' +
      `<span class="ink-code-lang">${escapeHtml(languageLabel(parsed.lang))}</span>` +
      (parsed.filename ? `<span class="ink-code-filename">${escapeHtml(parsed.filename)}</span>` : '') +
      copyButton +
      '</div>'
    : copyButton;

  const codeClass: string = `hljs${parsed.lang ? ` language-${escapeHtml(parsed.lang)}` : ''}`;

  return (
    `<div class="${classes.join(' ')}"${parsed.lang ? ` data-lang="${escapeHtml(parsed.lang)}"` : ''}>` +
    header +
    `<pre class="ink-code-pre"><code class="${codeClass}">${lines}</code></pre>` +
    '</div>'
  );
}
