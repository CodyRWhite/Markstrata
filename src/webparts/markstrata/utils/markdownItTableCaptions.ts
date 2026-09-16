/**
 * .SYNOPSIS
 * markdown-it plugin: keeps a table caption from eating a table row.
 *
 * .DESCRIPTION
 * markdown-it-multimd-table reads a line of the form `[text]` sitting above or
 * below a table as its `<caption>`. That test is only "starts with a bracket,
 * ends with a bracket", and it is tried before the test for a data row, so a
 * perfectly ordinary row whose first cell opens with `[` and whose last cell
 * closes with `]` is taken for a caption and disappears:
 *
 *   A   | B          becomes a <caption> reading "x] | [y" and a table
 *   --- | ---        with a <thead> and no <tbody> at all. The row is gone,
 *   [x] | [y]        with nothing on the page to say a row was ever there.
 *
 * That shape is not contrived. `[[Wiki]] | ![[Embed]]` is how Obsidian's own
 * documentation writes a table of links, and a row of task list cells starts
 * and ends the same way. When the swallowed line is the header rather than a
 * data row the loss is total: the DFA never reaches a separator, so nothing is
 * a table and the whole block renders as one paragraph of raw pipes.
 *
 * Turning the plugin's `autolabel` option off does not help. All that option
 * decides is whether the caption gets an `id`; the row is swallowed either
 * way. The caption test itself has to be narrowed, and the rule is simple: a
 * line holding an unescaped pipe is a row. A caption cannot contain one - a
 * line with a pipe is a well formed row and a row of somebody's data is worth
 * more than a caption nobody documented - so such a line is never offered to
 * the caption test, and captions go on working everywhere else.
 *
 * The plugin owns none of that logic, keeping it in a closure, so the
 * narrowing is done by wrapping its block rule and moving the start of the
 * offending line past its leading brackets for the length of the call. The
 * caption test reads from that start and no longer sees a bracket; the row
 * scanner pads its cell boundaries back out to the line's real indent, so the
 * row still parses with every character it was written with, and with the
 * plugin's own rowspan, colspan and multiline handling intact.
 *
 * .USAGE
 *   import { tableCaptionPlugin } from './utils/markdownItTableCaptions';
 *
 *   markdownIt.use(markdownItMultimdTable, { ... });
 *   markdownIt.use(tableCaptionPlugin);   // after, it wraps what that left
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  markdownItTypes.ts, markdown-it-multimd-table
 */

import { BlockRule, IMarkdownIt, IStateBlock } from './markdownItTypes';

/*
 * The plugin's own caption test, copied so the wrapper asks exactly the
 * question the plugin is about to ask. Anything this does not match is not a
 * caption to begin with and is left alone.
 */
const CAPTION: RegExp = /^\[(.+?)\](\[([^[\]]+)\])?\s*$/;

/** Leading brackets, which are what the caption test looks at first. */
const BRACKETS: RegExp = /^\[+/;

/*
 * A pipe that has not been escaped, which is what makes a line a row. `\|` is
 * how Obsidian writes a pipe inside a cell, so an escaped one is content and
 * says nothing about whether the line is a row.
 */
const PIPE: RegExp = /(^|[^\\])\|/;

/** The line as the plugin will read it: from its indent to its end. */
function lineText(state: IStateBlock, line: number): string {
  return state.src.slice(state.bMarks[line] + state.sCount[line], state.eMarks[line]);
}

export function tableCaptionPlugin(markdownIt: IMarkdownIt): void {
  const rules: { name: string; fn?: BlockRule }[] = markdownIt.block.ruler.__rules__ || [];
  let original: BlockRule | undefined;
  rules.forEach((rule: { name: string; fn?: BlockRule }) => {
    if (rule.name === 'table') {
      original = rule.fn;
    }
  });

  /* No table rule to wrap means markdown-it-multimd-table did not load, which
     it reports for itself. Nothing here to guard. */
  if (!original) {
    return;
  }

  const inner: BlockRule = original;

  const guarded: BlockRule = (
    state: IStateBlock,
    startLine: number,
    endLine: number,
    silent: boolean
  ): boolean => {
    const moved: { line: number; by: number }[] = [];

    /* Only as far as the first blank line: with `multibody` off a table stops
       there, so nothing past it can be this table's caption. */
    for (let line: number = startLine; line < endLine && !state.isEmpty(line); line++) {
      const text: string = lineText(state, line);
      if (!CAPTION.test(text) || !PIPE.test(text)) {
        continue;
      }
      const brackets: RegExpExecArray | null = BRACKETS.exec(text);
      const by: number = brackets ? brackets[0].length : 1;
      state.sCount[line] += by;
      moved.push({ line: line, by: by });
    }

    try {
      return inner(state, startLine, endLine, silent);
    } finally {
      /* Restored whichever way the rule went. A line that turned out not to
         be part of a table is offered to every other block rule next, and
         they all read the same indent. */
      moved.forEach((entry: { line: number; by: number }) => {
        state.sCount[entry.line] -= entry.by;
      });
    }
  };

  markdownIt.block.ruler.at('table', guarded, { alt: ['paragraph', 'reference'] });
}

export const plugin: (markdownIt: IMarkdownIt) => void = tableCaptionPlugin;
