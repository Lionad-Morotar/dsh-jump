/**
 * Hint badge overlay: one fixed container whose only job is drawing the label
 * round. Coordinates come from the activation snapshot inside each Hint, so
 * badges stay put even if the page scrolls afterwards (v1 freezes the round
 * on purpose; recomputing mid-round would move labels under the user fingers).
 *
 * Two costs scale with the round: minting the badges, and repainting them on
 * every stroke of a label. The first is unavoidable — N targets need N marks —
 * so the second is what has to stay off the keystroke path. Badges are keyed
 * by label and updated in place: a stroke rewrites opacity on the badges the
 * prefix ruled out (one property each) and re-segments only the few it still
 * reaches, leaving position, size and node identity untouched. Rebuilding the
 * whole run per stroke is what made a busy page feel sluggish while typing,
 * and that cost was paid on every stroke of a three-key label.
 *
 * Badges are absolutely positioned inside the fixed container rather than fixed
 * themselves. The container already spans the viewport, so the coordinate
 * system is identical while the browser tracks one containing block instead of
 * one per badge.
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

interface Badge {
  element: HTMLElement;
  /** The target this badge was minted for; a new round replaces the badge. */
  target: Element;
  /**
   * Prefix currently painted.
   *
   * The whole lit/dim split is a function of the prefix, so an unchanged prefix
   * means an unchanged badge: that is the check that keeps a stroke from
   * touching the other hundreds of badges in the round.
   */
  drawn: string;
}

export function createOverlay(deps: OverlayDeps = {}): Overlay {
  const doc = deps.doc ?? globalThis.document;
  const viewport =
    deps.viewport ?? (() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }));
  let container: HTMLElement | undefined;
  /** Badges of the current round; labels are unique within a round. */
  let badges = new Map<string, Badge>();

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
   * The badge text of one hint. The typed prefix splits the label into the
   * letters already typed and the ones left behind; an empty prefix, which is
   * also what a ruled-out label gets, stays one run so the badge keeps reading
   * as whole.
   */
  function segments(hint: Hint, typed: string): HTMLElement[] {
    if (typed === "") return [segment("whole", hint.label)];
    // Weight, not colour, marks the hand-off: dimming already means "ruled out"
    // and must stay reserved for badges the prefix cannot reach.
    return [
      segment("typed", typed, "700"),
      segment("rest", hint.label.slice(typed.length), "400"),
    ];
  }

  /**
   * Build one badge: node, static look, clamped position and the text for the
   * prefix that is current when the round opens. Doing the first paint here
   * keeps a round's cost to one append per badge — the same nodes are then
   * only re-segmented on the strokes that actually change them.
   */
  function mint(hint: Hint, bounds: OverlayViewport, pending: string): Badge {
    const el = doc.createElement("div");
    el.dataset.jumpLabel = hint.label;
    // A hint at the viewport edge still needs its badge on screen, so the
    // badge box (not the hint) is clamped into the viewport.
    const x = Math.min(Math.max(hint.rect.x, 0), Math.max(bounds.width - BADGE_W, 0));
    const y = Math.min(Math.max(hint.rect.y, 0), Math.max(bounds.height - BADGE_H, 0));
    const matched = hint.label.startsWith(pending);
    el.style.cssText =
      "position:absolute;left:" + String(Math.round(x)) + "px;top:" + String(Math.round(y)) + "px;" +
      "padding:1px 3px;background:#ffd60a;color:#000;border-radius:3px;" +
      "font:11px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;" +
      "opacity:" + (matched ? "1" : "0.3");
    el.append(...segments(hint, matched ? pending : ""));
    return { element: el, target: hint.element, drawn: pending };
  }

  /**
   * Bring one badge up to the current prefix.
   *
   * One answer drives both the split and the light: a label the prefix still
   * reaches keeps its typed run and stays lit, otherwise it is one whole run
   * and goes dim.
   */
  function paint(badge: Badge, hint: Hint, pending: string): void {
    if (badge.drawn === pending) return;
    badge.drawn = pending;
    const matched = hint.label.startsWith(pending);
    badge.element.style.opacity = matched ? "1" : "0.3";
    badge.element.replaceChildren(...segments(hint, matched ? pending : ""));
  }

  /**
   * Whether `hints` is the round the badges already hold.
   *
   * Keyed on both label and target: a fresh round can hand the same label to a
   * different element, and rendering that in place would leave the badge over
   * the old target. Length equality alone is not enough either, since labels
   * are unique within a round.
   */
  function sameRound(hints: readonly Hint[]): boolean {
    if (badges.size !== hints.length) return false;
    return hints.every((hint) => badges.get(hint.label)?.target === hint.element);
  }

  return {
    render(hints: readonly Hint[], pending = ""): void {
      const root = ensureContainer();
      if (!sameRound(hints)) {
        const bounds = viewport();
        const next = new Map<string, Badge>();
        const nodes: HTMLElement[] = [];
        for (const hint of hints) {
          const badge = mint(hint, bounds, pending);
          next.set(hint.label, badge);
          nodes.push(badge.element);
        }
        badges = next;
        root.replaceChildren(...nodes);
      }
      for (const hint of hints) {
        const badge = badges.get(hint.label);
        // sameRound already proved every label is present; the guard keeps the
        // loop honest under a future caller that renders a partial list.
        if (badge !== undefined) paint(badge, hint, pending);
      }
    },
    destroy(): void {
      badges = new Map();
      container?.remove();
      container = undefined;
    },
  };
}
