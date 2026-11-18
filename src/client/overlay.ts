/**
 * Hint badge overlay: one fixed container whose only job is drawing the label
 * round. Coordinates come from the activation snapshot inside each Hint, so
 * badges stay put even if the page scrolls afterwards (v1 freezes the round
 * on purpose; recomputing mid-round would move labels under the user fingers).
 *
 * Two costs scale with the round: minting the badges, and repainting them on
 * every stroke of a label. The first is unavoidable — N targets need N marks —
 * so the second is what has to stay off the keystroke path. Badges are keyed
 * by label and updated in place: a stroke only touches badges whose look
 * changes, dimming the ones it rules out and re-segmenting the few it still
 * reaches. A badge ruled out by an earlier stroke stays out at every longer
 * prefix, so it is skipped entirely. Position, size and node identity stay
 * untouched. Rebuilding the whole run per stroke is what made a busy page feel
 * sluggish while typing, and that cost was paid on every stroke of a three-key
 * label.
 *
 * Badges are absolutely positioned inside the fixed container rather than fixed
 * themselves. The container already spans the viewport, so the coordinate
 * system is identical while the browser tracks one containing block instead of
 * one per badge.
 */
import type { Hint } from "./hints.ts";

export interface OverlayViewport {
  width: number;
  height: number;
}

/**
 * Frame scheduling seam.
 *
 * Browsers supply requestAnimationFrame; tests supply a stepper so a batch is
 * only inserted when the test says a frame happened. `now` is on the clock so a
 * batch can measure the gap from its own insertion to the next frame.
 */
export interface FrameClock {
  now(): number;
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
}

export interface ProgressiveOptions {
  /** Time one batch may spend before yielding to the next frame. */
  frameBudgetMs?: number;
  /** Nodes inserted in the activation frame, before any timing exists. */
  initialBatch?: number;
  minBatch?: number;
  maxBatch?: number;
}

/** Cancellation seam: clearing a round never lets a queued frame repaint it. */
export interface ProgressiveRender {
  cancel(): void;
}

export interface Overlay {
  /** Redraw the round; a pending prefix keeps its badges lit and dims the rest. */
  render(hints: readonly Hint[], pending?: string): void;
  /**
   * Paint the same round across frames.
   *
   * Label assignment is already fixed by `hints`; only the moment a badge joins
   * the DOM is deferred. A prefix repaint during the round updates the badges
   * that exist and leaves the queued batches alone.
   */
  renderProgressive(
    hints: readonly Hint[],
    pending?: string,
    options?: ProgressiveOptions,
  ): ProgressiveRender;
  destroy(): void;
}

export interface OverlayDeps {
  doc?: Document;
  viewport?: () => OverlayViewport;
  clock?: FrameClock;
}

/** Badge box estimate for clamping; hint rects are target-sized, not badge-sized. */
const BADGE_W = 24;
const BADGE_H = 16;

/** A 60Hz frame, used until the host injects the display's measured cadence. */
const DEFAULT_FRAME_BUDGET_MS = 16.7;
/** Conservative first batch: small enough to leave room for style and layout. */
const DEFAULT_INITIAL_BATCH = 32;
const MIN_BATCH = 8;
const MAX_BATCH = 256;
/** Below this share of the budget the next batch may grow. */
const GROW_UNDER_BUDGET = 0.5;
const GROWTH_FACTOR = 1.5;
const SHRINK_DIVISOR = 2;

interface Badge {
  element: HTMLElement;
  /** The target this badge was minted for; a new round replaces the badge. */
  target: Element;
  /**
   * Whether the last paint left this badge lit.
   *
   * Kept apart from the prefix because a ruled-out badge looks identical at
   * every prefix that does not reach it: once dim, a longer prefix must not
   * touch it again.
   */
  matched: boolean;
  /**
   * Prefix whose split this badge currently renders.
   *
   * A dim badge always renders the empty prefix, whichever prefix ruled it out.
   * Kept as the rendered form rather than the live prefix so `paint` can tell a
   * text change from a light change.
   */
  drawn: string;
}

/**
 * The round being inserted batch by batch.
 *
 * Hints are the whole round from the start: labels are assigned before the
 * first frame, so batching only decides when a badge appears, never which
 * element owns which label. `pending` is live because the reader can type a
 * label while later batches are still queued; a badge minted after that point
 * must open in the prefix the round currently shows.
 */
interface ProgressiveRound {
  readonly hints: readonly Hint[];
  readonly bounds: OverlayViewport;
  readonly clock: FrameClock | undefined;
  readonly budgetMs: number;
  readonly minBatch: number;
  readonly maxBatch: number;
  pending: string;
  nextIndex: number;
  batchSize: number;
  lastInsertAt: number;
  handle: number | undefined;
  done: boolean;
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

function clampBatch(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * A measured display cadence injected by the embedding page.
 *
 * An embedding page that measures the display cadence can publish it here;
 * reading it per activation lets one page measure tiers at different cadences.
 * Ordinary pages leave it unset and get the 60Hz default, so seven milliseconds
 * is never a property of the plugin itself.
 */
function environmentFrameBudget(): number | undefined {
  const host = globalThis as typeof globalThis & { __DSH_JUMP_FRAME_BUDGET_MS__?: unknown };
  const value = host.__DSH_JUMP_FRAME_BUDGET_MS__;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function createOverlay(deps: OverlayDeps = {}): Overlay {
  const doc = deps.doc ?? globalThis.document;
  const viewport =
    deps.viewport ?? (() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }));
  const clock = deps.clock ?? defaultClock(doc);
  let container: HTMLElement | undefined;
  /** Badges of the current round; labels are unique within a round. */
  let badges = new Map<string, Badge>();
  let progressive: ProgressiveRound | undefined;

  function ensureContainer(): HTMLElement {
    if (container !== undefined) return container;
    const el = doc.createElement("div");
    el.dataset.dshJumpOverlay = "";
    // Max int z-index plus pointer-events:none: the overlay floats above every
    // normally-painted element while never stealing the hover or click it is
    // labeling. The UA's closed-popover box is neutralized explicitly: without
    // these resets `showPopover()` would bring margin, border, padding and an
    // opaque background with it.
    el.style.cssText =
      "position:fixed;inset:0;margin:0;padding:0;border:0;background:transparent;overflow:visible;" +
      "z-index:2147483647;pointer-events:none";
    doc.documentElement.append(el);
    container = el;
    raiseTopLayer(el);
    return el;
  }

  /**
   * Put the overlay on the top layer as a manual popover.
   *
   * z-index cannot reach past the top layer: a card opened with `showPopover()`
   * or `showModal()` paints above every normal element no matter how large its
   * z-index is, and the badge minted for its button ends up hidden behind the
   * card. Showing the overlay itself as a popover puts it on the same layer;
   * because it is shown after the card, it lands on top. `manual` keeps it out
   * of light-dismiss and Escape handling, which belong to the jump round.
   *
   * The attribute is only kept when the browser actually opened the popover.
   * A closed `[popover]` is `display:none` in the UA sheet, so leaving the
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

  /** One painted run of label text, tagged so the split can be styled by part. */
  function segment(part: string, text: string, weight?: string): HTMLElement {
    const el = doc.createElement("span");
    el.dataset.jumpPart = part;
    el.textContent = text;
    if (weight !== undefined) el.style.fontWeight = weight;
    return el;
  }

  /**
   * The badge text of one hint. The typed prefix splits the label into the
   * letters already typed and the ones left behind; an empty prefix, which is
   * also what a ruled-out label gets, stays one run so the badge keeps reading
   * as whole.
   */
  function segments(hint: Hint, typed: string): HTMLElement[] {
    if (typed === "") return [segment("whole", hint.label)];
    // Weight, not colour, marks the hand-off: dimming already means "ruled out"
    // and must stay reserved for badges the prefix cannot reach.
    return [
      segment("typed", typed, "700"),
      segment("rest", hint.label.slice(typed.length), "400"),
    ];
  }

  /**
   * Build one badge: node, static look, clamped position and the text for the
   * prefix that is current when the round opens. Doing the first paint here
   * keeps a round's cost to one append per badge — the same nodes are then
   * only re-segmented on the strokes that actually change them.
   */
  function mint(hint: Hint, bounds: OverlayViewport, pending: string): Badge {
    const el = doc.createElement("div");
    el.dataset.jumpLabel = hint.label;
    // A hint at the viewport edge still needs its badge on screen, so the
    // badge box (not the hint) is clamped into the viewport.
    const x = Math.min(Math.max(hint.rect.x, 0), Math.max(bounds.width - BADGE_W, 0));
    const y = Math.min(Math.max(hint.rect.y, 0), Math.max(bounds.height - BADGE_H, 0));
    const matched = hint.label.startsWith(pending);
    el.style.cssText =
      "position:absolute;left:" + String(Math.round(x)) + "px;top:" + String(Math.round(y)) + "px;" +
      "padding:1px 3px;background:#ffd60a;color:#000;border-radius:3px;" +
      "font:11px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;" +
      "opacity:" + (matched ? "1" : "0.3");
    el.append(...segments(hint, matched ? pending : ""));
    // The rendered form, not the live prefix: an unmatched badge paints whole
    // even when the round was minted under a non-empty prefix.
    return { element: el, target: hint.element, matched, drawn: matched ? pending : "" };
  }

  /**
   * Bring one badge up to the current prefix.
   *
   * One answer drives both the split and the light: a label the prefix still
   * reaches keeps its typed run and stays lit, otherwise it is one whole run
   * and goes dim.
   */
  function paint(badge: Badge, hint: Hint, pending: string): void {
    const matched = hint.label.startsWith(pending);
    // The text is a function of the prefix only while the badge is lit; a dim
    // badge always shows one whole run. Comparing this form instead of the raw
    // prefix is what keeps the first stroke from rebuilding hundreds of spans
    // that would come out identical.
    const drawn = matched ? pending : "";
    const flips = badge.matched !== matched;
    const textChanged = badge.drawn !== drawn;
    if (!flips && !textChanged) return;
    badge.matched = matched;
    badge.drawn = drawn;
    // While the badge stays lit the opacity is already 1; only the split moves.
    if (flips) badge.element.style.opacity = matched ? "1" : "0.3";
    // Crossing the lit/dim line with the same whole-label run is an opacity
    // write only; the children are still the nodes the reader sees.
    if (textChanged) badge.element.replaceChildren(...segments(hint, drawn));
  }

  /**
   * Whether `hints` is the round the badges already hold.
   *
   * Keyed on both label and target: a fresh round can hand the same label to a
   * different element, and rendering that in place would leave the badge over
   * the old target. Length equality alone is not enough either, since labels
   * are unique within a round.
   */
  function sameRound(hints: readonly Hint[]): boolean {
    if (badges.size !== hints.length) return false;
    return hints.every((hint) => badges.get(hint.label)?.target === hint.element);
  }

  function removeContainer(): void {
    const el = container as (HTMLElement & { hidePopover?: () => void }) | undefined;
    if (el !== undefined && typeof el.hidePopover === "function") {
      // Leaves the top layer before the node goes away; a detached popover
      // would otherwise stay registered until the browser cleans it up.
      try {
        el.hidePopover();
      } catch {
        // Already closed or unsupported: removing the node is enough.
      }
    }
    el?.remove();
    container = undefined;
  }

  /**
   * Stop the queued batch of the live round.
   *
   * The round is dropped before the handle is cancelled so a callback that
   * already left the scheduler's queue still sees that it no longer owns the
   * overlay and inserts nothing.
   */
  function cancelProgressive(): void {
    const round = progressive;
    if (round === undefined) return;
    progressive = undefined;
    if (round.handle !== undefined) round.clock?.cancel(round.handle);
  }

  /**
   * Batch size for the next frame from the gap the previous batch took.
   *
   * The gap is the only signal a page gets for how much style and layout work a
   * batch really caused. Growth stays multiplicative and bounded: a fast frame
   * grows the next batch until the ceiling, a missed budget halves it until the
   * floor, and the min keeps a slow page from degenerating to one badge per
   * frame.
   */
  function nextBatchSize(round: ProgressiveRound, elapsed: number): number {
    let next = round.batchSize;
    if (elapsed < round.budgetMs * GROW_UNDER_BUDGET) next = Math.ceil(round.batchSize * GROWTH_FACTOR);
    else if (elapsed > round.budgetMs) next = Math.floor(round.batchSize / SHRINK_DIVISOR);
    return clampBatch(next, round.minBatch, round.maxBatch);
  }

  /** Append the next slice of the round in one DOM write. */
  function insertBatch(round: ProgressiveRound, count: number): void {
    const root = ensureContainer();
    const end = Math.min(round.nextIndex + count, round.hints.length);
    const nodes: HTMLElement[] = [];
    for (let index = round.nextIndex; index < end; index += 1) {
      const hint = round.hints[index];
      if (hint === undefined) break;
      const badge = mint(hint, round.bounds, round.pending);
      badges.set(hint.label, badge);
      nodes.push(badge.element);
    }
    round.nextIndex = end;
    round.lastInsertAt = round.clock?.now() ?? 0;
    if (nodes.length > 0) root.append(...nodes);
    round.done = round.nextIndex >= round.hints.length;
  }

  function scheduleBatch(round: ProgressiveRound): void {
    const frameClock = round.clock;
    if (frameClock === undefined) return;
    round.handle = frameClock.request((time) => {
      round.handle = undefined;
      if (progressive !== round) return;
      // The frame timestamp can predate the end of the previous insertion when
      // that batch overran its frame. Reading that as a negative gap would grow
      // the next batch exactly when the page is behind; treat it as a miss.
      const elapsed = time >= round.lastInsertAt ? time - round.lastInsertAt : Number.POSITIVE_INFINITY;
      round.batchSize = nextBatchSize(round, elapsed);
      insertBatch(round, round.batchSize);
      if (!round.done) scheduleBatch(round);
    });
  }

  function startProgressive(
    hints: readonly Hint[],
    pending: string,
    options: ProgressiveOptions,
  ): ProgressiveRender {
    cancelProgressive();
    const root = ensureContainer();
    root.replaceChildren();
    badges = new Map();
    const minBatch = Math.max(1, Math.round(options.minBatch ?? MIN_BATCH));
    const maxBatch = Math.max(minBatch, Math.round(options.maxBatch ?? MAX_BATCH));
    const initial = clampBatch(options.initialBatch ?? DEFAULT_INITIAL_BATCH, minBatch, maxBatch);
    const round: ProgressiveRound = {
      hints,
      bounds: viewport(),
      clock,
      budgetMs:
        options.frameBudgetMs !== undefined && options.frameBudgetMs > 0
          ? options.frameBudgetMs
          : (environmentFrameBudget() ?? DEFAULT_FRAME_BUDGET_MS),
      minBatch,
      maxBatch,
      pending,
      nextIndex: 0,
      batchSize: initial,
      lastInsertAt: 0,
      handle: undefined,
      done: hints.length === 0,
    };
    progressive = round;
    if (hints.length > 0) {
      if (round.clock === undefined) {
        // No frame scheduler (jsdom, an exotic host): correctness outranks
        // pacing, so the whole round lands in this frame like the synchronous
        // path. A real browser always has requestAnimationFrame.
        insertBatch(round, hints.length);
      } else {
        insertBatch(round, Math.min(initial, hints.length));
        if (!round.done) scheduleBatch(round);
      }
    }
    return {
      cancel: () => {
        if (progressive !== round) return;
        cancelProgressive();
        badges = new Map();
        removeContainer();
      },
    };
  }

  return {
    render(hints: readonly Hint[], pending = ""): void {
      // A prefix stroke during progressive insertion must not pull the queued
      // batches forward: it repaints what is already on screen and every later
      // batch opens in the prefix the round has reached.
      if (progressive !== undefined && progressive.hints === hints) {
        progressive.pending = pending;
        for (const hint of hints) {
          const badge = badges.get(hint.label);
          if (badge !== undefined) paint(badge, hint, pending);
        }
        return;
      }
      cancelProgressive();
      const root = ensureContainer();
      if (!sameRound(hints)) {
        const bounds = viewport();
        const next = new Map<string, Badge>();
        const nodes: HTMLElement[] = [];
        for (const hint of hints) {
          const badge = mint(hint, bounds, pending);
          next.set(hint.label, badge);
          nodes.push(badge.element);
        }
        badges = next;
        root.replaceChildren(...nodes);
      }
      for (const hint of hints) {
        const badge = badges.get(hint.label);
        // sameRound already proved every label is present; the guard keeps the
        // loop honest under a future caller that renders a partial list.
        if (badge !== undefined) paint(badge, hint, pending);
      }
    },
    renderProgressive(hints, pending = "", options = {}): ProgressiveRender {
      return startProgressive(hints, pending, options);
    },
    destroy(): void {
      cancelProgressive();
      badges = new Map();
      removeContainer();
    },
  };
}
