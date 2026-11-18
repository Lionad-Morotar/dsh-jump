/**
 * overlay 的两条性能决策，各自都改变行为之外的东西：
 *
 * 1. 同一轮内的击键只改已存在的徽章，不重建。实测 1189 枚徽章、三键 label
 *    的中间态，全量重建每次击键 5.4ms，原地更新 0.1ms。
 * 2. 徽章用 absolute 挂在 fixed 容器里，而不是自己 fixed。600 枚 fixed 就是
 *    600 个 containing block；容器已经铺满视口，坐标系相同，视觉逐像素一致。
 *
 * 这里守的是这两条，不是实现细节：节点身份、被跳过的写入、location 的归属。
 */
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateLabels, type Hint } from "../src/client/hints.ts";
import { createOverlay, sampleFrameBudget, type FrameClock } from "../src/client/overlay.ts";

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

function badges(): HTMLElement[] {
  const root = document.querySelector(OVERLAY);
  return root === null ? [] : ([...root.children] as HTMLElement[]);
}

beforeEach(() => {
  document.documentElement.querySelector(OVERLAY)?.remove();
});

describe("badge lifecycle", () => {
  it("reuses the same nodes across prefixes of one round", () => {
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints);
    const first = badges();
    overlay.render(hints, "a");
    expect(badges()).toEqual(first);
    overlay.destroy();
  });

  it("mints fresh badges when a new round arrives", () => {
    // 同样的标签可能指到别的元素，原地更新会把徽章留在旧目标上。
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    overlay.render(hintsOf(["as", "sd"]));
    const first = badges();
    overlay.render(hintsOf(["as", "sd"]));
    const second = badges();
    expect(second).toHaveLength(2);
    expect(second[0]).not.toBe(first[0]);
    overlay.destroy();
  });

  it("leaves a badge untouched when the prefix did not change", () => {
    // 「不写」是这条优化的本体：同前缀下每枚徽章都该被完全跳过。
    // 从外部改一个值，若实现真的跳过，它应该原样留着。
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints, "a");
    const [, sd] = badges();
    sd!.style.opacity = "0.9";
    overlay.render(hints, "a");
    expect(sd?.style.opacity).toBe("0.9");
    overlay.destroy();
  });
});

describe("prefix painting", () => {
  it("splits the badges the prefix reaches and dims the rest", () => {
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    const hints = hintsOf(["as", "sd"]);
    overlay.render(hints);
    const [as, sd] = badges();
    // 未敲键时每一枚都是一整段。
    expect(as?.children).toHaveLength(1);
    overlay.render(hints, "a");
    // 敲了 a：as 拆成已敲与未敲两段并保持点亮，sd 被前缀排除、整枚变暗。
    expect(as?.children).toHaveLength(2);
    expect((as?.children[0] as HTMLElement).dataset.jumpPart).toBe("typed");
    // 已敲与未敲的字重分工也是用户看到的形态，不能被重分段改掉。
    expect((as?.children[0] as HTMLElement).style.fontWeight).toBe("700");
    expect((as?.children[1] as HTMLElement).style.fontWeight).toBe("400");
    expect(as?.style.opacity).toBe("1");
    expect(sd?.style.opacity).toBe("0.3");
    expect(sd?.children).toHaveLength(1);
    overlay.destroy();
  });

  it("drops empty rounds and leaves no container behind", () => {
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    overlay.render(hintsOf(["as"]));
    overlay.render([]);
    expect(badges()).toHaveLength(0);
    overlay.destroy();
    expect(document.querySelector(OVERLAY)).toBeNull();
  });
});

/**
 * 文字没变的转态不许重建子节点。
 *
 * 首击时整批徽章从「整段」转成「整段」只是变暗，span 的结构与文本完全一样；
 * replaceChildren 会把同一枚 span 销毁再造一枚，600 档就是 519 次白做。这里用
 * MutationObserver 的 childList 记录区分「重建」与「只写 opacity」，最终视觉在
 * 两种实现下相同，不能靠读 DOM 结果断言。
 */
describe("badge text repaint", () => {
  let observer: MutationObserver | undefined;

  afterEach(() => {
    observer?.disconnect();
    observer = undefined;
  });

  function badgeOf(label: string): HTMLElement {
    const found = badges().find((child) => child.dataset.jumpLabel === label);
    expect(found).toBeDefined();
    return found as HTMLElement;
  }

  function watchChildList(label: string): () => MutationRecord[] {
    const observerInstance = new dom.window.MutationObserver(() => undefined);
    observerInstance.observe(badgeOf(label), { subtree: true, childList: true });
    observer = observerInstance;
    return () => observerInstance.takeRecords();
  }

  function partTexts(label: string): (string | null | undefined)[][] {
    return [...badgeOf(label).children].map((child) => [
      (child as HTMLElement).dataset.jumpPart,
      child.textContent,
    ]);
  }

  it("keeps the whole-label run when a matching badge is ruled out", () => {
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    const hints = hintsOf(["asd", "sd"]);
    overlay.render(hints);
    const drain = watchChildList("sd");

    overlay.render(hints, "a");

    // 首击：文字从 whole 到 whole，只有透明度变了。
    expect(drain()).toHaveLength(0);
    expect(badgeOf("sd").style.opacity).toBe("0.3");
    expect(partTexts("sd")).toEqual([["whole", "sd"]]);
    overlay.destroy();
  });

  it("keeps the whole-label run when a dead key relights a dimmed badge", () => {
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    const hints = hintsOf(["asd", "sd"]);
    overlay.render(hints);
    overlay.render(hints, "a");
    expect(badgeOf("sd").style.opacity).toBe("0.3");
    const drain = watchChildList("sd");

    overlay.render(hints, "");

    // 死键回亮：whole 到 whole，同样只有透明度该动。
    expect(drain()).toHaveLength(0);
    expect(badgeOf("sd").style.opacity).toBe("1");
    expect(partTexts("sd")).toEqual([["whole", "sd"]]);
    overlay.destroy();
  });

  it("rebuilds the run when a split badge drops out", () => {
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    const hints = hintsOf(["asa", "asd"]);
    overlay.render(hints, "as");
    expect(partTexts("asa")).toEqual([
      ["typed", "as"],
      ["rest", "a"],
    ]);
    const drain = watchChildList("asa");

    overlay.render(hints, "asd");

    // typed/rest 到 whole 是两枚 span 换一枚，必须重建。
    expect(drain().length).toBeGreaterThan(0);
    expect(badgeOf("asa").style.opacity).toBe("0.3");
    expect(partTexts("asa")).toEqual([["whole", "asa"]]);
    overlay.destroy();
  });

  it("rebuilds the run when a dimmed badge becomes reachable again", () => {
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    const hints = hintsOf(["asa", "asd"]);
    overlay.render(hints);
    overlay.render(hints, "asd");
    expect(badgeOf("asa").style.opacity).toBe("0.3");
    const drain = watchChildList("asa");

    overlay.render(hints, "as");

    // whole 到 typed/rest，文字内容也变了，必须重建。
    expect(drain().length).toBeGreaterThan(0);
    expect(badgeOf("asa").style.opacity).toBe("1");
    expect(partTexts("asa")).toEqual([
      ["typed", "as"],
      ["rest", "a"],
    ]);
    overlay.destroy();
  });

  it("rebuilds the run when a longer prefix splits further", () => {
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    const hints = hintsOf(["asd"]);
    overlay.render(hints, "a");
    const drain = watchChildList("asd");

    overlay.render(hints, "as");

    expect(drain().length).toBeGreaterThan(0);
    expect(partTexts("asd")).toEqual([
      ["typed", "as"],
      ["rest", "d"],
    ]);
    expect(badgeOf("asd").style.opacity).toBe("1");
    overlay.destroy();
  });
});

describe("badge positioning", () => {
  it("positions badges absolutely inside one fixed container", () => {
    // 徽章自己 fixed 的话，一枚一个 containing block；容器已铺满视口，
    // absolute 拿到的是同一套坐标。
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    overlay.render(hintsOf(["as"]));
    const root = document.querySelector<HTMLElement>(OVERLAY);
    expect(root?.style.position).toBe("fixed");
    expect(badges()[0]?.style.position).toBe("absolute");
    overlay.destroy();
  });

  it("clamps a badge at the viewport edge back inside", () => {
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    overlay.render([{ element: document.createElement("button"), label: "as", rect: { x: 795, y: 595, w: 10, h: 10 } }]);
    const badge = badges()[0];
    // jsdom 把 left/top 规范化成带单位的写法，这里比的是钳制后的数值。
    expect(badge?.style.left).toBe(String(VIEWPORT.width - 24) + "px");
    expect(badge?.style.top).toBe(String(VIEWPORT.height - 16) + "px");
    overlay.destroy();
  });
});

describe("top layer", () => {
  /**
   * 目标可能是 popover（峰价提醒一类）或 showModal 打开的对话框，它们整体放在
   * top layer 上，会盖住任何 z-index 的普通元素。徽章画在它们下面等于不存在，
   * 用户看得到卡片、看不到标签。容器必须以 manual popover 进场，每轮重新抬一次。
   */
  it("enters the top layer as a manual popover and re-raises on a new round", () => {
    const proto = dom.window.Element.prototype as unknown as Record<string, unknown>;
    const shown: Element[] = [];
    proto["showPopover"] = function (this: Element) { shown.push(this) };
    proto["hidePopover"] = function () {};
    try {
      const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
      overlay.render(hintsOf(["as"]));
      const first = document.querySelector<HTMLElement>(OVERLAY);
      expect(first?.getAttribute("popover")).toBe("manual");
      expect(shown).toContain(first);
      overlay.destroy();
      overlay.render(hintsOf(["as"]));
      expect(shown).toHaveLength(2);
      overlay.destroy();
    } finally {
      delete proto["showPopover"];
      delete proto["hidePopover"];
    }
  });

  it("falls back to a plain container when popovers are unavailable", () => {
    // 没有 showPopover 的宿主里留着 popover 属性会被 UA 样式表按「未打开」藏掉，
    // 徽章会整轮消失，所以拿不到能力时不能留下这个属性。
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT });
    overlay.render(hintsOf(["as"]));
    expect(document.querySelector<HTMLElement>(OVERLAY)?.hasAttribute("popover")).toBe(false);
    overlay.destroy();
  });
});

/** 手动推进的帧时钟：jsdom 没有真实帧，分批只在该步进时发生。 */
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

/**
 * 帧周期与批成本分开的两个可调量。
 *
 * `step` 只推进 rAF 时间戳（帧周期），`spend` 只推进 performance.now（批成本）。
 * 旧实现用 `step` 同时扮演两者，所以看不到「帧间隔 7ms、批成本 0.5ms」时批量
 * 不增长这个 bug。真实浏览器里两个量本来就是独立的：帧起点由 vsync 决定，
 * 批成本由这一批 DOM 写入加样式布局决定。
 */
function costClock(start = 0): FrameClock & {
  step(ms: number): void;
  spend(ms: number): void;
  requests(): number;
} {
  let frameTime = start;
  let wallTime = start;
  let nextHandle = 1;
  let requests = 0;
  const queued = new Map<number, (time: number) => void>();
  return {
    now: () => wallTime,
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
    spend: (ms) => {
      wallTime += ms;
    },
    step: (ms) => {
      frameTime += ms;
      wallTime += ms;
      const due = [...queued.values()];
      queued.clear();
      for (const callback of due) callback(frameTime);
    },
  };
}

/**
 * 让一次整批 append 花掉给定毫秒。
 *
 * jsdom 的 DOM 写入本身不耗时，这里把「插入成本」注入到 overlay 容器的
 * append 上；overlay 在插入前后读 now()，读到的差值就是这批的成本。
 */
function chargeBatchAppend(clock: { spend(ms: number): void }, ms: number): () => void {
  const proto = dom.window.Element.prototype as unknown as {
    append: (...nodes: (Node | string)[]) => void;
  };
  const original = proto.append;
  proto.append = function (this: Element, ...nodes: (Node | string)[]): void {
    if (this.hasAttribute("data-dsh-jump-overlay")) clock.spend(ms);
    original.apply(this, nodes);
  };
  return () => {
    proto.append = original;
  };
}

/** 每一帧实际插入的徽章数，首帧也算一格。 */
function batchDeltas(clock: { step(ms: number): void }, steps: readonly number[]): number[] {
  const deltas = [badges().length];
  for (const ms of steps) {
    const before = badges().length;
    clock.step(ms);
    deltas.push(badges().length - before);
  }
  return deltas;
}

function progressiveHints(count: number): Hint[] {
  // Distinct positions inside the viewport: a label handed to another target
  // would also change the badge's clamped left/top, so the comparison below can
  // see a drift instead of two badges stacking on the same clamped corner.
  return [...generateLabels(4)].slice(0, count).map((label, index) => ({
    element: document.createElement("button"),
    label,
    rect: { x: (index % 30) * 20, y: Math.floor(index / 30) * 20, w: 10, h: 10 },
  }));
}

describe("progressive badge insertion", () => {
  it("reports when the round is fully inserted", async () => {
    const clock = frameClock();
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT, clock });
    const round = overlay.renderProgressive(progressiveHints(300), "", {
      frameBudgetMs: 100,
      initialBatch: 32,
    });
    let settled = false;
    void round.done.then(() => {
      settled = true;
    });
    await Promise.resolve();
    // 首批之后还有队列，done 不能提前完成。
    expect(settled).toBe(false);
    expect(badges()).toHaveLength(32);

    for (let frame = 0; frame < 20 && badges().length < 300; frame += 1) clock.step(1);
    await round.done;
    expect(settled).toBe(true);
    expect(badges()).toHaveLength(300);
    overlay.destroy();
  });

  it("inserts the first batch in the activation frame and the rest across later frames", () => {
    const clock = frameClock();
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT, clock });

    overlay.renderProgressive(progressiveHints(300), "", { frameBudgetMs: 100, initialBatch: 32 });

    // 激活那一帧只插入首批；后续批次等动画帧。
    expect(badges()).toHaveLength(32);
    clock.step(1);
    expect(badges().length).toBeGreaterThan(32);
    expect(badges().length).toBeLessThan(150);

    for (let frame = 0; frame < 20 && badges().length < 300; frame += 1) clock.step(1);
    expect(badges()).toHaveLength(300);
    overlay.destroy();
  });

  it("keeps every label on the same target as one synchronous render", () => {
    const hints = progressiveHints(300);
    const clock = frameClock();
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT, clock });

    overlay.renderProgressive(hints, "", { frameBudgetMs: 100, initialBatch: 32 });
    for (let frame = 0; frame < 20 && badges().length < 300; frame += 1) clock.step(1);

    const snapshot = (): { label: string | undefined; left: string; top: string; text: string | null }[] =>
      badges()
        .map((badge) => ({
          label: badge.dataset.jumpLabel,
          left: badge.style.left,
          top: badge.style.top,
          text: badge.textContent,
        }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label)));
    const progressive = snapshot();

    overlay.destroy();
    overlay.render(hints);
    expect(snapshot()).toEqual(progressive);
    overlay.destroy();
  });

  it("grows the batch when frames come in far under budget, never past the ceiling", () => {
    // 预算 100ms、每帧只花 1ms：批量该连续放大，但上限 256 不能破。
    const clock = frameClock();
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT, clock });
    overlay.renderProgressive(progressiveHints(2000), "", {
      frameBudgetMs: 100,
      initialBatch: 32,
      minBatch: 8,
      maxBatch: 256,
    });

    const deltas: number[] = [];
    let previous = badges().length;
    for (let frame = 0; frame < 8; frame += 1) {
      clock.step(1);
      const current = badges().length;
      deltas.push(current - previous);
      previous = current;
    }

    expect(deltas[0]).toBeGreaterThan(32);
    expect(Math.max(...deltas)).toBe(256);
    overlay.destroy();
  });

  it("uses the frame budget published by the embedding page when no option is given", () => {
    // 400ms 在默认 16.7ms 预算下必然收缩；只有读到了页面发布的 1000ms 预算，
    // 它才算「远低于预算」并放大批量。
    const host = globalThis as typeof globalThis & { __DSH_JUMP_FRAME_BUDGET_MS__?: number };
    host.__DSH_JUMP_FRAME_BUDGET_MS__ = 1000;
    const clock = frameClock();
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT, clock });
    try {
      overlay.renderProgressive(progressiveHints(2000), "", {
        initialBatch: 128,
        minBatch: 8,
        maxBatch: 256,
      });
      clock.step(400);
      expect(badges()).toHaveLength(128 + 192);
    } finally {
      delete host.__DSH_JUMP_FRAME_BUDGET_MS__;
      overlay.destroy();
    }
  });

  it("shrinks the batch when a frame misses budget, never past the floor", () => {
    // 预算 10ms、每帧花 500ms：批量逐帧减半，8 是下限。
    const clock = frameClock();
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT, clock });
    overlay.renderProgressive(progressiveHints(2000), "", {
      frameBudgetMs: 10,
      initialBatch: 128,
      minBatch: 8,
      maxBatch: 256,
    });

    const deltas: number[] = [];
    let previous = badges().length;
    for (let frame = 0; frame < 6; frame += 1) {
      clock.step(500);
      const current = badges().length;
      deltas.push(current - previous);
      previous = current;
    }

    expect(deltas[0]).toBeLessThan(128);
    expect(Math.min(...deltas)).toBe(8);
    for (let index = 1; index < deltas.length; index += 1) {
      expect(deltas[index]).toBeLessThanOrEqual(deltas[index - 1] as number);
    }
    overlay.destroy();
  });
});

describe("adaptive batch sizing", () => {
  it("grows the batch when the measured insertion cost is far under budget", () => {
    // 帧周期 7ms、批成本 0.5ms：增长必须来自批成本，不能来自 vsync 间隔。
    const clock = costClock();
    const restore = chargeBatchAppend(clock, 0.5);
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT, clock });
    try {
      overlay.renderProgressive(progressiveHints(2000), "", {
        frameBudgetMs: 7,
        initialBatch: 16,
        minBatch: 4,
        maxBatch: 256,
      });
      const deltas = batchDeltas(clock, [7, 7, 7, 7, 7, 7]);

      expect(deltas[0]).toBe(16);
      expect(deltas[1]).toBeGreaterThan(deltas[0] as number);
      for (let index = 2; index < deltas.length; index += 1) {
        expect(deltas[index]).toBeGreaterThan(deltas[index - 1] as number);
      }
    } finally {
      restore();
      overlay.destroy();
    }
  });

  it("shrinks the batch when the measured insertion cost exceeds budget", () => {
    // 帧周期仍是 7ms（没有错过 vsync），但每批插入花 9ms，必须收缩。
    const clock = costClock();
    const restore = chargeBatchAppend(clock, 9);
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT, clock });
    try {
      overlay.renderProgressive(progressiveHints(2000), "", {
        frameBudgetMs: 7,
        initialBatch: 128,
        minBatch: 4,
        maxBatch: 256,
      });
      const deltas = batchDeltas(clock, [7, 7, 7, 7, 7, 7, 7]);

      expect(deltas[0]).toBe(128);
      expect(deltas[1]).toBeLessThan(128);
      for (let index = 2; index < deltas.length; index += 1) {
        expect(deltas[index]).toBeLessThanOrEqual(deltas[index - 1] as number);
      }
      expect(Math.min(...deltas)).toBe(4);
    } finally {
      restore();
      overlay.destroy();
    }
  });

  it("does not let frame jitter interrupt growth while the batch cost stays low", () => {
    // 周期 7±0.5ms 只是测量抖动，不是错过 vsync；批成本稳定 0.5ms。
    const clock = costClock();
    const restore = chargeBatchAppend(clock, 0.5);
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT, clock });
    try {
      overlay.renderProgressive(progressiveHints(4500), "", {
        frameBudgetMs: 7,
        initialBatch: 16,
        minBatch: 4,
        maxBatch: 256,
      });
      const steps = Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? 6.5 : 7.5));
      const deltas = batchDeltas(clock, steps);

      for (let index = 1; index < deltas.length; index += 1) {
        expect(deltas[index]).toBeGreaterThanOrEqual(deltas[index - 1] as number);
      }
      expect(deltas[deltas.length - 1]).toBeGreaterThan(deltas[0] as number);
    } finally {
      restore();
      overlay.destroy();
    }
  });

  it("stays conservative until the display budget has been measured", async () => {
    // 采样还没回来时预算只是 60Hz fallback。143Hz 的 7ms 帧会让增长条件
    // 恒真，所以这里必须从下限的两倍起步，并且只许缩不许涨。
    const restoreHidden = setDocumentHidden(false);
    const clock = costClock();
    const restoreAppend = chargeBatchAppend(clock, 0.5);
    const overlay = createOverlay({
      doc: document,
      viewport: () => VIEWPORT,
      clock,
      frameBudgetSampler: () => new Promise(() => undefined),
    });
    try {
      for (let round = 0; round < 3; round += 1) {
        overlay.renderProgressive(progressiveHints(2000), "", {
          initialBatch: 128,
          minBatch: 8,
          maxBatch: 256,
        });
        expect(badges()).toHaveLength(16);
        const deltas = batchDeltas(clock, [7, 7, 7, 7, 7, 7, 7, 7]);
        expect(Math.max(...deltas)).toBeLessThanOrEqual(16);
      }
    } finally {
      restoreAppend();
      overlay.destroy();
      restoreHidden();
    }
  });
});


/** jsdom 默认按 prerender 报 hidden，测量用例先把它掰成真实前台页面。 */
function setDocumentHidden(value: boolean): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
  return () => {
    if (descriptor === undefined) {
      delete (document as unknown as Record<string, unknown>)["hidden"];
    } else {
      Object.defineProperty(document, "hidden", descriptor);
    }
  };
}

describe("frame budget measurement", () => {
  it("measures the display cadence as the median frame interval", async () => {
    const restore = setDocumentHidden(false);
    const clock = frameClock();
    try {
      const sample = sampleFrameBudget({ doc: document, clock });
      for (let frame = 0; frame < 121; frame += 1) clock.step(7);
      await expect(sample).resolves.toEqual({ budgetMs: 7, measured: true });
    } finally {
      restore();
    }
  });

  it("samples the display once and reuses the budget across later activations", async () => {
    const restore = setDocumentHidden(false);
    const clock = frameClock();
    let runs = 0;
    const overlay = createOverlay({
      doc: document,
      viewport: () => VIEWPORT,
      clock,
      frameBudgetSampler: (deps) => {
        runs += 1;
        return sampleFrameBudget(deps);
      },
    });
    try {
      const hints = progressiveHints(300);
      overlay.renderProgressive(hints);
      for (let frame = 0; frame < 121; frame += 1) clock.step(7);
      await new Promise((resolve) => setTimeout(resolve, 0));

      overlay.renderProgressive(hints);
      overlay.renderProgressive(hints);

      expect(runs).toBe(1);
      // 缓存命中后按 7ms 缩放首批，与 16.7ms 的 32 枚不同。
      expect(badges()).toHaveLength(13);
    } finally {
      overlay.destroy();
      restore();
    }
  });

  it("falls back to the 60Hz budget on a hidden page instead of measuring throttled frames", async () => {
    const restore = setDocumentHidden(true);
    const clock = frameClock();
    const overlay = createOverlay({ doc: document, viewport: () => VIEWPORT, clock });
    try {
      await expect(sampleFrameBudget({ doc: document, clock })).resolves.toEqual({
        budgetMs: 16.7,
        measured: false,
      });
      expect(clock.requests()).toBe(0);

      overlay.renderProgressive(progressiveHints(300));
      // 预算没测完时是保守模式：从下限的两倍（8 × 2）起步，而不是 32。
      expect(badges()).toHaveLength(16);
    } finally {
      overlay.destroy();
      restore();
    }
  });

  it("scales the activation batch with the frame budget", () => {
    const sixty = createOverlay({ doc: document, viewport: () => VIEWPORT, clock: frameClock() });
    sixty.renderProgressive(progressiveHints(300), "", { frameBudgetMs: 16.7 });
    const atSixty = badges().length;
    sixty.destroy();

    const fast = createOverlay({ doc: document, viewport: () => VIEWPORT, clock: frameClock() });
    fast.renderProgressive(progressiveHints(300), "", { frameBudgetMs: 7 });
    const atFast = badges().length;
    fast.destroy();

    expect(atSixty).toBe(32);
    expect(atFast).toBeLessThan(atSixty);
  });

  it("keeps scaled batches inside an absolute floor and ceiling", () => {
    const tinyClock = frameClock();
    const tiny = createOverlay({ doc: document, viewport: () => VIEWPORT, clock: tinyClock });
    tiny.renderProgressive(progressiveHints(2000), "", { frameBudgetMs: 1 });
    const tinyDeltas = [badges().length];
    for (let frame = 0; frame < 3; frame += 1) {
      const before = badges().length;
      tinyClock.step(0.1);
      tinyDeltas.push(badges().length - before);
    }
    tiny.destroy();
    expect(Math.min(...tinyDeltas)).toBe(4);
    expect(Math.max(...tinyDeltas)).toBeLessThanOrEqual(15);

    const hugeClock = frameClock();
    const huge = createOverlay({ doc: document, viewport: () => VIEWPORT, clock: hugeClock });
    huge.renderProgressive(progressiveHints(2000), "", { frameBudgetMs: 100 });
    const firstHuge = badges().length;
    hugeClock.step(0.1);
    const secondHuge = badges().length - firstHuge;
    huge.destroy();
    expect(firstHuge).toBe(192);
    expect(secondHuge).toBe(256);
  });
});
