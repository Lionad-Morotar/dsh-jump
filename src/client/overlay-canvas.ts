/**
 * Canvas painting for one label round: target outlines, badge geometry, text
 * segmentation and the draw calls. Everything here is a pure function of
 * (hints, prefix, viewport), so the overlay above only owns when to paint.
 *
 * The badge contract is the one the DOM badges shipped: a 24x16 box with a 3px
 * radius, the Vimium yellow fill, black 11px monospace text, 1px/3px padding,
 * the typed prefix in 700 weight and the rest in 400, and a ruled-out badge
 * drawn whole at 0.3 opacity. The colours stay hardcoded because the DOM
 * implementation never read CSS variables for them; introducing a computed
 * style read now would be a new dependency on the host's token names, not a
 * port of the existing look.
 *
 * The outline is drawn on this same canvas rather than on the targets: a
 * `className` or inline style on the host element would outlive the round and
 * fight the page's own state, and one repaint then has to cover both layers
 * anyway.
 */
import type { Hint, HintRect } from "./hints.ts";

export interface OverlayViewport {
  readonly width: number;
  readonly height: number;
}

/** Badge box; also the clamp box at the viewport edge. */
export const BADGE_WIDTH = 24;
export const BADGE_HEIGHT = 16;
const BADGE_RADIUS = 3;
const PADDING_X = 3;
/** Vertical centre of the 16px box, used as the text baseline. */
const BASELINE_Y = 8;
const FONT_SIZE = 11;
const FONT_FAMILY = "ui-monospace, Menlo, monospace";
const BADGE_FILL = "#ffd60a";
const BADGE_INK = "#000";
/** A ruled-out badge fades as a whole; the DOM badge did this with opacity. */
export const DIM_ALPHA = 0.3;

/**
 * Opacity of one badge on this repaint.
 *
 * The exclusion fade is time-dependent, so the surface cannot derive it from
 * (hints, prefix) alone. The overlay owns the clock and the fade state and hands
 * the answer down; without a resolver the surface keeps the original two-state
 * look, which is what a host with no frames gets.
 */
export type BadgeAlpha = (hint: Hint, matched: boolean) => number;

/**
 * Target outline, in two tiers.
 *
 * The faint ring has to survive 155 of them at once without becoming a wall, so
 * it is a neutral grey at low alpha: neutral because the host page may be light
 * or dark and the ring has to read on both, and low because the ring is
 * background information, not the thing being read. The matching ring reuses
 * the badge yellow, which is what makes "this one still counts" legible at a
 * glance, and doubles the width so the difference survives at badge scale.
 */
const OUTLINE_FAINT = "rgba(128,128,136,0.45)";
const OUTLINE_FAINT_WIDTH = 1;
const OUTLINE_STRONG = BADGE_FILL;
const OUTLINE_STRONG_WIDTH = 2;

/**
 * Whether the live prefix narrows this label down to a current match.
 *
 * Deliberately not the badge's rule. An empty prefix matches every label as a
 * string, which is right for badge dimming (nothing is ruled out yet, so
 * everything stays lit) but wrong for the outline: it would put all 155 targets
 * in the strong tier and leave the reader no way to see how many remain.
 */
function narrowsTo(label: string, pending: string): boolean {
  return pending !== "" && label.startsWith(pending);
}

export interface BadgeOrigin {
  readonly x: number;
  readonly y: number;
}

/**
 * Top-left corner of one badge, clamped so a target at the viewport edge still
 * gets its whole box on screen. The snapshot rect is already in viewport
 * coordinates, so no scroll offset enters here.
 */
export function badgeOrigin(
  rect: HintRect,
  bounds: OverlayViewport,
  width = BADGE_WIDTH,
): BadgeOrigin {
  const x = Math.min(Math.max(rect.x, 0), Math.max(bounds.width - width, 0));
  const y = Math.min(Math.max(rect.y, 0), Math.max(bounds.height - BADGE_HEIGHT, 0));
  return { x: Math.round(x), y: Math.round(y) };
}

export interface TextRun {
  readonly text: string;
  readonly weight: 400 | 700;
}

/**
 * The runs of one badge under a prefix.
 *
 * An empty prefix, which is also what a ruled-out badge gets, stays one run so
 * the badge reads as a whole label. A matching prefix splits into the typed
 * letters at 700 and the rest at 400; the empty rest of a completed label is
 * dropped instead of drawing a zero-width run.
 */
export function textRuns(label: string, pending: string): readonly TextRun[] {
  if (pending === "" || !label.startsWith(pending)) return [{ text: label, weight: 400 }];
  const rest = label.slice(pending.length);
  return rest === ""
    ? [{ text: pending, weight: 700 }]
    : [
        { text: pending, weight: 700 },
        { text: rest, weight: 400 },
      ];
}

export type CanvasContextFactory = (canvas: HTMLCanvasElement) => CanvasRenderingContext2D | null;

export interface CanvasSurface {
  readonly canvas: HTMLCanvasElement;
  /**
   * Full repaint of the first `count` hints. Every call clears the whole
   * backing store first: the round is a pure function of the hints, so partial
   * frames repaint the prefix they have already shown instead of trying to
   * patch pixels.
   */
  paint(hints: readonly Hint[], bounds: OverlayViewport, pending: string, count: number, alpha?: BadgeAlpha): void;
  /**
   * Draw hints in `[from, to)` without clearing what is already there.
   *
   * The slow path appends one collected batch per frame, and a full repaint of
   * the growing prefix would make each frame pay for every badge again. The
   * canvas keeps the earlier badges; only the new tail costs anything.
   */
  paintRange(
    hints: readonly Hint[],
    bounds: OverlayViewport,
    pending: string,
    from: number,
    to: number,
    alpha?: BadgeAlpha,
  ): void;
  clear(): void;
}

/**
 * The 2D context, or null where the host has no canvas support.
 *
 * `getContext` exists on the element even in hosts that never implemented the
 * 2D API (jsdom); calling it there produces a host-level capability error on
 * every activation. The constructor is the honest probe: it is present in
 * every browser that can actually paint.
 */
function defaultContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const view = canvas.ownerDocument?.defaultView as
    | (typeof globalThis & { CanvasRenderingContext2D?: unknown })
    | null
    | undefined;
  if (view?.CanvasRenderingContext2D === undefined) return null;
  return canvas.getContext("2d");
}

function devicePixelRatioOf(doc: Document): number {
  const ratio = doc.defaultView?.devicePixelRatio ?? 1;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

/**
 * Create the one canvas a round paints on. The caller owns attaching it to the
 * document and promoting it to the top layer; this module only knows pixels.
 */
export function createCanvasSurface(
  doc: Document,
  factory?: CanvasContextFactory,
): CanvasSurface {
  const canvas = doc.createElement("canvas");
  canvas.dataset.dshJumpOverlay = "";
  // The badges are a visual hint, never content: screen readers should hear the
  // labeled element itself, not a canvas rectangle. No role and no label.
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;display:block;margin:0;padding:0;border:0;background:transparent;" +
    "z-index:2147483647;pointer-events:none";
  const context = factory !== undefined ? factory(canvas) : defaultContext(canvas);
  let sized: { width: number; height: number; dpr: number } | undefined;
  let lastBounds: OverlayViewport | undefined;

  function resize(bounds: OverlayViewport): void {
    const dpr = devicePixelRatioOf(doc);
    lastBounds = bounds;
    const previous = sized;
    if (
      previous !== undefined &&
      previous.width === bounds.width &&
      previous.height === bounds.height &&
      previous.dpr === dpr
    ) {
      return;
    }
    canvas.style.width = String(bounds.width) + "px";
    canvas.style.height = String(bounds.height) + "px";
    // The backing store is in device pixels; the transform puts drawing back in
    // CSS pixels, which is what keeps 11px text sharp on a Retina display.
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    sized = { width: bounds.width, height: bounds.height, dpr };
  }

  function paintBadge(
    ctx: CanvasRenderingContext2D,
    hint: Hint,
    bounds: OverlayViewport,
    pending: string,
    alpha?: BadgeAlpha,
  ): void {
    // Long labels (the >2000 fallback round uses four keys) must not spill out
    // of the box; 24px is the floor that keeps ordinary one-to-three key
    // badges on the documented size.
    ctx.font = String(400) + " " + String(FONT_SIZE) + "px " + FONT_FAMILY;
    const textWidth = ctx.measureText(hint.label).width;
    const width = Math.max(BADGE_WIDTH, Math.ceil(textWidth) + PADDING_X * 2);
    const { x, y } = badgeOrigin(hint.rect, bounds, width);
    const matched = hint.label.startsWith(pending);
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? (matched ? 1 : DIM_ALPHA) : alpha(hint, matched);
    ctx.fillStyle = BADGE_FILL;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, BADGE_HEIGHT, BADGE_RADIUS);
    } else {
      // A host without roundRect still gets the badge; losing the radius is
      // better than losing the label.
      ctx.rect(x, y, width, BADGE_HEIGHT);
    }
    ctx.fill();
    ctx.fillStyle = BADGE_INK;
    let cursor = x + PADDING_X;
    for (const run of textRuns(hint.label, matched ? pending : "")) {
      ctx.font = String(run.weight) + " " + String(FONT_SIZE) + "px " + FONT_FAMILY;
      ctx.fillText(run.text, cursor, y + BASELINE_Y);
      cursor += ctx.measureText(run.text).width;
    }
    ctx.restore();
  }

  /**
   * Stroke one tier of outlines as a single path.
   *
   * One `stroke()` for the whole tier, not one per target: 155 candidates would
   * otherwise be 155 raster calls per repaint, and every prefix stroke repaints
   * the round. The path is offset outward by half the line width so the ring
   * sits against the element's edge instead of covering its content.
   */
  function strokeRing(
    ctx: CanvasRenderingContext2D,
    rects: readonly HintRect[],
    color: string,
    width: number,
  ): void {
    if (rects.length === 0) return;
    const half = width / 2;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const rect of rects) {
      ctx.rect(rect.x - half, rect.y - half, rect.w + width, rect.h + width);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Ring every painted target, faint unless the live prefix still reaches it.
   *
   * The two tiers are collected first and stroked after, so a repaint costs two
   * raster calls no matter how the round splits between them.
   */
  function paintOutlines(
    ctx: CanvasRenderingContext2D,
    hints: readonly Hint[],
    pending: string,
    from: number,
    to: number,
  ): void {
    const faint: HintRect[] = [];
    const strong: HintRect[] = [];
    for (let index = from; index < to; index += 1) {
      const hint = hints[index];
      if (hint === undefined) break;
      // A zero-area rect has no edge to stroke and would draw a dot.
      if (hint.rect.w <= 0 || hint.rect.h <= 0) continue;
      (narrowsTo(hint.label, pending) ? strong : faint).push(hint.rect);
    }
    strokeRing(ctx, faint, OUTLINE_FAINT, OUTLINE_FAINT_WIDTH);
    strokeRing(ctx, strong, OUTLINE_STRONG, OUTLINE_STRONG_WIDTH);
  }

  function drawRange(
    ctx: CanvasRenderingContext2D,
    hints: readonly Hint[],
    bounds: OverlayViewport,
    pending: string,
    from: number,
    to: number,
    alpha?: BadgeAlpha,
  ): void {
    ctx.textBaseline = "middle";
    // Outlines first: a badge sits on the target's corner and has to stay
    // readable over the ring it belongs to.
    paintOutlines(ctx, hints, pending, from, to);
    for (let index = from; index < to; index += 1) {
      const hint = hints[index];
      if (hint === undefined) break;
      paintBadge(ctx, hint, bounds, pending, alpha);
    }
  }

  return {
    canvas,
    paint(hints, bounds, pending, count, alpha): void {
      resize(bounds);
      if (context === null) {
        // No 2D API: keep the round readable as canvas fallback text instead of
        // leaving an empty element behind.
        canvas.textContent = hints
          .slice(0, count)
          .map((hint) => hint.label)
          .join(" ");
        return;
      }
      context.clearRect(0, 0, bounds.width, bounds.height);
      drawRange(context, hints, bounds, pending, 0, count, alpha);
    },
    paintRange(hints, bounds, pending, from, to, alpha): void {
      resize(bounds);
      if (context === null) {
        canvas.textContent = hints
          .slice(0, to)
          .map((hint) => hint.label)
          .join(" ");
        return;
      }
      drawRange(context, hints, bounds, pending, from, to, alpha);
    },
    clear(): void {
      if (context === null) {
        canvas.textContent = "";
        return;
      }
      if (lastBounds !== undefined) {
        context.clearRect(0, 0, lastBounds.width, lastBounds.height);
      }
    },
  };
}
