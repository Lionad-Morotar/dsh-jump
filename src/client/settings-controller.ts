/**
 * The settings row's whole state machine, kept out of the view.
 *
 * Recording a chord is a small mode with its own rules (a modifier alone is not
 * a chord, a rejected chord keeps the recording open so the reader can retry,
 * Escape abandons it), and every one of those rules is testable without a
 * renderer. The React component below the fold only projects this state.
 */
import type { JumpAction, JumpBindings, JumpPlatform } from "./bindings.ts";
import { recordChord } from "./recorder.ts";
import type { BindingsStore } from "./store.ts";

export interface BindingRowState {
  /** The chords in force. */
  bindings: JumpBindings;
  /** The action waiting for a chord, or null when idle. */
  recording: JumpAction | null;
  /** Why the last attempt was refused, cleared when recording restarts. */
  issue: import("./bindings.ts").BindingIssue | null;
}

/** What one keystroke did, so the view can decide whether to close or keep going. */
export type PressOutcome = "idle" | "pending" | "saved" | "rejected" | "cancelled";

export interface BindingRowController {
  getState(): BindingRowState;
  /** Start recording for one action; any previous attempt is abandoned. */
  begin(action: JumpAction): void;
  /** Feed one keydown; only meaningful while recording. */
  press(event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    isComposing: boolean;
  }): PressOutcome;
  /** Restore the shipped chords and drop any recording. */
  reset(): void;
  subscribe(listener: (state: BindingRowState) => void): () => void;
}

export interface BindingRowOptions {
  store: BindingsStore;
  platform: JumpPlatform;
}

/** The other action's chord, which a new one must not collide with. */
function rivalOf(bindings: JumpBindings, action: JumpAction): JumpBindings[JumpAction][] {
  return [action === "click" ? bindings.focus : bindings.click];
}

export function createBindingsController(options: BindingRowOptions): BindingRowController {
  const { store, platform } = options;
  const listeners = new Set<(state: BindingRowState) => void>();
  let state: BindingRowState = { bindings: store.get(), recording: null, issue: null };

  const emit = (next: BindingRowState): void => {
    if (next.bindings === state.bindings && next.recording === state.recording && next.issue === state.issue) return;
    state = next;
    for (const listener of listeners) listener(state);
  };

  // 别的标签页改了同一份文档时，这里跟着走并播报一次
  store.subscribe((bindings) => {
    emit({ ...state, bindings, issue: null });
  });

  return {
    getState: () => state,

    begin(action: JumpAction): void {
      emit({ ...state, recording: action, issue: null });
    },

    press(event) {
      const action = state.recording;
      if (action === null) return "idle";
      const result = recordChord(event, rivalOf(state.bindings, action), platform);
      if (result.status === "pending") return "pending";
      if (result.status === "cancel") {
        emit({ ...state, recording: null, issue: null });
        return "cancelled";
      }
      if (result.status === "rejected") {
        emit({ ...state, issue: result.issue });
        return "rejected";
      }
      store.set({ ...state.bindings, [action]: result.binding });
      emit({ ...state, bindings: store.get(), recording: null, issue: null });
      return "saved";
    },

    reset(): void {
      store.reset();
      emit({ bindings: store.get(), recording: null, issue: null });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
