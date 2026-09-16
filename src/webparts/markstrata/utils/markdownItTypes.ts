/**
 * .SYNOPSIS
 * The slice of markdown-it's internals this web part relies on.
 *
 * .DESCRIPTION
 * markdown-it's published types do not cover plugin authoring in a way that
 * survives the TypeScript version SPFx pins, so the contract is written out
 * here instead of spreading `any` through the plugins. It doubles as the list
 * of things to re-check when markdown-it is upgraded: if one of these members
 * disappears, the compiler says so instead of the renderer failing silently in
 * a browser.
 *
 * .USAGE
 *   import { IMarkdownIt, IStateCore, IToken } from './utils/markdownItTypes';
 *
 *   export function myPlugin(markdownIt: IMarkdownIt): void {
 *     markdownIt.core.ruler.after('block', 'mine', (state: IStateCore) => {
 *       state.tokens.forEach((token: IToken) => token.attrSet('data-mine', 'yes'));
 *     });
 *   }
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

// markdown-it really does hand back null for these, so the types say so.
/* eslint-disable @rushstack/no-new-null */
export interface IToken {
  type: string;
  tag: string;
  content: string;
  markup: string;
  level: number;
  nesting: number;
  children: IToken[] | null;
  map: [number, number] | null;
  /** Plugin payload. Each plugin casts this to its own shape. */
  meta: unknown;
  attrGet(name: string): string | null;
  attrSet(name: string, value: string): void;
  attrJoin(name: string, value: string): void;
}

/* eslint-enable @rushstack/no-new-null */

export type TokenConstructor = new (type: string, tag: string, nesting: number) => IToken;

export type RenderRule = (
  tokens: IToken[],
  index: number,
  options: unknown,
  env: unknown,
  self: IRenderer
) => string;

export interface IRenderer {
  rules: { [tokenType: string]: RenderRule | undefined };
  renderToken(tokens: IToken[], index: number, options: unknown): string;
}

/** Core rules run over the whole token stream after block or inline parsing. */
export interface IStateCore {
  /** The whole document, which is what a token's `map` indexes lines of. */
  src: string;
  tokens: IToken[];
  Token: TokenConstructor;
  md: IMarkdownIt;
}

/** The parts of the block parser state the math and table rules read. */
export interface IStateBlock {
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  /** Leading whitespace on a line, which is where its content starts. */
  sCount: number[];
  line: number;
  isEmpty(line: number): boolean;
  push(type: string, tag: string, nesting: number): IToken;
  getLines(begin: number, end: number, indent: number, keepLastLf: boolean): string;
}

/**
 * One end of a pair of markers, as the inline parser collects them before
 * `balance_pairs` works out which opener goes with which closer.
 *
 * The names are markdown-it's own, spelt the way markdown-it spells them,
 * because these objects are put straight into its lists and read back out.
 */
/* eslint-disable @typescript-eslint/naming-convention */
export interface IDelimiter {
  /** Which run of markers this is one of. Any number will do, as long as one
      rule's markers cannot be paired with another's. */
  marker: number;
  length: number;
  jump?: number;
  /** Index of the text token standing in for the marker. */
  token: number;
  /** Index of the delimiter that closes this one, or -1. */
  end: number;
  open: boolean;
  close: boolean;
}

/** What `scanDelims` reports about a run of markers. */
export interface IScannedDelims {
  can_open: boolean;
  can_close: boolean;
  length: number;
}
/* eslint-enable @typescript-eslint/naming-convention */

/** The parts of the inline parser state the math and marker rules read. */
export interface IStateInline {
  src: string;
  pos: number;
  posMax: number;
  Token: TokenConstructor;
  tokens: IToken[];
  /** Per token, whatever a rule hung on it; markers live here. */
  tokens_meta: ({ delimiters?: IDelimiter[] } | undefined)[];
  delimiters: IDelimiter[];
  scanDelims(start: number, canSplitWord: boolean): IScannedDelims;
  push(type: string, tag: string, nesting: number): IToken;
}

/** A rule of the second inline pass, which pairs markers up. */
export type PostRule = (state: IStateInline) => void;

export type CoreRule = (state: IStateCore) => void;
export type BlockRule = (state: IStateBlock, startLine: number, endLine: number, silent: boolean) => boolean;
export type InlineRule = (state: IStateInline, silent: boolean) => boolean;

export interface IRuler<TRule> {
  /**
   * `options.alt` names the rules this one may interrupt. A block rule that
   * does not list `paragraph` can only start a block, never break into one.
   */
  before(beforeName: string, ruleName: string, rule: TRule, options?: { alt?: string[] }): void;
  after(afterName: string, ruleName: string, rule: TRule, options?: { alt?: string[] }): void;
  push(ruleName: string, rule: TRule): void;
  /** Replaces a rule that is already registered, keeping its place in the chain. */
  at(ruleName: string, rule: TRule, options?: { alt?: string[] }): void;
  /**
   * Undocumented but stable; used to detect whether a plugin is loaded, and to
   * reach the rule a plugin registered so it can be wrapped rather than
   * reimplemented.
   */
  __rules__?: { name: string; fn?: TRule }[];
}

/** One autolink candidate linkify-it found in a run of text. */
export interface ILinkifyMatch {
  /** The scheme it was written with, empty when the text had none. */
  schema: string;
  text: string;
  url: string;
  index: number;
  lastIndex: number;
}

/** The linkify-it instance markdown-it autolinks through. */
export interface ILinkify {
  set(options: { fuzzyLink?: boolean; fuzzyEmail?: boolean; fuzzyIP?: boolean }): ILinkify;
  /** A property rather than a method, because it is wrapped to narrow it. */
  match: (text: string) => ILinkifyMatch[] | undefined;
}

export interface IMarkdownIt {
  core: { ruler: IRuler<CoreRule> };
  block: { ruler: IRuler<BlockRule> };
  inline: { ruler: IRuler<InlineRule>; ruler2: IRuler<PostRule> };
  renderer: IRenderer;
  linkify: ILinkify;
  utils: {
    escapeHtml(value: string): string;
    /** Removed in markdown-it 15; MarkdownProcessor restores it for plugins. */
    assign?: typeof Object.assign;
  };
  use(plugin: unknown, options?: unknown): IMarkdownIt;
  render(source: string, env?: unknown): string;
  renderInline(source: string, env?: unknown): string;
}

export type MarkdownItPlugin = (markdownIt: IMarkdownIt, options?: unknown) => void;
