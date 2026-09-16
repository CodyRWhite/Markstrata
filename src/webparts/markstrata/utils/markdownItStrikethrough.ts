/**
 * .SYNOPSIS
 * markdown-it plugin: single tilde strikethrough, `~struck~`.
 *
 * .DESCRIPTION
 * GitHub Flavoured Markdown defines a run of one or two tildes as
 * strikethrough, and GitHub renders `~deprecated~` struck through. markdown-it
 * implements only the doubled form: its rule wants at least two tildes and
 * hands a single one back as text.
 *
 * What made that worse here than a missing feature is what used to fill the
 * gap. `markdown-it-sub` read `~2~` as a subscript, which is Pandoc's reading
 * and nobody else's, so a document written in GitHub, Obsidian or VS Code that
 * said `~deprecated~` rendered here as a tiny subscript. No error, no warning,
 * and a word saying the opposite of what it meant. The collision only runs one
 * way - nobody writes `H~2~O` meaning struck through - so it is settled in
 * GitHub's favour, and subscript keeps the two routes that work everywhere:
 * `$H_2O$` with maths on, and `<sub>2</sub>` with HTML allowed.
 *
 * Shaped after markdown-it-mark, which adds `==highlight==` the same way:
 * push the marker as a text token and a delimiter in the first inline pass,
 * then, once markdown-it has paired the delimiters up, turn the two text
 * tokens into the tags. The tags are markdown-it's own `s_open` and `s_close`,
 * so a themed `<s>` needs no new styling and `~~this~~` and `~this~` cannot
 * look different from one another.
 *
 * The delimiters carry a marker of their own rather than the tilde's character
 * code, so that markdown-it's own strikethrough - which is still what handles
 * `~~` - cannot pair one of its markers with one of these and produce a tag
 * from half of each.
 *
 * .USAGE
 *   import { strikethroughPlugin } from './utils/markdownItStrikethrough';
 *
 *   markdownIt.use(strikethroughPlugin);
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  markdownItTypes.ts
 */

import {
  IDelimiter,
  IMarkdownIt,
  IScannedDelims,
  IStateInline,
  IToken
} from './markdownItTypes';

const TILDE: number = 0x7e; /* ~ */

/*
 * The marker these delimiters are pooled under. Not the tilde's own code,
 * because markdown-it's `~~` rule claims that one and the two must not mix.
 */
const MARKER: number = 0x1007e;

function tokenize(state: IStateInline, silent: boolean): boolean {
  if (state.src.charCodeAt(state.pos) !== TILDE) {
    return false;
  }
  /* markdown-it's own rule declines a validation pass too: a run of markers is
     not yet known to be anything until its partner has been found. */
  if (silent) {
    return false;
  }

  const scanned: IScannedDelims = state.scanDelims(state.pos, true);
  /* Two or more tildes are markdown-it's to handle, and it is registered
     before this. Only a run of exactly one reaches here unclaimed. */
  if (scanned.length !== 1) {
    return false;
  }

  const token: IToken = state.push('text', '', 0);
  token.content = '~';

  if (scanned.can_open || scanned.can_close) {
    state.delimiters.push({
      marker: MARKER,
      /* Zero turns off the length arithmetic markdown-it does for emphasis,
         where three markers in a row mean something different from two. A
         tilde has no such rule. */
      length: 0,
      jump: 0,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close
    });
  }

  state.pos += 1;
  return true;
}

/** Turns each paired marker into the tags markdown-it's own rule produces. */
function pair(state: IStateInline, delimiters: IDelimiter[]): void {
  delimiters.forEach((start: IDelimiter) => {
    if (start.marker !== MARKER || start.end === -1) {
      return;
    }

    const open: IToken = state.tokens[start.token];
    open.type = 's_open';
    open.tag = 's';
    open.nesting = 1;
    open.markup = '~';
    open.content = '';

    const close: IToken = state.tokens[delimiters[start.end].token];
    close.type = 's_close';
    close.tag = 's';
    close.nesting = -1;
    close.markup = '~';
    close.content = '';
  });
}

function postProcess(state: IStateInline): void {
  pair(state, state.delimiters);

  /* Markers inside an already paired construct are held on the token that
     opened it rather than on the top level list. */
  (state.tokens_meta || []).forEach((meta: { delimiters?: IDelimiter[] } | undefined) => {
    if (meta && meta.delimiters) {
      pair(state, meta.delimiters);
    }
  });
}

export function strikethroughPlugin(markdownIt: IMarkdownIt): void {
  /* After markdown-it's own rule, which takes `~~` and declines `~`. */
  markdownIt.inline.ruler.after('strikethrough', 'strata_strikethrough', tokenize);
  /* And after the pass that works out which marker closes which, which is
     where the tags can finally be written. */
  markdownIt.inline.ruler2.after('strikethrough', 'strata_strikethrough', postProcess);
}

export const plugin: (markdownIt: IMarkdownIt) => void = strikethroughPlugin;
