/**
 * .SYNOPSIS
 * Markdown -> HTML pipeline.
 *
 * .DESCRIPTION
 * Deliberately free of SharePoint imports so it can be unit tested and used by
 * the static theme preview under /demo.
 *
 * .USAGE
 *   import { MarkdownProcessor } from './utils/MarkdownProcessor';
 *
 *   const processor: MarkdownProcessor = new MarkdownProcessor({ enableMermaid: true });
 *   const html: string = processor.render('# Hello');
 *
 *   // Rebuilt only when an option actually changes:
 *   processor.updateOptions({ imageBasePath: '/sites/team/Shared Documents' });
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  markdownItCallouts.ts, markdownItTaskLists.ts, codeBlocks.ts,
 *            imagePaths.ts, frontMatter.ts, markdownItWikiLinks.ts,
 *            markdownItTableCaptions.ts, markdownItAttributeGuard.ts,
 *            markdownItTypes.ts
 */

import { calloutPlugin } from './markdownItCallouts';
import { taskListPlugin } from './markdownItTaskLists';
import { renderCodeBlock, ICodeBlockOptions, escapeHtml } from './codeBlocks';
import { resolveAgainst } from './imagePaths';
import { splitFrontMatter, ISplitDocument } from './frontMatter';
import { wikiLinkPlugin } from './markdownItWikiLinks';
import { tableCaptionPlugin } from './markdownItTableCaptions';
import { attributeGuardPlugin } from './markdownItAttributeGuard';
import {
  IMarkdownIt,
  IRenderer,
  IStateBlock,
  IStateInline,
  IToken,
  RenderRule
} from './markdownItTypes';

import MarkdownIt from 'markdown-it';
import markdownItAttrs from 'markdown-it-attrs';
import markdownItFootnote from 'markdown-it-footnote';
import * as markdownItEmoji from 'markdown-it-emoji';
import markdownItAbbr from 'markdown-it-abbr';
import markdownItDeflist from 'markdown-it-deflist';
import markdownItSub from 'markdown-it-sub';
import markdownItSup from 'markdown-it-sup';
import markdownItMark from 'markdown-it-mark';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItTOC from 'markdown-it-table-of-contents';
import markdownItMultimdTable from 'markdown-it-multimd-table';
import * as katex from 'katex';

export interface IMarkdownProcessorOptions {
  enableSyntaxHighlighting: boolean;
  enableMath: boolean;
  enableMermaid: boolean;
  enableToc: boolean;
  enableAnchors: boolean;
  enableWikiLinks: boolean;
  showCodeHeader: boolean;
  showLineNumbers: boolean;
  wrapCodeLines: boolean;
  allowHtml: boolean;
  /**
   * The folder the markdown came from, as a server-relative path. Relative
   * image sources are resolved against it: a file in a document library that
   * says `![d](images/flow.png)` means a sibling folder of itself, but a
   * browser resolves that against the page's URL instead, so without this
   * every relative image on a SharePoint page is a 404.
   *
   * A plain string rather than anything SharePoint-shaped, so this file keeps
   * no SharePoint imports and stays testable in plain Node.
   */
  imageBasePath?: string;
}

export const DEFAULT_PROCESSOR_OPTIONS: IMarkdownProcessorOptions = {
  enableSyntaxHighlighting: true,
  enableMath: true,
  enableMermaid: true,
  enableToc: true,
  enableAnchors: true,
  enableWikiLinks: false,
  showCodeHeader: true,
  showLineNumbers: false,
  wrapCodeLines: false,
  allowHtml: false,
  imageBasePath: undefined
};

/** Loads a plugin whether it is a CommonJS or ES default export. */
function resolvePlugin(plugin: unknown): unknown {
  const candidate: { default?: unknown } = plugin as { default?: unknown };
  return candidate && candidate.default ? candidate.default : plugin;
}

export class MarkdownProcessor {
  private markdownIt: IMarkdownIt;
  private options: IMarkdownProcessorOptions;
  private mermaidCounter: number = 0;

  constructor(options?: Partial<IMarkdownProcessorOptions>) {
    this.options = { ...DEFAULT_PROCESSOR_OPTIONS, ...(options || {}) };
    this.build();
  }

  /**
   * Applies new options, rebuilding markdown-it only when one actually
   * changed. Callers pass the whole option set on every content load, and
   * rebuilding means re-registering every plugin and render rule.
   */
  public updateOptions(options: Partial<IMarkdownProcessorOptions>): void {
    const merged: IMarkdownProcessorOptions = { ...this.options, ...options };
    const keys = Object.keys(merged) as (keyof IMarkdownProcessorOptions)[];
    if (keys.every((key) => merged[key] === this.options[key])) {
      return;
    }
    this.options = merged;
    this.build();
  }

  public render(markdown: string): string {
    try {
      /* Frontmatter is metadata for whatever built the file, not part of the
         document. Left in, it renders as a rule and a heading of its own keys.
         What it held is read back separately, by whoever wants the footer. */
      const document: ISplitDocument = splitFrontMatter(markdown || '');
      return this.unwrapToc(this.markdownIt.render(document.body));
    } catch (error) {
      const message: string = (error as Error).message || 'Unknown error';
      return `<div class="strata-error">Could not render this markdown: ${escapeHtml(message)}</div>`;
    }
  }

  /**
   * markdown-it-table-of-contents is an inline rule, so `[[toc]]` on its own
   * line comes back wrapped in a paragraph. Browsers then close that paragraph
   * before the container div and leave an empty one behind.
   */
  private unwrapToc(html: string): string {
    return html.replace(/<p>\s*(<div class="strata-toc">[\s\S]*?<\/div>)\s*<\/p>/g, '$1');
  }

  // ----------------------------------------------------------------- build

  private build(): void {
    this.markdownIt = (new MarkdownIt({
      html: this.options.allowHtml,
      linkify: true,
      typographer: true,
      breaks: false
    }) as unknown) as IMarkdownIt;

    this.addPlugins();
    this.addCodeBlocks();
    this.addTableWrapper();
    this.addImages();

    if (this.options.enableMath) {
      this.addMath();
    }
    if (this.options.enableMermaid) {
      this.addMermaid();
    }

    // Callouts must be registered after markdown-it-attrs so the Wiki.js
    // `{.is-info}` classes have already landed on the blockquote token.
    this.markdownIt.use(calloutPlugin);
    this.markdownIt.use(taskListPlugin);

    if (this.options.enableWikiLinks) {
      /* Given the same resolver as images, so a link and a picture beside it
         agree about which folder this document is in. */
      this.markdownIt.use(wikiLinkPlugin, {
        resolve: (path: string): string | undefined =>
          this.options.imageBasePath ? resolveAgainst(this.options.imageBasePath, path) : undefined
      });
    }
  }

  private addPlugins(): void {
    // markdown-it 15 removed `utils.assign`, which markdown-it-multimd-table
    // still calls. It only ever delegated to Object.assign.
    if (!this.markdownIt.utils.assign) {
      this.markdownIt.utils.assign = Object.assign;
    }

    // A plugin that throws must not take the whole render with it, but it must
    // also not fail quietly - a missing plugin is a missing feature.
    const register = (name: string, plugin: unknown, options?: unknown): void => {
      try {
        this.markdownIt.use(resolvePlugin(plugin), options);
      } catch (error) {
        console.error(`[Markstrata] the ${name} plugin did not load; that feature is off.`, error);
      }
    };

    register('attributes', markdownItAttrs, { leftDelimiter: '{', rightDelimiter: '}', allowedAttributes: ['id', 'class'] });
    /* Straight after, so the plugin above is only ever shown a brace group it
       can really use. Left to itself it takes any trailing `{...}`, keeps
       nothing out of it, and deletes the text it was holding. */
    register('attribute guard', attributeGuardPlugin);

    /*
     * A fence's line spec has to be taken before markdown-it-attrs runs.
     * Attributes use the same braces, so `{2,4-6}` was read as an attribute
     * list, found to hold nothing it allows, and removed from the info string
     * before the fence renderer ever saw it.
     *
     * Registered against that rule by name rather than pushed, because pushing
     * appends to the end of the chain while attrs inserts itself near the
     * front: the order has to be said, not assumed.
     */
    this.claimFenceLineSpecs();
    register('footnotes', markdownItFootnote);
    // markdown-it-emoji 3 exports `full`, `light` and `bare` rather than a
    // single default plugin.
    register('emoji', markdownItEmoji.full || markdownItEmoji);
    register('abbreviations', markdownItAbbr);
    register('definition lists', markdownItDeflist);
    register('subscript', markdownItSub);
    register('superscript', markdownItSup);
    // ==highlight==, which Obsidian users write a lot of.
    register('highlight', markdownItMark);
    register('tables', markdownItMultimdTable, {
      multiline: true,
      rowspan: true,
      headerless: false,
      // multibody merges two tables separated by a blank line into one table
      // with several bodies, which silently swallows a second table on the
      // page. Rowspan and multiline still work without it.
      multibody: false,
      autolabel: true
    });
    /* Straight after, because it wraps the block rule that plugin just
       registered and narrows its caption test so a row of cells written in
       brackets stays a row. */
    register('table captions', tableCaptionPlugin);

    if (this.options.enableAnchors || this.options.enableToc) {
      const anchor: typeof markdownItAnchor = resolvePlugin(markdownItAnchor) as typeof markdownItAnchor;
      const permalink: unknown =
        this.options.enableAnchors && anchor.permalink && anchor.permalink.linkInsideHeader
          ? anchor.permalink.linkInsideHeader({
              symbol: '#',
              placement: 'before',
              class: 'strata-anchor',
              ariaHidden: true,
              // No separator text token, otherwise the space leaks into the
              // table of contents entry for the heading.
              space: false
            })
          : undefined;
      register('heading anchors', anchor, { level: [1, 2, 3, 4], permalink: permalink, tabIndex: false });
    }

    if (this.options.enableToc) {
      register('table of contents', markdownItTOC, {
        includeLevel: [2, 3],
        containerClass: 'strata-toc',
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

    this.markdownIt.renderer.rules.fence = (tokens: IToken[], index: number): string => {
      const token: IToken = tokens[index];
      return renderCodeBlock(token.content,
        this.fenceInfo(token) + this.fenceLines(token), codeOptions());
    };

    // Indented code blocks get the same treatment, just without a language.
    this.markdownIt.renderer.rules.code_block = (tokens: IToken[], index: number): string =>
      renderCodeBlock(tokens[index].content, '', codeOptions());
  }

  /*
   * Moves `{2,4-6}` off a fence's info string and onto the token, before
   * anything else can claim the braces. The spec is kept rather than parsed
   * here so codeBlocks stays the one place that understands a fence.
   */
  private claimFenceLineSpecs(): void {
    const claim = (state: { tokens: IToken[] }): void => {
      state.tokens.forEach((token: IToken) => {
        if (token.type !== 'fence') {
          return;
        }
        const info: string = this.fenceInfo(token);
        const braces: RegExpExecArray | null = /\{[\d\s,-]+\}/.exec(info);
        if (!braces) {
          return;
        }
        /* The token's own type says nothing about info or meta, which is
           where the claim has to be written. */
        const writable: { info?: string; meta?: { [key: string]: unknown } } =
          (token as unknown) as { info?: string; meta?: { [key: string]: unknown } };
        writable.meta = { ...(writable.meta || {}), strataLines: braces[0] };
        writable.info = info.replace(braces[0], '').replace(/\s+/g, ' ').trim();
      });
    };

    /* Before attrs where it loaded, and before linkify otherwise, which is
       where attrs would have put itself. */
    try {
      this.markdownIt.core.ruler.before('curly_attributes', 'strata_fence_lines', claim);
    } catch {
      this.markdownIt.core.ruler.before('linkify', 'strata_fence_lines', claim);
    }
  }

  /** The line spec claimed above, put back for the fence renderer. */
  private fenceLines(token: IToken): string {
    const meta: { strataLines?: string } | undefined =
      ((token as unknown) as { meta?: { strataLines?: string } }).meta;
    return meta && meta.strataLines ? ` ${meta.strataLines}` : '';
  }

  /** The token's info string; markdown-it keeps it outside the typed surface. */
  private fenceInfo(token: IToken): string {
    return ((token as unknown) as { info?: string }).info || '';
  }

  /**
   * Resolves relative image sources, and asks the browser to be lazy about
   * fetching them.
   */
  private addImages(): void {
    const previous: RenderRule | undefined = this.markdownIt.renderer.rules.image;
    const base: string | undefined = this.options.imageBasePath;

    this.markdownIt.renderer.rules.image = (
      tokens: IToken[],
      index: number,
      options: unknown,
      environment: unknown,
      self: IRenderer
    ): string => {
      const token: IToken = tokens[index];
      const source: string | null = token.attrGet ? token.attrGet('src') : null;

      this.sizeImage(token);

      if (source && base) {
        const resolved: string | undefined = resolveAgainst(base, source);
        if (resolved !== undefined && token.attrSet) {
          token.attrSet('src', resolved);
        }
      }

      // A long document should not fetch every image before the reader has
      // scrolled to it.
      if (token.attrSet) {
        token.attrSet('loading', 'lazy');
        token.attrSet('decoding', 'async');
      }

      return previous
        ? previous(tokens, index, options, environment, self)
        : self.renderToken(tokens, index, options);
    };
  }

  /*
   * Obsidian writes an image's width after a pipe in the alt text, either
   * `![alt|300]` or `![alt|300x200]`, and enough documents come from Obsidian
   * that the syntax arrives whether or not it is supported. Unsupported, it
   * did not merely fail to resize: the digits stayed in the alt text, so a
   * screen reader read "diagram 300" aloud.
   *
   * The width is set as an attribute rather than as a style, because an
   * attribute gives the image an intrinsic size. Every image here is lazily
   * loaded, and a lazily loaded image with no intrinsic size reserves no room:
   * the text below it jumps as each one arrives, which moves the paragraph
   * being read and unsettles the contents tracking.
   *
   * Height is left off unless the document asks for one, so the stylesheet's
   * `height: auto` keeps the aspect ratio. Asking for both is taken at face
   * value: a document that gives two numbers has said what it wants.
   */
  private sizeImage(token: IToken): void {
    if (!token.attrGet || !token.attrSet) {
      return;
    }

    const altText: string = this.altText(token);
    const match: RegExpMatchArray | null = altText.match(/^([\s\S]*?)\s*\|\s*(\d+)(?:\s*[x\u00d7]\s*(\d+))?\s*$/);
    if (!match) {
      return;
    }

    this.setAltText(token, match[1]);
    token.attrSet('width', match[2]);
    if (match[3]) {
      token.attrSet('height', match[3]);
    }
  }

  /*
   * An image's alt text is the rendered content of its child tokens, not an
   * attribute, so it is read and written through them.
   */
  private altText(token: IToken): string {
    const children: IToken[] | undefined = token.children as IToken[] | undefined;
    if (!children || !children.length) {
      return (token.content as string) || '';
    }
    return children.map((child: IToken) => (child.content as string) || '').join('');
  }

  private setAltText(token: IToken, text: string): void {
    const children: IToken[] | undefined = token.children as IToken[] | undefined;
    token.content = text;
    if (children && children.length) {
      children.forEach((child: IToken, index: number) => {
        child.content = index === 0 ? text : '';
      });
    }
  }

  /** Wide tables scroll inside their own box instead of stretching the page. */
  private addTableWrapper(): void {
    const renderDefault = (rule: RenderRule | undefined): RenderRule =>
      rule ||
      ((tokens: IToken[], index: number, options: unknown, environment: unknown, self: IRenderer) =>
        self.renderToken(tokens, index, options));

    const defaultOpen: RenderRule = renderDefault(this.markdownIt.renderer.rules.table_open);
    const defaultClose: RenderRule = renderDefault(this.markdownIt.renderer.rules.table_close);

    this.markdownIt.renderer.rules.table_open = (
      tokens: IToken[],
      index: number,
      options: unknown,
      environment: unknown,
      self: IRenderer
    ): string => '<div class="strata-table-scroll">' + defaultOpen(tokens, index, options, environment, self);

    this.markdownIt.renderer.rules.table_close = (
      tokens: IToken[],
      index: number,
      options: unknown,
      environment: unknown,
      self: IRenderer
    ): string => defaultClose(tokens, index, options, environment, self) + '</div>';
  }

  // ------------------------------------------------------------------ math

  private addMath(): void {
    // Inline: $...$ with guards so prices ("$5 and $10") are not swallowed.
    this.markdownIt.inline.ruler.before('escape', 'mdf_math_inline', (state: IStateInline, silent: boolean): boolean => {
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
        const token: IToken = state.push('mdf_math_inline', 'math', 0);
        token.content = content;
        token.markup = '$';
      }

      state.pos = end + 1;
      return true;
    });

    // Block: $$ ... $$
    this.markdownIt.block.ruler.before(
      'fence',
      'mdf_math_block',
      (state: IStateBlock, startLine: number, endLine: number, silent: boolean): boolean => {
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
          const lineStart: number = state.bMarks[nextLine] + state.tShift[nextLine];
          const lineEnd: number = state.eMarks[nextLine];
          const line: string = state.src.slice(lineStart, lineEnd);
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
          const token: IToken = state.push('mdf_math_block', 'math', 0);
          token.content = body.trim();
          token.markup = '$$';
          token.map = [startLine, nextLine + 1];
        }

        state.line = nextLine + 1;
        return true;
      }
    );

    this.markdownIt.renderer.rules.mdf_math_inline = (tokens: IToken[], index: number): string => {
      try {
        return katex.renderToString(tokens[index].content, { throwOnError: false, output: 'html' });
      } catch {
        return `<span class="strata-math-error-inline">${escapeHtml(tokens[index].content)}</span>`;
      }
    };

    this.markdownIt.renderer.rules.mdf_math_block = (tokens: IToken[], index: number): string => {
      try {
        const html: string = katex.renderToString(tokens[index].content, {
          throwOnError: false,
          displayMode: true,
          output: 'html'
        });
        return `<div class="strata-math-block">${html}</div>`;
      } catch {
        return `<div class="strata-math-error">${escapeHtml(tokens[index].content)}</div>`;
      }
    };
  }

  // --------------------------------------------------------------- mermaid

  private addMermaid(): void {
    const defaultFence: RenderRule = this.markdownIt.renderer.rules.fence as RenderRule;

    this.markdownIt.renderer.rules.fence = (
      tokens: IToken[],
      index: number,
      options: unknown,
      environment: unknown,
      self: IRenderer
    ): string => {
      const token: IToken = tokens[index];
      if (this.fenceInfo(token).trim().toLowerCase() === 'mermaid') {
        this.mermaidCounter += 1;
        const id: string = `strata-mermaid-${Date.now().toString(36)}-${this.mermaidCounter}`;
        return (
          `<div class="strata-mermaid" data-mermaid-container="true">` +
          `<pre class="mermaid" id="${id}">${escapeHtml(token.content)}</pre></div>`
        );
      }
      return defaultFence(tokens, index, options, environment, self);
    };
  }
}
