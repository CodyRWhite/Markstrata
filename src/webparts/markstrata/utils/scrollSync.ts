/**
 * .SYNOPSIS
 * Keeps the two halves of the split editor at the same place in the document,
 * so scrolling the source scrolls the preview and the other way round.
 *
 * .DESCRIPTION
 * The two panes never agree on how tall the document is. The source is
 * monospace text at a fixed line height; the preview is headings, code blocks,
 * tables and images, and a paragraph that is two lines of markdown can be six
 * lines of prose. Copying scrollTop across therefore drifts further apart the
 * further down you read, so what is carried over is the proportion of the
 * scrollable height instead: halfway down the source is halfway down the
 * preview. That is a rough map rather than a line-for-line one, and it is
 * predictable, which matters more here than being exact.
 *
 * The other half of the job is not letting the panes fight. Scrolling one sets
 * the other's scrollTop, which fires that pane's own scroll event, which would
 * set the first one back - and between the rounding in each step the pair
 * judders and creeps. So one pane is marked as driving and the echo from the
 * other is ignored until the next animation frame, by which time the scroll
 * events for this frame have all been delivered.
 *
 * .USAGE
 *   import { ScrollSync } from './utils/scrollSync';
 *
 *   const sync: ScrollSync = new ScrollSync();
 *   sync.pair(textarea, previewBox);
 *   sync.stop();
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

/** Puts `target` the same fraction of the way down as `source` is. */
function follow(source: HTMLElement, target: HTMLElement): void {
  const sourceRoom: number = source.scrollHeight - source.clientHeight;
  const targetRoom: number = target.scrollHeight - target.clientHeight;
  if (sourceRoom <= 0 || targetRoom <= 0) {
    return;
  }
  target.scrollTop = Math.round((source.scrollTop / sourceRoom) * targetRoom);
}

/**
 * Two panes showing the same document, held at the same reading position.
 *
 * A pane with nothing to scroll is left alone rather than special-cased by
 * layout: in edit-only or preview-only view the other pane is display:none and
 * so has no scrollable height, which is the same answer as a document short
 * enough to fit, and both want the same thing - do nothing.
 */
export class ScrollSync {
  private first: HTMLElement | undefined;
  private second: HTMLElement | undefined;
  private onScroll: ((event: Event) => void) | undefined;
  private driver: HTMLElement | undefined;
  private frame: number | undefined;

  public pair(first: HTMLElement, second: HTMLElement): void {
    this.stop();
    this.first = first;
    this.second = second;

    this.onScroll = (event: Event): void => {
      const source: HTMLElement = event.currentTarget as HTMLElement;
      /* The echo of the scroll we just caused. Following it would hand the
         lead back to a pane that is only doing as it was told. */
      if (this.driver && this.driver !== source) {
        return;
      }
      this.driver = source;
      follow(source, source === first ? second : first);

      if (this.frame === undefined) {
        this.frame = window.requestAnimationFrame(() => {
          this.frame = undefined;
          this.driver = undefined;
        });
      }
    };

    first.addEventListener('scroll', this.onScroll, { passive: true });
    second.addEventListener('scroll', this.onScroll, { passive: true });
  }

  public stop(): void {
    if (this.onScroll) {
      if (this.first) {
        this.first.removeEventListener('scroll', this.onScroll);
      }
      if (this.second) {
        this.second.removeEventListener('scroll', this.onScroll);
      }
      this.onScroll = undefined;
    }
    if (this.frame !== undefined) {
      window.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
    this.first = undefined;
    this.second = undefined;
    this.driver = undefined;
  }
}
