/**
 * Hint badge overlay: one canvas that draws the label round.
 *
 * The round is fixed at activation (label, target and rect are snapshotted), so
 * the only thing that changes mid-round is the typed prefix. Canvas repaints
 * are cheap enough to redraw the whole round on every stroke: measured 1.7ms
 * for 600 badges including a forced GPU read. The DOM round of 300 absolutely
 * positioned nodes took 32.8ms from dispatch to the next frame. That is why the
 * default path paints synchronously and only an extreme round falls back to
 * frames.
 *
 * This module owns orchestration and the public API; badge geometry, text
 * segmentation and the draw calls live in overlay-canvas.ts.
 */
import type { Hint, HintRect } from "./hints.ts";
import {
  createCanvasSurface,
  type CanvasContextFactory,
  type CanvasSurface,
  type OverlayViewport,
} from "./overlay-canvas.ts";

export type { OverlayViewport };

/**
 * Frame scheduling seam, used only by the extreme-round fallback.
 *
 * Browsers supply requestAnimationFrame; tests supply a stepper so a frame only
 * happens when the test says so.
 */
export interface FrameClock {
  now(): number;
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
}

/** Cancellation seam: clearing a round never lets a queued frame repaint it. */
export interface ProgressiveRender {
  cancel(): void;
  /** Resolves when every badge of the round is painted, or the round is cancelled. */
  done: Promise<void>;
}

/**
 * Timer seam for the hit confirmation.
 *
 * The confirmation outlives the round that produced it, so its 300ms cannot ride
 * on the frame clock: a frame callback would be cancelled with the round. Tests
 * supply a stepper so the box only disappears when the test says so.
 */
export interface ConfirmTimers {
  setTimeout(run: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

/** How long the confirmation box stays on screen. */
export const CONFIRM_MS = 300;

export interface Overlay {
  /** Repaint the round; a pending prefix keeps its badges lit and dims the rest. */
  render(hints: readonly Hint[], pending?: string): void;
  /**
   * Paint the round.
   *
   * Below the synchronous limit this is the same as `render` and returns an
   * already-complete handle; the method survives because callers and tests
   * already drive rounds through it. Only a round too large for one frame is
   * spread across frames, in which case `done` waits for the last one.
   */
  renderProgressive(hints: readonly Hint[], pending?: string): ProgressiveRender;
  /**
   * Draw one more batch on the live round without clearing or repainting the
   * badges already on the canvas.
   *
   * The slow collection path calls this once per frame with the candidates it
   * just accepted, which is what makes the first painted badges typeable while
   * the rest of the page is still being walked.
   */
  append(hints: readonly Hint[], pending?: string): void;
  /** Every label of the current round, in hint order. */
  labels(): readonly string[];
  /**
   * Labels already painted. Equal to `labels()` on the synchronous path; on the
   * frame fallback it grows until the round is complete.
   */
  visibleLabels(): readonly string[];
  /**
   * Flash a box over the target that was just hit.
   *
   * Called after the action has been dispatched, never before: the reader's
   * click must not wait on a visual. A confirmation is a receipt, so it lives
   * outside the round and survives `destroy`.
   */
  confirm(rect: HintRect, options?: { timers?: ConfirmTimers }): void;
  /** Drop the live confirmation, for Esc and for a round that starts over it. */
  clearConfirm(): void;
  destroy(): void;
}

export interface OverlayDeps {
  doc?: Document;
  viewport?: () => OverlayViewport;
  clock?: FrameClock;
  /** Test seam: jsdom has no 2D context, so tests record draw calls instead. */
  canvasContext?: CanvasContextFactory;
  /**
   * Told the wall clock of every `paint` call.
   *
   * The app owns the per-frame probe and the frame boundary; this hook is the
   * only way the paint stage can report into the same frame as the collection
   * slice that triggered it. Absent when the host disabled the probe.
   */
  onPaint?: (durationMs: number) => void;
}

/**
 * Rounds at or below this count paint in the activation frame.
 *
 * The number is deliberately far above real pages: 600 badges full-repaint in
 * 1.7ms, so even a huge page has room. Only a pathological round, where one
 * frame's draw work could itself be long, pays for frame scheduling.
 */
export const SYNC_PAINT_LIMIT = 2000;

/** First slice of the fallback path, painted in the activation frame. */
const FALLBACK_FIRST_BATCH = 1000;

/** The confirmation ring reuses the badge yellow, so it reads as the same UI. */
const CONFIRM_COLOR = "#ffd60a";
/** Fade-out only; the box appears instantly so the receipt is never delayed. */
const CONFIRM_FADE_MS = 120;

interface Round {
  /** Painted hints; `append` extends this array in place. */
  hints: Hint[];
  readonly bounds: OverlayViewport;
  readonly promise: Promise<void>;
  pending: string;
  /** Hints already painted; also the length of `visibleLabels()`. */
  drawn: number;
  handle: number | undefined;
  finished: boolean;
  settled: boolean;
  resolve: () => void;
}

/** The browser's frame clock, or undefined where the host has no frames. */
function defaultClock(doc: Document): FrameClock | undefined {
  const view = doc.defaultView;
  if (view === null) return undefined;
  const request = view.requestAnimationFrame?.bind(view);
  const cancel = view.cancelAnimationFrame?.bind(view);
  if (typeof request !== "function" || typeof cancel !== "function") return undefined;
  return {
    now: () => view.performance.now(),
    request,
    cancel,
  };
}

/**
 * Put the overlay on the top layer as a manual popover.
 *
 * z-index cannot reach past the top layer: a card opened with `showPopover()`
 * or `showModal()` paints above every normal element no matter how large its
 * z-index is, and the badge minted for its button ends up hidden behind the
 * card. Showing the overlay itself as a popover puts it on the same layer;
 * because it is shown after the card, it lands on top. `manual` keeps it out of
 * light-dismiss and Escape handling, which belong to the jump round.
 *
 * The attribute is only kept when the browser actually opened the popover. A
 * closed `[popover]` is `display:none` in the UA sheet, so leaving the
 * attribute behind after a failed call would blank out the whole round.
 */
function raiseTopLayer(el: HTMLElement): void {
  const popover = el as HTMLElement & { showPopover?: () => void };
  if (typeof popover.showPopover !== "function") return;
  el.setAttribute("popover", "manual");
  try {
    popover.showPopover();
  } catch {
    el.removeAttribute("popover");
  }
}

export function createOverlay(deps: OverlayDeps = {}): Overlay {
  const doc = deps.doc ?? globalThis.document;
  const viewport =
    deps.viewport ?? (() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }));
  const clock = deps.clock ?? defaultClock(doc);
  /**
   * Paint clock, only resolved when a probe is listening.
   *
   * `clock` is a frame scheduler and may be a test stepper; paint duration is
   * wall clock and must come from the page realm, not from that seam.
   */
  const paintNow =
    deps.onPaint === undefined
      ? undefined
      : (() => {
          const perf = doc.defaultView?.performance;
          return perf !== undefined && typeof perf.now === "function"
            ? () => perf.now()
            : () => Date.now();
        })();
  let surface: CanvasSurface | undefined;
  let round: Round | undefined;
  let confirmation: { element: HTMLElement; handle: number } | undefined;
  /** Timers of the live confirmation; the caller's seam wins over the host's. */
  let confirmTimers: ConfirmTimers | undefined;

  /**
   * The host's timers, or a no-op pair where the document has no window.
   *
   * A detached document (jsdom without a window, a torn-down iframe) has no
   * `setTimeout`; the confirmation then simply never schedules its own removal
   * instead of throwing on the way out of a successful hit.
   */
  function hostTimers(): ConfirmTimers {
    const view = doc.defaultView;
    if (view === null || typeof view.setTimeout !== "function") {
      return { setTimeout: () => 0, clearTimeout: () => undefined };
    }
    return {
      setTimeout: (run, ms) => view.setTimeout(run, ms) as unknown as number,
      clearTimeout: (handle) => view.clearTimeout(handle),
    };
  }

  /**
   * Whether the reader asked the system to cut animation.
   *
   * A confirmation that fades is decoration; under `prefers-reduced-motion` the
   * box still has to appear and disappear, just without the fade. Read per call
   * because the preference can change while a page stays open.
   */
  function motionAllowed(): boolean {
    const view = doc.defaultView;
    if (view === null || typeof view.matchMedia !== "function") return true;
    try {
      return !view.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  }

  /** Take the live confirmation off the page and cancel its removal. */
  function dropConfirmation(): void {
    if (confirmation === undefined) return;
    const { element, handle } = confirmation;
    confirmation = undefined;
    (confirmTimers ?? hostTimers()).clearTimeout(handle);
    element.remove();
  }

  /** The one canvas this overlay ever attaches; rounds reuse it. */
  function ensureSurface(): CanvasSurface {
    if (surface !== undefined) return surface;
    const created = createCanvasSurface(doc, deps.canvasContext);
    doc.documentElement.append(created.canvas);
    surface = created;
    raiseTopLayer(created.canvas);
    return created;
  }

  function cancelFrame(target: Round): void {
    if (target.handle === undefined) return;
    clock?.cancel(target.handle);
    target.handle = undefined;
  }

  function settle(target: Round): void {
    target.finished = true;
    if (target.settled) return;
    target.settled = true;
    target.resolve();
  }

  /**
   * Give up on a round: stop its frame and release anyone waiting on `done`.
   * A caller must never hang because the round it was waiting for was
   * replaced, cancelled or destroyed.
   */
  function abandon(target: Round): void {
    cancelFrame(target);
    if (target.settled) return;
    target.settled = true;
    target.resolve();
  }

  /**
   * Paint the first `count` hints of the round.
   *
   * The draw is a full repaint of that prefix: canvas keeps no per-badge state,
   * and a prefix stroke has to restyle every badge anyway. `drawn` is the only
   * round state, so `visibleLabels()` can answer without reading pixels.
   */
  function paint(target: Round, count: number): void {
    const next = Math.min(Math.max(count, 0), target.hints.length);
    const started = paintNow === undefined ? 0 : paintNow();
    try {
      const canvas = ensureSurface();
      canvas.paint(target.hints, target.bounds, target.pending, next);
    } finally {
      if (paintNow !== undefined) deps.onPaint?.(paintNow() - started);
    }
    target.drawn = next;
    if (next >= target.hints.length) settle(target);
  }

  /** Start a round, dropping the queued frame of the previous one. */
  function begin(hints: readonly Hint[], pending: string): Round {
    if (round !== undefined) abandon(round);
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const target: Round = {
      // Kept by reference on purpose: `render(hints, pending)` on a prefix
      // stroke compares identity with the live round and must repaint the
      // painted prefix instead of starting a new round from scratch.
      hints: hints as Hint[],
      bounds: viewport(),
      promise,
      pending,
      drawn: 0,
      handle: undefined,
      finished: false,
      settled: false,
      resolve,
    };
    round = target;
    return target;
  }

  /**
   * Schedule the next slice of an oversized round.
   *
   * The batch doubles: each frame repaints everything already shown, so a
   * constant batch would make every later frame pay the whole prefix again for
   * one small step; doubling keeps the total draw work linear in the round.
   */
  function schedule(target: Round): void {
    const frameClock = clock;
    if (frameClock === undefined) return;
    target.handle = frameClock.request(() => {
      target.handle = undefined;
      if (round !== target) return;
      const next = Math.min(
        Math.max(target.drawn * 2, target.drawn + 1),
        target.hints.length,
      );
      paint(target, next);
      if (!target.finished) schedule(target);
    });
  }

  function removeSurface(): void {
    const canvas = surface?.canvas as
      | (HTMLCanvasElement & { hidePopover?: () => void })
      | undefined;
    if (canvas !== undefined && typeof canvas.hidePopover === "function") {
      // Leaves the top layer before the node goes away; a detached popover
      // would otherwise stay registered until the browser cleans it up.
      try {
        canvas.hidePopover();
      } catch {
        // Already closed or unsupported: removing the node is enough.
      }
    }
    canvas?.remove();
    surface = undefined;
  }

  function cancelRound(): void {
    if (round === undefined) return;
    abandon(round);
    round = undefined;
    surface?.clear();
    removeSurface();
  }

  return {
    render(hints: readonly Hint[], pending = ""): void {
      // A prefix stroke during the fallback must repaint only the visible
      // prefix and leave the queued frames alone; later frames open in the
      // prefix the round has reached.
      if (round !== undefined && round.hints === hints) {
        round.pending = pending;
        paint(round, round.drawn);
        return;
      }
      const target = begin(hints, pending);
      paint(target, hints.length);
    },
    renderProgressive(hints: readonly Hint[], pending = ""): ProgressiveRender {
      const target = begin(hints, pending);
      if (hints.length <= SYNC_PAINT_LIMIT || clock === undefined) {
        // No frame scheduler (jsdom, an exotic host): correctness outranks
        // pacing, so the whole round lands in this frame like the sync path.
        paint(target, hints.length);
      } else {
        paint(target, Math.min(FALLBACK_FIRST_BATCH, hints.length));
        if (!target.finished) schedule(target);
      }
      return {
        done: target.promise,
        cancel: () => {
          if (round !== target) return;
          cancelRound();
        },
      };
    },
    append(hints: readonly Hint[], pending = ""): void {
      if (hints.length === 0) return;
      const started = paintNow === undefined ? 0 : paintNow();
      try {
        const target = round;
        if (target === undefined) {
          // First batch of a slow round: there is no previous canvas state to
          // preserve, so the round starts at this batch.
          const fresh = begin(hints, pending);
          const canvas = ensureSurface();
          canvas.paintRange(fresh.hints, fresh.bounds, pending, 0, fresh.hints.length);
          fresh.drawn = fresh.hints.length;
          return;
        }
        target.pending = pending;
        const from = target.drawn;
        target.hints.push(...hints);
        const canvas = ensureSurface();
        canvas.paintRange(target.hints, target.bounds, pending, from, target.hints.length);
        target.drawn = target.hints.length;
      } finally {
        if (paintNow !== undefined) deps.onPaint?.(paintNow() - started);
      }
    },
    labels(): readonly string[] {
      return round === undefined ? [] : round.hints.map((hint) => hint.label);
    },
    visibleLabels(): readonly string[] {
      return round === undefined
        ? []
        : round.hints.slice(0, round.drawn).map((hint) => hint.label);
    },
    confirm(rect, options): void {
      // One box at a time: a second hit inside the window replaces the first
      // rather than stacking two receipts on top of each other.
      dropConfirmation();
      confirmTimers = options?.timers;
      const timers = confirmTimers ?? hostTimers();
      const element = doc.createElement("div");
      element.dataset.dshJumpConfirm = "";
      // The box is a visual receipt for something that already happened; a
      // screen reader announcing it would replay the action it confirms.
      element.setAttribute("aria-hidden", "true");
      const fade = motionAllowed();
      element.style.cssText =
        "position:fixed;box-sizing:border-box;pointer-events:none;" +
        "z-index:2147483647;border:2px solid " +
        CONFIRM_COLOR +
        ";border-radius:3px;" +
        (fade ? "transition:opacity " + String(CONFIRM_FADE_MS) + "ms ease-out;" : "") +
        "left:" +
        String(rect.x) +
        "px;top:" +
        String(rect.y) +
        "px;width:" +
        String(rect.w) +
        "px;height:" +
        String(rect.h) +
        "px";
      doc.documentElement.append(element);
      const handle = timers.setTimeout(() => {
        // Only the live box may remove itself: a replaced confirmation must not
        // be torn down early by the timer of the one it replaced.
        if (confirmation?.element !== element) return;
        confirmation = undefined;
        element.remove();
      }, CONFIRM_MS);
      confirmation = { element, handle };
    },
    clearConfirm(): void {
      dropConfirmation();
    },
    destroy(): void {
      dropConfirmation();
      if (round !== undefined) {
        abandon(round);
        round = undefined;
      }
      surface?.clear();
      removeSurface();
    },
  };
}
