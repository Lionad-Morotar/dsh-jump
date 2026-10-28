/**
 * Activation chords as data: defaults, normalization, validation, matching and
 * the printed form the settings page shows.
 *
 * A chord is described by the physical key plus the full modifier set rather
 * than by the letters the plugin used to hard-code. Two consumers share this
 * module and must never disagree: the runtime matcher, which folds real
 * keydowns through it, and the settings recorder, which has to reject a chord
 * the runtime would refuse to recognize.
 */

/** The two activation modes. Each owns exactly one chord. */
export type JumpAction = "click" | "focus";

/**
 * Keyboards split into the two families the Chords differ on.
 *
 * Only one thing differs: "primary". On a mac it is Command, everywhere else it
 * is Control. Separating the two also settles the printed form, since the fold
 * of modifier symbols is mac-only convention.
 */
export type JumpPlatform = "macos" | "other";

/**
 * A resolved chord. Every modifier is explicit so matching is one comparison
 * per modifier and never relies on a missing field meaning false.
 */
export interface JumpBinding {
  /** `KeyboardEvent.key` the chord expects, lowercased for single characters. */
  key: string;
  meta: boolean;
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
}

/** One chord per action. */
export interface JumpBindings {
  click: JumpBinding;
  focus: JumpBinding;
}

/** Why a chord cannot be used, as a code the settings page turns into copy. */
export type BindingIssue = "no-modifier" | "reserved-key" | "duplicate";

/**
 * Keys no activation chord may claim.
 *
 * Two families: the strokes that drive the surrounding controls (escape, tab,
 * enter, space, the arrows, the deletion keys — all owned by the host's own
 * shortcut service), and keys that never arrive as a usable keydown at all
 * (a bare modifier reports `key` but as the modifier itself, a dead key
 * reports "Dead", and an IME reports "Unidentified").
 */
const RESERVED_KEYS: readonly string[] = [
  "Escape",
  "Tab",
  "Enter",
  " ",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Dead",
  "CapsLock",
  "AltGraph",
  "Unidentified",
  "Meta",
  "Control",
  "Alt",
  "Shift",
  "OS",
  "",
];

/**
 * Whether a chord is allowed to fire while a text surface has focus.
 *
 * A chord carrying a modifier is not something a text surface can produce by
 * typing, so it stays available everywhere. A bare named key is the ambiguous
 * case: an editor uses Insert for overtype, a grid uses Home for the row start.
 * The plugin's job is navigation, not overriding the field the reader is in, so
 * a bare chord stands down while one has focus.
 */
export function firesInTextEntry(binding: JumpBinding): boolean {
  return binding.meta || binding.alt || binding.ctrl || binding.shift;
}

/**
 * Keys that a bare press can own without taking input away from anyone.
 *
 * "Must carry a modifier" exists because a bare printable key types a character,
 * so consuming it would eat text the reader meant to enter. That reasoning does
 * not extend to keys with no character: Insert, the function row, Home/End,
 * PageUp/PageDown and the media keys report a named `key` and print nothing.
 * Binding one bare is therefore safe in general, and the runtime still steps
 * aside while a text surface has focus (see `activationAllowed`), so an editor
 * that reads Insert itself keeps it.
 *
 * The test is "is this the name of a printing key", not a whitelist: every
 * `KeyboardEvent.key` of length 1 is printable (letters, digits, punctuation,
 * space), and everything longer is a named key. Named keys the interface owns
 * are filtered by RESERVED_KEYS first, so Escape and the arrows still lose.
 */
export function isNamedKey(key: string): boolean {
  return key.length > 1 && !RESERVED_KEYS.includes(key);
}

const MAC_SYMBOLS: Readonly<Record<string, string>> = { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" };
const OTHER_NAMES: Readonly<Record<string, string>> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta" };

/** Keys whose printed form is a word or a symbol rather than the key itself. */
const MAC_KEY_LABELS: Readonly<Record<string, string>> = {
  " ": "Space",
  Escape: "Esc",
  Enter: "↩",
  Tab: "⇥",
  Backspace: "⌫",
  Delete: "⌦",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};
const OTHER_KEY_LABELS: Readonly<Record<string, string>> = { " ": "Space" };

/**
 * Where the primary modifier comes from.
 *
 * `navigator.platform` is deprecated in favour of `userAgentData`, which is
 * still Chromium-only, so the deprecated field stays the one every engine
 * answers. A host that reports nothing lands on the shipped defaults rather
 * than a guess: an empty string is "the environment did not say", and the
 * chords this plugin has always advertised are the mac-shaped ones.
 */
export function detectPlatform(navigatorPlatform: string): JumpPlatform {
  const reported = navigatorPlatform.trim().toLowerCase();
  if (reported === "") return "macos";
  return /mac|darwin|iphone|ipad/.test(reported) ? "macos" : "other";
}

/** The shipped chords: primary+H for click mode, primary+U for focus mode. */
export function createDefaultBindings(platform: JumpPlatform): JumpBindings {
  const primary = platform === "macos" ? { meta: true, ctrl: false } : { meta: false, ctrl: true };
  return {
    click: { key: "h", alt: false, shift: false, ...primary },
    focus: { key: "u", alt: false, shift: false, ...primary },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modifier(source: Record<string, unknown>, name: string): boolean {
  // `control` is the name the host's shortcut service uses for the same field.
  return source[name] === true || (name === "ctrl" && source.control === true);
}

/**
 * Coerce one candidate into a chord, falling back to `fallback` wholesale.
 *
 * Placement matters: a candidate that names a key but omits a modifier is not
 * merged over the fallback, because inheriting a modifier the user did not ask
 * for would silently bind a chord they never typed.
 *
 * A single letter is the shape older config used (`activationClick: "h"`), and
 * it still means "primary + that letter": the modifier it implied was the
 * primary one, so it is re-read against the receiving platform rather than
 * being frozen to meta.
 */
export function normalizeBinding(candidate: unknown, fallback: JumpBinding, platform: JumpPlatform = "macos"): JumpBinding {
  if (typeof candidate === "string") {
    if (candidate.length !== 1) return fallback;
    return {
      key: candidate.toLowerCase(),
      meta: platform === "macos",
      alt: false,
      ctrl: platform !== "macos",
      shift: false,
    };
  }
  if (!isRecord(candidate)) return fallback;
  const key = candidate.key;
  if (typeof key !== "string" || key.length === 0) return fallback;
  return {
    key: key.length === 1 ? key.toLowerCase() : key,
    meta: modifier(candidate, "meta"),
    alt: modifier(candidate, "alt"),
    ctrl: modifier(candidate, "ctrl"),
    shift: modifier(candidate, "shift"),
  };
}

/** Normalize a whole pair, falling back per action rather than for the pair. */
export function normalizeBindings(candidate: unknown, platform: JumpPlatform = "macos"): JumpBindings {
  const defaults = createDefaultBindings(platform);
  const source = isRecord(candidate) ? candidate : {};
  return {
    click: normalizeBinding(source.click, defaults.click, platform),
    focus: normalizeBinding(source.focus, defaults.focus, platform),
  };
}

/** Structural equality over the five fields, normalized first. */
export function bindingsEqual(left: JumpBinding, right: JumpBinding): boolean {
  return (
    left.key.toLowerCase() === right.key.toLowerCase() &&
    left.meta === right.meta &&
    left.alt === right.alt &&
    left.ctrl === right.ctrl &&
    left.shift === right.shift
  );
}

/**
 * Why `candidate` cannot be bound, or null when it can.
 *
 * `taken` is the set of chords the other action (and anything else sharing the
 * keymap) already holds: two actions on one chord would make the second one
 * unreachable, since the runtime resolves the first match.
 */
export function bindingIssue(candidate: JumpBinding, taken: readonly JumpBinding[]): BindingIssue | null {
  if (RESERVED_KEYS.includes(candidate.key)) return "reserved-key";
  // Shift alone is not a modifier: shift+a is still a plain letter to every
  // text surface the plugin runs inside. A named key is the exception, because
  // it prints nothing and the runtime yields it back to focused text surfaces.
  const bare = !candidate.meta && !candidate.alt && !candidate.ctrl;
  if (bare && !isNamedKey(candidate.key)) return "no-modifier";
  if (taken.some((other) => bindingsEqual(other, candidate))) return "duplicate";
  return null;
}

/** Whether one keydown is the chord. */
export function matchesBinding(
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    isComposing: boolean;
  },
  binding: JumpBinding,
): boolean {
  // A chord pressed mid-composition belongs to the IME; consuming it would
  // interrupt the candidate list the reader is looking at.
  if (event.isComposing) return false;
  return (
    event.key.toLowerCase() === binding.key.toLowerCase() &&
    event.metaKey === binding.meta &&
    event.altKey === binding.alt &&
    event.ctrlKey === binding.ctrl &&
    event.shiftKey === binding.shift
  );
}

function keyLabel(key: string, platform: JumpPlatform): string {
  const labels = platform === "macos" ? MAC_KEY_LABELS : OTHER_KEY_LABELS;
  const named = labels[key];
  if (named !== undefined) return named;
  // A single character is printed as the capital the keycap shows; a named key
  // (`F5`, `Home`) already reads as itself.
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * The printed chord, in the order a keycap strip reads left to right.
 *
 * Mac uses the modifier symbols; every other platform spells the names out,
 * because `Ctrl` written as a symbol is a mac-only convention.
 */
export function formatBinding(binding: JumpBinding, platform: JumpPlatform): string {
  const order = ["ctrl", "alt", "shift", "meta"] as const;
  const parts = order.filter((name) => binding[name]).map((name) => (platform === "macos" ? MAC_SYMBOLS[name] : OTHER_NAMES[name]));
  parts.push(keyLabel(binding.key, platform));
  const chord = platform === "macos" ? parts.join("") : parts.join("+");
  return chord;
}
