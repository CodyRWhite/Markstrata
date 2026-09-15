/**
 * markdown-it plugin: GitHub style task lists.
 *
 * Replaces the unmaintained markdown-it-task-lists (last released in 2019),
 * which also emitted slightly malformed markup - `class="x"type="checkbox"` -
 * and wrapped every item in a <label> whose `for` pointed nowhere.
 *
 *   - [ ] not done
 *   - [x] done
 *
 * becomes a list marked `strata-task-list` whose items carry `data-checked`, with
 * a disabled checkbox that screen readers still announce as checked or not.
 */

import { IMarkdownIt, IStateCore, IToken } from './markdownItTypes';

const MARKER: RegExp = /^\[([ xX])\]\s+/;

function isInlineStart(tokens: IToken[], index: number): boolean {
  return (
    tokens[index].type === 'list_item_open' &&
    tokens[index + 1] &&
    tokens[index + 1].type === 'paragraph_open' &&
    tokens[index + 2] &&
    tokens[index + 2].type === 'inline'
  );
}

function taskListRule(state: IStateCore): void {
  const tokens: IToken[] = state.tokens;
  // Lists that turn out to contain at least one task item, so the <ul> can be
  // marked once the whole list has been walked.
  const taskLists: IToken[] = [];
  const openLists: IToken[] = [];

  for (let index: number = 0; index < tokens.length; index++) {
    const token: IToken = tokens[index];

    if (token.type === 'bullet_list_open') {
      openLists.push(token);
      continue;
    }
    if (token.type === 'bullet_list_close') {
      openLists.pop();
      continue;
    }
    if (!isInlineStart(tokens, index)) {
      continue;
    }

    const inline: IToken = tokens[index + 2];
    const match: RegExpExecArray | null = MARKER.exec(inline.content);
    if (!match || !inline.children || inline.children.length === 0) {
      continue;
    }

    const firstChild: IToken = inline.children[0];
    if (firstChild.type !== 'text' || !MARKER.test(firstChild.content)) {
      continue;
    }

    const checked: boolean = match[1].toLowerCase() === 'x';

    inline.content = inline.content.replace(MARKER, '');
    firstChild.content = firstChild.content.replace(MARKER, '');

    const checkbox: IToken = new state.Token('mdf_task_checkbox', '', 0);
    checkbox.meta = { checked: checked };
    inline.children.unshift(checkbox);

    token.attrJoin('class', 'strata-task-item');
    token.attrSet('data-checked', String(checked));

    const parent: IToken | undefined = openLists[openLists.length - 1];
    if (parent && taskLists.indexOf(parent) === -1) {
      taskLists.push(parent);
    }
  }

  taskLists.forEach((list: IToken) => list.attrJoin('class', 'strata-task-list'));
}

export function taskListPlugin(markdownIt: IMarkdownIt): void {
  markdownIt.core.ruler.after('inline', 'mdf_task_lists', taskListRule);

  markdownIt.renderer.rules.mdf_task_checkbox = (tokens: IToken[], index: number): string => {
    const checked: boolean = !!(tokens[index].meta as { checked?: boolean } | undefined)?.checked;
    return (
      '<input class="strata-task-checkbox" type="checkbox" disabled' +
      (checked ? ' checked' : '') +
      ' /> '
    );
  };
}
