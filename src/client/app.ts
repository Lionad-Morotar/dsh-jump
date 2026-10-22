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
import { collectHints, type Hint } from "./hints.ts";
import { createKeyState, matchKey, type KeyEventLike, type KeyState } from "./keys.ts";
import { DEFAULT_CONFIG, type JumpConfig } from "./config.ts";
import { createOverlay } from "./overlay.ts";

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

export interface AppDeps {
  /** Host window; defaults to the browser global, injected under jsdom. */
  window?: JumpWindow;
  config?: JumpConfig;
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

export function createApp(deps: AppDeps = {}): JumpApp {
  const win = deps.window ?? (globalThis as unknown as JumpWindow);
  const config: JumpConfig = { ...DEFAULT_CONFIG, ...deps.config };
  const isVisible = deps.isVisible ?? defaultIsVisible;
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
        const action = matchKey(state, like, hints.map((hint) => hint.label));
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
        if (mode === "click") {
          fireClickSequence(hit.element, cx, cy);
        } else {
          const el = hit.element as HTMLElement;
          // Non-focusable targets (an <a> without href) simply no-op.
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
