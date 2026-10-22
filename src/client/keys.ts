/**
 * Pure key state machine. The event is structured data rather than a DOM Event
 * so tests drive it with plain objects and the browser adapter feeds a
 * KeyboardEvent's fields straight in.
 */
import { ACTIVATION_CLICK, ACTIVATION_FOCUS, HOME_ROW_KEYS } from "./config.ts";

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
 * live label set of the current activation round; a keystroke that neither
 * completes nor extends a label resets the pending prefix so a mistyped
 * sequence cannot poison the next one. Every accepted label character is
 * reported (even the first half of a two-key label): the caller echoes what
 * was typed, and `state.pending` says whether the label has fully landed.
 */
export function matchKey(
  state: KeyState,
  e: KeyEventLike,
  labels: readonly string[] = HOME_ROW_KEYS,
): KeyAction {
  const bare = !e.shiftKey && !e.ctrlKey && !e.altKey;

  if (state.mode === "idle") {
    // Activation demands meta and nothing else: shift/alt/ctrl variants
    // belong to the host and must not steal the chord.
    if (e.metaKey && bare && !e.isComposing) {
      if (e.key === ACTIVATION_CLICK) {
        state.mode = "click";
        state.pending = "";
        return { type: "activate-click" };
      }
      if (e.key === ACTIVATION_FOCUS) {
        state.mode = "focus";
        state.pending = "";
        return { type: "activate-focus" };
      }
    }
    return { type: "ignore" };
  }

  if (e.key === "Escape") {
    reset(state);
    return { type: "exit" };
  }
  // Any meta chord (including the activation key pressed again) leaves jump
  // mode instead of typing a label.
  if (e.metaKey) {
    reset(state);
    return { type: "exit" };
  }
  if (!bare || e.isComposing) return { type: "ignore" };
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
