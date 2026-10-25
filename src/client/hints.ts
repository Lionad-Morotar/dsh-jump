/**
 * Pure hint computation: which elements get a label this activation round, and
 * which label each gets. Every DOM touch (candidate query, visibility, rects)
 * arrives through arguments so the same function runs against jsdom stubs in
 * tests and the real viewport in the browser.
 */
import { HOME_ROW_KEYS } from "./config.ts";

export interface HintRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Hint {
  element: Element;
  label: string;
  rect: HintRect;
}

export interface CollectDeps {
  /** Visibility oracle (offsetParent / checkVisibility in real DOM). */
  isVisible: (element: Element) => boolean;
}

/**
 * The ordered label stream of one fixed length.
 *
 * `keys` is how many strokes every label in the round takes: 1 yields the nine
 * home-row singles, 2 yields the 81 two-key labels (an "as" block sorted after
 * the singles), 3 the 729 three-key ones, and so on. The order within a level
 * enumerates every key except the prefix's own last character first, then that
 * character itself, so no label doubles its final stroke at the head of its
 * block (`aa` sorts to the tail of the "a" block) while the level still covers
 * the full key space.
 *
 * Length is fixed per round rather than grown level by level: a short label
 * beside a longer one makes matchKey complete the short one early, and every
 * candidate past that point becomes unreachable.
 */
export function* generateLabels(keys = 1): Generator<string> {
  if (keys <= 1) {
    yield* HOME_ROW_KEYS;
    return;
  }
  let level: string[] = [...HOME_ROW_KEYS];
  for (let depth = 1; depth < keys; depth += 1) {
    const next: string[] = [];
    for (const prefix of level) {
      const last = prefix[prefix.length - 1];
      if (last === undefined) break;
      for (const key of HOME_ROW_KEYS) {
        if (key !== last) next.push(prefix + key);
      }
      next.push(prefix + last);
    }
    level = next;
  }
  yield* level;
}

/** Label capacity of the single-key level; beyond it every label goes two-key. */
const SINGLE_KEY_CAPACITY = HOME_ROW_KEYS.length;

/**
 * How many keys a round of `count` hints needs, applied to every hint.
 *
 * One length per round is a correctness requirement, not tidiness: matchKey
 * treats a label that is present in the set as complete, so a two-key label
 * living beside three-key ones would swallow the two strokes that should have
 * started a three-key label, and the candidates carrying those labels would be
 * unreachable. Level sizes are 9, 81, 729… (HOME_ROW_KEYS.length ** level).
 */
function keysPerLabel(count: number): number {
  let level = 1;
  let capacity = SINGLE_KEY_CAPACITY;
  while (count > capacity) {
    level += 1;
    capacity *= SINGLE_KEY_CAPACITY;
  }
  return level;
}

/**
 * Filter candidates to the visible viewport, keep only the deepest element on
 * any ancestor chain (clicking a button inside a button must hit the inner
 * one), and assign labels in stream order. Labels are decided only after the
 * final candidate array exists so the whole round shares one label length.
 */
export function collectHints(
  selectCandidates: () => Element[],
  viewport: { width: number; height: number },
  deps: CollectDeps,
): Hint[] {
  const kept: { element: Element; rect: HintRect }[] = [];
  for (const element of selectCandidates()) {
    const rect = element.getBoundingClientRect();
    // Zero-area rects (display:none stubs, collapsed cells) never intersect
    // usefully, and the strict comparisons below drop them for free.
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.x < viewport.width &&
      rect.x + rect.width > 0 &&
      rect.y < viewport.height &&
      rect.y + rect.height > 0;
    if (visible && deps.isVisible(element)) {
      kept.push({ element, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } });
    }
  }
  // A candidate that contains another candidate is a wrapper; the deepest
  // target wins, so drop any element that contains a kept sibling candidate.
  const deepest = kept.filter(
    ({ element }) => !kept.some((other) => other.element !== element && element.contains(other.element)),
  );
  const labels = generateLabels(keysPerLabel(deepest.length));
  return deepest.map((entry) => {
    const label = labels.next();
    if (label.done) throw new Error("dsh-jump: label space exhausted");
    return { element: entry.element, label: label.value, rect: entry.rect };
  });
}
