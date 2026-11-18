/**
 * Client wiring: folds real KeyboardEvents through matchKey and owns every DOM
 * side effect, so the state machine stays pure and realm-agnostic.
 *
 * The keydown listener is capture-phase and eats every stroke it owns with
 * preventDefault plus stopPropagation: dsh-vscode-keyboard listens on window
 * bubble and forwards keydowns whose defaultPrevented is false, so an
 * unconsumed Cmd+H/Cmd+U or label stroke would leak into the embedded VS Code
 * keybindings.
 */
import {
  createDefaultBindings,
  detectPlatform,
  firesInTextEntry,
  matchesBinding,
  type JumpBindings,
  type JumpPlatform,
} from "./bindings.ts";
import { createHintScan, type Hint, type HintScan } from "./hints.ts";
import { createLabelMemory } from "./identity.ts";
import { createKeyState, matchKey, type KeyEventLike } from "./keys.ts";
import { DEFAULT_CONFIG, HOME_ROW_KEYS, type JumpConfig } from "./config.ts";
import { createOverlay, type FrameClock } from "./overlay.ts";
import { activationOf, isTextEntry } from "./target.ts";
import { isUserReachable } from "./reach.ts";

/** 测试桩是 jsdom 的 window，监听签名不能比它更窄。 */
type JumpListen = (type: string, listener: (event: Event) => void, options?: { capture?: boolean }) => void;

export interface JumpWindow {
  document: Document;
  innerWidth: number;
  innerHeight: number;
  dispatchEvent(event: Event): boolean;
  addEventListener: JumpListen;
  removeEventListener: JumpListen;
}

/**
 * The activation chords, as a live source rather than a fixed value.
 *
 * The reader can remap them from the settings page at any time while the
 * listener stays installed for the page's lifetime, so the chords are read at
 * match time instead of being captured at mount.
 */
export interface BindingSource {
  get(): JumpBindings;
}

export interface AppDeps {
  /** Host window; defaults to the browser global, injected under jsdom. */
  window?: JumpWindow;
  config?: JumpConfig;
  /** Activation chords; defaults to the platform keymap, fixed for the page. */
  bindings?: BindingSource;
  /** Modifier family, injected by tests; browsers read the navigator. */
  platform?: JumpPlatform;
  /** Visibility oracle injected by tests; browsers get the default below. */
  isVisible?: (element: Element) => boolean;
  /**
   * Told when a label round opens and when it closes.
   *
   * The page cannot change the system input source itself. The runtime turns
   * these two moments into a request the host process can act on. Absent in
   * tests that do not care, and a no-op must not change navigation.
   */
  onRound?: (phase: "begin" | "end") => void;
  /**
   * What reference mode does with the picked element.
   *
   * Injected rather than imported so the DOM layer stays free of the composer:
   * this callback writes into the session's draft, which is a different surface
   * with its own failure modes.
   */
  onReference?: (element: Element) => void;
  /**
   * Frame clock for the oversized-round fallback.
   *
   * Browsers read the document's own requestAnimationFrame; tests inject a
   * stepper so a frame only lands when the test advances it. Rounds below the
   * synchronous limit never ask for a frame.
   */
  frameClock?: FrameClock;
  /**
   * Display frame budget in ms, injected by a bench or a test.
   *
   * A normal page leaves it unset: the app samples its own display, and the
   * embedding page may publish a measurement instead (the bench measures each
   * tier and exposes it as `__DSH_JUMP_FRAME_BUDGET_MS__`). Either source
   * outranks the sample and stops it from running.
   */
  frameBudgetMs?: number;
  /**
   * Starts the display sample outside the load path.
   *
   * Browsers get requestIdleCallback, or setTimeout(…, 0) where it is absent;
   * tests inject a queue so the sample only begins when they release it.
   */
  idleScheduler?: (run: () => void) => void;
}

export interface JumpApp {
  /** Mount the window listener. Returns the symmetric teardown. */
  apply(): () => void;
  /**
   * Resolves when every badge of the current round is painted.
   *
   * The synchronous path resolves immediately; only an oversized round that
   * falls back to frames makes the caller wait. A bench or a host that wants a
   * complete round waits here instead of guessing a frame count.
   */
  settled(): Promise<void>;
  /** Every label of the current round, in hint order. */
  labels(): readonly string[];
  /** Labels already painted; equal to `labels()` once the round settles. */
  visibleLabels(): readonly string[];
}

function defaultIsVisible(element: Element): boolean {
  const el = element as HTMLElement;
  let rendered: boolean;
  if (typeof el.checkVisibility === "function") rendered = el.checkVisibility();
  else {
    // offsetParent is also null for position:fixed, which stays clickable.
    const view = el.ownerDocument?.defaultView;
    rendered = el.offsetParent !== null || view?.getComputedStyle(el).position === "fixed";
  }
  // Rendered but unreachable (aria-hidden / inert / pointer-events:none up the
  // chain) is the stacked-background-card shape: a label there would send the
  // synthetic click to a button no user can see or hit.
  return rendered && isUserReachable(element);
}

/**
 * The 60Hz fallback for a page that publishes no display budget.
 *
 * A hidden page, a host without requestAnimationFrame and a first activation
 * before any measurement all land here; the collection chunk is still capped
 * to a fraction of a frame, so a wrong guess only makes the walk slower, never
 * longer than the budget.
 */
const FALLBACK_FRAME_BUDGET_MS = 16.7;
/**
 * Frames one display sample needs.
 *
 * The sample answers one question: how often does this display present? 24
 * frames is about 170ms at 143Hz and 400ms at 60Hz, short enough that a reader
 * who activates right after load usually gets the measured value, and long
 * enough that the median outvotes a janky first frame. The previous sampler
 * asked for 120 frames, which kept a page that never activates paying for two
 * seconds of animation frames.
 */
const FRAME_BUDGET_SAMPLE_FRAMES = 24;
/** A median below this is a timer or a burst, not a display cadence. */
const MIN_SAMPLE_FRAME_BUDGET_MS = 4;
/** A median above this is a throttled or backgrounded page. */
const MAX_SAMPLE_FRAME_BUDGET_MS = 40;
/**
 * Frame budget assumed while the display cadence is still unknown.
 *
 * The sample takes a few hundred milliseconds, and a reader can activate
 * inside that window. Falling back to 16.7ms there is the bug the sample exists
 * to prevent: on a 143Hz panel it hands the walk twice the real frame, so the
 * slice grows exactly when it must stay small. Assuming an 8ms display keeps
 * the slice under 1ms, smaller than any 16.7ms-derived slice; a panel faster
 * than 125Hz pays a slightly larger slice for that one round and gets the
 * measured value as soon as the sample lands. A short slice only costs a few
 * more animation frames, a long one costs dropped frames the reader sees.
 */
const CONSERVATIVE_FRAME_BUDGET_MS = Math.min(FALLBACK_FRAME_BUDGET_MS, 8);

/**
 * Share of a display frame the collection walk may spend.
 *
 * The activation frame also has to paint the first badges and leave room for
 * the host. At the measured 143Hz cadence this is about 0.8ms, at 60Hz the
 * absolute cap keeps it at 1.5ms; both are inside the 1-2ms target.
 */
const COLLECT_BUDGET_SHARE = 0.12;
const COLLECT_BUDGET_MAX_MS = 1.5;
const COLLECT_BUDGET_MIN_MS = 0.4;
/**
 * Home-row strokes kept while stage A is walking.
 *
 * Four is more than the three strokes even a three-key label needs and short
 * enough that a burst of dead-end typing cannot turn into a backlog the reader
 * never meant to send. Older strokes fall off first: the newest ones are the
 * ones aimed at the labels about to appear.
 */
const BUFFERED_KEY_LIMIT = 4;

/** The display cadence the embedding page publishes, or undefined. */
function publishedFrameBudget(): number | undefined {
  const host = globalThis as typeof globalThis & { __DSH_JUMP_FRAME_BUDGET_MS__?: unknown };
  const value = host.__DSH_JUMP_FRAME_BUDGET_MS__;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function collectBudgetMs(frameBudget: number): number {
  return Math.min(Math.max(frameBudget * COLLECT_BUDGET_SHARE, COLLECT_BUDGET_MIN_MS), COLLECT_BUDGET_MAX_MS);
}

function medianOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/**
 * One display sample, cancellable.
 *
 * The promise answers the budget to cache: a number is a decision (the rounded
 * median, or the 60Hz fallback when the sample is unusable), while undefined
 * means the sample was abandoned because the page went away, so the caller
 * should try again later rather than cache anything.
 */
interface FrameBudgetSample {
  done: Promise<number | undefined>;
  cancel(): void;
}

/**
 * Sample the display cadence across {@link FRAME_BUDGET_SAMPLE_FRAMES} frames.
 *
 * A hidden page or a cancelled sample resolves undefined: background tabs
 * report seconds between frames, and that is not a cadence the panel ever had.
 * A median outside 4-40ms is treated as the 60Hz fallback rather than trusted;
 * a 2ms median is a burst of two callbacks in one vsync, and 60ms is a
 * throttled timer. Never rejects: the caller needs a budget, not an error.
 */
function startFrameBudgetSample(clock: FrameClock, doc: Document): FrameBudgetSample {
  const intervals: number[] = [];
  let previous: number | undefined;
  let frames = 0;
  let handle: number | undefined;
  let finished = false;
  let resolve: (budgetMs: number | undefined) => void = () => undefined;
  const done = new Promise<number | undefined>((accept) => {
    resolve = accept;
  });
  const finish = (budgetMs: number | undefined): void => {
    if (finished) return;
    finished = true;
    resolve(budgetMs);
  };
  const tick = (time: number): void => {
    handle = undefined;
    if (finished) return;
    if (doc.hidden) {
      finish(undefined);
      return;
    }
    frames += 1;
    if (previous !== undefined) {
      const gap = time - previous;
      if (Number.isFinite(gap) && gap > 0) intervals.push(gap);
    }
    previous = time;
    if (frames >= FRAME_BUDGET_SAMPLE_FRAMES) {
      const median = medianOf(intervals);
      if (
        median === undefined ||
        median < MIN_SAMPLE_FRAME_BUDGET_MS ||
        median > MAX_SAMPLE_FRAME_BUDGET_MS
      ) {
        finish(FALLBACK_FRAME_BUDGET_MS);
        return;
      }
      // Round up so a 6.999ms cadence is not filed just under 7ms.
      finish(Math.ceil(median * 10 - 1e-9) / 10);
      return;
    }
    try {
      handle = clock.request(tick);
    } catch {
      finish(FALLBACK_FRAME_BUDGET_MS);
    }
  };
  try {
    handle = clock.request(tick);
  } catch {
    finish(FALLBACK_FRAME_BUDGET_MS);
  }
  return {
    done,
    cancel: () => {
      if (finished) return;
      finished = true;
      if (handle !== undefined) {
        clock.cancel(handle);
        handle = undefined;
      }
      resolve(undefined);
    },
  };
}

/**
 * Run `run` when the page is idle.
 *
 * requestIdleCallback is the whole point: the sample burns one animation frame
 * callback per tick, and starting it during load would put it in front of the
 * work that makes the page usable. setTimeout(…, 0) is the fallback for hosts
 * without the API, still a task after the current work rather than inline.
 */
function runWhenIdle(run: () => void): void {
  const host = globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  };
  if (typeof host.requestIdleCallback === "function") {
    // The timeout keeps a permanently busy page from never sampling at all;
    // one second is long enough that load work still goes first.
    host.requestIdleCallback(() => run(), { timeout: 1000 });
    return;
  }
  setTimeout(run, 0);
}

/** The browser's frame clock, or undefined where the host has no frames. */
function defaultFrameClock(doc: Document): FrameClock | undefined {
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

/** Click-mode dispatch: the full pointer/mouse sequence a real user produces. */
function fireClickSequence(element: Element, cx: number, cy: number): void {
  const realm = element.ownerDocument?.defaultView;
  if (realm === null || realm === undefined) return;
  // Constructors must come from the target realm: under jsdom the Node-global
  // MouseEvent does not exist, and React listeners read these coordinates.
  const mouse = (type: string, buttons: number): MouseEvent =>
    new realm.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: cx,
      clientY: cy,
      button: 0,
      buttons,
    });
  const PointerCtor = realm.PointerEvent;
  const pointer = (type: string, buttons: number): MouseEvent =>
    PointerCtor === undefined
      ? mouse(type, buttons)
      : new PointerCtor(type, {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
          button: 0,
          buttons,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        });
  element.dispatchEvent(pointer("pointerdown", 1));
  element.dispatchEvent(mouse("mousedown", 1));
  element.dispatchEvent(pointer("pointerup", 0));
  element.dispatchEvent(mouse("mouseup", 0));
  element.dispatchEvent(mouse("click", 0));
}

/**
 * Focus a text entry surface and put the caret where the user can keep typing.
 *
 * Plain `focus()` is not enough for a contenteditable host. A native text field
 * does come out with its caret at the end (measured: `<input>.focus()` leaves
 * selectionStart at the value length), but a contenteditable div leaves the
 * caret wherever the selection happened to be, which for a fresh focus is the
 * start of the content. Jumping to the composer and landing at the top of the
 * draft is the opposite of "keep writing", so the collapse is done by hand.
 *
 * The caret is only moved when the target does not already own it: if the user
 * is typing in the field and asks jump to bring them back, the offset they left
 * is theirs.
 *
 * The selection is only touched once focus is confirmed to have landed. A host
 * that claims a text-entry role but is not actually focusable (no tabindex, an
 * aria mistake) would otherwise get its whole content highlighted while the
 * real focus stayed where it was, leaving a stray blue band and no jump.
 */
function focusTextEntry(element: Element, doc: Document): void {
  const el = element as HTMLElement;
  if (typeof el.focus !== "function") return;
  // The user already typing here means the caret is where they left it.
  if (doc.activeElement === element) return;
  el.focus();
  // focus() is a silent no-op when the element cannot take focus; only a target
  // that really took it should get a caret.
  if (doc.activeElement !== element) return;
  // A native field carries its own caret and already places it at the end of
  // the value on `focus()`. It also refuses `Range` work: `selectNodeContents`
  // addresses the element rather than its text, so the range lands outside the
  // field and the next keystroke goes nowhere even though the field does hold
  // focus. Leaving the field alone is therefore the whole fix, and it equally
  // keeps a caret the user left mid-word where they left it.
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") return;
  const selection = doc.getSelection?.() ?? null;
  if (selection === null) return;
  // Collapsing to the end of the host is what makes the next keystroke append
  // instead of inserting at the top.
  const range = doc.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** One round's stage A walk, from activation to painted labels. */
interface CollectorRound {
  readonly scan: HintScan;
  handle: number | undefined;
  cancelled: boolean;
  resolve: () => void;
}

/** The navigator's platform string, or "" where the host has none. */
function navigatorPlatform(): string {
  return globalThis.navigator?.platform ?? "";
}

export function createApp(deps: AppDeps = {}): JumpApp {
  const win = deps.window ?? (globalThis as unknown as JumpWindow);
  const config: JumpConfig = { ...DEFAULT_CONFIG, ...deps.config };
  const isVisible = deps.isVisible ?? defaultIsVisible;
  const platform = deps.platform ?? detectPlatform(navigatorPlatform());
  // A caller without a store gets one fixed pair for this app's lifetime.
  const fixed = createDefaultBindings(platform);
  const bindings: BindingSource = deps.bindings ?? { get: () => fixed };
  const onRound = deps.onRound ?? (() => undefined);
  // One table for the page load: it is what lets a label stay on its element
  // across activations, and it dies with the module instance, so a reload
  // starts clean.
  const memory = createLabelMemory();
  const overlay = createOverlay({
    doc: win.document,
    viewport: () => ({ width: win.innerWidth, height: win.innerHeight }),
    clock: deps.frameClock,
  });
  /**
   * The promise of the current collection round, resolved when its badges are
   * painted or the round is cancelled. Kept outside `apply` so `settled()` can
   * answer before the listener is installed.
   */
  let roundSettled: Promise<void> = Promise.resolve();

  /**
   * Drop whatever currently holds focus before a round starts.
   *
   * A focused composer keeps an IME composition open, so the next letter would
   * belong to the input method instead of a label. Blurring first makes the
   * chord work from a text field the same way it works from a button. The
   * document element and a missing blur are both left alone.
   */
  function releaseFocus(): void {
    const active = win.document.activeElement as HTMLElement | null;
    if (active === null || active === win.document.body || active === win.document.documentElement) return;
    if (typeof active.blur !== "function") return;
    active.blur();
  }

  return {
    settled(): Promise<void> {
      return roundSettled;
    },
    labels(): readonly string[] {
      return overlay.labels();
    },
    visibleLabels(): readonly string[] {
      return overlay.visibleLabels();
    },
    apply(): () => void {
      const state = createKeyState();
      let hints: Hint[] = [];
      let roundOpen = false;
      const collectClock = deps.frameClock ?? defaultFrameClock(win.document);
      const injectedBudget =
        typeof deps.frameBudgetMs === "number" &&
        Number.isFinite(deps.frameBudgetMs) &&
        deps.frameBudgetMs > 0
          ? deps.frameBudgetMs
          : undefined;
      const publishedBudget = publishedFrameBudget();
      const scheduleIdle = deps.idleScheduler ?? runWhenIdle;
      /** The stage A walk still in flight, if any. */
      let collecting: CollectorRound | undefined;
      /** Home-row strokes typed while stage A is still walking. */
      let bufferedKeys: string[] = [];
      /** Measured display cadence; absent until a sample lands. */
      let measuredBudgetMs: number | undefined;
      /** Viewport the cached measurement describes. */
      let measuredViewport: { width: number; height: number } | undefined;
      let sampling: FrameBudgetSample | undefined;

      /**
       * The frame budget an activation starting now should use.
       *
       * Precedence: the caller's value, the embedding page's published value,
       * a completed sample, then the conservative budget while the sample is
       * still in flight. A hidden page answers the 60Hz fallback: nothing can
       * be painted there, and the sample is not allowed to run in the
       * background where its gaps are throttled.
       */
      function currentFrameBudget(): number {
        if (injectedBudget !== undefined) return injectedBudget;
        if (publishedBudget !== undefined) return publishedBudget;
        if (win.document.hidden) return FALLBACK_FRAME_BUDGET_MS;
        const current = { width: win.innerWidth, height: win.innerHeight };
        if (measuredBudgetMs !== undefined) {
          if (measuredViewport === undefined || sameViewport(measuredViewport, current)) {
            return measuredBudgetMs;
          }
          // The display may have changed under the same window (external
          // monitor, refresh-rate switch); the old value still serves this
          // round, and a fresh sample lands for the next one.
          const stale = measuredBudgetMs;
          resetSample();
          sampleDisplay();
          return stale;
        }
        if (collectClock === undefined) return FALLBACK_FRAME_BUDGET_MS;
        return CONSERVATIVE_FRAME_BUDGET_MS;
      }

      function sameViewport(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
        return a.width === b.width && a.height === b.height;
      }

      /** Drop a cached or in-flight measurement so the next activation resamples. */
      function resetSample(): void {
        sampling?.cancel();
        sampling = undefined;
        measuredBudgetMs = undefined;
        measuredViewport = undefined;
      }

      /**
       * Ask for one display sample, lazily.
       *
       * Nothing runs inline: the request is queued to an idle callback so the
       * load path keeps the page's own work first. Hidden pages skip it
       * entirely, and a page that goes hidden mid-sample abandons the sample
       * instead of caching throttled gaps.
       */
      function sampleDisplay(): void {
        if (sampling !== undefined || measuredBudgetMs !== undefined) return;
        if (injectedBudget !== undefined || publishedBudget !== undefined) return;
        if (collectClock === undefined || win.document.hidden) return;
        const clock = collectClock;
        scheduleIdle(() => {
          // The page can hide between queueing and the idle callback; the
          // sample must not start on a background tab.
          if (sampling !== undefined || measuredBudgetMs !== undefined) return;
          if (win.document.hidden) return;
          const sample = startFrameBudgetSample(clock, win.document);
          sampling = sample;
          void sample.done.then((budgetMs) => {
            if (sampling !== sample) return;
            sampling = undefined;
            if (budgetMs === undefined) return;
            measuredBudgetMs = budgetMs;
            measuredViewport = { width: win.innerWidth, height: win.innerHeight };
          });
        });
      }

      /**
       * Stop the in-flight stage A walk, if one exists.
       *
       * Every cancellation path goes through here: Esc, a completed label, the
       * activation chord again, a hidden page, pagehide and teardown. Resolving
       * the round here is what keeps `settled()` from hanging on a walk that
       * will never finish. Buffered strokes belong to the walk being cancelled,
       * so they are dropped rather than replayed against another round.
       */
      function cancelCollection(): void {
        bufferedKeys = [];
        const round = collecting;
        if (round === undefined) return;
        collecting = undefined;
        round.cancelled = true;
        if (round.handle !== undefined) {
          collectClock?.cancel(round.handle);
          round.handle = undefined;
        }
        round.resolve();
      }

      /**
       * Stage A is over: settle labels and paint them.
       *
       * `finish` is the one synchronous step of the round, but it works on the
       * candidate array only, so its cost does not scale with DOM depth.
       */
      function commitCollection(round: CollectorRound): void {
        if (round.cancelled) return;
        const next = round.scan.finish();
        hints = next;
        const render = overlay.renderProgressive(next, "");
        // Strokes typed while the walk was in flight were swallowed to keep
        // them away from the host; they come back here, in order, against the
        // labels they were aimed at.
        const pending = replayBuffered();
        if (pending === null) {
          round.resolve();
          return;
        }
        if (pending !== "") overlay.render(hints, pending);
        // A synchronous paint is the common case: resolve in this frame so a
        // caller awaiting `settled()` after activation does not need a turn.
        if (overlay.visibleLabels().length >= hints.length) {
          round.resolve();
          return;
        }
        void render.done.then(() => round.resolve());
      }

      /** Queue the next stage A slice on the next frame. */
      function scheduleCollection(round: CollectorRound): void {
        const frameClock = collectClock;
        if (frameClock === undefined) return;
        round.handle = frameClock.request(() => {
          round.handle = undefined;
          if (round.cancelled || collecting !== round) return;
          if (!round.scan.advance(collectBudgetMs(currentFrameBudget()), () => frameClock.now())) {
            scheduleCollection(round);
            return;
          }
          collecting = undefined;
          commitCollection(round);
        });
      }

      /**
       * Start collection for one activation.
       *
       * The first slice runs inside the activation frame; a small page finishes
       * there and paints immediately. A large one returns an empty hint array
       * and keeps walking on later frames, then paints the whole round at once:
       * labels cannot be issued before the total count and visual order are
       * known, so partial painting would only show labels that later change.
       */
      function collectRound(): Hint[] {
        cancelCollection();
        releaseFocus();
        hints = [];
        // Snapshot semantics: hints are computed once per activation, so DOM
        // churn afterwards never moves labels under a half-typed prefix (v1).
        const scan = createHintScan(
          () => Array.from(win.document.querySelectorAll(config.candidateSelector)),
          { width: win.innerWidth, height: win.innerHeight },
          { isVisible, memory },
        );
        let resolve: () => void = () => undefined;
        const promise = new Promise<void>((done) => {
          resolve = done;
        });
        roundSettled = promise;
        const round: CollectorRound = { scan, handle: undefined, cancelled: false, resolve };
        collecting = round;
        if (collectClock === undefined) {
          scan.advance(Number.POSITIVE_INFINITY);
          collecting = undefined;
          commitCollection(round);
          return hints;
        }
        if (scan.advance(collectBudgetMs(currentFrameBudget()), () => collectClock.now())) {
          collecting = undefined;
          commitCollection(round);
          return hints;
        }
        scheduleCollection(round);
        return hints;
      }

      const openRound = (): void => {
        if (roundOpen) return;
        roundOpen = true;
        onRound("begin");
      };
      const closeRound = (): void => {
        if (!roundOpen) return;
        roundOpen = false;
        onRound("end");
      };

      /**
       * End the round on a completed label and act on its target.
       *
       * matchKey already cleared the prefix, so the full typed label is the
       * pre-stroke prefix plus key. No repaint of the empty prefix happens on
       * the way out: the badges go with the overlay in the same stroke.
       */
      function completeLabel(typed: string): void {
        const hit = hints.find((hint) => hint.label === typed);
        hints = [];
        cancelCollection();
        overlay.destroy();
        closeRound();
        const mode = state.mode;
        state.mode = "idle";
        if (hit === undefined) return;
        const cx = hit.rect.x + hit.rect.w / 2;
        const cy = hit.rect.y + hit.rect.h / 2;
        // Which action a target needs is a property of the target, not of the
        // mode the user pressed: a text entry surface has no click semantics
        // (synthetic pointer events are untrusted, so the browser performs no
        // focusing default action for them — measured across button, input and
        // contenteditable, all three left activeElement unchanged), while a
        // button has no focus semantics (focusing it runs nothing). Mode then
        // only decides the fallback for targets that do not care.
        // Reference mode is checked before the target's own activation: it is
        // the one mode whose whole point is to leave the page alone, so neither
        // the click sequence nor the focus path may run for it.
        if (mode === "reference") {
          deps.onReference?.(hit.element);
          return;
        }
        const activation = activationOf(hit.element);
        if (activation === "focus") {
          focusTextEntry(hit.element, win.document);
        } else if (mode === "click") {
          fireClickSequence(hit.element, cx, cy);
        } else {
          const el = hit.element as HTMLElement;
          // A widget with no focus method (a leaf div) simply no-ops.
          if (typeof el.focus === "function") el.focus();
        }
      }

      /**
       * Replay the strokes buffered during stage A.
       *
       * The first dead end stops the replay, the same as normal typing: a
       * prefix that no label can extend clears itself, and keys after it were
       * aimed at a round the reader never saw. Returns the live prefix, or null
       * when a label completed and the round is already closed.
       */
      function replayBuffered(): string | null {
        const keys = bufferedKeys;
        bufferedKeys = [];
        for (const key of keys) {
          const before = state.pending;
          const action = matchKey(
            state,
            { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false },
            hints.map((hint) => hint.label),
            bindings.get(),
          );
          if (action.type !== "label") return state.pending;
          if (state.pending !== "") continue;
          completeLabel(before + action.key);
          return null;
        }
        return state.pending;
      }

      /** Whether a stroke is a label character that must not reach the host. */
      function bufferableStroke(event: KeyboardEvent): boolean {
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing) return false;
        if (event.key === "Escape") return false;
        return (HOME_ROW_KEYS as readonly string[]).includes(event.key);
      }

      const onKeyDown = (raw: Event): void => {
        const event = raw as KeyboardEvent;
        // A bare named key (Insert, F2, Home) is only free while no text
        // surface has focus: inside one, the editor's own meaning of that key
        // outranks navigation. Checked before matchKey so the chord never opens
        // a round, and skipped from the swallow below so the stroke reaches the
        // field. A chord with a modifier can never be typed by accident, so it
        // stays live everywhere.
        const reachable = bindings.get();
        // Every unbound mode is skipped: it has no chord, so there is nothing
        // for the text-entry stand-down to compare against.
        const bareMatch =
          (matchesBinding(event, reachable.click) && !firesInTextEntry(reachable.click)) ||
          (reachable.focus !== null &&
            matchesBinding(event, reachable.focus) &&
            !firesInTextEntry(reachable.focus)) ||
          (reachable.reference !== null &&
            matchesBinding(event, reachable.reference) &&
            !firesInTextEntry(reachable.reference));
        if (state.mode === "idle" && bareMatch && isTextEntry(win.document.activeElement)) return;

        // Stage A is walking and the round has no labels yet, so matchKey
        // would rule every home-row stroke a dead end while the listener still
        // eats it. Hold the stroke instead, and replay it against the finished
        // label set: the reader's typing must land somewhere, not vanish.
        if (state.mode !== "idle" && collecting !== undefined && bufferableStroke(event)) {
          bufferedKeys.push(event.key);
          if (bufferedKeys.length > BUFFERED_KEY_LIMIT) bufferedKeys.shift();
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        const before = state.pending;
        const like: KeyEventLike = {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing,
        };
        const wasActive = state.mode !== "idle";
        const action = matchKey(state, like, hints.map((hint) => hint.label), reachable);
        // While a mode is active every keydown belongs to jump, even the
        // ones matchKey ignores (Enter, arrows, off-row keys): a leaked
        // Enter would submit a focused composer and arrow scrolling would
        // move the page under the frozen label snapshot.
        if (wasActive || action.type !== "ignore") {
          event.preventDefault();
          event.stopPropagation();
        }
        if (action.type === "ignore") {
          if (state.pending !== before) overlay.render(hints, state.pending);
          return;
        }

        if (
          action.type === "activate-click" ||
          action.type === "activate-focus" ||
          action.type === "activate-reference"
        ) {
          openRound();
          hints = collectRound();
          return;
        }
        if (action.type === "exit") {
          hints = [];
          cancelCollection();
          overlay.destroy();
          closeRound();
          return;
        }
        if (state.pending !== "") {
          if (state.pending !== before) {
            // The stroke extended the prefix, so the lit/dim split must mirror
            // the live prefix again.
            overlay.render(hints, state.pending);
          }
          return;
        }
        completeLabel(before + action.key);
      };

      /** Drop the live round and give the input source back. */
      function endRound(): void {
        hints = [];
        cancelCollection();
        overlay.destroy();
        state.mode = "idle";
        state.pending = "";
        closeRound();
      }

      // 切到别的应用时这一轮不再有人敲标签，但输入法是全系统的，英文会跟过去。
      // 隐藏即结束，比等一分钟的兜底更早把输入源还回去。
      const onVisibility = (): void => {
        if (win.document.visibilityState === "hidden") {
          endRound();
          return;
        }
        // A page that loaded hidden or was hidden before its sample landed
        // gets another lazy attempt now that frames are real again.
        sampleDisplay();
      };
      // 刷新或关掉页面时插件的卸载函数不会跑。pagehide 是这一轮还能发出 end
      // 的最后时机，也是唯一能停下在途采集的地方：bfcache 恢复后不能再来一次
      // "end" 之后的 commit。
      const onPageHide = (): void => {
        endRound();
        sampling?.cancel();
        sampling = undefined;
      };
      // A refresh-rate change under the same window is announced as a resize;
      // drop the cached cadence and take a new lazy sample.
      const onResize = (): void => {
        if (injectedBudget !== undefined || publishedBudget !== undefined) return;
        const current = { width: win.innerWidth, height: win.innerHeight };
        if (measuredViewport !== undefined && sameViewport(measuredViewport, current)) return;
        if (sampling === undefined && measuredBudgetMs === undefined) return;
        resetSample();
        sampleDisplay();
      };
      win.addEventListener("keydown", onKeyDown, { capture: true });
      win.document.addEventListener("visibilitychange", onVisibility);
      win.addEventListener("pagehide", onPageHide);
      win.addEventListener("resize", onResize);
      // Loading the page is the one moment the sample must not compete with:
      // queue it behind the host's own work.
      sampleDisplay();
      return () => {
        win.removeEventListener("keydown", onKeyDown, { capture: true });
        win.document.removeEventListener("visibilitychange", onVisibility);
        win.removeEventListener("pagehide", onPageHide);
        win.removeEventListener("resize", onResize);
        sampling?.cancel();
        sampling = undefined;
        endRound();
      };
    },
  };
}
