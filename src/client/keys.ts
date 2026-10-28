/**
 * Pure key state machine. The event is structured data rather than a DOM Event
 * so tests drive it with plain objects and the browser adapter feeds a
 * KeyboardEvent's fields straight in.
 */
import { matchesBinding, type JumpBindings } from "./bindings.ts";
import { HOME_ROW_KEYS } from "./config.ts";

export type KeyMode = "idle" | "click" | "focus";

export interface KeyState {
  mode: KeyMode;
  /** Typed label prefix waiting for its remaining characters. */
  pending: string;
}

export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
}

export type KeyAction =
  | { type: "activate-click" }
  | { type: "activate-focus" }
  | { type: "label"; key: string }
  | { type: "exit" }
  | { type: "ignore" };

export function createKeyState(): KeyState {
  return { mode: "idle", pending: "" };
}

function reset(state: KeyState): void {
  state.mode = "idle";
  state.pending = "";
}

/**
 * Fold one key event into the state and report what it means. `labels` is the
 * live label set of the current activation round and `bindings` the chords the
 * user currently has bound; a keystroke that neither completes nor extends a
 * label resets the pending prefix so a mistyped sequence cannot poison the next
 * one. Every accepted label character is reported (even the first half of a
 * two-key label): the caller echoes what was typed, and `state.pending` says
 * whether the label has fully landed.
 */
export function matchKey(
  state: KeyState,
  e: KeyEventLike,
  labels: readonly string[],
  bindings: JumpBindings,
): KeyAction {
  if (state.mode === "idle") {
    // Only the bound chord opens a round, and only with exactly its modifiers:
    // any other stroke belongs to the host and must not be swallowed.
    if (matchesBinding(e, bindings.click)) {
      state.mode = "click";
      state.pending = "";
      return { type: "activate-click" };
    }
    if (matchesBinding(e, bindings.focus)) {
      state.mode = "focus";
      state.pending = "";
      return { type: "activate-focus" };
    }
    return { type: "ignore" };
  }

  if (e.key === "Escape") {
    reset(state);
    return { type: "exit" };
  }
  // Any chord leaves jump mode instead of typing a label: the activation keys
  // pressed again, and every neighbour the user might reach for by mistake.
  // Shift is exempt because shift+label is a typo to swallow, not a chord.
  if (e.metaKey || e.ctrlKey || e.altKey) {
    reset(state);
    return { type: "exit" };
  }
  if (e.shiftKey || e.isComposing) return { type: "ignore" };
  // Pressing the activation chord again leaves. The modifier branch above
  // catches every chorded form; a bare named key carries no modifier, so it
  // has to be compared against the chords explicitly, or Insert/F2 would be
  // the one activation that cannot be cancelled from the keyboard.
  if (matchesBinding(e, bindings.click) || matchesBinding(e, bindings.focus)) {
    reset(state);
    return { type: "exit" };
  }
  // A stroke that cannot extend any label (wrong row, dead end) clears the
  // prefix so the mistyped sequence cannot poison the next one.
  if (!(HOME_ROW_KEYS as readonly string[]).includes(e.key)) {
    state.pending = "";
    return { type: "ignore" };
  }

  const combined = state.pending + e.key;
  if (labels.includes(combined)) {
    state.pending = "";
    return { type: "label", key: e.key };
  }
  if (labels.some((label) => label.length > combined.length && label.startsWith(combined))) {
    state.pending = combined;
    return { type: "label", key: e.key };
  }
  state.pending = "";
  return { type: "ignore" };
}
