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
 * Ordered label stream: the nine home-row singles, then each level of ordered
 * combinations. Within one level a prefix's children enumerate every key except
 * the prefix's last character, then that character itself, so no label begins
 * with a doubled character (aa sorts to the tail of the "a" block) while the
 * level still covers the full key space.
 */
export function* generateLabels(includeSingles = true): Generator<string> {
  // Equal-length labels per round: skipping the singles keeps a single-key
  // label from shadowing the first character of longer labels in matchKey.
  if (includeSingles) yield* HOME_ROW_KEYS;
  let level: string[] = [...HOME_ROW_KEYS];
  while (true) {
    const next: string[] = [];
    for (const prefix of level) {
      const last = prefix[prefix.length - 1];
      if (last === undefined) break;
      for (const key of HOME_ROW_KEYS) {
        if (key !== last) next.push(prefix + key);
      }
      next.push(prefix + last);
    }
    yield* next;
    level = next;
  }
}

/** Label capacity of the single-key level; beyond it every label goes two-key. */
const SINGLE_KEY_CAPACITY = HOME_ROW_KEYS.length;

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
  const labels = generateLabels(deepest.length <= SINGLE_KEY_CAPACITY);
  return deepest.map((entry) => {
    const label = labels.next();
    if (label.done) throw new Error("dsh-jump: label space exhausted");
    return { element: entry.element, label: label.value, rect: entry.rect };
  });
}
