/**
 * overlay 的 canvas 契约，守的是用户看到的形态与画布的生命周期：
 *
 * 1. 一轮激活只有一个 canvas，徽章是画上去的像素，不是 DOM 节点。实测 600 枚
 *    全量重绘含等 GPU 只要 1.7ms，所以默认路径同步画完，不走分帧。
 * 2. 只有候选数超过同步上限时才退回分帧；分帧每帧重画已画出的前缀，语义是
 *    「已画出的标签」而不是「已插入的节点」。
 * 3. 视觉分段（已敲前缀 700、剩余 400、被排除整枚 0.3 透明度）通过注入的
 *    上下文替身记录绘制调用断言，jsdom 没有 2D 上下文。
 */
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateLabels, type Hint } from "../src/client/hints.ts";
import { BADGE_HEIGHT, BADGE_WIDTH, badgeOrigin } from "../src/client/overlay-canvas.ts";
import { createOverlay, SYNC_PAINT_LIMIT, type FrameClock, type Overlay } from "../src/client/overlay.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1/" });
const { document } = dom.window;

const VIEWPORT = { width: 800, height: 600 };
const OVERLAY = "[data-dsh-jump-overlay]";

function hintsOf(labels: string[]): Hint[] {
  return labels.map((label, i) => ({
    element: document.createElement("button"),
    label,
    rect: { x: i * 10, y: 0, w: 10, h: 10 },
  }));
}

function overlayCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>(OVERLAY);
}

/** 一次绘制调用的快照；状态取调用发生的那一刻。 */
interface DrawOp {
  readonly kind:
    | "clearRect"
    | "fillText"
    | "setTransform"
    | "roundRect"
    | "rect"
    | "fill"
    | "beginPath"
    | "stroke";
  readonly args: readonly unknown[];
  readonly font: string;
  readonly alpha: number;
  readonly stroke: string;
  readonly lineWidth: number;
}

interface RecordedText {
  readonly text: string;
  readonly weight: string;
  readonly alpha: number;
}

/** 一次描边的快照：颜色、线宽，以及这条路径上攒下的矩形。 */
interface RecordedOutline {
  readonly stroke: string;
  readonly lineWidth: number;
  readonly rects: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[];
}

/** `rgba(...)` 的透明度；`#rrggbb` 这类不透明写法算 1。 */
function alphaOf(color: string): number {
  const parts = color.match(/^rgba?\(([^)]+)\)$/);
  if (parts === null) return 1;
  const fields = (parts[1] ?? "").split(",").map((field) => field.trim());
  return fields.length < 4 ? 1 : Number(fields[3]);
}

/** 描边是否圈住了元素本体：不要求逐像素相等，只要求覆盖它的盒子。 */
function covers(
  outline: { x: number; y: number; w: number; h: number },
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    outline.x <= rect.x &&
    outline.y <= rect.y &&
    outline.x + outline.w >= rect.x + rect.w &&
    outline.y + outline.h >= rect.y + rect.h
  );
}

interface Recorder {
  readonly context: CanvasRenderingContext2D;
  readonly ops: DrawOp[];
  texts(): RecordedText[];
  outlines(): RecordedOutline[];
  clears(): number;
}

/**
 * 记录调用的 2D 上下文替身。
 *
 * jsdom 没有 canvas 2D 实现，装 canvas 包只为单测代价太大；这里只实现绘制
 * 用到的成员，并把每次调用连同当时的 font/globalAlpha 一起记下来，视觉断言
 * 因此能落在「画了什么」而不是「DOM 里有什么」。
 */
function recorder(): Recorder {
  const ops: DrawOp[] = [];
  let font = "10px sans-serif";
  let alpha = 1;
  let strokeStyle = "#000";
  let lineWidth = 1;
  const stack: { font: string; alpha: number }[] = [];
  const push = (kind: DrawOp["kind"], args: readonly unknown[] = []): void => {
    ops.push({ kind, args, font, alpha, stroke: strokeStyle, lineWidth });
  };
  const context = {
    get font(): string {
      return font;
    },
    set font(value: string) {
      font = value;
    },
    set fillStyle(_value: string) {
      // 颜色不是这两个用例的判据，但绘制路径会写它，必须可赋值。
    },
    get fillStyle(): string {
      return "#000";
    },
    get strokeStyle(): string {
      return strokeStyle;
    },
    set strokeStyle(value: string) {
      strokeStyle = value;
    },
    get lineWidth(): number {
      return lineWidth;
    },
    set lineWidth(value: number) {
      lineWidth = value;
    },
    get globalAlpha(): number {
      return alpha;
    },
    set globalAlpha(value: number) {
      alpha = value;
    },
    save(): void {
      stack.push({ font, alpha });
    },
    restore(): void {
      const last = stack.pop();
      if (last !== undefined) {
        font = last.font;
        alpha = last.alpha;
      }
    },
    setTransform(...args: number[]): void {
      push("setTransform", args);
    },
    clearRect(...args: number[]): void {
      push("clearRect", args);
    },
    beginPath(): void {
      push("beginPath");
    },
    roundRect(...args: number[]): void {
      push("roundRect", args);
    },
    rect(...args: number[]): void {
      push("rect", args);
    },
    fill(): void {
      push("fill");
    },
    stroke(): void {
      push("stroke");
    },
    fillText(text: string, x: number, y: number): void {
      push("fillText", [text, x, y]);
    },
    measureText(text: string): { width: number } {
      return { width: text.length * 6.6 };
    },
  } as unknown as CanvasRenderingContext2D;
  return {
    context,
    ops,
    texts: () =>
      ops
        .filter((op) => op.kind === "fillText")
        .map((op) => ({
          text: String(op.args[0]),
          weight: op.font.split(" ")[0] ?? "",
          alpha: op.alpha,
        })),
    outlines: () => {
      const found: RecordedOutline[] = [];
      let path: { x: number; y: number; w: number; h: number }[] = [];
      for (const op of ops) {
        if (op.kind === "beginPath") {
          path = [];
          continue;
        }
        if (op.kind === "rect") {
          const [x, y, w, h] = op.args as number[];
          path.push({ x: x ?? 0, y: y ?? 0, w: w ?? 0, h: h ?? 0 });
          continue;
        }
        if (op.kind === "stroke") {
          found.push({ stroke: op.stroke, lineWidth: op.lineWidth, rects: path });
          path = [];
        }
      }
      return found;
    },
    clears: () => ops.filter((op) => op.kind === "clearRect").length,
  };
}

const mounted: Overlay[] = [];

function mount(options: { clock?: FrameClock; onPaint?: (durationMs: number) => void } = {}): {
  overlay: Overlay;
  recorder: Recorder;
} {
  const recorded = recorder();
  const overlay = createOverlay({
    doc: document,
    viewport: () => VIEWPORT,
    clock: options.clock,
    canvasContext: () => recorded.context,
    onPaint: options.onPaint,
  });
  mounted.push(overlay);
  return { overlay, recorder: recorded };
}

beforeEach(() => {
  document.documentElement.querySelector(OVERLAY)?.remove();
});

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.destroy();
});

describe("badge lifecycle", () => {
  it("reuses one canvas across prefixes of one round", () => {
    const { overlay } = mount();
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints);
    const first = overlayCanvas();
    overlay.render(hints, "a");
    expect(overlayCanvas()).toBe(first);
    expect(overlay.labels()).toEqual(["as", "sd"]);
  });

  it("replaces the labels when a new round arrives", () => {
    const { overlay } = mount();
    overlay.render(hintsOf(["as", "sd"]));
    overlay.render(hintsOf(["fj", "dk"]));
    expect(overlay.labels()).toEqual(["fj", "dk"]);
    expect(overlayCanvas()).not.toBeNull();
  });

  it("repaints the same labels when the prefix did not change", () => {
    const { overlay, recorder: recorded } = mount();
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints, "a");
    const first = recorded.texts();
    overlay.render(hints, "a");
    // 全量重绘是 canvas 的默认路径：第二次画出的文字序列必须与第一次逐条相同。
    expect(recorded.texts()).toEqual([...first, ...first]);
    expect(overlay.labels()).toEqual(["as", "sd"]);
  });

  it("reports one paint duration per paint call, and none for teardown", () => {
    const durations: number[] = [];
    const { overlay } = mount({ onPaint: (durationMs) => durations.push(durationMs) });
    const hints = hintsOf(["as", "sd"]);

    overlay.render(hints);
    overlay.render(hints, "a");
    expect(durations).toHaveLength(2);
    for (const value of durations) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }

    overlay.destroy();
    expect(durations).toHaveLength(2);
  });
});

describe("prefix painting", () => {
  it("splits the badges the prefix reaches and dims the rest", () => {
    const { overlay, recorder: recorded } = mount();
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints);
    // 未敲键时每一枚都是一整段。
    expect(recorded.texts()).toEqual([
      { text: "as", weight: "400", alpha: 1 },
      { text: "sd", weight: "400", alpha: 1 },
    ]);
    overlay.render(hints, "a");
    const stroke = recorded.texts().slice(2);
    // 敲了 a：as 拆成已敲与未敲两段并保持点亮，sd 被前缀排除、整枚变暗。
    expect(stroke).toEqual([
      { text: "a", weight: "700", alpha: 1 },
      { text: "s", weight: "400", alpha: 1 },
      { text: "sd", weight: "400", alpha: 0.3 },
    ]);
  });

  it("drops empty rounds and leaves no canvas behind", () => {
    const { overlay } = mount();
    overlay.render(hintsOf(["as"]));
    overlay.render([]);
    expect(overlay.labels()).toEqual([]);
    overlay.destroy();
    expect(overlayCanvas()).toBeNull();
  });
});

/**
 * 文字分段的四种转态。
 *
 * 分段是用户看到的形态：已敲部分加粗、剩余部分常规，被排除的整枚只画一段并
 * 降到 0.3 透明度。canvas 每帧重画，所以这里断言的是这一帧画出的文字序列。
 */
describe("badge text repaint", () => {
  function strokeTexts(recorded: Recorder, mark: number): RecordedText[] {
    return recorded.texts().slice(mark);
  }

  it("keeps the whole-label run when a matching badge is ruled out", () => {
    const { overlay, recorder: recorded } = mount();
    const hints = hintsOf(["asd", "sd"]);
    overlay.render(hints);
    const mark = recorded.texts().length;

    overlay.render(hints, "a");

    // 首击：sd 从 whole 到 whole，只有透明度变了；asd 拆成两段。
    expect(strokeTexts(recorded, mark)).toEqual([
      { text: "a", weight: "700", alpha: 1 },
      { text: "sd", weight: "400", alpha: 1 },
      { text: "sd", weight: "400", alpha: 0.3 },
    ]);
  });

  it("keeps the whole-label run when a dead key relights a dimmed badge", () => {
    const { overlay, recorder: recorded } = mount();
    const hints = hintsOf(["asd", "sd"]);
    overlay.render(hints);
    overlay.render(hints, "a");
    const mark = recorded.texts().length;

    overlay.render(hints, "");

    // 死键回亮：whole 到 whole，同样只有透明度该动。
    expect(strokeTexts(recorded, mark)).toEqual([
      { text: "asd", weight: "400", alpha: 1 },
      { text: "sd", weight: "400", alpha: 1 },
    ]);
  });

  it("rebuilds the run when a split badge drops out", () => {
    const { overlay, recorder: recorded } = mount();
    const hints = hintsOf(["asa", "asd"]);
    overlay.render(hints, "as");
    expect(strokeTexts(recorded, 0)[0]).toEqual({ text: "as", weight: "700", alpha: 1 });
    const mark = recorded.texts().length;

    overlay.render(hints, "asd");

    // typed/rest 到 whole 是两段换一段。
    expect(strokeTexts(recorded, mark)).toEqual([
      { text: "asa", weight: "400", alpha: 0.3 },
      { text: "asd", weight: "700", alpha: 1 },
    ]);
  });

  it("rebuilds the run when a dimmed badge becomes reachable again", () => {
    const { overlay, recorder: recorded } = mount();
    const hints = hintsOf(["asa", "asd"]);
    overlay.render(hints);
    overlay.render(hints, "asd");
    const mark = recorded.texts().length;

    overlay.render(hints, "as");

    // whole 到 typed/rest，文字内容也变了。
    expect(strokeTexts(recorded, mark)).toEqual([
      { text: "as", weight: "700", alpha: 1 },
      { text: "a", weight: "400", alpha: 1 },
      { text: "as", weight: "700", alpha: 1 },
      { text: "d", weight: "400", alpha: 1 },
    ]);
  });

  it("rebuilds the run when a longer prefix splits further", () => {
    const { overlay, recorder: recorded } = mount();
    const hints = hintsOf(["asd"]);
    overlay.render(hints, "a");
    const mark = recorded.texts().length;

    overlay.render(hints, "as");

    expect(strokeTexts(recorded, mark)).toEqual([
      { text: "as", weight: "700", alpha: 1 },
      { text: "d", weight: "400", alpha: 1 },
    ]);
  });
});

describe("canvas geometry", () => {
  it("covers the viewport with one fixed canvas", () => {
    const { overlay } = mount();
    overlay.render(hintsOf(["as"]));
    const canvas = overlayCanvas();
    expect(canvas?.tagName).toBe("CANVAS");
    expect(canvas?.style.position).toBe("fixed");
    expect(canvas?.style.width).toBe(String(VIEWPORT.width) + "px");
    expect(canvas?.style.height).toBe(String(VIEWPORT.height) + "px");
  });

  it("clamps a badge at the viewport edge back inside", () => {
    // 徽章贴在被标注元素的左上角，但边缘目标仍要把整枚徽章夹回视口。
    expect(badgeOrigin({ x: 795, y: 595, w: 10, h: 10 }, VIEWPORT)).toEqual({
      x: VIEWPORT.width - BADGE_WIDTH,
      y: VIEWPORT.height - BADGE_HEIGHT,
    });
  });
});

describe("top layer", () => {
  /**
   * 目标可能是 popover（峰价提醒一类）或 showModal 打开的对话框，它们整体放在
   * top layer 上，会盖住任何 z-index 的普通元素。canvas 必须同样以 manual
   * popover 进场，每轮重新抬一次。
   */
  it("enters the top layer as a manual popover and re-raises on a new round", () => {
    const proto = dom.window.Element.prototype as unknown as Record<string, unknown>;
    const shown: Element[] = [];
    proto["showPopover"] = function (this: Element) { shown.push(this) };
    proto["hidePopover"] = function () {};
    try {
      const { overlay } = mount();
      overlay.render(hintsOf(["as"]));
      const first = overlayCanvas();
      expect(first?.getAttribute("popover")).toBe("manual");
      expect(shown).toContain(first);
      overlay.destroy();
      overlay.render(hintsOf(["as"]));
      expect(shown).toHaveLength(2);
    } finally {
      delete proto["showPopover"];
      delete proto["hidePopover"];
    }
  });

  it("falls back to a plain canvas when popovers are unavailable", () => {
    // 没有 showPopover 的宿主里留着 popover 属性会被 UA 样式表按「未打开」藏掉，
    // 徽章会整轮消失，所以拿不到能力时不能留下这个属性。
    const { overlay } = mount();
    overlay.render(hintsOf(["as"]));
    expect(overlayCanvas()?.hasAttribute("popover")).toBe(false);
  });
});

describe("canvas backing store", () => {
  it("sizes the canvas to the viewport", () => {
    const { overlay } = mount();
    overlay.render(hintsOf(["as"]));
    const canvas = overlayCanvas();
    // jsdom 的 devicePixelRatio 是 1，所以 backing store 与视口同尺寸。
    expect(canvas?.width).toBe(VIEWPORT.width);
    expect(canvas?.height).toBe(VIEWPORT.height);
  });

  it("scales the canvas by the device pixel ratio and sets the transform", () => {
    const descriptor = Object.getOwnPropertyDescriptor(dom.window, "devicePixelRatio");
    Object.defineProperty(dom.window, "devicePixelRatio", { configurable: true, value: 2 });
    try {
      const { overlay, recorder: recorded } = mount();
      overlay.render(hintsOf(["as"]));
      const canvas = overlayCanvas();
      expect(canvas?.width).toBe(VIEWPORT.width * 2);
      expect(canvas?.height).toBe(VIEWPORT.height * 2);
      expect(recorded.ops.some((op) => op.kind === "setTransform" && op.args.join(",") === "2,0,0,2,0,0")).toBe(true);
    } finally {
      if (descriptor === undefined) {
        delete (dom.window as unknown as Record<string, unknown>)["devicePixelRatio"];
      } else {
        Object.defineProperty(dom.window, "devicePixelRatio", descriptor);
      }
    }
  });

  it("paints the whole round in one pass", () => {
    // 300 枚一次画完：一次清屏、每条标签一次 fillText，没有第二帧。
    const { overlay, recorder: recorded } = mount();
    const hints = progressiveHints(300);
    overlay.renderProgressive(hints);
    expect(overlay.labels()).toHaveLength(300);
    expect(recorded.clears()).toBe(1);
    expect(recorded.texts()).toHaveLength(300);
  });
});

/** 手动推进的帧时钟：jsdom 没有真实帧，分帧只在该步进时发生。 */
function frameClock(start = 0): FrameClock & { step(ms: number): void; requests(): number } {
  let time = start;
  let nextHandle = 1;
  let requests = 0;
  const queued = new Map<number, (time: number) => void>();
  return {
    now: () => time,
    request: (callback) => {
      requests += 1;
      const handle = nextHandle++;
      queued.set(handle, callback);
      return handle;
    },
    requests: () => requests,
    cancel: (handle) => {
      queued.delete(handle);
    },
    step: (ms) => {
      time += ms;
      const due = [...queued.values()];
      queued.clear();
      for (const callback of due) callback(time);
    },
  };
}

function progressiveHints(count: number): Hint[] {
  // Distinct positions inside the viewport: a label handed to another target
  // would also change the badge's clamped origin, so a comparison can see a
  // drift instead of two badges stacking on the same clamped corner.
  return [...generateLabels(4)].slice(0, count).map((label, index) => ({
    element: document.createElement("button"),
    label,
    rect: { x: (index % 30) * 20, y: Math.floor(index / 30) * 20, w: 10, h: 10 },
  }));
}

describe("progressive painting", () => {
  it("paints every hint before returning below the synchronous limit", async () => {
    const { overlay, recorder: recorded } = mount();
    const round = overlay.renderProgressive(progressiveHints(SYNC_PAINT_LIMIT));
    let settled = false;
    void round.done.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(true);
    expect(overlay.labels()).toHaveLength(SYNC_PAINT_LIMIT);
    expect(overlay.visibleLabels()).toHaveLength(SYNC_PAINT_LIMIT);
    expect(recorded.clears()).toBe(1);
  });

  it("reports the round as already settled below the limit", async () => {
    const { overlay } = mount();
    const round = overlay.renderProgressive(progressiveHints(300));
    await expect(round.done).resolves.toBeUndefined();
    expect(overlay.labels()).toHaveLength(300);
  });

  it("paints the first batch in the activation frame above the limit", () => {
    const clock = frameClock();
    const { overlay, recorder: recorded } = mount({ clock });
    overlay.renderProgressive(progressiveHints(SYNC_PAINT_LIMIT + 1));
    // 超限才分帧：激活帧只画出第一批，剩余标签还不可见。
    expect(recorded.clears()).toBe(1);
    expect(overlay.visibleLabels().length).toBeGreaterThan(0);
    expect(overlay.visibleLabels().length).toBeLessThan(SYNC_PAINT_LIMIT + 1);
    expect(overlay.labels()).toHaveLength(SYNC_PAINT_LIMIT + 1);
  });

  it("grows the drawn prefix across frames until every label is visible", () => {
    const clock = frameClock();
    const { overlay } = mount({ clock });
    const total = SYNC_PAINT_LIMIT + 1;
    overlay.renderProgressive(progressiveHints(total));
    const first = overlay.visibleLabels().length;
    clock.step(16);
    const second = overlay.visibleLabels().length;
    expect(second).toBeGreaterThan(first);
    for (let frame = 0; frame < 10 && overlay.visibleLabels().length < total; frame += 1) clock.step(16);
    expect(overlay.visibleLabels()).toHaveLength(total);
  });

  it("reports when the fallback round is fully painted", async () => {
    const clock = frameClock();
    const { overlay } = mount({ clock });
    const round = overlay.renderProgressive(progressiveHints(SYNC_PAINT_LIMIT + 1));
    let settled = false;
    void round.done.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    for (let frame = 0; frame < 10; frame += 1) clock.step(16);
    await round.done;
    expect(settled).toBe(true);
    expect(overlay.visibleLabels()).toHaveLength(SYNC_PAINT_LIMIT + 1);
  });

  it("keeps every label on the same target as one synchronous render", () => {
    const hints = progressiveHints(300);
    const { overlay } = mount();
    overlay.renderProgressive(hints);
    const progressive = overlay.labels();

    overlay.destroy();
    overlay.render(hints);
    expect(overlay.labels()).toEqual(progressive);
  });

  it("keeps labels stable while the visible prefix grows", () => {
    const clock = frameClock();
    const { overlay } = mount({ clock });
    const hints = progressiveHints(SYNC_PAINT_LIMIT + 1);
    overlay.renderProgressive(hints);
    const labels = overlay.labels();
    expect(labels).toEqual(hints.map((hint) => hint.label));
    clock.step(16);
    expect(overlay.labels()).toEqual(labels);
  });

  it("cancels a queued fallback and removes the canvas", async () => {
    const clock = frameClock();
    const { overlay, recorder: recorded } = mount({ clock });
    const round = overlay.renderProgressive(progressiveHints(SYNC_PAINT_LIMIT + 1));
    const done = round.done;
    round.cancel();
    // 取消也要释放等待者，否则 settled() 会永远挂着。
    await expect(done).resolves.toBeUndefined();
    expect(overlay.labels()).toEqual([]);
    expect(overlayCanvas()).toBeNull();
    // cancel 本身清一次画布；之后队列里的帧不能再画一次。
    const clears = recorded.clears();
    clock.step(16);
    expect(recorded.clears()).toBe(clears);
    expect(overlayCanvas()).toBeNull();
  });

  it("starts a fresh round from the first batch after a cancelled one", () => {
    const clock = frameClock();
    const { overlay } = mount({ clock });
    const total = SYNC_PAINT_LIMIT + 1;
    overlay.renderProgressive(progressiveHints(total));
    const first = overlay.visibleLabels().length;
    overlay.renderProgressive([]).cancel();

    overlay.renderProgressive(progressiveHints(total));
    // 新轮从第一批重新开始，不夹带上一轮已经画出的残余。
    expect(overlay.visibleLabels()).toHaveLength(first);
    expect(overlay.labels()).toHaveLength(total);
  });

  it("stops painting after destroy", () => {
    const clock = frameClock();
    const { overlay, recorder: recorded } = mount({ clock });
    overlay.renderProgressive(progressiveHints(SYNC_PAINT_LIMIT + 1));
    overlay.destroy();
    const clears = recorded.clears();
    clock.step(16);
    expect(recorded.clears()).toBe(clears);
    expect(overlay.labels()).toEqual([]);
    expect(overlayCanvas()).toBeNull();
  });

  it("falls back to a synchronous paint when the host has no frames", () => {
    const { overlay } = mount();
    overlay.renderProgressive(progressiveHints(SYNC_PAINT_LIMIT + 1));
    // 没有帧调度器的宿主里，正确性优先：整轮落在这一帧里。
    expect(overlay.visibleLabels()).toHaveLength(SYNC_PAINT_LIMIT + 1);
  });

  it("treats the limit itself as synchronous", () => {
    const clock = frameClock();
    const { overlay, recorder: recorded } = mount({ clock });
    overlay.renderProgressive(progressiveHints(SYNC_PAINT_LIMIT));
    expect(recorded.clears()).toBe(1);
    expect(clock.requests()).toBe(0);
    expect(overlay.visibleLabels()).toHaveLength(SYNC_PAINT_LIMIT);
  });
});

describe("appending a later batch", () => {
  it("画布只补画新增的一批，不清屏也不重画已有标签", () => {
    const { overlay, recorder: recorded } = mount();
    overlay.append(hintsOf(["a", "s"]));
    const clears = recorded.clears();
    overlay.append(hintsOf(["d", "f"]));

    expect(recorded.clears()).toBe(clears);
    expect(overlay.labels()).toEqual(["a", "s", "d", "f"]);
    expect(overlay.visibleLabels()).toEqual(["a", "s", "d", "f"]);
    expect(recorded.texts().map((entry) => entry.text)).toEqual(["a", "s", "d", "f"]);
  });

  it("空批次不碰画布", () => {
    const { overlay, recorder: recorded } = mount();
    overlay.append([]);
    expect(overlayCanvas()).toBeNull();
    expect(recorded.texts()).toEqual([]);
  });
});

/**
 * 目标本体描边。
 *
 * 徽章只说明「有个标签」，不说明标签属于哪个元素：一屏 155 枚徽章时，用户得靠
 * 位置猜。描边把「这个元素能被跳到」直接画在元素身上，并随前缀分成淡/重两档。
 * 断言落在绘制调用上（画在哪、多粗、什么透明度），因为 jsdom 没有像素。
 */
describe("target outline", () => {
  /**
   * 一次绘制里每个元素拿到的描边。
   *
   * 按矩形归并而不是按 stroke 调用归并：一次 stroke 画几个矩形是绘制层的实现
   * 自由，用户看到的只是「这个元素上有一圈线」。
   */
  function ringsOf(recorded: Recorder, hints: readonly Hint[]): Map<Hint, RecordedOutline> {
    const rings = new Map<Hint, RecordedOutline>();
    for (const outline of recorded.outlines()) {
      for (const hint of hints) {
        if (rings.has(hint)) continue;
        if (outline.rects.some((rect) => covers(rect, hint.rect))) rings.set(hint, outline);
      }
    }
    return rings;
  }

  function ringOf(recorded: Recorder, hint: Hint): RecordedOutline | undefined {
    return ringsOf(recorded, [hint]).get(hint);
  }

  it("rings every candidate at its own rect on activation", () => {
    const { overlay, recorder: recorded } = mount();
    const hints = hintsOf(["as", "sd", "fj"]);
    overlay.render(hints);

    const rings = ringsOf(recorded, hints);
    // 没有前缀时全部候选都是淡描边，没有一个算「当前匹配」。
    expect(rings.size).toBe(hints.length);
    for (const ring of rings.values()) expect(alphaOf(ring.stroke)).toBeLessThan(1);
  });

  it("draws the ring on the element, not on the badge", () => {
    const { overlay, recorder: recorded } = mount();
    // 元素在 (400,300) 且远大于徽章；描边必须跟着元素走。
    const hint: Hint = {
      element: document.createElement("button"),
      label: "as",
      rect: { x: 400, y: 300, w: 120, h: 40 },
    };
    overlay.render([hint]);

    const ring = ringOf(recorded, hint);
    expect(ring).toBeDefined();
    const rect = ring!.rects.find((candidate) => covers(candidate, hint.rect));
    expect(rect).toBeDefined();
    // 24x16 的徽章盒子盖不住 120x40 的元素，所以这条断言能区分描边与徽章。
    expect(rect!.w).toBeGreaterThanOrEqual(hint.rect.w);
    expect(rect!.h).toBeGreaterThanOrEqual(hint.rect.h);
  });

  it("thickens the matching rings and drops the rest back to faint", () => {
    const { overlay, recorder: recorded } = mount();
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints);
    const faint = ringOf(recorded, hints[0]!);
    expect(faint).toBeDefined();
    const mark = recorded.outlines().length;

    overlay.render(hints, "a");

    // 只看这一笔新画的描边：as 还匹配，sd 被前缀排除。
    const stroke: Recorder = { ...recorded, outlines: () => recorded.outlines().slice(mark) };
    const matching = ringOf(stroke, hints[0]!);
    const excluded = ringOf(stroke, hints[1]!);
    expect(matching).toBeDefined();
    expect(excluded).toBeDefined();
    expect(alphaOf(matching!.stroke)).toBeGreaterThan(alphaOf(excluded!.stroke));
    expect(matching!.lineWidth).toBeGreaterThan(excluded!.lineWidth);
    expect(matching!.lineWidth).toBeGreaterThan(faint!.lineWidth);
  });

  it("returns an excluded ring to faint when the prefix is cleared", () => {
    const { overlay, recorder: recorded } = mount();
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints, "a");
    const mark = recorded.outlines().length;

    overlay.render(hints, "");

    // 死键回退：两枚都回到淡描边，没有一枚还留在重档。
    const stroke: Recorder = { ...recorded, outlines: () => recorded.outlines().slice(mark) };
    const rings = ringsOf(stroke, hints);
    expect(rings.size).toBe(hints.length);
    for (const ring of rings.values()) expect(alphaOf(ring.stroke)).toBeLessThan(1);
  });

  it("paints the ring for a batch appended mid-round", () => {
    const { overlay, recorder: recorded } = mount();
    overlay.append(hintsOf(["a", "s"]));
    const mark = recorded.outlines().length;
    const batch = hintsOf(["d", "f"]);
    overlay.append(batch);

    // 慢路径只补画新增的一批，但新增的那几个同样要带上描边。
    const stroke: Recorder = { ...recorded, outlines: () => recorded.outlines().slice(mark) };
    const rings = ringsOf(stroke, batch);
    expect(rings.size).toBe(batch.length);
    for (const ring of rings.values()) expect(alphaOf(ring.stroke)).toBeLessThan(1);
  });

  it("leaves no ring behind after destroy", () => {
    const { overlay } = mount();
    overlay.render(hintsOf(["as"]));
    overlay.destroy();
    // 描边与徽章同在一张 canvas 上，canvas 走了描边就跟着走。
    expect(overlayCanvas()).toBeNull();
  });

  it("does not touch the host element's class or style", () => {
    const { overlay } = mount();
    const element = document.createElement("button");
    element.className = "host-button primary";
    element.setAttribute("style", "color: red; margin: 4px");
    const hint: Hint = { element, label: "as", rect: { x: 10, y: 10, w: 80, h: 24 } };

    const before = { className: element.className, style: element.getAttribute("style") };
    overlay.render([hint]);
    overlay.render([hint], "a");
    overlay.destroy();

    // 描边画在 canvas 上，宿主元素必须一个字节都没动。
    expect(element.className).toBe(before.className);
    expect(element.getAttribute("style")).toBe(before.style);
  });
});

/**
 * 命中确认框。
 *
 * 敲完标签后浮层整轮消失，用户看不到刚才打中了哪个元素。确认框在动作派发之后
 * 才出现，只负责「刚才那一下落在哪」，所以它必须是独立元素而不是画在 canvas 上：
 * 画布随轮销毁，而确认要活过这一轮。
 *
 * 断言落在 DOM 形态与几何上：位置、不吃事件、到点消失、不叠。
 */
describe("hit confirmation", () => {
  const CONFIRM = "[data-dsh-jump-confirm]";

  /** 手动推进的定时器：jsdom 里没有真实时钟，300ms 只在测试说走时走。 */
  function fakeTimers(): { setTimeout: (run: () => void, ms: number) => number; clearTimeout: (handle: number) => void; advance(ms: number): void; pending(): number } {
    let nextHandle = 1;
    const queued = new Map<number, { run: () => void; at: number }>();
    let now = 0;
    return {
      setTimeout: (run, ms) => {
        const handle = nextHandle++;
        queued.set(handle, { run, at: now + ms });
        return handle;
      },
      clearTimeout: (handle) => {
        queued.delete(handle);
      },
      advance: (ms) => {
        now += ms;
        for (const [handle, entry] of [...queued]) {
          if (entry.at > now) continue;
          queued.delete(handle);
          entry.run();
        }
      },
      pending: () => queued.size,
    };
  }

  function confirmOf(): HTMLElement | null {
    return document.querySelector<HTMLElement>(CONFIRM);
  }

  it("shows a box over the target and removes it after the duration", () => {
    const { overlay } = mount();
    const timers = fakeTimers();
    const rect = { x: 120, y: 80, w: 60, h: 24 };

    overlay.confirm(rect, { timers });
    const box = confirmOf();
    expect(box).not.toBeNull();
    // 框要落在目标上，而不是页角。
    expect(box?.style.left).toBe(String(rect.x) + "px");
    expect(box?.style.top).toBe(String(rect.y) + "px");
    expect(box?.style.width).toBe(String(rect.w) + "px");
    expect(box?.style.height).toBe(String(rect.h) + "px");

    // 300ms 前还在，到点就没了。
    timers.advance(299);
    expect(confirmOf()).not.toBeNull();
    timers.advance(1);
    expect(confirmOf()).toBeNull();
  });

  it("survives the round teardown that follows a hit", () => {
    const { overlay } = mount();
    const timers = fakeTimers();
    overlay.render(hintsOf(["as"]));
    // 命中后浮层整轮销毁，确认框必须活下来，否则用户什么都看不到。
    overlay.destroy();
    overlay.confirm({ x: 10, y: 10, w: 20, h: 20 }, { timers });
    expect(confirmOf()).not.toBeNull();
    expect(overlayCanvas()).toBeNull();
  });

  it("does not intercept pointer events", () => {
    const { overlay } = mount();
    const timers = fakeTimers();
    overlay.confirm({ x: 10, y: 10, w: 20, h: 20 }, { timers });
    // 确认框只是事后回执，绝不能挡住用户紧接着要点的东西。
    expect(confirmOf()?.style.pointerEvents).toBe("none");
  });

  it("replaces the previous confirmation instead of stacking", () => {
    const { overlay } = mount();
    const timers = fakeTimers();
    overlay.confirm({ x: 10, y: 10, w: 20, h: 20 }, { timers });
    overlay.confirm({ x: 40, y: 40, w: 20, h: 20 }, { timers });

    expect(document.querySelectorAll(CONFIRM)).toHaveLength(1);
    expect(confirmOf()?.style.left).toBe("40px");
    // 旧的那条定时器不能把新框提前收走。
    timers.advance(300);
    expect(confirmOf()).toBeNull();
  });

  it("clears on demand, for Esc and for a new round", () => {
    const { overlay } = mount();
    const timers = fakeTimers();
    overlay.confirm({ x: 10, y: 10, w: 20, h: 20 }, { timers });
    overlay.clearConfirm();
    expect(confirmOf()).toBeNull();
    // 清掉之后排队的那一枪不能再打一次。
    timers.advance(300);
    expect(confirmOf()).toBeNull();
  });

  it("drops the transition when the reader asked for reduced motion", () => {
    const { overlay } = mount();
    const timers = fakeTimers();
    const original = dom.window.matchMedia;
    (dom.window as unknown as Record<string, unknown>)["matchMedia"] = (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    try {
      overlay.confirm({ x: 10, y: 10, w: 20, h: 20 }, { timers });
      // 减少动态偏好下不做过渡：框直接出现，到点直接消失。
      expect(confirmOf()?.style.transition).toBe("");
    } finally {
      (dom.window as unknown as Record<string, unknown>)["matchMedia"] = original;
    }
  });

  it("keeps the transition when motion is allowed", () => {
    const { overlay } = mount();
    const timers = fakeTimers();
    const original = dom.window.matchMedia;
    (dom.window as unknown as Record<string, unknown>)["matchMedia"] = (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    try {
      overlay.confirm({ x: 10, y: 10, w: 20, h: 20 }, { timers });
      expect(confirmOf()?.style.transition).toContain("opacity");
    } finally {
      (dom.window as unknown as Record<string, unknown>)["matchMedia"] = original;
    }
  });
});

/**
 * 排除过渡。
 *
 * 敲一个键，被排除的徽章从 1.0 瞬间掉到 0.3，用户看不见「哪些被排掉了」这个
 * 过程。这里只给「被排除」这一个方向加约 80ms 的过渡：仍匹配的瞬时点亮，死键
 * 回退也瞬时恢复，因为那两件事都是信息，晚到就是错。
 *
 * 断言落在绘制调用的 opacity 序列上：canvas 每帧全量重绘，所以「过渡」就是
 * 同一枚徽章在连续几帧里被画成递减的透明度。
 */
describe("exclusion fade", () => {
  /** 某段文字在每一帧被画出来时的透明度序列。 */
  function alphasOf(recorded: Recorder, text: string): number[] {
    return recorded
      .texts()
      .filter((entry) => entry.text === text)
      .map((entry) => entry.alpha);
  }

  it("fades an excluded badge down to the dim alpha over about 80ms", () => {
    const clock = frameClock();
    const { overlay, recorder: recorded } = mount({ clock });
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints);
    overlay.render(hints, "a");

    // 第一帧仍是 1.0：过渡从当前状态起步，不能一上来就跳。
    const start = alphasOf(recorded, "sd");
    expect(start[start.length - 1]).toBe(1);

    clock.step(40);
    const mid = alphasOf(recorded, "sd");
    const atHalf = mid[mid.length - 1]!;
    expect(atHalf).toBeGreaterThan(0.3);
    expect(atHalf).toBeLessThan(1);

    clock.step(39);
    const nearEnd = alphasOf(recorded, "sd");
    expect(nearEnd[nearEnd.length - 1]!).toBeGreaterThan(0.3);

    clock.step(1);
    const done = alphasOf(recorded, "sd");
    expect(done[done.length - 1]).toBe(0.3);
  });

  it("lights a still-matching badge instantly, with no intermediate value", () => {
    const clock = frameClock();
    const { overlay, recorder: recorded } = mount({ clock });
    const hints = hintsOf(["as"]);
    overlay.render(hints);
    overlay.render(hints, "a");
    clock.step(40);
    clock.step(40);

    // 只剩一枚且它一直匹配：任何一帧都不该出现中间透明度。
    for (const entry of recorded.texts()) expect(entry.alpha).toBe(1);
  });

  it("restores instantly when a dead key clears the prefix", () => {
    const clock = frameClock();
    const { overlay, recorder: recorded } = mount({ clock });
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints);
    overlay.render(hints, "a");
    clock.step(40);
    const before = alphasOf(recorded, "sd").length;

    overlay.render(hints, "");

    // 死键是用户在纠错，越快越好：这一帧直接回到 1.0，没有中间态。
    const restored = alphasOf(recorded, "sd").slice(before);
    expect(restored).toEqual([1]);
    // 而且不该再排任何过渡帧。
    const requests = clock.requests();
    clock.step(16);
    clock.step(16);
    expect(clock.requests()).toBe(requests);
  });

  it("hands a mid-fade badge over to the next key without jumping", () => {
    const clock = frameClock();
    const { overlay, recorder: recorded } = mount({ clock });
    const hints = hintsOf(["as", "ad", "sd"]);
    overlay.render(hints);
    // 第一击：sd 被排除，开始淡出。
    overlay.render(hints, "a");
    clock.step(40);
    const beforeSecond = alphasOf(recorded, "sd");
    const live = beforeSecond[beforeSecond.length - 1]!;
    expect(live).toBeLessThan(1);
    expect(live).toBeGreaterThan(0.3);

    // 第二击：ad 被排除，sd 仍然被排除。sd 必须从当前插值位置接着走。
    overlay.render(hints, "as");
    const afterSecond = alphasOf(recorded, "sd");
    expect(afterSecond[afterSecond.length - 1]).toBe(live);

    // 再走完剩下的 40ms：sd 从接管点走到底，ad 从 1.0 走到底。
    clock.step(40);
    const finished = alphasOf(recorded, "sd");
    // 单调不增，且最终落到 0.3，不卡在中间。
    const series = finished;
    for (let i = 1; i < series.length; i += 1) expect(series[i]!).toBeLessThanOrEqual(series[i - 1]!);
    expect(series[series.length - 1]).toBe(0.3);

    // 第二击自己排除的 ad 从第二击起算自己的 80ms，所以还要再走 40ms。
    clock.step(40);
    const ad = alphasOf(recorded, "ad");
    expect(ad[ad.length - 1]).toBe(0.3);
  });

  it("stops the frame loop once every fade has finished", () => {
    const clock = frameClock();
    const { overlay } = mount({ clock });
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints);
    overlay.render(hints, "a");

    // 过渡期间必须有帧在排队。
    const during = clock.requests();
    expect(during).toBeGreaterThan(0);

    // 走完 80ms 之后，再推进帧也不能再排新的：循环必须自己停。
    clock.step(80);
    const settled = clock.requests();
    clock.step(16);
    clock.step(16);
    clock.step(16);
    expect(clock.requests()).toBe(settled);
  });

  it("dims instantly when the reader asked for reduced motion", () => {
    const clock = frameClock();
    const { overlay, recorder: recorded } = mount({ clock });
    const original = dom.window.matchMedia;
    (dom.window as unknown as Record<string, unknown>)["matchMedia"] = (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    try {
      const hints = hintsOf(["as", "sd"]);
      overlay.render(hints);
      overlay.render(hints, "a");

      // 减少动态偏好下完全跳过过渡：这一帧就是 0.3，也不排任何帧。
      const series = alphasOf(recorded, "sd");
      expect(series[series.length - 1]).toBe(0.3);
      expect(clock.requests()).toBe(0);
    } finally {
      (dom.window as unknown as Record<string, unknown>)["matchMedia"] = original;
    }
  });

  it("does not fade a badge that was already dim", () => {
    const clock = frameClock();
    const { overlay, recorder: recorded } = mount({ clock });
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints);
    overlay.render(hints, "a");
    clock.step(80);
    const mark = recorded.texts().length;

    // 再敲一个仍然排除 sd 的键：它已经在 0.3，不该重新淡一遍。
    overlay.render(hints, "as");
    const after = recorded.texts().slice(mark).filter((entry) => entry.text === "sd");
    expect(after.every((entry) => entry.alpha === 0.3)).toBe(true);
  });
});
