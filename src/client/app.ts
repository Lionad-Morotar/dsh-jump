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
import { DEFAULT_CONFIG, type JumpConfig } from "./config.ts";
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
   * A normal page leaves it unset and gets the value the embedding page
   * publishes (the bench measures the display once and exposes it as
   * `__DSH_JUMP_FRAME_BUDGET_MS__`), falling back to 60Hz.
   */
  frameBudgetMs?: number;
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
 * Share of a display frame the collection walk may spend.
 *
 * The activation frame also has to paint the first badges and leave room for
 * the host. At the measured 143Hz cadence this is about 0.8ms, at 60Hz the
 * absolute cap keeps it at 1.5ms; both are inside the 1-2ms target.
 */
const COLLECT_BUDGET_SHARE = 0.12;
const COLLECT_BUDGET_MAX_MS = 1.5;
const COLLECT_BUDGET_MIN_MS = 0.4;

/** The display cadence the bench publishes, or the 60Hz fallback. */
function publishedFrameBudget(): number {
  const host = globalThis as typeof globalThis & { __DSH_JUMP_FRAME_BUDGET_MS__?: unknown };
  const value = host.__DSH_JUMP_FRAME_BUDGET_MS__;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : FALLBACK_FRAME_BUDGET_MS;
}

function collectBudgetMs(frameBudget: number): number {
  return Math.min(Math.max(frameBudget * COLLECT_BUDGET_SHARE, COLLECT_BUDGET_MIN_MS), COLLECT_BUDGET_MAX_MS);
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
      const injectedBudget = deps.frameBudgetMs;
      const budgetMs = collectBudgetMs(
        typeof injectedBudget === "number" && Number.isFinite(injectedBudget) && injectedBudget > 0
          ? injectedBudget
          : publishedFrameBudget(),
      );
      /** The stage A walk still in flight, if any. */
      let collecting: CollectorRound | undefined;

      /**
       * Stop the in-flight stage A walk, if one exists.
       *
       * Every cancellation path goes through here: Esc, a completed label, the
       * activation chord again, a hidden page and teardown. Resolving the
       * round here is what keeps `settled()` from hanging on a walk that will
       * never finish.
       */
      function cancelCollection(): void {
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
        // A synchronous paint is the common case: resolve in this frame so a
        // caller awaiting `settled()` after activation does not need a turn.
        if (overlay.visibleLabels().length >= next.length) {
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
          if (!round.scan.advance(budgetMs, () => frameClock.now())) {
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
        if (scan.advance(budgetMs, () => collectClock.now())) {
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
        // A completed label ends the round: matchKey already cleared the
        // prefix, so the full typed label is the pre-stroke prefix plus key.
        // No repaint of the now-empty prefix happens on the way out: the badges
        // are removed with the overlay in the same stroke, so rewriting the
        // whole round would only produce work the reader never sees.
        const typed = before + action.key;
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
      };

      // 切到别的应用时这一轮不再有人敲标签，但输入法是全系统的，英文会跟过去。
      // 隐藏即结束，比等一分钟的兜底更早把输入源还回去。
      const onVisibility = (): void => {
        if (win.document.visibilityState !== "hidden") return;
        hints = [];
        cancelCollection();
        overlay.destroy();
        state.mode = "idle";
        state.pending = "";
        closeRound();
      };
      // 刷新或关掉页面时插件的卸载函数不会跑。pagehide 是这一轮还能发出 end 的最后时机。
      const onPageHide = (): void => closeRound();
      win.addEventListener("keydown", onKeyDown, { capture: true });
      win.document.addEventListener("visibilitychange", onVisibility);
      win.addEventListener("pagehide", onPageHide);
      return () => {
        win.removeEventListener("keydown", onKeyDown, { capture: true });
        win.document.removeEventListener("visibilitychange", onVisibility);
        win.removeEventListener("pagehide", onPageHide);
        cancelCollection();
        overlay.destroy();
        hints = [];
        closeRound();
      };
    },
  };
}
