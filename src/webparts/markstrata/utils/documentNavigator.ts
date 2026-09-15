/**
 * .SYNOPSIS
 * Which document is being read, when it is not the one the page is configured
 * to show.
 *
 * .DESCRIPTION
 * A reader who follows a link to another markdown file is not reconfiguring the
 * page, so none of this touches the web part's properties: those are the page's
 * settings and are saved with it, and writing a followed document into
 * selectedFile would change what everybody sees the next time somebody saves
 * the page. The document being read lives here instead, for as long as the
 * reader is reading it.
 *
 * It also owns the browser history that goes with that. An entry is pushed at
 * the same URL rather than at the document's, so Back comes here rather than to
 * SharePoint's own router, which would treat a new URL as a page of its own and
 * leave. Each entry carries the web part's instance id, so two of them on one
 * page do not answer for each other - they do share the browser's single
 * history, so one stepping back can send the other home as well, which is
 * recoverable and cheaper than an entry per web part per click.
 *
 * .USAGE
 *   import { DocumentNavigator } from './utils/documentNavigator';
 *
 *   const navigator: DocumentNavigator = new DocumentNavigator({
 *     instanceId: this.context.instanceId,
 *     load: (path) => this.sharePoint.getDocument(path),
 *     onChange: () => this.render(),
 *     onError: (message) => { this.loadError = message; this.render(); }
 *   });
 *
 *   void navigator.open('/sites/team/Runbooks/deploy.md', 'rollback', true);
 *   navigator.close(true);          // back to the configured document
 *   navigator.markdown;             // what to render, or undefined
 *   navigator.takeHeading();        // the heading to land on, read once
 *   navigator.dispose();
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  SharePointService.ts (for the metadata type), wikiLinks.ts
 */

import type { IFileMetadata } from './SharePointService';
import { fileOf } from './wikiLinks';

/** What a document is, to whoever is showing one. */
export interface ILoadedDocument {
  markdown: string;
  metadata?: IFileMetadata;
}

export interface INavigatorCallbacks {
  /** Tells the history entries apart from another web part's on the same page. */
  instanceId: string;
  load: (path: string) => Promise<ILoadedDocument>;
  /** Something changed and the page should be drawn again. */
  onChange: () => void;
  /** A document that could not be opened. The reader stays where they were. */
  onError: (message: string) => void;
}

interface IHistoryEntry {
  strata?: string;
  path?: string;
}

export class DocumentNavigator {
  private readonly callbacks: INavigatorCallbacks;

  private openPath: string | undefined;
  private openMarkdown: string | undefined;
  private openMetadata: IFileMetadata | undefined;
  private openHeading: string | undefined;
  private onPopState: ((event: PopStateEvent) => void) | undefined;

  public constructor(callbacks: INavigatorCallbacks) {
    this.callbacks = callbacks;
  }

  /** The document being read, or undefined at the configured one. */
  public get path(): string | undefined {
    return this.openPath;
  }

  public get markdown(): string | undefined {
    return this.openMarkdown;
  }

  public get metadata(): IFileMetadata | undefined {
    return this.openMetadata;
  }

  /** What to call the document on screen. */
  public get name(): string {
    if (!this.openPath) {
      return '';
    }
    return this.openMetadata ? this.openMetadata.name : fileOf(this.openPath);
  }

  /**
   * The heading the link named, handed over once.
   *
   * Read-once on purpose: a re-render for a theme change must not send the
   * reader back to a heading they have since scrolled away from.
   */
  public takeHeading(): string | undefined {
    const heading: string | undefined = this.openHeading;
    this.openHeading = undefined;
    return heading;
  }

  /**
   * Opens a document, pushing a history entry unless this is the browser's own
   * Back or Forward putting one back.
   */
  public async open(path: string, heading: string, push: boolean): Promise<void> {
    if (!path) {
      return;
    }

    let document: ILoadedDocument;
    try {
      document = await this.callbacks.load(path);
    } catch (error) {
      /* The link stays where it is and so does the reader: a document that
         cannot be opened is not a reason to lose the one being read. */
      this.callbacks.onError(
        `Could not open ${fileOf(path) || path}: ${(error as Error).message}`
      );
      return;
    }

    this.openPath = path;
    this.openMarkdown = document.markdown;
    this.openMetadata = document.metadata;
    this.openHeading = heading;

    if (push) {
      this.pushHistory(path);
    }
    this.callbacks.onChange();
  }

  /** Back to the document the page is configured to show. */
  public close(push: boolean): void {
    if (!this.openPath) {
      return;
    }
    this.openPath = undefined;
    this.openMarkdown = undefined;
    this.openMetadata = undefined;
    this.openHeading = undefined;
    if (push) {
      this.pushHistory(undefined);
    }
    this.callbacks.onChange();
  }

  public dispose(): void {
    if (this.onPopState) {
      window.removeEventListener('popstate', this.onPopState);
      this.onPopState = undefined;
    }
  }

  private pushHistory(path: string | undefined): void {
    try {
      window.history.pushState(
        { strata: this.callbacks.instanceId, path: path },
        '',
        window.location.href
      );
      this.watchHistory();
    } catch {
      /* Some hosts refuse to be pushed to. The bar above the document is the
         way back either way; this only adds the browser's own button to it. */
    }
  }

  /*
   * Back and forward both arrive here. An entry of ours names the document to
   * show; anything else means the reader has stepped back past the point where
   * they started following links, so the configured document comes back.
   */
  private watchHistory(): void {
    if (this.onPopState) {
      return;
    }

    this.onPopState = (event: PopStateEvent): void => {
      const state: IHistoryEntry = (event.state || {}) as IHistoryEntry;
      const mine: boolean = state.strata === this.callbacks.instanceId;
      const path: string | undefined = mine ? state.path : undefined;

      if (!path) {
        this.close(false);
        return;
      }
      if (path !== this.openPath) {
        void this.open(path, '', false);
      }
    };
    window.addEventListener('popstate', this.onPopState);
  }
}
