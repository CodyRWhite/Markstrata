/**
 * .SYNOPSIS
 * Zooming and panning a picture inside the full size overlay.
 *
 * .DESCRIPTION
 * The overlay shows a picture at the size of the window and stops there, which
 * is the whole of it for a diagram and not enough for a screenshot. A
 * screenshot of a settings page is legible at the size it was taken and a
 * blur at the size a column allows, and "open it full size" only helps if
 * full size means the picture's own size rather than the window's.
 *
 * Three ways in, because the readers are not all holding the same thing:
 *
 *   wheel or pinch   toward the pointer, the way a map zooms
 *   double click     between fit and 2x, which is the whole gesture on a
 *                    touchscreen
 *   the buttons      for a keyboard, and for anybody who would rather see a
 *                    control than discover one
 *
 * Dragging pans, once there is anything to pan to. A drag is not a click, so
 * one that moved is swallowed before it reaches the overlay, which would
 * otherwise read it as a click on the background and put the picture away
 * mid-gesture.
 *
 * The scale is a transform rather than a width, so the browser keeps the
 * picture's own pixels rather than resampling it at each step, and nothing
 * around it reflows while it moves.
 *
 * .USAGE
 *   import { PictureZoom } from './utils/pictureZoom';
 *
 *   const zoom: PictureZoom = new PictureZoom(panel, picture);
 *   zoom.attach();
 *   zoom.detach();
 *
 * .NOTES
 * Since:     0.0.20.3
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

/** Fit, which is where a picture opens and what reset goes back to. */
const FIT: number = 1;

/** As far in as it goes. Past this a screenshot is pixels rather than text. */
const DEEPEST: number = 8;

/** What a button press multiplies by, and what a double click jumps to. */
const STEP: number = 1.5;
const DOUBLE_CLICK_SCALE: number = 2;

/** A pointer that moved further than this was dragging, not clicking. */
const DRAG_SLOP: number = 4;

export interface IPictureZoomState {
  scale: number;
  x: number;
  y: number;
}

/**
 * Keeps the picture overlapping its window.
 *
 * Without it a drag can throw the picture off the side and leave an empty
 * frame with no way back but the reset button, which is a control the reader
 * has to find after the thing they were looking at has gone.
 *
 * The bound is half the picture's scaled size, so at least the middle of it is
 * always over the window somewhere.
 */
export function clampPan(offset: number, picture: number, window: number, scale: number): number {
  const scaled: number = picture * scale;
  /* Smaller than its window in this direction: there is nothing to pan to, so
     it stays in the middle. */
  if (scaled <= window) {
    return 0;
  }
  const limit: number = (scaled - window) / 2;
  return Math.max(-limit, Math.min(limit, offset));
}

/** Within the range a picture may be shown at. */
export function clampScale(scale: number): number {
  return Math.max(FIT, Math.min(DEEPEST, scale));
}

/**
 * Where the picture has to move to so that the point under the pointer stays
 * under the pointer.
 *
 * Zooming about the middle is the easy version and the wrong one: a reader
 * points at the thing they want bigger, and a zoom that walks it off the
 * screen makes them chase it. `from` and `to` are the scales either side of
 * the step, and `pointer` is how far the pointer is from the middle of the
 * window.
 */
export function panAfterZoom(offset: number, pointer: number, from: number, to: number): number {
  return offset + (pointer - offset) * (1 - to / from);
}

export class PictureZoom {
  private state: IPictureZoomState = { scale: FIT, x: 0, y: 0 };
  private pointers: Map<number, { x: number; y: number }> = new Map();
  private dragging: boolean = false;
  private moved: boolean = false;
  private pinchGap: number = 0;
  private attached: boolean = false;
  private listeners: { target: EventTarget; type: string; fn: EventListener }[] = [];

  public constructor(
    private readonly panel: HTMLElement,
    private readonly picture: HTMLImageElement
  ) {}

  public attach(): void {
    /*
     * Once, however many times it is asked.
     *
     * The caller attaches when the picture loads and also straight away if it
     * is already complete, because a cached picture may raise no load at all.
     * Sometimes it is both: complete by the time it is asked, and load fires
     * anyway. Two sets of handlers is not twice as responsive, it is wrong in
     * a way that reads as random. A double click ran the handler twice, so it
     * zoomed to 2x and then saw itself zoomed and went back to fit, and the
     * gesture did nothing. Every wheel notch moved two steps for the same
     * reason.
     */
    if (this.attached) {
      return;
    }
    this.attached = true;

    this.on(this.picture, 'dblclick', (event: Event) => {
      event.preventDefault();
      const pointer: MouseEvent = event as MouseEvent;
      if (this.state.scale > FIT) {
        this.reset();
      } else {
        this.zoomAbout(DOUBLE_CLICK_SCALE, this.pointerOffset(pointer.clientX, pointer.clientY));
      }
    });

    /*
     * Not passive, and that is the point: without preventDefault the page
     * behind the overlay scrolls while the reader is zooming, so they finish
     * somewhere else in the document with a picture over it.
     */
    this.on(this.panel, 'wheel', (event: Event) => {
      const wheel: WheelEvent = event as WheelEvent;
      event.preventDefault();
      const direction: number = wheel.deltaY < 0 ? STEP : 1 / STEP;
      this.zoomAbout(this.state.scale * direction,
        this.pointerOffset(wheel.clientX, wheel.clientY));
    }, { passive: false });

    this.on(this.picture, 'pointerdown', (event: Event) => {
      const pointer: PointerEvent = event as PointerEvent;
      this.pointers.set(pointer.pointerId, { x: pointer.clientX, y: pointer.clientY });
      if (this.pointers.size === 2) {
        this.pinchGap = this.gap();
        return;
      }
      this.dragging = true;
      /* Cleared as a gesture begins rather than when the one before it is
         tidied up. Left to a later click it survives a drag that was followed
         by a button press instead, and then swallows the next click on the
         picture: pan, press a control, double click, and the double click does
         nothing at all. */
      this.moved = false;
      this.picture.setPointerCapture(pointer.pointerId);
    });

    this.on(this.picture, 'pointermove', (event: Event) => {
      const pointer: PointerEvent = event as PointerEvent;
      const was: { x: number; y: number } | undefined = this.pointers.get(pointer.pointerId);
      if (!was) {
        return;
      }
      this.pointers.set(pointer.pointerId, { x: pointer.clientX, y: pointer.clientY });

      if (this.pointers.size === 2) {
        const gap: number = this.gap();
        if (this.pinchGap > 0 && gap > 0) {
          this.moved = true;
          this.zoomAbout(this.state.scale * (gap / this.pinchGap), this.pinchMiddle());
          this.pinchGap = gap;
        }
        return;
      }

      if (!this.dragging) {
        return;
      }
      const dx: number = pointer.clientX - was.x;
      const dy: number = pointer.clientY - was.y;
      if (Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP) {
        this.moved = true;
      }
      this.state.x += dx;
      this.state.y += dy;
      this.draw();
    });

    const release = (event: Event): void => {
      const pointer: PointerEvent = event as PointerEvent;
      this.pointers.delete(pointer.pointerId);
      if (this.pointers.size < 2) {
        this.pinchGap = 0;
      }
      this.dragging = this.pointers.size > 0;
    };
    this.on(this.picture, 'pointerup', release);
    this.on(this.picture, 'pointercancel', release);

    /*
     * A drag that ends over the picture still raises a click, and the overlay
     * is listening for one. Swallowed here, in the capture phase, so a reader
     * who pans to the edge does not have the picture taken away as they let
     * go.
     */
    this.on(this.picture, 'click', (event: Event) => {
      if (this.moved) {
        /*
         * Stopped, not prevented. Stopping it is all this needs: the overlay
         * is the only thing listening further up. Preventing it also cancels
         * the double click Chromium would have raised next, so the gesture
         * after a drag was being swallowed along with the drag.
         */
        event.stopPropagation();
      }
    }, undefined, true);

    this.draw();
  }

  public detach(): void {
    this.listeners.forEach((entry) => entry.target.removeEventListener(entry.type, entry.fn, true));
    this.listeners.forEach((entry) => entry.target.removeEventListener(entry.type, entry.fn));
    this.listeners = [];
    this.pointers.clear();
    this.attached = false;
  }

  /** In one step, about the middle: what the buttons do. */
  public zoomBy(factor: number): void {
    this.zoomAbout(this.state.scale * factor, { x: 0, y: 0 });
  }

  public reset(): void {
    this.state = { scale: FIT, x: 0, y: 0 };
    this.draw();
  }

  /** Read by the harness, which cannot see a transform it did not compute. */
  public current(): IPictureZoomState {
    return { scale: this.state.scale, x: this.state.x, y: this.state.y };
  }

  private zoomAbout(wanted: number, pointer: { x: number; y: number }): void {
    const from: number = this.state.scale;
    const to: number = clampScale(wanted);
    if (to === from) {
      return;
    }
    this.state.scale = to;
    this.state.x = panAfterZoom(this.state.x, pointer.x, from, to);
    this.state.y = panAfterZoom(this.state.y, pointer.y, from, to);
    this.draw();
  }

  /** How far a page point is from the middle of the panel. */
  private pointerOffset(clientX: number, clientY: number): { x: number; y: number } {
    const box: DOMRect = this.panel.getBoundingClientRect();
    return {
      x: clientX - (box.left + box.width / 2),
      y: clientY - (box.top + box.height / 2)
    };
  }

  private gap(): number {
    const [first, second] = Array.from(this.pointers.values());
    if (!first || !second) {
      return 0;
    }
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  private pinchMiddle(): { x: number; y: number } {
    const [first, second] = Array.from(this.pointers.values());
    if (!first || !second) {
      return { x: 0, y: 0 };
    }
    return this.pointerOffset((first.x + second.x) / 2, (first.y + second.y) / 2);
  }

  private draw(): void {
    const box: DOMRect = this.panel.getBoundingClientRect();
    /* The picture's own laid out size, which is what the scale multiplies. */
    const width: number = this.picture.offsetWidth;
    const height: number = this.picture.offsetHeight;

    this.state.x = clampPan(this.state.x, width, box.width, this.state.scale);
    this.state.y = clampPan(this.state.y, height, box.height, this.state.scale);

    this.picture.style.transform =
      `translate(${this.state.x}px, ${this.state.y}px) scale(${this.state.scale})`;
    /* What the cursor says is what dragging would do. */
    this.panel.setAttribute('data-strata-zoomed', this.state.scale > FIT ? 'in' : 'fit');
  }

  private on(
    target: EventTarget,
    type: string,
    fn: EventListener,
    options?: AddEventListenerOptions,
    capture?: boolean
  ): void {
    if (capture) {
      target.addEventListener(type, fn, true);
    } else {
      target.addEventListener(type, fn, options);
    }
    this.listeners.push({ target: target, type: type, fn: fn });
  }
}
