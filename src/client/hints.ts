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
export function* generateLabels(): Generator<string> {
  yield* HOME_ROW_KEYS;
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

/**
 * Filter candidates to the visible viewport, keep only the deepest element on
 * any ancestor chain (clicking a button inside a button must hit the inner
 * one), and assign labels in stream order.
 */
export function collectHints(
  selectCandidates: () => Element[],
  viewport: { width: number; height: number },
  deps: CollectDeps,
): Hint[] {
  const candidates = selectCandidates().filter((element) => {
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
    return visible && deps.isVisible(element);
  });
  // A candidate that contains another candidate is a wrapper; the deepest
  // target wins, so drop any element that contains a kept sibling candidate.
  const deepest = candidates.filter(
    (element) => !candidates.some((other) => other !== element && element.contains(other)),
  );
  const labels = generateLabels();
  return deepest.map((element) => {
    const label = labels.next();
    if (label.done) throw new Error("dsh-jump: label space exhausted");
    const rect = element.getBoundingClientRect();
    return { element, label: label.value, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
  });
}
