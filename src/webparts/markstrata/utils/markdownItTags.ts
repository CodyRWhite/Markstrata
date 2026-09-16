/**
 * .SYNOPSIS
 * markdown-it plugin: Obsidian tags, `#recipe` and `#work/urgent`.
 *
 * .DESCRIPTION
 * A tag is how a note written in Obsidian says what it is about. It is written
 * in the text rather than in the frontmatter, it nests with a slash, and a
 * folder of notes is full of them. Rendered here they were plain words with a
 * hash in front, indistinguishable from the sentence around them.
 *
 * They become a span with a class, so a theme can show them as the pills they
 * are. Nothing more: this web part does not know what other documents exist
 * and cannot search a library, so a tag that looked like a link and went
 * nowhere would be a worse answer than one that is honestly only a label.
 *
 * Obsidian's rules for what may be one, from its own documentation:
 *
 *   - letters, digits, underscore, hyphen, and a slash to nest with
 *   - at least one character that is not a digit, so `#1984` is not a tag and
 *     `#1984-review` is
 *   - no spaces, and nothing joined onto the end of a word: `C#` is not a tag
 *
 * There is no argument with headings. A heading needs a space after its
 * hashes, and a tag cannot have one, so no line can be read as both.
 *
 * .USAGE
 *   import { tagPlugin } from './utils/markdownItTags';
 *
 *   markdownIt.use(tagPlugin);
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  markdownItTypes.ts
 */

import { IMarkdownIt, IStateInline, IToken } from './markdownItTypes';

const HASH: number = 0x23; /* # */

/*
 * What a tag is made of. The letters of other alphabets are included the way
 * they are for heading ids: by range, because the compilation target SharePoint
 * Framework pins is older than `\p{L}`.
 */
const TAG: RegExp = /^#([0-9A-Za-z_\-/À-῿Ⰰ-퟿豈-﷏ﷰ-�]+)/;

/** At least one character that is not a digit, which is Obsidian's own rule. */
const ALL_DIGITS: RegExp = /^[0-9]+$/;

/*
 * What may come immediately before a tag. A hash in the middle of a word is
 * part of that word - `C#`, `issue#4` - and only a hash that starts something
 * can start a tag.
 */
const BEFORE: RegExp = /[\s([{'"<|>-]/;

function tagRule(state: IStateInline, silent: boolean): boolean {
  const start: number = state.pos;
  if (state.src.charCodeAt(start) !== HASH) {
    return false;
  }
  if (start > 0 && !BEFORE.test(state.src.charAt(start - 1))) {
    return false;
  }

  const found: RegExpExecArray | null = TAG.exec(state.src.slice(start, state.posMax));
  if (!found) {
    return false;
  }

  /* A trailing slash is the start of a level that was never written, and a
     name that is only digits is a number somebody wrote a hash in front of. */
  const name: string = found[1].replace(/\/+$/, '');
  if (!name || ALL_DIGITS.test(name)) {
    return false;
  }

  if (!silent) {
    const token: IToken = state.push('strata_tag', 'span', 0);
    token.content = name;
  }

  state.pos = start + 1 + name.length;
  return true;
}

export function tagPlugin(markdownIt: IMarkdownIt): void {
  /* Before `escape`, which is where the other rules that claim a single
     punctuation character sit. A hash inside a code span never reaches here,
     because the backticks rule takes the whole span at its opening backtick. */
  markdownIt.inline.ruler.before('escape', 'strata_tag', tagRule);

  markdownIt.renderer.rules.strata_tag = (tokens: IToken[], index: number): string => {
    const name: string = markdownIt.utils.escapeHtml(tokens[index].content);
    /* The name is on the element as well as in it, so a theme or a script has
       the tag without having to read the hash back off the text. */
    return `<span class="strata-tag" data-tag="${name}">#${name}</span>`;
  };
}

export const plugin: (markdownIt: IMarkdownIt) => void = tagPlugin;
