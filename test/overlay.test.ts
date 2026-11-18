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
  readonly kind: "clearRect" | "fillText" | "setTransform" | "roundRect" | "rect" | "fill" | "beginPath";
  readonly args: readonly unknown[];
  readonly font: string;
  readonly alpha: number;
}

interface RecordedText {
  readonly text: string;
  readonly weight: string;
  readonly alpha: number;
}

interface Recorder {
  readonly context: CanvasRenderingContext2D;
  readonly ops: DrawOp[];
  texts(): RecordedText[];
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
  const stack: { font: string; alpha: number }[] = [];
  const push = (kind: DrawOp["kind"], args: readonly unknown[] = []): void => {
    ops.push({ kind, args, font, alpha });
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
    clears: () => ops.filter((op) => op.kind === "clearRect").length,
  };
}

const mounted: Overlay[] = [];

function mount(options: { clock?: FrameClock } = {}): { overlay: Overlay; recorder: Recorder } {
  const recorded = recorder();
  const overlay = createOverlay({
    doc: document,
    viewport: () => VIEWPORT,
    clock: options.clock,
    canvasContext: () => recorded.context,
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
