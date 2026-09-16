/**
 * .SYNOPSIS
 * Minimal typings for the lazily imported Paged.js chunk.
 *
 * .DESCRIPTION
 * Paged.js ships no typings of its own, so without this the import is an
 * error rather than a value. The `paths` entry in tsconfig.json points the
 * compiler at this file; webpack still resolves the real package when it
 * builds the chunk, the same arrangement Mermaid has next door.
 *
 * Only the one class this web part constructs is declared, and only the one
 * method it calls, so a typo in either is still a compile error rather than
 * something that shows up as a blank page during an export.
 *
 * .USAGE
 *   // Nothing imports this by name. tsconfig.json's `paths` points the
 *   // compiler at it wherever the code says:
 *
 *   const { Previewer } = await import('pagedjs');
 *
 * .NOTES
 * Since:     0.0.20.0
 * Ships in:  the web part bundle, as a chunk of its own
 * Requires:  nothing else in this project
 */

declare module 'pagedjs' {
  /**
   * What `preview` gives back once the pages have been laid out.
   *
   * Only the page count is read here, to tell an export that produced nothing
   * from one that produced a document.
   */
  export interface IPagedFlow {
    total: number;
    performance?: number;
  }

  /**
   * A stylesheet handed to the previewer, keyed by a name that only ever
   * appears in Paged.js's own diagnostics.
   */
  export interface IPagedStylesheet {
    [name: string]: string;
  }

  /**
   * The two halves a previewer is made of, declared because it has no teardown
   * of its own and they are where the teardown lives.
   *
   * The chunker owns the page elements and the listeners on them; the polisher
   * owns the stylesheets it injected while rewriting the paged CSS. Left alone
   * after an export, both go on answering for a document that is no longer
   * there.
   */
  export interface IPagedPart {
    destroy(): void;
  }

  export interface IPagedChunker extends IPagedPart {
    /**
     * Destroys the pages from this index on, and with each one the resize
     * observer watching it. This is the call that stops Paged.js answering
     * for a document that is being taken off the page.
     */
    removePages(fromIndex?: number): void;
  }

  export class Previewer {
    public readonly chunker: IPagedChunker;
    public readonly polisher: IPagedPart;

    /**
     * Lays `content` out into pages inside `renderTo`, with `stylesheets`
     * rewritten so the paged rules in them mean something.
     */
    public preview(
      content: Node | undefined,
      stylesheets: (string | IPagedStylesheet)[],
      renderTo: HTMLElement
    ): Promise<IPagedFlow>;
  }
}
