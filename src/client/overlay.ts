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
 * only inserted when the test says a frame happened. `now` and the callback
 * timestamp are two different clocks: `now` measures work inside a batch,
 * while the timestamp says when the frame started.
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
  /**
   * Resolves when every badge of the round is in the DOM, or when the round is
   * cancelled. Callers that must read or measure a complete round wait here
   * instead of guessing a frame count.
   */
  done: Promise<void>;
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
  /** Explicit display budget; when set the sampler never runs. */
  frameBudgetMs?: number;
  /**
   * Sampler seam. Browsers sample requestAnimationFrame; tests wrap this to
   * count runs, and an embedding page may replace it outright.
   */
  frameBudgetSampler?: (deps: FrameBudgetSamplerDeps) => Promise<FrameBudgetSample>;
}

/** Badge box estimate for clamping; hint rects are target-sized, not badge-sized. */
const BADGE_W = 24;
const BADGE_H = 16;

/**
 * The 60Hz frame budget. Batches are stated at this cadence and scaled by the
 * ratio of the measured budget to it; it is also the fallback when the display
 * cannot be measured (hidden page, no requestAnimationFrame, too few samples).
 */
const DEFAULT_FRAME_BUDGET_MS = 16.7;
/** Median of this many frame intervals: about two seconds at 60Hz. */
const FRAME_BUDGET_SAMPLES = 120;
/** Fewer usable intervals cannot outvote a janky start, so keep the fallback. */
const MIN_FRAME_BUDGET_SAMPLES = 8;
/** Batch sizes at the 60Hz budget; every display scales them by budget / 16.7. */
const BASE_INITIAL_BATCH = 32;
const BASE_MIN_BATCH = 8;
const BASE_MAX_BATCH = 256;
/** Absolute floor: a 240Hz panel must not decay to one badge per frame. */
const MIN_BATCH_FLOOR = 4;
/** Absolute ceiling: a very slow budget must not insert the whole round at once. */
const MAX_BATCH_CEILING = 256;
/** Below this share of the budget the next batch may grow. */
const GROW_UNDER_BUDGET = 0.5;
/**
 * A frame gap this many times the measured cadence is a missed vsync, not
 * clock jitter: on a 7ms display the next real slot is about 14ms, so half a
 * millisecond of noise must not push the controller into shrinking forever.
 */
const MISSED_VSYNC_FACTOR = 1.5;
const GROWTH_FACTOR = 1.5;
const SHRINK_DIVISOR = 2;
/**
 * Frames between layout probes once the batch size has settled. Forced layout
 * is real work, so a stable size is only re-probed occasionally; a size change
 * is always probed because the cost of that size is unknown.
 */
const PROBE_INTERVAL = 8;

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
  /** False while the budget is the unmeasured 60Hz fallback. */
  readonly growAllowed: boolean;
  pending: string;
  nextIndex: number;
  batchSize: number;
  /** Timestamp of the previous animation frame, for the missed-vsync signal. */
  lastFrameAt: number;
  /** Cost of the last probed batch, measured inside its own frame. */
  batchCostMs: number;
  /** Size of the batch `batchCostMs` describes; -1 before the first probe. */
  probedBatchSize: number;
  /** Inserted frames since the last layout probe. */
  framesSinceProbe: number;
  handle: number | undefined;
  done: boolean;
  settle: () => void;
  settled: boolean;
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
 * One batch scaled from its 60Hz baseline: base × (budget / 16.7).
 *
 * The floor stays absolute rather than proportional, so a fast display still
 * inserts a few badges per frame instead of one; the ceiling caps how much a
 * very slow budget can put into a single frame.
 */
function scaleBatch(base: number, budgetMs: number, floor: number, ceiling: number): number {
  return clampBatch(base * (budgetMs / DEFAULT_FRAME_BUDGET_MS), floor, ceiling);
}

/**
 * A display cadence published by the embedding page, overriding the sampler.
 *
 * Bench pages measure each tier themselves and publish the result here; a
 * normal page leaves it unset and the overlay samples its own display once.
 */
function environmentFrameBudget(): number | undefined {
  const host = globalThis as typeof globalThis & { __DSH_JUMP_FRAME_BUDGET_MS__?: unknown };
  const value = host.__DSH_JUMP_FRAME_BUDGET_MS__;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export interface FrameBudgetSample {
  /** Budget to use for the coming activation. */
  budgetMs: number;
  /**
   * Whether the value came from enough visible frame intervals.
   *
   * A fallback is not a measurement: the overlay retries on a later activation
   * once the page is visible again.
   */
  measured: boolean;
}

export interface FrameBudgetSamplerDeps {
  doc?: Document;
  clock?: FrameClock;
  /** Intervals to sample; tests shorten the wait. */
  samples?: number;
}

function medianOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/**
 * Median frame interval of the display, rounded up to 0.1ms.
 *
 * The median ignores one-off hitches; rounding up keeps a 6.999ms cadence from
 * being filed just under 7ms and marking every frame as over budget. Never
 * rejects: a hidden page (background tabs are throttled to seconds), a host
 * without requestAnimationFrame, or a sample interrupted by either resolves to
 * the 60Hz fallback with `measured: false`.
 */
export function sampleFrameBudget(deps: FrameBudgetSamplerDeps = {}): Promise<FrameBudgetSample> {
  const doc = deps.doc ?? globalThis.document;
  const clock = deps.clock ?? defaultClock(doc);
  const wanted = Math.max(
    MIN_FRAME_BUDGET_SAMPLES,
    Math.round(deps.samples ?? FRAME_BUDGET_SAMPLES),
  );
  const fallback = (): FrameBudgetSample => ({
    budgetMs: DEFAULT_FRAME_BUDGET_MS,
    measured: false,
  });
  if (clock === undefined || doc.hidden) return Promise.resolve(fallback());
  return new Promise((resolve) => {
    const intervals: number[] = [];
    // A host whose timestamps never produce a usable gap must still degrade to
    // the fallback instead of keeping a frame callback alive forever.
    const maxTicks = wanted * 4;
    let ticks = 0;
    let previous: number | undefined;
    const tick = (time: number): void => {
      ticks += 1;
      // A tab that went to the background mid-sample reports throttled gaps;
      // stop instead of caching a budget the display never had.
      if (doc.hidden) {
        resolve(fallback());
        return;
      }
      if (previous !== undefined) {
        const gap = time - previous;
        if (Number.isFinite(gap) && gap > 0) intervals.push(gap);
      }
      previous = time;
      if (intervals.length >= wanted) {
        const median = medianOf(intervals);
        resolve(
          median === undefined
            ? fallback()
            : { budgetMs: Math.ceil(median * 10 - 1e-9) / 10, measured: true },
        );
        return;
      }
      if (ticks >= maxTicks) {
        resolve(fallback());
        return;
      }
      try {
        clock.request(tick);
      } catch {
        resolve(fallback());
      }
    };
    try {
      clock.request(tick);
    } catch {
      resolve(fallback());
    }
  });
}

function isUsableBudget(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function sameViewport(a: OverlayViewport, b: OverlayViewport): boolean {
  return a.width === b.width && a.height === b.height;
}

export function createOverlay(deps: OverlayDeps = {}): Overlay {
  const doc = deps.doc ?? globalThis.document;
  const viewport =
    deps.viewport ?? (() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }));
  const clock = deps.clock ?? defaultClock(doc);
  const fixedBudgetMs = deps.frameBudgetMs;
  const sampler = deps.frameBudgetSampler ?? sampleFrameBudget;
  let container: HTMLElement | undefined;
  /** Badges of the current round; labels are unique within a round. */
  let badges = new Map<string, Badge>();
  let progressive: ProgressiveRound | undefined;
  /** Last successful display sample, kept until the viewport changes. */
  let measuredBudgetMs: number | undefined;
  let measuredViewport: OverlayViewport | undefined;
  let sampling = false;
  let samplingViewport: OverlayViewport | undefined;
  // One sample per overlay, started here rather than at the first activation:
  // a 120-frame sample cannot finish inside the activation it would otherwise
  // be measuring, so that whole first round would run on the fallback. The
  // probe is a single callback per frame and never repeats.
  if (!isUsableBudget(fixedBudgetMs)) startBudgetSampling();

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

  /**
   * Start the one display sample this overlay gets, if frames exist and the
   * page is in front. A hidden page would only report throttled gaps.
   */
  function startBudgetSampling(): void {
    if (sampling || clock === undefined || doc.hidden) return;
    sampling = true;
    samplingViewport = viewport();
    void sampler({ doc, clock })
      .then((sample) => {
        sampling = false;
        if (!sample.measured) return;
        measuredBudgetMs = sample.budgetMs;
        measuredViewport = samplingViewport;
      })
      .catch(() => {
        sampling = false;
      });
  }

  /**
   * The frame budget for an activation starting now.
   *
   * Precedence: the caller's explicit value, the overlay's fixed value, the
   * embedding page's published measurement, the cached display sample, then
   * 60Hz. `measured` is false only for that last case: the batch controller
   * must stay conservative until a real cadence exists, because a 143Hz page
   * running on the 60Hz fallback would otherwise read every frame as far under
   * budget and grow the batch until the ceiling.
   *
   * Cache invalidation: a successful sample survives visibility changes because
   * the panel did not change, only whether its page is frontmost; re-measuring
   * on every tab switch would collect the same cadence again. A viewport resize
   * does invalidate, because switching display modes or external monitors can
   * change the refresh rate under the same window. The old value still serves
   * the round that starts now; the fresh sample lands for the next one.
   */
  function budgetForActivation(override: number | undefined): {
    budgetMs: number;
    measured: boolean;
  } {
    if (isUsableBudget(override)) return { budgetMs: override, measured: true };
    if (isUsableBudget(fixedBudgetMs)) return { budgetMs: fixedBudgetMs, measured: true };
    const published = environmentFrameBudget();
    if (published !== undefined) return { budgetMs: published, measured: true };
    if (doc.hidden) return { budgetMs: DEFAULT_FRAME_BUDGET_MS, measured: false };
    const current = viewport();
    if (measuredBudgetMs !== undefined) {
      if (measuredViewport === undefined || sameViewport(measuredViewport, current)) {
        return { budgetMs: measuredBudgetMs, measured: true };
      }
      startBudgetSampling();
      return { budgetMs: measuredBudgetMs, measured: true };
    }
    startBudgetSampling();
    return { budgetMs: DEFAULT_FRAME_BUDGET_MS, measured: false };
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
    if (!round.settled) {
      round.settled = true;
      round.settle();
    }
  }

  /**
   * Batch size for the next frame from two independent signals.
   *
   * `batchCostMs` is the work this round's last probed batch really did inside
   * its own frame (DOM write plus forced layout), so growth answers the cost
   * that has to fit in a frame. `elapsed` is the gap between animation-frame
   * timestamps, which answers a different question: did the page miss a vsync?
   * A miss shrinks even when the measured batch looked cheap, because paint
   * work is not inside the measurement. Once the batch size settles, probes
   * are periodic rather than every frame: forced layout is real work, and
   * paying it on every stable frame would change the profile being measured.
   */
  function nextBatchSize(round: ProgressiveRound, elapsed: number): number {
    let next = round.batchSize;
    const missedFrame = elapsed > round.budgetMs * MISSED_VSYNC_FACTOR;
    const overCost = round.batchCostMs > round.budgetMs;
    if (missedFrame || overCost) {
      next = Math.floor(round.batchSize / SHRINK_DIVISOR);
    } else if (round.growAllowed && round.batchCostMs < round.budgetMs * GROW_UNDER_BUDGET) {
      next = Math.ceil(round.batchSize * GROWTH_FACTOR);
    }
    return clampBatch(next, round.minBatch, round.maxBatch);
  }

  /**
   * Append the next slice of the round in one DOM write.
   *
   * The cost is timed around this batch's own DOM work, never against the next
   * frame timestamp: rAF timestamps are frame starts, so their difference is
   * the vsync period and says nothing about how long this batch took. A probe
   * batch also reads one inserted badge's `offsetHeight` before stopping the
   * clock, which forces the style and layout that would otherwise be paid at
   * paint time. Without that flush the controller would only see node creation
   * and would keep growing a batch whose real cost is layout.
   */
  function insertBatch(round: ProgressiveRound, count: number, probe: boolean): void {
    const root = ensureContainer();
    const startedAt = round.clock?.now() ?? 0;
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
    if (nodes.length > 0) root.append(...nodes);
    if (probe && round.clock !== undefined) {
      const last = nodes[nodes.length - 1];
      if (last !== undefined) void last.offsetHeight;
      round.batchCostMs = Math.max(0, round.clock.now() - startedAt);
      round.probedBatchSize = nodes.length;
      round.framesSinceProbe = 0;
    } else {
      round.framesSinceProbe += 1;
    }
    round.done = round.nextIndex >= round.hints.length;
    if (round.done && !round.settled) {
      round.settled = true;
      round.settle();
    }
  }

  function scheduleBatch(round: ProgressiveRound): void {
    const frameClock = round.clock;
    if (frameClock === undefined) return;
    round.handle = frameClock.request((time) => {
      round.handle = undefined;
      if (progressive !== round) return;
      // A frame timestamp that predates the previous one means the clock ran
      // backwards; reading that as a negative gap would grow the next batch
      // exactly when the page is behind, so treat it as a miss.
      const elapsed = time >= round.lastFrameAt ? time - round.lastFrameAt : Number.POSITIVE_INFINITY;
      round.lastFrameAt = time;
      const next = nextBatchSize(round, elapsed);
      const probe =
        next !== round.probedBatchSize || round.framesSinceProbe >= PROBE_INTERVAL;
      round.batchSize = next;
      insertBatch(round, next, probe);
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
    const activationBudget = budgetForActivation(options.frameBudgetMs);
    const budgetMs = activationBudget.budgetMs;
    // One batch is sized from its 60Hz baseline by budget / 16.7. Explicit
    // options stay literal; the floor and ceiling are absolute so neither a
    // 240Hz panel nor a very slow one degenerates the batching.
    const minBatch =
      options.minBatch !== undefined
        ? Math.max(1, Math.round(options.minBatch))
        : scaleBatch(BASE_MIN_BATCH, budgetMs, MIN_BATCH_FLOOR, BASE_MAX_BATCH);
    const maxBatch =
      options.maxBatch !== undefined
        ? Math.max(minBatch, Math.round(options.maxBatch))
        : Math.max(
            minBatch,
            scaleBatch(BASE_MAX_BATCH, budgetMs, MIN_BATCH_FLOOR, MAX_BATCH_CEILING),
          );
    // Before the display is measured the 60Hz fallback cannot describe a
    // 143Hz page: every real frame looks far under budget and growth runs to
    // the ceiling in the first activation, which is exactly the common
    // "load the page, press Cmd+H immediately" case. Start at twice the floor
    // and only allow shrinking until a real cadence exists. An explicit initial
    // batch is ignored here for the same reason: the caller is describing a
    // budget it knows, and this branch is the one where no budget is known yet.
    const initial = activationBudget.measured
      ? options.initialBatch !== undefined
        ? clampBatch(options.initialBatch, 1, maxBatch)
        : clampBatch(
            scaleBatch(BASE_INITIAL_BATCH, budgetMs, MIN_BATCH_FLOOR, BASE_MAX_BATCH),
            minBatch,
            maxBatch,
          )
      : clampBatch(minBatch * 2, minBatch, maxBatch);
    let settle: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const round: ProgressiveRound = {
      hints,
      bounds: viewport(),
      clock,
      budgetMs,
      minBatch,
      maxBatch,
      growAllowed: activationBudget.measured,
      pending,
      nextIndex: 0,
      batchSize: initial,
      lastFrameAt: clock?.now() ?? 0,
      batchCostMs: 0,
      probedBatchSize: -1,
      framesSinceProbe: 0,
      handle: undefined,
      done: hints.length === 0,
      settle,
      settled: false,
    };
    progressive = round;
    if (hints.length > 0) {
      if (round.clock === undefined) {
        // No frame scheduler (jsdom, an exotic host): correctness outranks
        // pacing, so the whole round lands in this frame like the synchronous
        // path. A real browser always has requestAnimationFrame.
        insertBatch(round, hints.length, false);
      } else {
        insertBatch(round, Math.min(initial, hints.length), true);
        if (!round.done) scheduleBatch(round);
      }
    } else {
      round.settled = true;
      settle();
    }
    return {
      done,
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
