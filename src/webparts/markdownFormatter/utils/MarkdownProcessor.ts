/**
 * Markdown -> HTML pipeline.
 *
 * Deliberately free of SharePoint imports so it can be unit tested and used by
 * the static theme preview under /demo.
 */

import { calloutPlugin } from './markdownItCallouts';
import { renderCodeBlock, ICodeBlockOptions, escapeHtml } from './codeBlocks';

const MarkdownIt = require('markdown-it');
const markdownItAttrs = require('markdown-it-attrs');
const markdownItFootnote = require('markdown-it-footnote');
const markdownItEmoji = require('markdown-it-emoji');
const markdownItAbbr = require('markdown-it-abbr');
const markdownItDeflist = require('markdown-it-deflist');
const markdownItSub = require('markdown-it-sub');
const markdownItSup = require('markdown-it-sup');
const markdownItAnchor = require('markdown-it-anchor');
const markdownItTOC = require('markdown-it-table-of-contents');
const markdownItTaskLists = require('markdown-it-task-lists');
const markdownItMultimdTable = require('markdown-it-multimd-table');
const katex = require('katex');

export interface IMarkdownProcessorOptions {
  enableSyntaxHighlighting: boolean;
  enableMath: boolean;
  enableMermaid: boolean;
  enableToc: boolean;
  enableAnchors: boolean;
  showCodeHeader: boolean;
  showLineNumbers: boolean;
  wrapCodeLines: boolean;
  allowHtml: boolean;
}

export const DEFAULT_PROCESSOR_OPTIONS: IMarkdownProcessorOptions = {
  enableSyntaxHighlighting: true,
  enableMath: true,
  enableMermaid: true,
  enableToc: true,
  enableAnchors: true,
  showCodeHeader: true,
  showLineNumbers: false,
  wrapCodeLines: false,
  allowHtml: false
};

/** Loads a plugin whether it is a CommonJS or ES default export. */
function resolvePlugin(plugin: any): any {
  return plugin && plugin.default ? plugin.default : plugin;
}

export class MarkdownProcessor {
  private md: any;
  private options: IMarkdownProcessorOptions;
  private mermaidCounter: number = 0;

  constructor(options?: Partial<IMarkdownProcessorOptions>) {
    this.options = { ...DEFAULT_PROCESSOR_OPTIONS, ...(options || {}) };
    this.build();
  }

  public updateOptions(options: Partial<IMarkdownProcessorOptions>): void {
    this.options = { ...this.options, ...options };
    this.build();
  }

  public render(markdown: string): string {
    try {
      return this.unwrapToc(this.md.render(markdown || ''));
    } catch (error) {
      const message: string = (error as Error).message || 'Unknown error';
      return `<div class="mdf-error">Could not render this markdown: ${escapeHtml(message)}</div>`;
    }
  }

  /**
   * markdown-it-table-of-contents is an inline rule, so `[[toc]]` on its own
   * line comes back wrapped in a paragraph. Browsers then close that paragraph
   * before the container div and leave an empty one behind.
   */
  private unwrapToc(html: string): string {
    return html.replace(/<p>\s*(<div class="mdf-toc">[\s\S]*?<\/div>)\s*<\/p>/g, '$1');
  }

  // ----------------------------------------------------------------- build

  private build(): void {
    this.md = new MarkdownIt({
      html: this.options.allowHtml,
      linkify: true,
      typographer: true,
      breaks: false
    });

    this.addPlugins();
    this.addCodeBlocks();
    this.addTableWrapper();

    if (this.options.enableMath) {
      this.addMath();
    }
    if (this.options.enableMermaid) {
      this.addMermaid();
    }

    // Callouts must be registered after markdown-it-attrs so the Wiki.js
    // `{.is-info}` classes have already landed on the blockquote token.
    this.md.use(calloutPlugin);
  }

  private addPlugins(): void {
    const use = (plugin: any, opts?: any): void => {
      try {
        this.md.use(resolvePlugin(plugin), opts);
      } catch (error) {
        console.warn('[MarkdownFormatter] plugin failed to load', error);
      }
    };

    use(markdownItAttrs, { leftDelimiter: '{', rightDelimiter: '}', allowedAttributes: ['id', 'class'] });
    use(markdownItFootnote);
    use(markdownItEmoji);
    use(markdownItAbbr);
    use(markdownItDeflist);
    use(markdownItSub);
    use(markdownItSup);
    use(markdownItTaskLists, { enabled: true, label: true, labelAfter: false });
    use(markdownItMultimdTable, {
      multiline: true,
      rowspan: true,
      headerless: false,
      // multibody merges two tables separated by a blank line into one table
      // with several bodies, which silently swallows a second table on the
      // page. Rowspan and multiline still work without it.
      multibody: false,
      autolabel: true
    });

    if (this.options.enableAnchors || this.options.enableToc) {
      const anchor: any = resolvePlugin(markdownItAnchor);
      const permalink: any =
        this.options.enableAnchors && anchor.permalink && anchor.permalink.linkInsideHeader
          ? anchor.permalink.linkInsideHeader({
              symbol: '#',
              placement: 'before',
              class: 'mdf-anchor',
              ariaHidden: true,
              // No separator text token, otherwise the space leaks into the
              // table of contents entry for the heading.
              space: false
            })
          : undefined;
      use(anchor, { level: [1, 2, 3, 4], permalink: permalink, tabIndex: false });
    }

    if (this.options.enableToc) {
      use(markdownItTOC, {
        includeLevel: [2, 3],
        containerClass: 'mdf-toc',
        listType: 'ul'
      });
    }
  }

  private addCodeBlocks(): void {
    const codeOptions = (): ICodeBlockOptions => ({
      highlight: this.options.enableSyntaxHighlighting,
      showHeader: this.options.showCodeHeader,
      lineNumbers: this.options.showLineNumbers,
      wrap: this.options.wrapCodeLines
    });

    this.md.renderer.rules.fence = (tokens: any[], idx: number): string => {
      const token: any = tokens[idx];
      return renderCodeBlock(token.content, token.info, codeOptions());
    };

    // Indented code blocks get the same treatment, just without a language.
    this.md.renderer.rules.code_block = (tokens: any[], idx: number): string =>
      renderCodeBlock(tokens[idx].content, '', codeOptions());
  }

  /** Wide tables scroll inside their own box instead of stretching the page. */
  private addTableWrapper(): void {
    const defaultOpen: any =
      this.md.renderer.rules.table_open ||
      ((tokens: any[], idx: number, options: any, env: any, self: any) => self.renderToken(tokens, idx, options));
    const defaultClose: any =
      this.md.renderer.rules.table_close ||
      ((tokens: any[], idx: number, options: any, env: any, self: any) => self.renderToken(tokens, idx, options));

    this.md.renderer.rules.table_open = (tokens: any[], idx: number, options: any, env: any, self: any): string =>
      '<div class="mdf-table-scroll">' + defaultOpen(tokens, idx, options, env, self);

    this.md.renderer.rules.table_close = (tokens: any[], idx: number, options: any, env: any, self: any): string =>
      defaultClose(tokens, idx, options, env, self) + '</div>';
  }

  // ------------------------------------------------------------------ math

  private addMath(): void {
    // Inline: $...$ with guards so prices ("$5 and $10") are not swallowed.
    this.md.inline.ruler.before('escape', 'mdf_math_inline', (state: any, silent: boolean): boolean => {
      const start: number = state.pos;
      if (state.src.charCodeAt(start) !== 0x24 /* $ */) {
        return false;
      }
      if (start > 0 && state.src[start - 1] === '\\') {
        return false;
      }

      let end: number = start + 1;
      while (end < state.posMax) {
        if (state.src[end] === '$' && state.src[end - 1] !== '\\') {
          break;
        }
        if (state.src[end] === '\n') {
          return false;
        }
        end++;
      }

      if (end >= state.posMax) {
        return false;
      }

      const content: string = state.src.slice(start + 1, end);
      if (!content || /^\s|\s$/.test(content)) {
        return false;
      }

      if (!silent) {
        const token: any = state.push('mdf_math_inline', 'math', 0);
        token.content = content;
        token.markup = '$';
      }

      state.pos = end + 1;
      return true;
    });

    // Block: $$ ... $$
    this.md.block.ruler.before(
      'fence',
      'mdf_math_block',
      (state: any, startLine: number, endLine: number, silent: boolean): boolean => {
        const startPos: number = state.bMarks[startLine] + state.tShift[startLine];
        const startMax: number = state.eMarks[startLine];
        if (startPos + 2 > startMax || state.src.slice(startPos, startPos + 2) !== '$$') {
          return false;
        }

        const firstLine: string = state.src.slice(startPos + 2, startMax);
        let lastLine: string = '';
        let nextLine: number = startLine;
        let closed: boolean = false;

        if (firstLine.trim().slice(-2) === '$$') {
          closed = true;
          lastLine = '';
        }

        while (!closed && nextLine + 1 < endLine) {
          nextLine++;
          const pos: number = state.bMarks[nextLine] + state.tShift[nextLine];
          const max: number = state.eMarks[nextLine];
          const line: string = state.src.slice(pos, max);
          if (line.trim().slice(-2) === '$$') {
            lastLine = line.trim().slice(0, -2);
            closed = true;
          }
        }

        if (!closed) {
          return false;
        }

        if (!silent) {
          const body: string =
            firstLine.trim().slice(-2) === '$$'
              ? firstLine.trim().slice(0, -2)
              : firstLine + '\n' + state.getLines(startLine + 1, nextLine, 0, false) + lastLine;
          const token: any = state.push('mdf_math_block', 'math', 0);
          token.content = body.trim();
          token.markup = '$$';
          token.map = [startLine, nextLine + 1];
        }

        state.line = nextLine + 1;
        return true;
      }
    );

    this.md.renderer.rules.mdf_math_inline = (tokens: any[], idx: number): string => {
      try {
        return katex.renderToString(tokens[idx].content, { throwOnError: false, output: 'html' });
      } catch (error) {
        return `<span class="mdf-math-error-inline">${escapeHtml(tokens[idx].content)}</span>`;
      }
    };

    this.md.renderer.rules.mdf_math_block = (tokens: any[], idx: number): string => {
      try {
        const html: string = katex.renderToString(tokens[idx].content, {
          throwOnError: false,
          displayMode: true,
          output: 'html'
        });
        return `<div class="mdf-math-block">${html}</div>`;
      } catch (error) {
        return `<div class="mdf-math-error">${escapeHtml(tokens[idx].content)}</div>`;
      }
    };
  }

  // --------------------------------------------------------------- mermaid

  private addMermaid(): void {
    const defaultFence: any = this.md.renderer.rules.fence;

    this.md.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any): string => {
      const token: any = tokens[idx];
      if ((token.info || '').trim().toLowerCase() === 'mermaid') {
        this.mermaidCounter += 1;
        const id: string = `mdf-mermaid-${Date.now().toString(36)}-${this.mermaidCounter}`;
        return (
          `<div class="mdf-mermaid" data-mermaid-container="true">` +
          `<pre class="mermaid" id="${id}">${escapeHtml(token.content)}</pre></div>`
        );
      }
      return defaultFence(tokens, idx, options, env, self);
    };
  }
}
