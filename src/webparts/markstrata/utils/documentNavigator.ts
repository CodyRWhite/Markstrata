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
 * It also owns the trail of documents behind the one being read. A reader who
 * follows a link from one page to the next expects the way back to be the page
 * they came from, not the beginning: three links in, `back` returns the second
 * document, then the first, then the configured one. The trail rides in the
 * history entry rather than beside it, so the browser's own Back button and the
 * bar above the document walk the same path and cannot disagree.
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
 *   void navigator.back(true);      // back one document, or to the configured one
 *   navigator.close(true);          // straight back to the configured document
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
  /** The documents behind this one, oldest first. */
  trail?: string[];
}

export class DocumentNavigator {
  private readonly callbacks: INavigatorCallbacks;

  private openPath: string | undefined;
  private openMarkdown: string | undefined;
  private openMetadata: IFileMetadata | undefined;
  private openHeading: string | undefined;
  /** The documents followed to reach this one, oldest first. */
  private trail: string[] = [];
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
   * What `back` would return to, or empty when that is the configured
   * document and only the web part knows its name.
   *
   * A file name rather than a title: only the document being read has been
   * fetched, so only that one has metadata. The trail holds paths.
   */
  public get previousName(): string {
    return this.trail.length ? fileOf(this.trail[this.trail.length - 1]) : '';
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
    /* Following a link lengthens the trail by the document being left. Not
       pushing means the browser is putting an entry back, or something outside
       chose the document, and in neither case did the reader walk here - so
       the trail is whatever was restored with it. */
    const trail: string[] = push
      ? (this.openPath ? this.trail.concat([this.openPath]) : [])
      : this.trail;
    await this.go(path, heading, push, trail);
  }

  /**
   * Back one document: to the one the reader came from, or to the configured
   * one when that is where they came from.
   *
   * This is what the bar above the document does. It used to close straight to
   * the configured document however deep the reader had gone, which made every
   * link after the first a one-way trip: the way back from the fourth page in
   * was the beginning.
   */
  public async back(push: boolean): Promise<void> {
    if (!this.openPath) {
      return;
    }
    if (!this.trail.length) {
      this.close(push);
      return;
    }
    const previous: string = this.trail[this.trail.length - 1];
    await this.go(previous, '', push, this.trail.slice(0, this.trail.length - 1));
  }

  /** Straight back to the document the page is configured to show. */
  public close(push: boolean): void {
    if (!this.openPath) {
      return;
    }
    this.openPath = undefined;
    this.openMarkdown = undefined;
    this.openMetadata = undefined;
    this.openHeading = undefined;
    this.trail = [];
    if (push) {
      this.pushHistory(undefined, []);
    }
    this.callbacks.onChange();
  }

  /* Opening a document, once the trail it sits at the end of has been worked
     out. Both ways in end here so that the trail and what is on screen are
     only ever set together. */
  private async go(
    path: string, heading: string, push: boolean, trail: string[]
  ): Promise<void> {
    if (!path) {
      return;
    }

    let document: ILoadedDocument;
    try {
      document = await this.callbacks.load(path);
    } catch (error) {
      /* The link stays where it is and so does the reader: a document that
         cannot be opened is not a reason to lose the one being read, or the
         trail back out of it. */
      this.callbacks.onError(
        `Could not open ${fileOf(path) || path}: ${(error as Error).message}`
      );
      return;
    }

    this.trail = trail;
    this.openPath = path;
    this.openMarkdown = document.markdown;
    this.openMetadata = document.metadata;
    this.openHeading = heading;

    if (push) {
      this.pushHistory(path, trail);
    }
    this.callbacks.onChange();
  }

  public dispose(): void {
    if (this.onPopState) {
      window.removeEventListener('popstate', this.onPopState);
      this.onPopState = undefined;
    }
  }

  private pushHistory(path: string | undefined, trail: string[]): void {
    try {
      window.history.pushState(
        { strata: this.callbacks.instanceId, path: path, trail: trail },
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
      /* The trail is read back out of the entry rather than worked out here,
         so stepping back through the browser leaves the bar above the document
         saying the same thing it said on the way in. */
      const trail: string[] = (mine && state.trail) || [];
      if (path !== this.openPath) {
        void this.go(path, '', false, trail);
        return;
      }
      this.trail = trail;
    };
    window.addEventListener('popstate', this.onPopState);
  }
}
