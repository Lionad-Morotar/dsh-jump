/**
 * Hint badge overlay: one fixed container whose only job is drawing the label
 * round. Coordinates come from the activation snapshot inside each Hint, so
 * badges stay put even if the page scrolls afterwards (v1 freezes the round
 * on purpose; recomputing mid-round would move labels under the user fingers).
 */
import type { Hint } from "./hints.ts";

export interface OverlayViewport {
  width: number;
  height: number;
}

export interface Overlay {
  /** Redraw the round; a pending prefix keeps its badges lit and dims the rest. */
  render(hints: readonly Hint[], pending?: string): void;
  destroy(): void;
}

export interface OverlayDeps {
  doc?: Document;
  viewport?: () => OverlayViewport;
}

/** Badge box estimate for clamping; hint rects are target-sized, not badge-sized. */
const BADGE_W = 24;
const BADGE_H = 16;

export function createOverlay(deps: OverlayDeps = {}): Overlay {
  const doc = deps.doc ?? globalThis.document;
  const viewport =
    deps.viewport ?? (() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }));
  let container: HTMLElement | undefined;

  function ensureContainer(): HTMLElement {
    if (container !== undefined) return container;
    const el = doc.createElement("div");
    el.dataset.dshJumpOverlay = "";
    // Max int z-index plus pointer-events:none: the overlay floats above
    // everything while never stealing the hover or click it is labeling.
    el.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    doc.documentElement.append(el);
    container = el;
    return el;
  }

  /** One painted run of label text, tagged so the split can be styled by part. */
  function segment(part: string, text: string, weight?: string): HTMLElement {
    const el = doc.createElement("span");
    el.dataset.jumpPart = part;
    el.textContent = text;
    if (weight !== undefined) el.style.fontWeight = weight;
    return el;
  }

  /**
   * The badge text of one hint. A prefix the label still starts with splits the
   * label into the letters already typed and the ones left behind; a bare or
   * ruled-out label stays one run, so the badge keeps reading as whole.
   */
  function segments(hint: Hint, pending: string): HTMLElement[] {
    const typed = pending !== "" && hint.label.startsWith(pending) ? pending : "";
    if (typed === "") return [segment("whole", hint.label)];
    // Weight, not colour, marks the hand-off: dimming already means "ruled out"
    // and must stay reserved for badges the prefix cannot reach.
    return [
      segment("typed", typed, "700"),
      segment("rest", hint.label.slice(typed.length), "400"),
    ];
  }

  function badge(hint: Hint, pending: string): HTMLElement {
    const el = doc.createElement("div");
    el.dataset.jumpLabel = hint.label;
    el.append(...segments(hint, pending));
    const { width, height } = viewport();
    // A hint at the viewport edge still needs its badge on screen, so the
    // badge box (not the hint) is clamped into the viewport.
    const x = Math.min(Math.max(hint.rect.x, 0), Math.max(width - BADGE_W, 0));
    const y = Math.min(Math.max(hint.rect.y, 0), Math.max(height - BADGE_H, 0));
    el.style.cssText =
      "position:fixed;left:" + String(Math.round(x)) + "px;top:" + String(Math.round(y)) + "px;" +
      "padding:1px 3px;background:#ffd60a;color:#000;border-radius:3px;" +
      "font:11px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;" +
      "opacity:" + (hint.label.startsWith(pending) ? "1" : "0.3");
    return el;
  }

  return {
    render(hints: readonly Hint[], pending = ""): void {
      const root = ensureContainer();
      root.replaceChildren(...hints.map((hint) => badge(hint, pending)));
    },
    destroy(): void {
      container?.remove();
      container = undefined;
    },
  };
}
