/**
 * .SYNOPSIS
 * Filling in a code block whose fence named an address instead of a body.
 *
 * .DESCRIPTION
 * A runbook that quotes twenty lines out of a file wants those twenty lines,
 * not a copy of them that stopped being true three releases ago. So a fence
 * can say where the code is:
 *
 *   ```ts src="https://github.com/contoso/tools/blob/main/src/cache.ts#L10-L20"
 *   ```
 *
 * The address is fetched here rather than while the markdown is rendered,
 * because rendering is a string going in and a string coming out and has to
 * stay that way. codeBlocks.ts draws the block waiting, carrying the address
 * on the element; this finds those blocks once the document is on the page,
 * asks for each one, and puts the code inside. It is the same shape as
 * validateWikiLinks: started and left to settle, with the document readable
 * the whole time.
 *
 * Three things it does not do itself. The address is translated by
 * remoteDocuments' fetchableUrl, so a github.com/.../blob/... link - the one a
 * browser gives you when you copy a link to a file - reaches the raw host that
 * actually returns the file. A failure is worded by remoteFailure, which knows
 * that a browser cannot tell "not there" from "that server will not let this
 * page read it". And the fetch itself belongs to the caller, because only the
 * caller knows whether it is talking to SharePoint or to a stand-in.
 *
 * What came back is somebody else's file. It goes in as text, through the same
 * highlighter and the same escaping as a block the author typed, and never as
 * markup.
 *
 * .USAGE
 *   import { fillRemoteCode } from './utils/remoteCode';
 *
 *   // Left to settle on its own, after the article is in the page.
 *   void fillRemoteCode(article, (url) => SharePointService.fetchUrl(url));
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  codeBlocks.ts, remoteDocuments.ts
 */

import { CODE_LOADING_CLASS, CODE_SOURCE_ATTRIBUTE, renderCodeLines } from './codeBlocks';
import { fetchableUrl, remoteFailure } from './remoteDocuments';

/** How the caller reaches the other server. */
export type FetchCode = (url: string) => Promise<string>;

/**
 * The lines a GitHub line fragment names, as a 1-based inclusive pair.
 *
 * `#L10-L20` and `#L10` are what the blob page puts in the address bar when
 * you click a line number or shift-click a range, so they are what anybody
 * pastes. Nothing else is read: a fragment this does not recognise means the
 * whole file, which is what an address without a fragment means anyway.
 */
export function fragmentRange(url: string): { from: number; to: number } | undefined {
  const found: RegExpExecArray | null = /#L(\d+)(?:-L?(\d+))?$/i.exec(url || '');
  if (!found) {
    return undefined;
  }
  const from: number = parseInt(found[1], 10);
  const to: number = found[2] ? parseInt(found[2], 10) : from;
  /* Written either way round, as a line spec on a fence is. */
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

/**
 * The part of a fetched file a fragment asked for.
 *
 * A range that runs off the end is trimmed rather than refused: a file that
 * has grown shorter since the link was written should still show what is
 * there. The trailing newline every file ends with is dropped first, or it
 * would arrive as an empty last line in the block.
 */
export function sliceLines(text: string, range: { from: number; to: number } | undefined): string {
  const body: string = (text || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
  if (!range) {
    return body;
  }
  return body.split('\n').slice(Math.max(0, range.from - 1), range.to).join('\n');
}

/**
 * Fetches every waiting block in `container` and fills it in.
 *
 * One request per block, in parallel, and a block that fails says so in place
 * of its code. A block left empty and silent is the worst of the three
 * outcomes: the reader cannot tell it from a fence the author left blank.
 */
export async function fillRemoteCode(container: HTMLElement, fetchCode: FetchCode): Promise<void> {
  const blocks: HTMLElement[] = Array.prototype.slice.call(
    container.querySelectorAll(`.strata-code[${CODE_SOURCE_ATTRIBUTE}]`)
  );

  await Promise.all(blocks.map((block: HTMLElement) => fill(block, fetchCode)));
}

async function fill(block: HTMLElement, fetchCode: FetchCode): Promise<void> {
  const src: string = block.getAttribute(CODE_SOURCE_ATTRIBUTE) || '';
  /* Claimed before the request goes out, so a second pass over the same
     article cannot ask for the same file twice. */
  block.removeAttribute(CODE_SOURCE_ATTRIBUTE);

  try {
    const fetched: string = await fetchCode(fetchableUrl(src));
    show(block, sliceLines(fetched, fragmentRange(src)));
  } catch (error) {
    fail(block, remoteFailure(src, error, 'file'));
  }
}

function show(block: HTMLElement, code: string): void {
  const target: HTMLElement | null = block.querySelector('code');
  if (!target) {
    return;
  }

  /* The language the fence named, which is the one the block is already
     labelled and classed for, so the fetched file is highlighted exactly as a
     block written in the document would be. */
  const lang: string = block.getAttribute('data-lang') || '';
  const plain: boolean = block.getAttribute('data-strata-code-plain') === 'true';
  const called: number[] = (block.getAttribute('data-strata-code-called') || '')
    .split(',')
    .map((part: string) => parseInt(part, 10))
    .filter((line: number) => !isNaN(line));

  /* renderCodeLines escapes or highlights the text; either way what goes in is
     the file's characters, never its markup. */
  target.innerHTML = renderCodeLines(code, lang, !plain, called);
  settle(block);
  const note: HTMLElement | null = block.querySelector('.strata-code-note');
  if (note) {
    note.remove();
  }
}

function fail(block: HTMLElement, message: string): void {
  const note: HTMLElement | null = block.querySelector('.strata-code-note');
  if (note) {
    note.textContent = message;
  }
  block.classList.add('strata-code--failed');
  settle(block);
}

function settle(block: HTMLElement): void {
  block.classList.remove(CODE_LOADING_CLASS);
  block.removeAttribute('data-strata-code-plain');
  block.removeAttribute('data-strata-code-called');
}
