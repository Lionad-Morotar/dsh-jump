/**
 * createApp 的客户端接线契约：监听器生命周期、激活/退出对 overlay 的驱动、
 * label 命中触发真实事件序列、IME 组合与 teardown 的零残留。
 *
 * jsdom 没有布局引擎，矩形与可见性全部装桩；事件一律用 jsdom realm 的
 * KeyboardEvent 真实例派发，断言落在 DOM 副作用与 defaultPrevented 上。
 */
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp, type JumpApp, type JumpWindow } from "../src/client/app.ts";
import type { FrameClock } from "../src/client/overlay.ts";
import { generateLabels } from "../src/client/hints.ts";
import { createDefaultBindings, type JumpBindings } from "../src/client/bindings.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1/" });
const win = dom.window as unknown as JumpWindow;
const doc = dom.window.document;

function place(el: Element, x = 0, y = 0, w = 10, h = 10): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
}

/** 建 n 个可见候选按钮；jsdom 下顺序即 label 顺序。 */
function buttons(n: number): HTMLElement[] {
  const els: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const el = doc.createElement("button");
    el.textContent = "b" + String(i);
    place(el, 10 + (i % 4) * 30, 10 + Math.floor(i / 4) * 30);
    doc.body.append(el);
    els.push(el);
  }
  return els;
}

function keydown(init: Record<string, unknown>): KeyboardEvent {
  return new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

function overlayRoot(): Element | null {
  return doc.querySelector("[data-dsh-jump-overlay]");
}

/**
 * 记录 canvas 绘制调用的替身。
 *
 * jsdom 没有 2D 上下文，app 层只关心「这一击画出了什么形态」：分段、字重与
 * 透明度。每次 canvas 取上下文都拿到一个写入同一份 ops 的记录器，断言落在
 * 绘制调用上，不依赖任何徽章 DOM。
 */
interface CanvasText {
  readonly text: string;
  readonly weight: string;
  readonly alpha: number;
}

let canvasOps: {
  readonly kind: "clearRect" | "fillText" | "setTransform" | "roundRect" | "rect" | "fill" | "beginPath" | "stroke";
  readonly args: readonly unknown[];
  readonly font: string;
  readonly alpha: number;
}[] = [];

function recordingContext(): CanvasRenderingContext2D {
  let font = "10px sans-serif";
  let alpha = 1;
  const stack: { font: string; alpha: number }[] = [];
  const push = (kind: (typeof canvasOps)[number]["kind"], args: readonly unknown[] = []): void => {
    canvasOps.push({ kind, args, font, alpha });
  };
  return {
    get font(): string {
      return font;
    },
    set font(value: string) {
      font = value;
    },
    set fillStyle(_value: string) {
      // The colour is not the assertion target here, only the run shape is.
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
}

function canvasTexts(): CanvasText[] {
  return canvasOps
    .filter((op) => op.kind === "fillText")
    .map((op) => ({
      text: String(op.args[0]),
      weight: op.font.split(" ")[0] ?? "",
      alpha: op.alpha,
    }));
}

function since(mark: number): CanvasText[] {
  return canvasTexts().slice(mark);
}

// jsdom 不认识 CanvasRenderingContext2D；先把这个构造函数放上去，再让
// canvas.getContext 返回记录器，overlay 的能力探测才会走真实绘制路径。
(dom.window as unknown as Record<string, unknown>)["CanvasRenderingContext2D"] = function () {};
(
  dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => CanvasRenderingContext2D }
).getContext = () => recordingContext();

function activate(): void {
  win.dispatchEvent(keydown({ key: "h", metaKey: true }));
}

beforeEach(() => {
  doc.body.replaceChildren();
  // 浮层挂在 documentElement 上，body 清空带不走它；上一轮漏下的容器会让
  // overlayRoot() 找到错误的节点。
  doc.querySelector("[data-dsh-jump-overlay]")?.remove();
  canvasOps = [];
  (doc.activeElement as HTMLElement | null)?.blur?.();
});

describe("bare named keys yield to focused text surfaces", () => {
  /** 一条只有 Insert、不带任何修饰键的绑定。 */
  const BARE: JumpBindings = {
    click: { key: "Insert", meta: false, alt: false, ctrl: false, shift: false },
    focus: { key: "F2", meta: false, alt: false, ctrl: false, shift: false },
    reference: null,
  };

  it("activates on a bare named key when focus is not in a text surface", () => {
    buttons(2);
    const bindings = { get: () => BARE };
    const teardown = createApp({ window: win, isVisible: () => true, bindings }).apply();

    doc.body.dispatchEvent(keydown({ key: "Insert" }));
    expect(overlayRoot()).not.toBeNull();
    teardown();
  });

  it("steps aside while a textarea has focus, so the editor keeps Insert", () => {
    buttons(2);
    const field = doc.createElement("textarea");
    place(field, 10, 10);
    doc.body.append(field);
    field.focus();
    const bindings = { get: () => BARE };
    const teardown = createApp({ window: win, isVisible: () => true, bindings }).apply();

    const e = keydown({ key: "Insert" });
    field.dispatchEvent(e);
    expect(overlayRoot()).toBeNull();
    // 让路的判据是"没吃掉"：other 键的监听器仍然能看到这一击。
    expect(e.defaultPrevented).toBe(false);
    teardown();
  });

  it("steps aside for contenteditable too, which has no tag to check", () => {
    buttons(2);
    const editable = doc.createElement("div");
    editable.setAttribute("contenteditable", "true");
    place(editable, 10, 10);
    doc.body.append(editable);
    editable.focus();
    const bindings = { get: () => BARE };
    const teardown = createApp({ window: win, isVisible: () => true, bindings }).apply();

    const e = keydown({ key: "Insert" });
    editable.dispatchEvent(e);
    expect(overlayRoot()).toBeNull();
    expect(e.defaultPrevented).toBe(false);
    teardown();
  });

  it("keeps a chorded binding working inside a text surface", () => {
    // 带修饰键的组合键不与输入冲突，所以在输入面里也不让路。
    const field = doc.createElement("textarea");
    place(field, 10, 10);
    doc.body.append(field);
    field.focus();
    buttons(2);
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

    const e = keydown({ key: "h", metaKey: true });
    field.dispatchEvent(e);
    expect(overlayRoot()).not.toBeNull();
    expect(e.defaultPrevented).toBe(true);
    teardown();
  });
});

describe("createApp wiring", () => {
  it("Cmd+H activates on capture: badges appear, stroke is eaten before bubble listeners", () => {
    const els = buttons(3);
    const leaked = vi.fn();
    win.addEventListener("keydown", leaked);
    const app = createApp({ window: win, isVisible: () => true });
    const teardown = app.apply();

    doc.body.dispatchEvent(keydown({ key: "h", metaKey: true }));
    expect(leaked).not.toHaveBeenCalled();

    expect(overlayRoot()).not.toBeNull();
    expect(app.labels()).toEqual(["a", "s", "d"]);
    expect(els[0]).toBeDefined();

    win.removeEventListener("keydown", leaked);
    teardown();
  });

  it("Cmd+H keydown itself reports defaultPrevented, so dsh-vscode-keyboard cannot forward it", () => {
    buttons(1);
    const teardown = createApp({ window: win, isVisible: () => true }).apply();
    const e = keydown({ key: "h", metaKey: true });
    doc.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    teardown();
  });

  it("two-key label round: first key dims non-matching badges, second key fires the full pointer/mouse/click sequence", () => {
    const els = buttons(12);
    const teardown = createApp({ window: win, isVisible: () => true }).apply();
    activate();

    const mark = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "a" }));
    const stroke = since(mark);
    // 命中的 ad 拆成已敲与未敲两段并保持点亮，被排除的 sd 整枚降到 0.3。
    expect(stroke).toContainEqual({ text: "a", weight: "700", alpha: 1 });
    expect(stroke).toContainEqual({ text: "d", weight: "400", alpha: 1 });
    expect(stroke).toContainEqual({ text: "sd", weight: "400", alpha: 0.3 });

    const seen: string[] = [];
    const target = els[1] as HTMLElement; // 第二个候选，两键轮 label 为 ad
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      target.addEventListener(type, () => seen.push(type));
    }

    win.dispatchEvent(keydown({ key: "d" }));
    expect(seen).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
    expect(overlayRoot()).toBeNull();

    teardown();
  });

  it("Esc exits with zero overlay residue and a new activation works again", () => {
    buttons(2);
    const teardown = createApp({ window: win, isVisible: () => true }).apply();
    activate();
    expect(overlayRoot()).not.toBeNull();

    win.dispatchEvent(keydown({ key: "Escape" }));
    expect(overlayRoot()).toBeNull();

    activate();
    expect(overlayRoot()).not.toBeNull();
    teardown();
    expect(overlayRoot()).toBeNull();
  });

  it("teardown removes the listener: no further activation happens", () => {
    buttons(2);
    const addSpy = vi.spyOn(win, "addEventListener");
    const teardown = createApp({ window: win, isVisible: () => true }).apply();
    const added = addSpy.mock.calls.filter((c) => c[0] === ("keydown" as string)).length;
    expect(added).toBe(1);
    addSpy.mockRestore();

    const removeSpy = vi.spyOn(win, "removeEventListener");
    teardown();
    const removed = removeSpy.mock.calls.filter((c) => c[0] === ("keydown" as string)).length;
    expect(removed).toBe(1);
    removeSpy.mockRestore();

    activate();
    expect(overlayRoot()).toBeNull();
  });

  it("isComposing keydown never activates and is not eaten", () => {
    buttons(2);
    const teardown = createApp({ window: win, isVisible: () => true }).apply();
    const e = keydown({ key: "h", metaKey: true, isComposing: true });
    win.dispatchEvent(e);
    expect(overlayRoot()).toBeNull();
    expect(e.defaultPrevented).toBe(false);
    teardown();
  });
});

describe("per-frame occupancy probe", () => {
  it("reports paint samples after a 300-candidate activation", () => {
    buttons(300);
    const app = createApp({ window: win, isVisible: () => true });
    const teardown = app.apply();

    activate();

    const stats = app.perfStats();
    expect(stats.samples.paint.length).toBeGreaterThan(0);
    for (const value of stats.samples.paint) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    expect(stats.frames).toBe(stats.samples.paint.length);
    teardown();
  });

  it("returns empty samples before the app is mounted", () => {
    const app = createApp({ window: win, isVisible: () => true });

    const stats = app.perfStats();
    expect(stats.samples).toEqual({ collect: [], paint: [] });
    expect(stats.frames).toBe(0);
    expect(stats.frameBudgetMs).toBeNull();
    expect(stats.budgetSource).toBe("fallback");
  });

  it("keeps at most 512 samples when 600 frames are painted", () => {
    buttons(4);
    const app = createApp({ window: win, isVisible: () => true });
    const teardown = app.apply();

    for (let index = 0; index < 600; index += 1) {
      activate();
      win.dispatchEvent(keydown({ key: "Escape" }));
    }

    const stats = app.perfStats();
    expect(stats.frames).toBe(600);
    expect(stats.samples.paint.length).toBe(512);
    expect(stats.samples.collect.length).toBe(512);
    teardown();
  });

  it("can be turned off without changing labels or drawing", () => {
    buttons(12);
    const appOn = createApp({ window: win, isVisible: () => true });
    const teardownOn = appOn.apply();
    activate();
    const labelsOn = appOn.labels();
    const drawOn = canvasOps.map((op) => ({ ...op, args: [...op.args] }));
    expect(appOn.perfStats().samples.paint.length).toBeGreaterThan(0);
    teardownOn();

    canvasOps = [];
    const appOff = createApp({ window: win, isVisible: () => true, perfProbe: false });
    const teardownOff = appOff.apply();
    activate();

    expect(appOff.labels()).toEqual(labelsOn);
    expect(canvasOps.map((op) => ({ ...op, args: [...op.args] }))).toEqual(drawOn);
    expect(appOff.perfStats().samples).toEqual({ collect: [], paint: [] });
    expect(appOff.perfStats().frames).toBe(0);
    teardownOff();
  });

  it("reports the injected display budget and its source", () => {
    buttons(2);
    const app = createApp({ window: win, isVisible: () => true, frameBudgetMs: 7 });
    const teardown = app.apply();

    activate();

    expect(app.perfStats().frameBudgetMs).toBe(7);
    expect(app.perfStats().budgetSource).toBe("injected");
    teardown();
  });
});

describe("badge segments in a multi-key round", () => {
  // 断言先失败时也要摘掉监听器，否则漏掉的 app 会接管后续用例的按键。
  let stop: (() => void) | undefined;
  let app: JumpApp | undefined;
  afterEach(() => {
    stop?.();
    stop = undefined;
    app = undefined;
  });

  function mount(): void {
    app = createApp({ window: win, isVisible: () => true });
    stop = app.apply();
  }

  it("paints a badge as one whole-label segment while no prefix is typed", () => {
    buttons(12);
    mount();
    activate();

    expect(app?.labels()).toHaveLength(12);
    expect(canvasTexts()).toEqual(
      (app?.labels() ?? []).map((label) => ({ text: label, weight: "400", alpha: 1 })),
    );
  });

  it("splits a still-matching badge into the typed letters and the rest", () => {
    buttons(12);
    mount();
    activate();

    const mark = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "a" }));

    const stroke = since(mark);
    expect(stroke).toContainEqual({ text: "a", weight: "700", alpha: 1 });
    expect(stroke).toContainEqual({ text: "d", weight: "400", alpha: 1 });
    // 连前缀都对不上的徽章仍是一整段完整标签，只是变暗。
    expect(stroke.filter((text) => text.text === "sd")).toEqual([
      { text: "sd", weight: "400", alpha: 0.3 },
    ]);
  });

  it("returns every badge to one whole segment after a dead-end key", () => {
    buttons(12);
    mount();
    activate();

    win.dispatchEvent(keydown({ key: "a" }));
    const mark = canvasTexts().length;

    // "x" 不在主行，接不上任何 label，前缀被清空。
    win.dispatchEvent(keydown({ key: "x" }));

    const labels = app?.labels() ?? [];
    expect(since(mark)).toEqual(labels.map((label) => ({ text: label, weight: "400", alpha: 1 })));
  });
});

describe("a completing stroke tears the round down without repainting it", () => {
  // 断言先失败时也要摘掉监听器，否则漏掉的 app 会接管后续用例的按键。
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  function mount(): void {
    stop = createApp({ window: win, isVisible: () => true }).apply();
  }

  /** 目标收到的完整 pointer/mouse/click 序列，按到达顺序追加。 */
  function hitSequence(target: HTMLElement): string[] {
    const seen: string[] = [];
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      target.addEventListener(type, () => seen.push(type));
    }
    return seen;
  }

  it("two-key label: first stroke splits the badge, second stroke clicks with no badge write", () => {
    const els = buttons(12);
    mount();
    activate();

    // 12 个候选超过单键容量，整轮是双键标签；第二个按钮的标签为 ad。
    const mark = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "a" }));
    expect(since(mark)).toContainEqual({ text: "a", weight: "700", alpha: 1 });
    expect(since(mark)).toContainEqual({ text: "d", weight: "400", alpha: 1 });
    expect(since(mark)).toContainEqual({ text: "sd", weight: "400", alpha: 0.3 });

    const target = els[1] as HTMLElement;
    const seen = hitSequence(target);
    const painted = canvasTexts().length;

    win.dispatchEvent(keydown({ key: "d" }));

    // 命中后的收尾只清画布，不再为即将消失的一轮补画任何文字。
    expect(canvasTexts().length).toBe(painted);
    expect(seen).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
    expect(overlayRoot()).toBeNull();
  });

  it("single-key label: the hit stroke clicks and closes with no badge write", () => {
    const els = buttons(2);
    mount();
    activate();

    const target = els[0] as HTMLElement;
    const seen = hitSequence(target);
    const painted = canvasTexts().length;

    win.dispatchEvent(keydown({ key: "a" }));

    expect(canvasTexts().length).toBe(painted);
    expect(seen).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
    expect(overlayRoot()).toBeNull();
  });

  it("three-key label: every prefix stroke repaints the split, the completing stroke only closes", () => {
    // 82 个候选超过双键容量（81），整轮升到三键；前两个按钮的标签是 asa、asd。
    const els = buttons(82);
    mount();
    activate();

    let mark = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "a" }));
    expect(since(mark)).toContainEqual({ text: "a", weight: "700", alpha: 1 });
    expect(since(mark)).toContainEqual({ text: "sd", weight: "400", alpha: 1 });

    mark = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "s" }));
    expect(since(mark)).toContainEqual({ text: "as", weight: "700", alpha: 1 });
    expect(since(mark)).toContainEqual({ text: "d", weight: "400", alpha: 1 });

    const target = els[1] as HTMLElement;
    const seen = hitSequence(target);
    const painted = canvasTexts().length;

    win.dispatchEvent(keydown({ key: "d" }));

    expect(canvasTexts().length).toBe(painted);
    expect(seen).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
    expect(overlayRoot()).toBeNull();
  });
});

/**
 * 前缀增长时，已经被排除的徽章在视觉上必须保持原样。
 *
 * 首键 "a" 之后已经变暗的徽章，到 "as" 仍然不匹配：透明度还是 0.3，
 * 文字还是一整段。canvas 每帧全量重画，所以断言落在这一击画出的形态上，
 * 不依赖「有没有写 DOM」。
 */
describe("a growing prefix keeps the ruled-out badges dim", () => {
  let stop: (() => void) | undefined;
  let app: JumpApp | undefined;
  afterEach(() => {
    stop?.();
    stop = undefined;
    app = undefined;
  });

  function mount(): void {
    app = createApp({ window: win, isVisible: () => true });
    stop = app.apply();
  }

  /** 这一击画出的文字里，点亮与变暗各占多少段。 */
  function alphaCounts(texts: CanvasText[]): { lit: number; dim: number } {
    return {
      lit: texts.filter((text) => text.alpha === 1).length,
      dim: texts.filter((text) => text.alpha === 0.3).length,
    };
  }

  it("leaves the badges that were already dim untouched on the second stroke", () => {
    // 90 个候选超过双键容量（81），整轮升到三键；两击之后 "as" 仍是活前缀。
    // 首键 "a" 留下 81 枚点亮，9 枚以 s 开头的标签在这一击就变暗。
    buttons(90);
    mount();
    activate();
    const markA = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "a" }));

    const first = since(markA);
    expect(app?.labels()).toHaveLength(90);
    // 81 枚点亮各画两段，9 枚变暗各画一整段。
    expect(alphaCounts(first)).toEqual({ lit: 162, dim: 9 });
    const dimLabels = first.filter((text) => text.alpha === 0.3).map((text) => text.text);
    expect(dimLabels).toContain("saa");

    const markS = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "s" }));

    const second = since(markS);
    // 第二击后只剩 as 组点亮：9 枚各两段，另外 81 枚整段变暗。
    expect(alphaCounts(second)).toEqual({ lit: 18, dim: 81 });
    // 已经变暗的那批继续以整段出现，不再被拆开；这一击把剩余 81 枚都排除了。
    expect(second.filter((text) => text.alpha === 0.3).map((text) => text.text).sort()).toEqual(
      (app?.labels() ?? []).filter((label) => !label.startsWith("as")).sort(),
    );
    expect(second).toContainEqual({ text: "as", weight: "700", alpha: 1 });
    expect(second).toContainEqual({ text: "d", weight: "400", alpha: 1 });
  });

  it("dims a badge the moment the growing prefix rules it out", () => {
    buttons(90);
    mount();
    activate();

    const markA = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "a" }));
    expect(since(markA)).toContainEqual({ text: "a", weight: "700", alpha: 1 });
    expect(since(markA)).toContainEqual({ text: "da", weight: "400", alpha: 1 });

    const markS = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "s" }));

    expect(since(markS).filter((text) => text.text === "ada")).toEqual([
      { text: "ada", weight: "400", alpha: 0.3 },
    ]);
  });

  it("relights every badge when a dead key clears the prefix", () => {
    buttons(90);
    mount();
    activate();

    // 两击之后只剩 as 组点亮；s 组那 9 枚从首击起就没亮过。
    win.dispatchEvent(keydown({ key: "a" }));
    const markS = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "s" }));
    expect(alphaCounts(since(markS))).toEqual({ lit: 18, dim: 81 });

    const markX = canvasTexts().length;
    // "x" 不在主行，接不上任何 label，前缀被清空。
    win.dispatchEvent(keydown({ key: "x" }));

    const relit = since(markX);
    expect(relit).toHaveLength(90);
    expect(relit.every((text) => text.weight === "400" && text.alpha === 1)).toBe(true);
    expect(relit.map((text) => text.text).sort()).toEqual([...(app?.labels() ?? [])].sort());
  });
});

/**
 * 首击变暗的整批徽章文字没有变化，画出来的仍是一整段。
 *
 * 600 档首击有 519 枚徽章从 whole 转成 whole，唯一变化是透明度；canvas 每帧
 * 重画，但视觉契约不变：变暗的那批不许被拆成两段，点亮的那批必须拆开。
 */
describe("the first stroke only dims the badges it rules out", () => {
  let stop: (() => void) | undefined;
  let app: JumpApp | undefined;
  afterEach(() => {
    stop?.();
    stop = undefined;
    app = undefined;
  });

  function mount(): void {
    app = createApp({ window: win, isVisible: () => true });
    stop = app.apply();
  }

  it("dims the ruled-out badges without touching their child nodes", () => {
    // 90 个候选整轮升到三键；首键 a 留下 81 枚点亮，9 枚以 s 开头的在这一击变暗。
    buttons(90);
    mount();
    activate();
    const mark = canvasTexts().length;

    win.dispatchEvent(keydown({ key: "a" }));
    const stroke = since(mark);

    const dim = stroke.filter((text) => text.alpha === 0.3);
    const lit = stroke.filter((text) => text.alpha === 1);
    expect(dim).toHaveLength(9);
    expect(lit).toHaveLength(162);
    // 变暗的这批文字还是整段：每条 label 只出现一次。
    expect(dim.map((text) => text.text).sort()).toEqual(
      (app?.labels() ?? []).filter((label) => !label.startsWith("a")).sort(),
    );
    // 点亮的那批必须拆成 typed/rest，否则观察到的就不是分段绘制。
    expect(lit[0]).toEqual({ text: "a", weight: "700", alpha: 1 });
  });

  it("relights the dead-key batch without rebuilding their whole-label run", () => {
    // 两击之后只剩 as 组 9 枚点亮，其余 81 枚都是整段文字加 0.3。
    buttons(90);
    mount();
    activate();
    win.dispatchEvent(keydown({ key: "a" }));
    const markS = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "s" }));
    expect(since(markS).filter((text) => text.alpha === 0.3)).toHaveLength(81);

    const markX = canvasTexts().length;
    // x 不在主行，接不上任何 label，前缀被清空，整轮回亮。
    win.dispatchEvent(keydown({ key: "x" }));
    const relit = since(markX);

    expect(relit.filter((text) => text.alpha === 1)).toHaveLength(90);
    expect(relit.every((text) => text.weight === "400")).toBe(true);
    expect(relit.map((text) => text.text).sort()).toEqual([...(app?.labels() ?? [])].sort());
  });
});

describe("active-mode key swallowing", () => {
  it("Enter in a focused input is eaten while click mode is active", () => {
    const input = doc.createElement("input");
    input.value = "draft";
    place(input, 5, 5);
    doc.body.append(input);
    const pageClick = vi.fn();
    doc.body.addEventListener("click", pageClick);
    const teardown = createApp({ window: win, isVisible: () => true }).apply();
    input.focus();

    activate();
    const e = keydown({ key: "Enter" });
    input.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(input.value).toBe("draft");
    expect(pageClick).not.toHaveBeenCalled();

    win.dispatchEvent(keydown({ key: "Escape" }));
    teardown();
    doc.body.removeEventListener("click", pageClick);
  });

  it("a dead-end key clears pending and relights every badge", () => {
    buttons(12);
    const teardown = createApp({ window: win, isVisible: () => true }).apply();
    activate();

    const markA = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "a" }));
    // 命中的 ad 两段点亮，被排除的 sd 整段变暗。
    expect(since(markA)).toContainEqual({ text: "a", weight: "700", alpha: 1 });
    expect(since(markA)).toContainEqual({ text: "sd", weight: "400", alpha: 0.3 });

    // "x" is off the home row, so it can never extend "a" to a label.
    const markX = canvasTexts().length;
    win.dispatchEvent(keydown({ key: "x" }));
    expect(overlayRoot()).not.toBeNull();
    expect(since(markX)).toHaveLength(12);
    expect(since(markX).every((text) => text.weight === "400" && text.alpha === 1)).toBe(true);

    win.dispatchEvent(keydown({ key: "Escape" }));
    teardown();
  });
});

/**
 * The shipped bindings plus a focus chord the reader recorded.
 *
 * Focus mode ships unbound, so a test that drives it has to configure it first;
 * that is the same step a reader takes in the settings page.
 */
const WITH_FOCUS: JumpBindings = {
  ...createDefaultBindings("macos"),
  focus: { key: "u", meta: true, alt: false, ctrl: false, shift: false },
};

describe("focus mode (Cmd+U)", () => {
  it("Cmd+U then full label focuses the target and tears down overlay", () => {
    const input = doc.createElement("input");
    place(input, 5, 5);
    doc.body.append(input);
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      // Focus mode ships unbound, so this mount carries the chord a reader
      // would have recorded in the settings page.
      bindings: { get: () => WITH_FOCUS },
    }).apply();

    win.dispatchEvent(keydown({ key: "u", metaKey: true }));
    expect(overlayRoot()).not.toBeNull();

    win.dispatchEvent(keydown({ key: "a" }));
    expect(doc.activeElement).toBe(input);
    expect(overlayRoot()).toBeNull();
    teardown();
  });

  it("after a focus hit the mode is idle: bare keys are not eaten", () => {
    const input = doc.createElement("input");
    place(input, 5, 5);
    doc.body.append(input);
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      // Focus mode ships unbound, so this mount carries the chord a reader
      // would have recorded in the settings page.
      bindings: { get: () => WITH_FOCUS },
    }).apply();

    win.dispatchEvent(keydown({ key: "u", metaKey: true }));
    win.dispatchEvent(keydown({ key: "a" }));
    expect(doc.activeElement).toBe(input);

    const e = keydown({ key: "a" });
    win.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(overlayRoot()).toBeNull();
    teardown();
  });
});

describe("text entry targets actually receive focus", () => {
  /** 造一个真 composer 形状的可编辑宿主，并装好矩形。 */
  function composer(): HTMLElement {
    const host = doc.createElement("div");
    host.setAttribute("contenteditable", "true");
    host.setAttribute("role", "textbox");
    host.setAttribute("data-composer-input", "true");
    place(host, 100, 500, 600, 36);
    doc.body.append(host);
    return host;
  }

  it("Cmd+U on the composer focuses it and puts the caret at the end of the draft", () => {
    // 跳到输入框的目的是接着写：光标落在行首等于把用户丢回开头。
    const host = composer();
    host.textContent = "draft";
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      // Focus mode ships unbound, so this mount carries the chord a reader
      // would have recorded in the settings page.
      bindings: { get: () => WITH_FOCUS },
    }).apply();

    win.dispatchEvent(keydown({ key: "u", metaKey: true }));
    win.dispatchEvent(keydown({ key: "a" }));

    expect(doc.activeElement).toBe(host);
    const selection = doc.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    expect(host.contains(selection?.anchorNode ?? null)).toBe(true);
    // 折叠位置在内容之后 = 可以继续打字。
    expect(selection?.anchorOffset).toBe(host.childNodes.length);
    teardown();
  });

  it("Cmd+H on the composer also focuses it, because synthetic clicks cannot focus anything", () => {
    // 合成鼠标事件不是可信事件，浏览器不会为其执行"聚焦"默认动作；实测
    // button/input/contenteditable 三种目标派发完整序列后 activeElement 均未变。
    // 所以 click 模式对文本面必须改走 focus，否则跳过去等于没跳。
    const host = composer();
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

    win.dispatchEvent(keydown({ key: "h", metaKey: true }));
    win.dispatchEvent(keydown({ key: "a" }));

    expect(doc.activeElement).toBe(host);
    teardown();
  });

  it("Cmd+H on the composer does not dispatch a mouse sequence that would blur it again", () => {
    const host = composer();
    const seen: string[] = [];
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      host.addEventListener(type, () => seen.push(type));
    }
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

    win.dispatchEvent(keydown({ key: "h", metaKey: true }));
    win.dispatchEvent(keydown({ key: "a" }));

    expect(seen).toEqual([]);
    teardown();
  });

  it("Cmd+U on a textarea focuses it and keeps its native caret-at-end behaviour", () => {
    const field = doc.createElement("textarea");
    field.value = "hello";
    place(field, 10, 10);
    doc.body.append(field);
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      // Focus mode ships unbound, so this mount carries the chord a reader
      // would have recorded in the settings page.
      bindings: { get: () => WITH_FOCUS },
    }).apply();

    win.dispatchEvent(keydown({ key: "u", metaKey: true }));
    win.dispatchEvent(keydown({ key: "a" }));

    expect(doc.activeElement).toBe(field);
    teardown();
  });

  it("a text entry target that already owns the caret is not yanked to the end", () => {
    // 光标已经在里面（用户正打着字）时跳回去不该改变偏移，否则等于吞掉一次编辑意图。
    const field = doc.createElement("textarea");
    field.value = "hello world";
    place(field, 10, 10);
    doc.body.append(field);
    field.focus();
    field.setSelectionRange(3, 3);
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      // Focus mode ships unbound, so this mount carries the chord a reader
      // would have recorded in the settings page.
      bindings: { get: () => WITH_FOCUS },
    }).apply();

    win.dispatchEvent(keydown({ key: "u", metaKey: true }));
    win.dispatchEvent(keydown({ key: "a" }));

    expect(doc.activeElement).toBe(field);
    expect(field.selectionStart).toBe(3);
    teardown();
  });

  it("click mode on a button still fires the full pointer/mouse/click sequence", () => {
    // 回归钉子：文本面改走 focus 之后，普通控件必须仍然走真实鼠标序列，
    // 否则 React 的 onClick 不会触发。
    const button = doc.createElement("button");
    place(button, 10, 10);
    doc.body.append(button);
    const seen: string[] = [];
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      button.addEventListener(type, () => seen.push(type));
    }
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

    win.dispatchEvent(keydown({ key: "h", metaKey: true }));
    win.dispatchEvent(keydown({ key: "a" }));

    expect(seen).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
    teardown();
  });

  it("does not paint a selection over a text-entry target that cannot actually take focus", () => {
    // 伪装成文本面却不可聚焦的宿主（ARIA 标错、缺 tabindex）：focus() 会静默
    // 失败。此时若照旧设置文档选区，用户会看到目标内容被整段高亮、焦点却还在
    // 原处，跳转没发生，只剩一段莫名的蓝条。
    const fake = doc.createElement("div");
    fake.setAttribute("role", "textbox");
    fake.textContent = "not really editable";
    place(fake, 20, 20);
    doc.body.append(fake);
    // jsdom 的 div 本来就不在 tab 序列里，focus() 是 no-op，正好是这个形态。
    fake.focus = () => undefined;

    const other = doc.createElement("button");
    place(other, 200, 20);
    doc.body.append(other);
    other.focus();

    const teardown = createApp({
      window: win,
      isVisible: () => true,
      // Focus mode ships unbound, so this mount carries the chord a reader
      // would have recorded in the settings page.
      bindings: { get: () => WITH_FOCUS },
    }).apply();

    win.dispatchEvent(keydown({ key: "u", metaKey: true }));
    // 激活本身会先放掉焦点，所以按钮不再是「原处」。要钉住的是：跳转失败后焦点
    // 没有落到这个伪装目标上，选区也没有被涂到它的内容上。
    win.dispatchEvent(keydown({ key: "a" }));

    expect(doc.activeElement).not.toBe(fake);
    const selection = doc.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    expect(range !== null && fake.contains(range.commonAncestorContainer)).toBe(false);
    teardown();
  });

  it("focuses a native search field without reaching for a Range", () => {
    // 原生 input 不认 Range：`selectNodeContents(input)` 指向元素本身而不是它的
    // 文本，加进选区之后光标落在框外，字段虽然拿到了焦点，下一个字母还是进不去。
    // 真实浏览器立刻能看出来，jsdom 没有选区引擎则会假装通过，所以这里钉住的是
    // 「没有构造 Range」，而不是最终选区落在哪。
    const field = doc.createElement("input");
    field.type = "search";
    field.value = "query";
    place(field, 10, 10, 160, 22);
    doc.body.append(field);

    const touched: string[] = [];
    const originalCreateRange = doc.createRange.bind(doc);
    doc.createRange = () => {
      touched.push("createRange");
      return originalCreateRange();
    };
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      // Focus mode ships unbound, so this mount carries the chord a reader
      // would have recorded in the settings page.
      bindings: { get: () => WITH_FOCUS },
    }).apply();

    win.dispatchEvent(keydown({ key: "u", metaKey: true }));
    win.dispatchEvent(keydown({ key: "a" }));

    expect(doc.activeElement).toBe(field);
    expect(touched).toEqual([]);
    teardown();
    doc.createRange = originalCreateRange;
  });
});

describe("activation clears the page so the next letter is a label", () => {
  it("blurs whatever held focus before collecting labels", () => {
    buttons(2);
    const field = doc.createElement("textarea");
    place(field, 10, 10);
    doc.body.append(field);
    field.focus();
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

    win.dispatchEvent(keydown({ key: "h", metaKey: true }));

    expect(doc.activeElement).not.toBe(field);
    expect(overlayRoot()).not.toBeNull();
    teardown();
  });

  it("asks the host to take the latin input source on activation and to give it back on escape", () => {
    buttons(1);
    const calls: string[] = [];
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      onRound: (phase) => calls.push(phase),
    }).apply();

    win.dispatchEvent(keydown({ key: "h", metaKey: true }));
    win.dispatchEvent(keydown({ key: "Escape" }));

    expect(calls).toEqual(["begin", "end"]);
    teardown();
  });

  it("gives the input source back once a label completes, not only on escape", () => {
    buttons(1);
    const calls: string[] = [];
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      onRound: (phase) => calls.push(phase),
      // Focus mode ships unbound, so this mount carries the chord a reader
      // would have recorded in the settings page.
      bindings: { get: () => WITH_FOCUS },
    }).apply();

    win.dispatchEvent(keydown({ key: "u", metaKey: true }));
    win.dispatchEvent(keydown({ key: "a" }));

    expect(calls).toEqual(["begin", "end"]);
    teardown();
  });

  it("gives the input source back when the window is hidden mid-round", () => {
    buttons(1);
    const calls: string[] = [];
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      onRound: (phase) => calls.push(phase),
    }).apply();

    win.dispatchEvent(keydown({ key: "h", metaKey: true }));
    Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => "hidden" });
    doc.dispatchEvent(new dom.window.Event("visibilitychange"));

    expect(calls).toEqual(["begin", "end"]);
    expect(overlayRoot()).toBeNull();
    teardown();
  });

  it("gives the input source back when the page is going away mid-round", () => {
    buttons(1);
    const calls: string[] = [];
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      onRound: (phase) => calls.push(phase),
    }).apply();

    win.dispatchEvent(keydown({ key: "h", metaKey: true }));
    win.dispatchEvent(new dom.window.Event("pagehide"));

    expect(calls).toEqual(["begin", "end"]);
    teardown();
  });

  it("gives the input source back if the plugin unloads while a round is open", () => {
    buttons(1);
    const calls: string[] = [];
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      onRound: (phase) => calls.push(phase),
    }).apply();

    win.dispatchEvent(keydown({ key: "h", metaKey: true }));
    teardown();

    expect(calls).toEqual(["begin", "end"]);
  });
});

describe("labels survive a second activation", () => {
  it("Cmd+H twice then the same label hits the same element after a new button lands ahead of it", () => {
    const els = buttons(3);
    els.forEach((el, i) => el.setAttribute("data-row-key", "row-" + String(i)));
    const app = createApp({ window: win, isVisible: () => true });
    const teardown = app.apply();

    activate();
    expect(app.labels()).toEqual(["a", "s", "d"]);
    win.dispatchEvent(keydown({ key: "d" }));

    // 新按钮插在 DOM 与视觉序里都排在第三个按钮之前，无记忆时它会把 d 顶走。
    const intruder = doc.createElement("button");
    place(intruder, 55, 10);
    doc.body.insertBefore(intruder, els[2] as HTMLElement);

    const hits: string[] = [];
    els[2]?.addEventListener("click", () => hits.push("target"));
    intruder.addEventListener("click", () => hits.push("intruder"));

    activate();
    expect(app.labels()).toEqual(["a", "s", "f", "d"]);
    win.dispatchEvent(keydown({ key: "d" }));

    expect(hits).toEqual(["target"]);
    teardown();
  });
});

describe("configurable activation chords", () => {
  const custom: JumpBindings = {
    click: { key: "k", meta: true, alt: true, ctrl: false, shift: false },
    focus: { key: "j", meta: false, alt: false, ctrl: true, shift: true },
    reference: null,
  };

  function source(bindings: typeof custom) {
    let current = bindings;
    const listeners = new Set<(next: typeof custom) => void>();
    return {
      get: () => current,
      subscribe: (listener: (next: typeof custom) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      push(next: typeof custom) {
        current = next;
        for (const listener of listeners) listener(current);
      },
    };
  }

  it("activates on the configured chord and ignores the shipped one", () => {
    buttons(2);
    const bindings = source(custom);
    const teardown = createApp({ window: win, isVisible: () => true, bindings }).apply();

    win.dispatchEvent(keydown({ key: "h", metaKey: true }));
    expect(overlayRoot()).toBeNull();

    win.dispatchEvent(keydown({ key: "k", metaKey: true, altKey: true }));
    expect(overlayRoot()).not.toBeNull();
    teardown();
  });

  it("routes the focus chord through its own modifiers", () => {
    const field = doc.createElement("textarea");
    place(field, 10, 10);
    doc.body.append(field);
    const bindings = source(custom);
    const teardown = createApp({ window: win, isVisible: () => true, bindings }).apply();

    win.dispatchEvent(keydown({ key: "j", ctrlKey: true, shiftKey: true }));
    win.dispatchEvent(keydown({ key: "a" }));

    expect(doc.activeElement).toBe(field);
    teardown();
  });

  it("takes a remap made while mounted on the next activation", () => {
    buttons(2);
    const bindings = source(custom);
    const teardown = createApp({ window: win, isVisible: () => true, bindings }).apply();

    bindings.push({
      click: { key: "p", meta: true, alt: false, ctrl: false, shift: false },
      focus: { key: "j", meta: false, alt: false, ctrl: true, shift: true },
      reference: null,
    });

    win.dispatchEvent(keydown({ key: "k", metaKey: true, altKey: true }));
    expect(overlayRoot()).toBeNull();
    win.dispatchEvent(keydown({ key: "p", metaKey: true }));
    expect(overlayRoot()).not.toBeNull();
    teardown();
  });
});

describe("stacked background cards stay out of the label set", () => {
  it("labels only the foreground button when the background card is aria-hidden and pointer-events:none", () => {
    // 不注入 isVisible：走真实 defaultIsVisible 的组合判定。jsdom 没有
    // checkVisibility 也不做布局，可见性一半靠内联 position:fixed 走
    // getComputedStyle 分支；不可交互一半由后台卡的 aria-hidden 阻断。
    const fgCard = doc.createElement("aside");
    const fgButton = doc.createElement("button");
    fgButton.setAttribute("style", "position: fixed");
    fgCard.append(fgButton);

    const bgCard = doc.createElement("aside");
    bgCard.setAttribute("aria-hidden", "true");
    bgCard.setAttribute("style", "pointer-events: none");
    const bgButton = doc.createElement("button");
    bgButton.setAttribute("style", "position: fixed");
    bgButton.setAttribute("tabindex", "-1");
    bgCard.append(bgButton);

    doc.body.append(fgCard, bgCard);
    place(fgButton, 10, 10);
    place(bgButton, 30, 30);

    const app = createApp({ window: win });
    const teardown = app.apply();
    activate();

    expect(overlayRoot()).not.toBeNull();
    expect(app.labels()).toEqual(["a"]);

    // 唯一的标签属于前景按钮：敲它命中的就是前景按钮本身。
    const hits: string[] = [];
    fgButton.addEventListener("click", () => hits.push("foreground"));
    bgButton.addEventListener("click", () => hits.push("background"));
    win.dispatchEvent(keydown({ key: "a" }));
    expect(hits).toEqual(["foreground"]);

    teardown();
  });
});

/** 20 列网格：300 个候选全部落在 jsdom 视口内，视觉顺序等于建按钮的顺序。 */
function gridButtons(count: number): HTMLElement[] {
  const cols = 20;
  const els: HTMLElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const el = doc.createElement("button");
    el.textContent = "g" + String(i);
    place(el, 10 + (i % cols) * 30, 10 + Math.floor(i / cols) * 30);
    doc.body.append(el);
    els.push(el);
  }
  return els;
}

describe("progressive activation", () => {
  it("settles only after every badge of the current round is painted", async () => {
    gridButtons(300);
    const app = createApp({ window: win, isVisible: () => true });
    const teardown = app.apply();

    activate();
    // 300 枚远低于同步上限：激活这一帧就画完，settled 立刻可等。
    expect(app.labels()).toHaveLength(300);
    let settled = false;
    void app.settled().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(true);

    await app.settled();
    expect(app.labels()).toHaveLength(300);
    teardown();
  });

  it("accepts a label on the activation frame", () => {
    // 300 个候选升到三键；全部标签在激活帧内已经可用，不需要等任何绘制帧。
    const els = gridButtons(300);
    const app = createApp({ window: win, isVisible: () => true });
    const teardown = app.apply();

    activate();
    expect(app.labels()).toHaveLength(300);

    const label = [...generateLabels(3)][299] as string;
    const target = els[299] as HTMLElement;
    const hits: string[] = [];
    target.addEventListener("click", () => hits.push("click"));

    win.dispatchEvent(keydown({ key: label[0] }));
    win.dispatchEvent(keydown({ key: label[1] }));
    win.dispatchEvent(keydown({ key: label[2] }));

    expect(hits).toEqual(["click"]);
    expect(overlayRoot()).toBeNull();
    // 命中已结束这一轮，画布与标签都不能留下残余。
    expect(app.labels()).toEqual([]);
    teardown();
  });

  it("Esc removes the canvas and leaves no label behind", () => {
    gridButtons(300);
    const app = createApp({ window: win, isVisible: () => true });
    const teardown = app.apply();

    activate();
    expect(app.labels()).toHaveLength(300);

    win.dispatchEvent(keydown({ key: "Escape" }));
    expect(overlayRoot()).toBeNull();
    expect(app.labels()).toEqual([]);
    expect(app.visibleLabels()).toEqual([]);
    teardown();
  });

  it("starts a fresh round after a cancelled one", () => {
    gridButtons(300);
    const app = createApp({ window: win, isVisible: () => true });
    const teardown = app.apply();

    activate();
    win.dispatchEvent(keydown({ key: "Escape" }));

    activate();
    // 新轮从头画满，不夹带上一轮的残余。
    expect(app.labels()).toHaveLength(300);
    teardown();
  });
});

describe("progressive cancellation surfaces", () => {
  it("visibilitychange cancels the round", () => {
    gridButtons(300);
    const app = createApp({ window: win, isVisible: () => true });
    const teardown = app.apply();
    activate();
    expect(app.labels()).toHaveLength(300);

    Object.defineProperty(doc, "visibilityState", { configurable: true, value: "hidden" });
    try {
      doc.dispatchEvent(new dom.window.Event("visibilitychange"));
      expect(overlayRoot()).toBeNull();
      expect(app.labels()).toEqual([]);
    } finally {
      delete (doc as unknown as Record<string, unknown>)["visibilityState"];
    }
    teardown();
  });

  it("dispose cancels the round", () => {
    gridButtons(300);
    const app = createApp({ window: win, isVisible: () => true });
    const teardown = app.apply();
    activate();
    expect(app.labels()).toHaveLength(300);

    teardown();
    expect(overlayRoot()).toBeNull();
    expect(app.labels()).toEqual([]);
  });
});

/**
 * 可控帧钟：每读一次 now 就走 0.1ms，模拟一枚候选的采集成本。
 *
 * 采集预算按真实时间判停，所以测试不再硬编码「每块多少枚」；`frame()` 只
 * 推进调用方排队的那一帧，没有帧就什么都没发生。
 */
class StepClock implements FrameClock {
  time = 0;
  private seq = 0;
  private callbacks = new Map<number, (time: number) => void>();

  now(): number {
    this.time += 0.1;
    return this.time;
  }

  request(callback: (time: number) => void): number {
    this.seq += 1;
    this.callbacks.set(this.seq, callback);
    return this.seq;
  }

  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  frame(): void {
    const batch = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of batch) callback(this.time);
  }

  get pending(): number {
    return this.callbacks.size;
  }
}

/** 给每个候选的矩形读取装计数器，用来观察激活帧到底碰了多少个元素。 */
function trackRects(els: readonly HTMLElement[]): { count: () => number } {
  let reads = 0;
  for (const el of els) {
    const original = el.getBoundingClientRect.bind(el);
    el.getBoundingClientRect = () => {
      reads += 1;
      return original();
    };
  }
  return { count: () => reads };
}

/** 把排队中的采集帧全部跑完，再等浮层画完。 */
async function drain(app: JumpApp, clock: { pending: number; frame(): void }): Promise<void> {
  for (let i = 0; i < 5000 && clock.pending > 0; i += 1) clock.frame();
  await app.settled();
}

describe("采集分块", () => {
  it("激活帧只读第一批候选的矩形，后续帧补齐全部标签", async () => {
    const els = gridButtons(500);
    const reads = trackRects(els);
    const clock = new StepClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();

    activate();
    const firstFrame = reads.count();
    expect(firstFrame).toBeGreaterThan(0);
    expect(firstFrame).toBeLessThan(200);
    expect(clock.pending).toBeGreaterThan(0);

    await drain(app, clock);
    expect(app.labels()).toHaveLength(500);
    teardown();
  });

  it("分块补齐后的标签序列与一次性采集完全一致", async () => {
    const els = gridButtons(300);
    const clock = new StepClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();
    activate();
    await drain(app, clock);
    const chunked = [...app.labels()];
    teardown();

    doc.body.replaceChildren();
    gridButtons(300);
    const syncApp = createApp({ window: win, isVisible: () => true });
    const syncTeardown = syncApp.apply();
    activate();
    expect([...syncApp.labels()]).toEqual(chunked);
    syncTeardown();
  });

  it("82 个候选跨过两键容量后整轮仍是三键", async () => {
    gridButtons(82);
    const clock = new StepClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();
    activate();
    expect(clock.pending).toBeGreaterThan(0);
    await drain(app, clock);

    const labels = [...app.labels()];
    expect(labels).toHaveLength(82);
    expect(new Set(labels.map((label) => label.length))).toEqual(new Set([3]));
    expect(new Set(labels).size).toBe(82);
    teardown();
  });

  it("Esc 中断在途采集：后续帧不再读任何矩形，浮层移除", async () => {
    const els = gridButtons(500);
    const reads = trackRects(els);
    const clock = new StepClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();

    activate();
    clock.frame();
    expect(clock.pending).toBeGreaterThan(0);
    const before = reads.count();

    win.dispatchEvent(keydown({ key: "Escape" }));
    expect(overlayRoot()).toBeNull();
    expect(clock.pending).toBe(0);

    for (let i = 0; i < 10; i += 1) clock.frame();
    expect(reads.count()).toBe(before);
    expect(app.labels()).toEqual([]);
    teardown();
  });

  it("页面隐藏与 dispose 都中断在途采集", async () => {
    const els = gridButtons(500);
    const reads = trackRects(els);
    const clock = new StepClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();

    activate();
    clock.frame();
    const beforeHidden = reads.count();
    Object.defineProperty(doc, "visibilityState", { configurable: true, value: "hidden" });
    try {
      doc.dispatchEvent(new dom.window.Event("visibilitychange"));
      expect(overlayRoot()).toBeNull();
      expect(clock.pending).toBe(0);
      for (let i = 0; i < 10; i += 1) clock.frame();
      expect(reads.count()).toBe(beforeHidden);
    } finally {
      delete (doc as unknown as Record<string, unknown>)["visibilityState"];
    }

    activate();
    clock.frame();
    const beforeDispose = reads.count();
    teardown();
    expect(clock.pending).toBe(0);
    for (let i = 0; i < 10; i += 1) clock.frame();
    expect(reads.count()).toBe(beforeDispose);
  });

  it("重激活路径中断旧采集，并从新的一轮重新开始", () => {
    const els = gridButtons(500);
    const reads = trackRects(els);
    const clock = new StepClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();

    activate();
    clock.frame();
    expect(clock.pending).toBeGreaterThan(0);
    const beforeExit = reads.count();

    // 激活和弦再按一次：本轮退出，在途采集必须一起停。
    win.dispatchEvent(keydown({ key: "h", metaKey: true }));
    expect(overlayRoot()).toBeNull();
    expect(clock.pending).toBe(0);
    for (let i = 0; i < 10; i += 1) clock.frame();
    expect(reads.count()).toBe(beforeExit);

    // 再激活是全新一轮，从第一个候选重新读。
    activate();
    expect(reads.count()).toBeGreaterThan(beforeExit);
    expect(clock.pending).toBeGreaterThan(0);
    teardown();
  });

  it("分块采集完成后仍能敲标签命中并收尾", async () => {
    const els = gridButtons(300);
    const clock = new StepClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();
    activate();
    await drain(app, clock);

    const label = [...generateLabels(3)][299] as string;
    const target = els[299] as HTMLElement;
    const hits: string[] = [];
    target.addEventListener("click", () => hits.push("click"));
    for (const key of label) win.dispatchEvent(keydown({ key }));
    expect(hits).toEqual(["click"]);
    expect(overlayRoot()).toBeNull();
    teardown();
  });
});

/**
 * 可控的显示帧钟：帧时间戳按 step 推进，`now()` 每读一次记 1ms 的采集成本。
 *
 * 采集预算按 `now()` 的差值判停，所以「激活帧读了几枚候选」就是预算的可见
 * 后果：0.84ms 只够读完第一枚，1.5ms 够读两枚。
 */
class SampleClock implements FrameClock {
  private time = 0;
  private seq = 0;
  private frames = 0;
  private queued = new Map<number, (time: number) => void>();

  now(): number {
    this.time += 1;
    return this.time;
  }

  request(callback: (time: number) => void): number {
    this.frames += 1;
    this.seq += 1;
    this.queued.set(this.seq, callback);
    return this.seq;
  }

  cancel(handle: number): void {
    this.queued.delete(handle);
  }

  frame(ms = 0): void {
    this.time += ms;
    const due = [...this.queued.values()];
    this.queued.clear();
    for (const callback of due) callback(this.time);
  }

  get requests(): number {
    return this.frames;
  }

  get pending(): number {
    return this.queued.size;
  }
}

function flushIdle(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

/** 把采样的 24 帧按固定间隔跑完，再走完 promise 链。 */
async function runSampleFrames(clock: SampleClock, intervalMs: number): Promise<void> {
  for (let index = 0; index < 10000 && clock.pending > 0; index += 1) {
    if (clock.pending === 0) break;
    clock.frame(intervalMs);
  }
  await flushIdle();
  await flushIdle();
}

/** 读一次激活帧里第一个分块碰到的候选数。 */
function firstSliceReads(clock: SampleClock, els: readonly HTMLElement[]): number {
  const reads = trackRects(els);
  activate();
  return reads.count();
}

describe("运行时帧预算采样", () => {
  // jsdom 默认把文档当成隐藏页；这一组测的是前台页面的采样。
  beforeEach(() => {
    Object.defineProperty(doc, "hidden", { configurable: true, value: false });
  });
  afterEach(() => {
    delete (doc as unknown as Record<string, unknown>)["hidden"];
  });

  it("生产路径按实测 7ms 算切片预算，而不是 16.7ms", async () => {
    const els = gridButtons(500);
    const clock = new SampleClock();
    const idle: (() => void)[] = [];
    const app = createApp({
      window: win,
      isVisible: () => true,
      frameClock: clock,
      idleScheduler: (run) => idle.push(run),
    });
    const teardown = app.apply();
    expect(idle).toHaveLength(1);
    (idle[0] as () => void)();
    await runSampleFrames(clock, 7);

    // 0.84ms 的份额只够读完第一枚；16.7ms 会读到第二枚。
    expect(firstSliceReads(clock, els)).toBe(1);
    teardown();
  });

  it("采样只用 24 帧，不多跑一帧", async () => {
    gridButtons(500);
    const clock = new SampleClock();
    const idle: (() => void)[] = [];
    const app = createApp({
      window: win,
      isVisible: () => true,
      frameClock: clock,
      idleScheduler: (run) => idle.push(run),
    });
    const teardown = app.apply();
    (idle[0] as () => void)();
    for (let index = 0; index < 24; index += 1) clock.frame(7);
    await flushIdle();
    expect(clock.requests).toBeLessThanOrEqual(24);
    expect(clock.pending).toBe(0);
    teardown();
  });

  it("页面隐藏时不起采样，预算用 16.7ms", async () => {
    const els = gridButtons(500);
    const clock = new SampleClock();
    const idle: (() => void)[] = [];
    Object.defineProperty(doc, "hidden", { configurable: true, value: true });
    try {
      const app = createApp({
        window: win,
        isVisible: () => true,
        frameClock: clock,
        idleScheduler: (run) => idle.push(run),
      });
      const teardown = app.apply();
      for (const run of idle) run();
      expect(clock.requests).toBe(0);
      expect(firstSliceReads(clock, els)).toBe(2);
      teardown();
    } finally {
      delete (doc as unknown as Record<string, unknown>)["hidden"];
    }
  });

  it("离谱读数被丢弃：2ms 与 60ms 都退回 16.7ms", async () => {
    for (const interval of [2, 60]) {
      const els = gridButtons(500);
      const clock = new SampleClock();
      const idle: (() => void)[] = [];
      const app = createApp({
        window: win,
        isVisible: () => true,
        frameClock: clock,
        idleScheduler: (run) => idle.push(run),
      });
      const teardown = app.apply();
      (idle[0] as () => void)();
      await runSampleFrames(clock, interval);
      expect({ interval, reads: firstSliceReads(clock, els) }).toEqual({ interval, reads: 2 });
      teardown();
      doc.body.replaceChildren();
    }
  });
});

describe("采集期键盘缓冲", () => {
  it("采集在途时敲的标签首字母被缓冲，drain 后照常命中", async () => {
    // 9 枚是一键标签；每读一个候选花 1ms，激活帧只够两枚，采集真的在途。
    const els = gridButtons(9);
    const clock = new SampleClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();
    activate();
    expect(app.labels()).toEqual([]);
    expect(clock.pending).toBeGreaterThan(0);

    const hits: string[] = [];
    (els[0] as HTMLElement).addEventListener("click", () => hits.push("click"));
    const stroke = keydown({ key: "a" });
    win.dispatchEvent(stroke);

    // 不能漏给宿主，也不能当场命中未完成的轮次。
    expect(stroke.defaultPrevented).toBe(true);
    expect(hits).toEqual([]);

    await drain(app, clock);
    expect(hits).toEqual(["click"]);
    expect(overlayRoot()).toBeNull();
    teardown();
  });

  it("采集期连敲超过缓冲上限不炸，收尾状态一致", async () => {
    gridButtons(500);
    const clock = new StepClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();
    activate();

    let hits = 0;
    for (const el of doc.querySelectorAll("button")) el.addEventListener("click", () => (hits += 1));
    for (const key of ["s", "d", "f", "g", "h", "j", "a", "a", "a", "s"]) {
      expect(() => win.dispatchEvent(keydown({ key }))).not.toThrow();
    }

    await expect(drain(app, clock)).resolves.toBeUndefined();
    // 缓冲只留最近的击键：它们拼成一条完整标签并正常收尾，不会重复派发。
    expect(hits).toBe(1);
    expect(overlayRoot()).toBeNull();
    expect(app.labels()).toEqual([]);
    teardown();
  });

  it("pagehide 取消在途采集，恢复后不提交也不画徽章", async () => {
    const els = gridButtons(500);
    const reads = trackRects(els);
    const clock = new StepClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();
    activate();
    expect(clock.pending).toBeGreaterThan(0);

    win.dispatchEvent(new dom.window.Event("pagehide"));
    expect(clock.pending).toBe(0);
    expect(overlayRoot()).toBeNull();
    const before = reads.count();
    for (let index = 0; index < 10; index += 1) clock.frame();

    expect(reads.count()).toBe(before);
    expect(app.labels()).toEqual([]);
    expect(app.visibleLabels()).toEqual([]);
    teardown();
  });
});

/**
 * 墙钟帧钟：`now()` 每读一次记 0.1ms 的采集成本，`frame(ms)` 把墙钟往前推
 * 一整段。两者必须分开：采集预算看的是每次读取之间的微小差值，1 秒硬上限
 * 看的是激活以来的墙钟跨度。
 */
class DeadlineClock implements FrameClock {
  private time = 0;
  private seq = 0;
  private callbacks = new Map<number, (time: number) => void>();

  now(): number {
    this.time += 0.1;
    return this.time;
  }

  request(callback: (time: number) => void): number {
    this.seq += 1;
    this.callbacks.set(this.seq, callback);
    return this.seq;
  }

  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  frame(ms: number): void {
    this.time += ms;
    const due = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of due) callback(this.time);
  }

  get pending(): number {
    return this.callbacks.size;
  }
}

/** 最后一整轮重绘的标签与位置，按画布绘制顺序返回。 */
function lastDrawnPairs(count: number): Map<string, string> {
  const draws = canvasOps
    .filter((op) => op.kind === "fillText")
    .slice(-count)
    .map((op) => ({ text: String(op.args[0]), x: Number(op.args[1]), y: Number(op.args[2]) }));
  return new Map(draws.map((entry) => [entry.x + "," + entry.y, entry.text]));
}

function labelRanks(labels: readonly string[], keys: number): Map<string, number> {
  const stream = [...generateLabels(keys)];
  return new Map(labels.map((label) => [label, stream.indexOf(label)]));
}

describe("条件回退：快路径、慢路径与硬上限", () => {
  it("快路径不变：一帧内采集完时，激活帧画满全部标签", () => {
    gridButtons(9);
    const clock = new StepClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();

    activate();
    // 9 枚在一键容量内，采集在激活帧跑完，画布一次画满。
    expect(app.labels()).toHaveLength(9);
    expect(app.visibleLabels()).toHaveLength(9);
    expect(clock.pending).toBe(0);
    expect(canvasTexts().map((entry) => entry.text)).toEqual([...generateLabels(1)].slice(0, 9));
    teardown();
  });

  it("慢路径在第 N+1 帧先画出已采到的部分", () => {
    gridButtons(300);
    const clock = new StepClock();
    const app = createApp({
      window: win,
      isVisible: () => true,
      frameClock: clock,
      frameBudgetMs: 16.7,
      progressiveAfterFrames: 3,
    });
    const teardown = app.apply();

    activate();
    // 激活帧只采到一小段，慢路径还没到点，屏幕上仍然静默。
    expect(app.visibleLabels()).toEqual([]);
    clock.frame();
    clock.frame();
    expect(app.visibleLabels()).toEqual([]);

    // 激活帧算第 1 帧，第 N+1 帧（这里是第 4 帧）开始先画已采到的部分。
    clock.frame();
    const first = app.visibleLabels().length;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(300);
    expect(app.labels().length).toBe(first);
    teardown();
  });

  it("慢路径标签不漂移：与一次性采集的配对只在标签长度上不同", async () => {
    // 100 个候选里藏起 40 个：总数让慢路径定三键，有效数让快路径定两键。
    const hidden = (el: Element): boolean => !el.hasAttribute("data-hidden");
    const build = (): HTMLElement[] => {
      const els = gridButtons(100);
      for (const [index, el] of els.entries()) {
        if (index % 5 === 4 || index % 5 === 0) el.setAttribute("data-hidden", "");
      }
      return els;
    };

    build();
    const fast = createApp({ window: win, isVisible: hidden });
    const fastTeardown = fast.apply();
    activate();
    const fastLabels = [...fast.labels()];
    expect(fastLabels).toHaveLength(60);
    const fastPairs = lastDrawnPairs(fastLabels.length);
    fastTeardown();

    doc.body.replaceChildren();
    doc.querySelector("[data-dsh-jump-overlay]")?.remove();
    build();
    const clock = new StepClock();
    const slow = createApp({
      window: win,
      isVisible: hidden,
      frameClock: clock,
      frameBudgetMs: 16.7,
      progressiveAfterFrames: 3,
    });
    const slowTeardown = slow.apply();
    activate();
    await drain(slow, clock);
    const slowLabels = [...slow.labels()];
    expect(slowLabels).toHaveLength(60);
    const slowPairs = lastDrawnPairs(slowLabels.length);

    // 同一批元素：位置集合完全一致。
    expect([...slowPairs.keys()].sort()).toEqual([...fastPairs.keys()].sort());
    // 每个元素在标签流里的位次一致，只有标签长度从 2 变成 3。
    const fastRank = labelRanks(fastLabels, 2);
    const slowRank = labelRanks(slowLabels, 3);
    for (const [cell, label] of fastPairs) {
      expect({ cell, rank: slowRank.get(slowPairs.get(cell) ?? "") }).toEqual({
        cell,
        rank: fastRank.get(label),
      });
    }
    expect(new Set(fastLabels.map((label) => label.length))).toEqual(new Set([2]));
    expect(new Set(slowLabels.map((label) => label.length))).toEqual(new Set([3]));
    slowTeardown();
  });

  it("慢路径首批标签可立即敲中", () => {
    const els = gridButtons(100);
    const clock = new StepClock();
    const app = createApp({
      window: win,
      isVisible: () => true,
      frameClock: clock,
      frameBudgetMs: 16.7,
      progressiveAfterFrames: 3,
    });
    const teardown = app.apply();

    activate();
    clock.frame();
    clock.frame();
    clock.frame();
    const first = app.visibleLabels();
    expect(first.length).toBeGreaterThan(0);

    const hits: string[] = [];
    (els[0] as HTMLElement).addEventListener("click", () => hits.push("first"));
    for (const key of first[0] as string) win.dispatchEvent(keydown({ key }));

    expect(hits).toEqual(["first"]);
    expect(overlayRoot()).toBeNull();
    expect(app.labels()).toEqual([]);
    teardown();
  });

  it("1 秒硬上限停止采集并冻结已画出的标签", () => {
    const els = gridButtons(300);
    const reads = trackRects(els);
    const clock = new DeadlineClock();
    const app = createApp({
      window: win,
      isVisible: () => true,
      frameClock: clock,
      frameBudgetMs: 16.7,
      progressiveAfterFrames: 100,
    });
    const teardown = app.apply();

    activate();
    expect(app.visibleLabels()).toEqual([]);
    // 每帧推进 300ms：第 4 帧的墙钟越过 1 秒，采集必须当场停手。
    for (let index = 0; index < 4; index += 1) clock.frame(300);

    const painted = app.visibleLabels().length;
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThan(300);
    // 页面上每个候选都可见且在视口内：读过的矩形数就是已采到的数量。
    expect(painted).toBe(reads.count());
    expect(clock.pending).toBe(0);
    const frozenReads = reads.count();
    for (let index = 0; index < 10; index += 1) clock.frame(300);

    expect(reads.count()).toBe(frozenReads);
    expect(app.visibleLabels()).toHaveLength(painted);
    expect(app.labels()).toHaveLength(painted);
    teardown();
  });

  it.each(["Esc", "命中", "重激活", "visibilitychange", "dispose", "pagehide"])(
    "%s 中断后不再采集、不再绘制、画布移除",
    (surface) => {
      const els = gridButtons(300);
      const reads = trackRects(els);
      const clock = new StepClock();
      const app = createApp({
        window: win,
        isVisible: () => true,
        frameClock: clock,
        frameBudgetMs: 16.7,
        progressiveAfterFrames: 3,
      });
      const teardown = app.apply();

      activate();
      clock.frame();
      clock.frame();
      clock.frame();
      const painted = app.visibleLabels();
      expect(painted.length).toBeGreaterThan(0);

      const readsBefore = reads.count();
      if (surface === "Esc") {
        win.dispatchEvent(keydown({ key: "Escape" }));
      } else if (surface === "命中") {
        for (const key of painted[0] as string) win.dispatchEvent(keydown({ key }));
      } else if (surface === "重激活") {
        win.dispatchEvent(keydown({ key: "h", metaKey: true }));
      } else if (surface === "visibilitychange") {
        Object.defineProperty(doc, "visibilityState", { configurable: true, value: "hidden" });
        try {
          doc.dispatchEvent(new dom.window.Event("visibilitychange"));
        } finally {
          delete (doc as unknown as Record<string, unknown>)["visibilityState"];
        }
      } else if (surface === "dispose") {
        teardown();
      } else {
        win.dispatchEvent(new dom.window.Event("pagehide"));
      }

      expect(overlayRoot()).toBeNull();
      expect(app.labels()).toEqual([]);
      expect(app.visibleLabels()).toEqual([]);
      expect(clock.pending).toBe(0);
      const opsAfterCancel = canvasOps.length;
      for (let index = 0; index < 10; index += 1) clock.frame();

      expect(reads.count()).toBe(readsBefore);
      expect(canvasOps.length).toBe(opsAfterCancel);
      if (surface !== "dispose") teardown();
    },
  );

  it("中断清空采集期缓冲：重激活不会补发上一轮盲敲的首字母", async () => {
    const els = gridButtons(9);
    const clock = new SampleClock();
    const app = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 });
    const teardown = app.apply();

    activate();
    // 一枚候选花 1ms，激活帧只采到两枚：屏幕还没有标签，首字母只能进缓冲。
    expect(app.labels()).toEqual([]);
    const hits: string[] = [];
    (els[0] as HTMLElement).addEventListener("click", () => hits.push("first"));
    win.dispatchEvent(keydown({ key: "a" }));
    win.dispatchEvent(new dom.window.Event("pagehide"));
    expect(app.labels()).toEqual([]);

    activate();
    await drain(app, clock);
    // 缓冲属于被中断的那一轮，不能在新一轮里补发成一次点击。
    expect(hits).toEqual([]);
    teardown();
  });

  it("慢路径中途 Esc 后重激活从新的一轮重新开始", () => {
    const els = gridButtons(300);
    const reads = trackRects(els);
    const clock = new StepClock();
    const app = createApp({
      window: win,
      isVisible: () => true,
      frameClock: clock,
      frameBudgetMs: 16.7,
      progressiveAfterFrames: 3,
    });
    const teardown = app.apply();

    activate();
    clock.frame();
    clock.frame();
    clock.frame();
    expect(app.visibleLabels().length).toBeGreaterThan(0);

    win.dispatchEvent(keydown({ key: "Escape" }));
    expect(overlayRoot()).toBeNull();
    expect(app.visibleLabels()).toEqual([]);

    const readsBefore = reads.count();
    activate();
    // 新轮从零开始：激活帧只采集，不夹带上一轮画出的任何标签。
    expect(reads.count()).toBeGreaterThan(readsBefore);
    expect(app.labels()).toEqual([]);
    expect(app.visibleLabels()).toEqual([]);
    expect(overlayRoot()).toBeNull();

    clock.frame();
    clock.frame();
    clock.frame();
    expect(app.visibleLabels().length).toBeGreaterThan(0);
    teardown();
  });
});

/**
 * 命中确认：动作先派发，确认后出现。
 *
 * 用户敲完标签后浮层整轮消失，看不到刚才打中了哪个元素。确认框补上这个回执，
 * 但它绝不能挡在动作前面：先点，再报。这里用调用顺序断言，不用时间戳，因为
 * 顺序是契约，耗时只是实现。
 */
describe("hit confirmation", () => {
  const CONFIRM = "[data-dsh-jump-confirm]";

  function confirmOf(): Element | null {
    return doc.querySelector(CONFIRM);
  }

  /** 手动推进的定时器，让 300ms 只在测试说走时走。 */
  function fakeTimers(): {
    setTimeout: (run: () => void, ms: number) => number;
    clearTimeout: (handle: number) => void;
    advance(ms: number): void;
  } {
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
    };
  }

  it("dispatches the click before the confirmation exists", () => {
    const els = buttons(12);
    const timers = fakeTimers();
    const teardown = createApp({ window: win, isVisible: () => true, confirmTimers: timers }).apply();
    activate();

    // 命中那一刻，确认框是否已经存在，从 click 监听器里读。
    let confirmAtClick: boolean | null = null;
    const target = els[1] as HTMLElement; // 两键轮第二个候选的 label 是 ad
    target.addEventListener("click", () => {
      confirmAtClick = confirmOf() !== null;
    });

    win.dispatchEvent(keydown({ key: "a" }));
    win.dispatchEvent(keydown({ key: "d" }));

    // 动作已经派发过，而它派发时确认框还没出现：先点，再报。
    expect(confirmAtClick).toBe(false);
    expect(confirmOf()).not.toBeNull();
    teardown();
  });

  it("places the box on the target that was hit", () => {
    const els = buttons(12);
    const timers = fakeTimers();
    const teardown = createApp({ window: win, isVisible: () => true, confirmTimers: timers }).apply();
    activate();
    win.dispatchEvent(keydown({ key: "a" }));
    win.dispatchEvent(keydown({ key: "d" }));

    // buttons(12) 里第二个按钮在 (40,10)，尺寸 10x10。
    const target = els[1] as HTMLElement;
    const rect = target.getBoundingClientRect();
    const box = confirmOf() as HTMLElement | null;
    expect(box?.style.left).toBe(String(rect.left) + "px");
    expect(box?.style.top).toBe(String(rect.top) + "px");
    teardown();
  });

  it("removes the box after the duration", () => {
    buttons(12);
    const timers = fakeTimers();
    const teardown = createApp({ window: win, isVisible: () => true, confirmTimers: timers }).apply();
    activate();
    win.dispatchEvent(keydown({ key: "a" }));
    win.dispatchEvent(keydown({ key: "d" }));
    expect(confirmOf()).not.toBeNull();

    timers.advance(300);
    expect(confirmOf()).toBeNull();
    teardown();
  });

  it("keeps only one box when a new round starts inside the window", () => {
    buttons(12);
    const timers = fakeTimers();
    const teardown = createApp({ window: win, isVisible: () => true, confirmTimers: timers }).apply();
    activate();
    win.dispatchEvent(keydown({ key: "a" }));
    win.dispatchEvent(keydown({ key: "d" }));
    expect(confirmOf()).not.toBeNull();

    // 300ms 内重新激活：旧确认立刻清掉，不能叠成两个。
    activate();
    expect(doc.querySelectorAll(CONFIRM)).toHaveLength(0);
    teardown();
  });

  it("clears the box on Esc", () => {
    buttons(12);
    const timers = fakeTimers();
    const teardown = createApp({ window: win, isVisible: () => true, confirmTimers: timers }).apply();
    activate();
    win.dispatchEvent(keydown({ key: "a" }));
    win.dispatchEvent(keydown({ key: "d" }));
    expect(confirmOf()).not.toBeNull();

    win.dispatchEvent(keydown({ key: "Escape" }));
    expect(confirmOf()).toBeNull();
    teardown();
  });

  it("leaves no box behind on teardown", () => {
    buttons(12);
    const timers = fakeTimers();
    const teardown = createApp({ window: win, isVisible: () => true, confirmTimers: timers }).apply();
    activate();
    win.dispatchEvent(keydown({ key: "a" }));
    win.dispatchEvent(keydown({ key: "d" }));
    expect(confirmOf()).not.toBeNull();

    teardown();
    expect(confirmOf()).toBeNull();
  });

  it("does not intercept pointer events", () => {
    buttons(12);
    const timers = fakeTimers();
    const teardown = createApp({ window: win, isVisible: () => true, confirmTimers: timers }).apply();
    activate();
    win.dispatchEvent(keydown({ key: "a" }));
    win.dispatchEvent(keydown({ key: "d" }));
    expect((confirmOf() as HTMLElement).style.pointerEvents).toBe("none");
    teardown();
  });
});
