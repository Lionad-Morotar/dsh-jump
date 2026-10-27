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
import { createDefaultBindings, detectPlatform, type JumpBindings, type JumpPlatform } from "./bindings.ts";
import { collectHints, type Hint } from "./hints.ts";
import { createKeyState, matchKey, type KeyEventLike } from "./keys.ts";
import { DEFAULT_CONFIG, type JumpConfig } from "./config.ts";
import { createOverlay } from "./overlay.ts";
import { activationOf } from "./target.ts";

export interface JumpWindow {
  document: Document;
  innerWidth: number;
  innerHeight: number;
  dispatchEvent(event: Event): boolean;
  addEventListener(
    type: "keydown",
    listener: (event: KeyboardEvent) => void,
    options?: { capture?: boolean },
  ): void;
  removeEventListener(
    type: "keydown",
    listener: (event: KeyboardEvent) => void,
    options?: { capture?: boolean },
  ): void;
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
}

export interface JumpApp {
  /** Mount the window listener. Returns the symmetric teardown. */
  apply(): () => void;
}

function defaultIsVisible(element: Element): boolean {
  const el = element as HTMLElement;
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  // offsetParent is also null for position:fixed, which stays clickable.
  const view = el.ownerDocument?.defaultView;
  return el.offsetParent !== null || view?.getComputedStyle(el).position === "fixed";
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
  const overlay = createOverlay({
    doc: win.document,
    viewport: () => ({ width: win.innerWidth, height: win.innerHeight }),
  });

  function collectRound(): Hint[] {
    // Snapshot semantics: hints are computed once per activation, so DOM
    // churn afterwards never moves labels under a half-typed prefix (v1).
    const hints = collectHints(
      () => Array.from(win.document.querySelectorAll(config.candidateSelector)),
      { width: win.innerWidth, height: win.innerHeight },
      { isVisible },
    );
    overlay.render(hints);
    return hints;
  }

  return {
    apply(): () => void {
      const state = createKeyState();
      let hints: Hint[] = [];

      const onKeyDown = (event: KeyboardEvent): void => {
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
        const action = matchKey(state, like, hints.map((hint) => hint.label), bindings.get());
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

        if (action.type === "activate-click" || action.type === "activate-focus") {
          hints = collectRound();
          return;
        }
        if (action.type === "exit") {
          hints = [];
          overlay.destroy();
          return;
        }
        if (state.pending !== before) {
          // The prefix changed (extended, or reset by a dead-end key), so
          // the lit/dim split must mirror the live prefix again.
          overlay.render(hints, state.pending);
        }
        if (state.pending !== "") return;
        // A completed label ends the round: matchKey already cleared the
        // prefix, so the full typed label is the pre-stroke prefix plus key.
        const typed = before + action.key;
        const hit = hints.find((hint) => hint.label === typed);
        hints = [];
        overlay.destroy();
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

      win.addEventListener("keydown", onKeyDown, { capture: true });
      return () => {
        win.removeEventListener("keydown", onKeyDown, { capture: true });
        overlay.destroy();
        hints = [];
      };
    },
  };
}
