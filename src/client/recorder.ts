/**
 * Turning one real keydown into a candidate chord.
 *
 * Recording is where a chord is decided, so it has to agree with the runtime
 * completely: if this accepted something `matchesBinding` could never see, the
 * settings page would happily save a key that does nothing. Both sides call
 * `bindingIssue`, and the checks are ordered so the reader sees the most
 * specific reason rather than the first technical one.
 */
import { bindingIssue, normalizeBinding, type BindingIssue, type JumpBinding, type JumpPlatform } from "./bindings.ts";

/** A keydown, narrowed to what a recording needs. */
export interface RecordedEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
}

export type RecordResult =
  /** The reader is mid-chord (only a modifier down so far, or an IME is open). */
  | { status: "pending" }
  /** Escape: leave recording without touching the binding. */
  | { status: "cancel" }
  /** A complete chord, ready to be committed. */
  | { status: "accepted"; binding: JumpBinding }
  /** A complete chord that must not be committed, with the reason to show. */
  | { status: "rejected"; issue: BindingIssue };

/** Keys that are only a modifier: pressing one alone never completes a chord. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(["Meta", "Control", "Alt", "Shift", "AltGraph", "CapsLock", "OS"]);

/**
 * Read one keydown as a chord.
 *
 * `taken` is what the other action currently holds. The action being edited is
 * deliberately absent from it, so re-recording the chord an action already has
 * is accepted rather than reported as its own duplicate.
 */
export function recordChord(event: RecordedEvent, taken: readonly JumpBinding[], platform: JumpPlatform): RecordResult {
  if (event.key === "Escape") return { status: "cancel" };
  // A modifier on its own is the first half of a chord, and a composition is
  // the IME's: in both cases the reader has not finished choosing.
  if (MODIFIER_KEYS.has(event.key) || event.isComposing) return { status: "pending" };
  const binding = normalizeBinding(
    {
      key: event.key,
      meta: event.metaKey,
      alt: event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
    },
    { key: event.key, meta: false, alt: false, ctrl: false, shift: false },
    platform,
  );
  const issue = bindingIssue(binding, taken);
  if (issue !== null) return { status: "rejected", issue };
  return { status: "accepted", binding };
}
