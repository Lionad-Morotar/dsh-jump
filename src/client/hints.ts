/**
 * Pure hint computation: which elements get a label this activation round, and
 * which label each gets. Every DOM touch (candidate query, visibility, rects)
 * arrives through arguments so the same function runs against jsdom stubs in
 * tests and the real viewport in the browser.
 */
import { HOME_ROW_KEYS } from "./config.ts";
import { identityKey, recallLabels, type LabelMemory } from "./identity.ts";

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
  /**
   * Label memory of the page load.
   *
   * Optional so a caller can ask for a single stateless round; the app passes
   * one instance for the page's lifetime, which is what keeps a label on its
   * element across activations.
   */
  memory?: LabelMemory;
  /**
   * The identity oracle of one round, defaulting to `identityKey`. The seam
   * lets a caller replace or count the walk without changing what a key means;
   * collectHints reads each candidate through it once and spends that value on
   * both recall and the write-back.
   */
  identity?: (element: Element) => string;
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
 * Sort candidates into reading order: rows top to bottom, each row left to
 * right.
 *
 * Rows are found by walking candidates in vertical-centre order and asking
 * whether the candidate sits on the row being built. The test is the centre
 * distance against half the shorter of the two heights, never overlap: overlap
 * is transitive, so one candidate bridging two rows would chain them into a
 * single row and the label stream would jump from the bottom of the page back
 * to the top. The centre test also keeps a tall bar and a short button on one
 * row, which overlap alone would only get right by accident.
 *
 * Rows are then ordered by their top edge and each row by its left edge, so the
 * stream follows what the eye does instead of the DOM tree. The sort is stable,
 * so candidates at the same coordinates keep their DOM order.
 */
function visualOrder<T extends { rect: HintRect }>(entries: readonly T[]): T[] {
  const centre = (entry: T): number => entry.rect.y + entry.rect.h / 2;
  const byCentre = [...entries].sort((a, b) => centre(a) - centre(b));
  const rows: T[][] = [];
  for (const entry of byCentre) {
    const row = rows[rows.length - 1];
    const anchor = row?.[0];
    if (row === undefined || anchor === undefined) {
      rows.push([entry]);
      continue;
    }
    const tolerance = Math.min(anchor.rect.h, entry.rect.h) / 2;
    if (Math.abs(centre(entry) - centre(anchor)) <= tolerance) row.push(entry);
    else rows.push([entry]);
  }
  rows.sort((a, b) => Math.min(...a.map((e) => e.rect.y)) - Math.min(...b.map((e) => e.rect.y)));
  return rows.flatMap((row) => [...row].sort((a, b) => a.rect.x - b.rect.x));
}

/** A candidate that survived stage A, with its geometry and identity key. */
export interface ScannedCandidate {
  readonly element: Element;
  readonly rect: HintRect;
  /** Identity of the element for label recall; "" when no memory is in play. */
  readonly key: string;
}

/**
 * Stage A of one round: a resumable walk of the candidate snapshot.
 *
 * The walk is split because the reader pays for it on the activation frame.
 * Geometry is read first and the survivors are ordered by y then x, a cheap
 * approximation of reading order that costs one array sort; the expensive
 * reachability and identity walks then run in that order. Every call to
 * `advance` stops on a time budget, so the caller decides how much of the page
 * a frame may touch.
 *
 * Stage A never decides a label: total count and full visual order are only
 * known once it is over, and `finish` is where that decision belongs.
 */
export interface HintScan {
  /** Candidates the selector returned for this round. */
  readonly total: number;
  /** Elements whose geometry has been read so far. */
  readonly scanned: number;
  /** Stage A is over; `finish` may run. */
  readonly ready: boolean;
  /**
   * Run stage A until `budgetMs` of measured time is spent or the walk ends.
   * Returns true when the scan is ready for `finish`.
   */
  advance(budgetMs: number, now?: () => number): boolean;
  /**
   * Stage B: sort, decide the round's label length, recall and assign labels.
   * Pure array work on the candidates stage A collected; it never reads layout
   * or style, which is what keeps it out of the frame budget's way.
   */
  finish(): Hint[];
}

/** Wall clock used when a caller does not inject one (tests do). */
function defaultNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function createHintScan(
  selectCandidates: () => Element[],
  viewport: { width: number; height: number },
  deps: CollectDeps,
): HintScan {
  const elements = selectCandidates();
  // The raw snapshot, not the kept set: an ancestor that is a candidate but
  // was itself filtered out can still never be a wrapper of a kept element, so
  // marking against the snapshot and intersecting at the end is the same set
  // as comparing only kept candidates.
  const raw = new Set(elements);
  const measured: { element: Element; rect: HintRect }[] = [];
  const kept: ScannedCandidate[] = [];
  const wrappers = new Set<Element>();
  const memory = deps.memory;
  const identity = deps.identity ?? identityKey;
  let measureIndex = 0;
  let filterIndex = 0;
  let ordered = false;
  let ready = false;
  let finished: Hint[] | undefined;

  function measureOne(): void {
    const element = elements[measureIndex] as Element;
    measureIndex += 1;
    const rect = element.getBoundingClientRect();
    // Zero-area rects (display:none stubs, collapsed cells) never intersect
    // usefully, and the strict comparisons below drop them for free.
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.x < viewport.width &&
      rect.x + rect.width > 0 &&
      rect.y < viewport.height &&
      rect.y + rect.height > 0
    ) {
      measured.push({ element, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } });
    }
  }

  function filterOne(): void {
    const entry = measured[filterIndex] as { element: Element; rect: HintRect };
    filterIndex += 1;
    if (!deps.isVisible(entry.element)) return;
    // A candidate that contains another candidate is a wrapper; the deepest
    // target wins. Marking ancestors is the same set as comparing every pair —
    // `contains` means exactly "is an ancestor of" — but it costs O(n · depth)
    // instead of O(n²). That quadratric scan is what the reader feels as a
    // pause before the labels appear: measured 47ms of main thread at 1200
    // visible candidates, against 0.4ms here, and the cost grows with the
    // square of a busy page rather than with its depth.
    for (let ancestor = entry.element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
      if (raw.has(ancestor)) wrappers.add(ancestor);
    }
    kept.push({
      element: entry.element,
      rect: entry.rect,
      // Read here rather than in stage B: identity walks the ancestor chain and
      // normalises text, the expensive half of collection, so it belongs inside
      // the budgeted pass. Without a memory neither recall nor write-back reads
      // a key, so the round pays nothing for one.
      key: memory === undefined ? "" : identity(entry.element),
    });
  }

  return {
    total: elements.length,
    get scanned(): number {
      return measureIndex;
    },
    get ready(): boolean {
      return ready;
    },
    advance(budgetMs: number, now: () => number = defaultNow): boolean {
      if (ready) return true;
      const start = now();
      let worked = false;
      while (measureIndex < elements.length) {
        // The check runs before the next unit, never after the last: spending
        // the budget on one candidate is what guarantees forward progress even
        // when the budget is zero.
        if (worked && now() - start >= budgetMs) return false;
        measureOne();
        worked = true;
      }
      if (!ordered) {
        measured.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
        ordered = true;
      }
      while (filterIndex < measured.length) {
        if (worked && now() - start >= budgetMs) return false;
        filterOne();
        worked = true;
      }
      ready = true;
      return true;
    },
    finish(): Hint[] {
      if (finished !== undefined) return finished;
      if (!ready) throw new Error("dsh-jump: hint scan is not ready");
      finished = finalizeHints(kept, wrappers, deps);
      return finished;
    },
  };
}

/**
 * Stage B: settle the round's labels from stage A's candidates.
 *
 * Labels are decided only after the final candidate array and its visual order
 * exist, so the whole round shares one label length. A label already spent on a
 * candidate last round is handed back to it first, and the rest of the stream
 * fills the gaps. The stream is walked in order and a remembered label is
 * skipped when it is already taken, so the labels left over stay a prefix of the
 * stream and no label is ever issued twice.
 */
function finalizeHints(
  kept: readonly ScannedCandidate[],
  wrappers: ReadonlySet<Element>,
  deps: CollectDeps,
): Hint[] {
  const deepest = kept.filter(({ element }) => !wrappers.has(element));
  const ordered = visualOrder(deepest);
  const keys = keysPerLabel(ordered.length);
  const memory = deps.memory;
  const identityKeys = new Map<Element, string>();
  if (memory !== undefined) {
    for (const entry of ordered) identityKeys.set(entry.element, entry.key);
  }
  const recalled = memory === undefined
    ? new Map<Element, string>()
    : recallLabels(memory, ordered.map((entry) => entry.element), keys, identityKeys);
  const taken = new Set(recalled.values());
  const labels = generateLabels(keys);
  const hints = ordered.map((entry) => {
    const remembered = recalled.get(entry.element);
    if (remembered !== undefined) return { element: entry.element, label: remembered, rect: entry.rect };
    for (;;) {
      const next = labels.next();
      if (next.done === true) throw new Error("dsh-jump: label space exhausted");
      if (taken.has(next.value)) continue;
      taken.add(next.value);
      return { element: entry.element, label: next.value, rect: entry.rect };
    }
  });
  if (memory !== undefined) {
    for (const hint of hints) memory.record(identityKeys.get(hint.element) ?? "", hint.label);
  }
  return hints;
}

/**
 * One-shot collection: the whole page in a single call.
 *
 * Kept for callers that have no frame to spread the walk over (tests, small
 * pages, hosts without requestAnimationFrame). The app uses `createHintScan`
 * directly so the activation frame only pays for the first batch.
 */
export function collectHints(
  selectCandidates: () => Element[],
  viewport: { width: number; height: number },
  deps: CollectDeps,
): Hint[] {
  const scan = createHintScan(selectCandidates, viewport, deps);
  scan.advance(Number.POSITIVE_INFINITY);
  return scan.finish();
}
