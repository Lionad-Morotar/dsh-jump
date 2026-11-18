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
import { beforeEach, describe, expect, it } from "vitest";

import type { Hint } from "../src/client/hints.ts";
import { createOverlay } from "../src/client/overlay.ts";

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
