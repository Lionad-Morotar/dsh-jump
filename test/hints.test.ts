/**
 * collectHints 的契约测试。
 *
 * jsdom 没有布局引擎，getBoundingClientRect 恒返回全零矩形，所以每个测试
 * 都手工给元素装上矩形桩；这正是本函数把 DOM 依赖全部经参数注入的原因：
 * 同一份逻辑在 jsdom 桩与真实浏览器之间可复用。
 */
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it } from "vitest";

import { collectHints } from "../src/client/hints.ts";
import { createLabelMemory } from "../src/client/identity.ts";
import { CANDIDATE_SELECTOR, HOME_ROW_KEYS } from "../src/client/config.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1/" });
const { document } = dom.window;

/** 给元素装视口坐标矩形桩；缺省给一个 10x10、位于 (0,0) 的可见矩形。 */
function place(el: Element, x = 0, y = 0, w = 10, h = 10): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
}

function select(...els: Element[]): () => Element[] {
  return () => els;
}

const VIEWPORT = { width: 800, height: 600 };
const visible = (): boolean => true;

beforeEach(() => {
  document.body.replaceChildren();
});

describe("viewport filter", () => {
  it("keeps elements intersecting the viewport and drops ones outside it", () => {
    const inside = document.createElement("button");
    const outsideRight = document.createElement("button");
    const below = document.createElement("button");
    place(inside, 790, 0);
    place(outsideRight, 900, 0);
    place(below, 0, 650);
    const hints = collectHints(select(inside, outsideRight, below), VIEWPORT, { isVisible: visible });
    expect(hints.map((h) => h.element)).toEqual([inside]);
    expect(hints[0]?.rect).toEqual({ x: 790, y: 0, w: 10, h: 10 });
  });

  it("drops zero-area elements even when they nominally intersect", () => {
    const flat = document.createElement("button");
    place(flat, 0, 0, 10, 0);
    const solid = document.createElement("button");
    place(solid);
    const hints = collectHints(select(flat, solid), VIEWPORT, { isVisible: visible });
    expect(hints.map((h) => h.element)).toEqual([solid]);
  });

  it("drops elements the injected visibility check rejects", () => {
    const ok = document.createElement("button");
    const hidden = document.createElement("button");
    place(ok);
    place(hidden);
    const hints = collectHints(select(ok, hidden), VIEWPORT, { isVisible: (el) => el !== hidden });
    expect(hints.map((h) => h.element)).toEqual([ok]);
  });
});

describe("nesting dedupe", () => {
  it("keeps the deepest candidate when a candidate contains another", () => {
    const outer = document.createElement("button");
    const inner = document.createElement("button");
    outer.append(inner);
    place(outer);
    place(inner, 2, 2, 6, 6);
    document.body.append(outer);
    const hints = collectHints(select(outer, inner), VIEWPORT, { isVisible: visible });
    expect(hints.map((h) => h.element)).toEqual([inner]);
  });

  it("keeps unrelated siblings side by side", () => {
    const a = document.createElement("a");
    const b = document.createElement("button");
    place(a);
    place(b, 40, 0);
    const hints = collectHints(select(a, b), VIEWPORT, { isVisible: visible });
    expect(hints.map((h) => h.element)).toEqual([a, b]);
  });
});

describe("label assignment", () => {
  function buttons(n: number): Element[] {
    return Array.from({ length: n }, (_, i) => {
      const el = document.createElement("button");
      place(el, (i % 80) * 10, Math.floor(i / 80) * 12);
      document.body.append(el);
      return el;
    });
  }

  it("assigns single home-row keys to the first nine hints", () => {
    const els = buttons(9);
    const hints = collectHints(select(...els), VIEWPORT, { isVisible: visible });
    expect(hints.map((h) => h.label)).toEqual([...HOME_ROW_KEYS]);
  });

  it("gives every hint an equal-length two-key label once there are more than nine", () => {
    const els = buttons(11);
    const hints = collectHints(select(...els), VIEWPORT, { isVisible: visible });
    const labels = hints.map((h) => h.label);
    expect(labels.every((label) => label.length === 2)).toBe(true);
    expect(labels[0]).toBe("as");
    expect(labels[1]).toBe("ad");
  });

  it("moves the whole round to three-key labels once the two-key space is exhausted", () => {
    // 一轮内 label 必须等长。混长会让 matchKey 把两键 label 提前判成完成：
    // 输入 "l"、"l" 时 "ll" 已在 labels 里，pending 立即清空，第 82 个候选
    // 永远轮不到。所以越过 81 时整轮改三键，而不是接着往下发三键。
    const els = buttons(81 + 1);
    const hints = collectHints(select(...els), VIEWPORT, { isVisible: visible });
    const labels = hints.map((h) => h.label);
    const lengths = new Set(labels.map((label) => label.length));
    expect(lengths).toEqual(new Set([3]));
    expect(labels[0]).toBe("asa");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps every round's labels the same length, so no label can shadow another", () => {
    // 边界两侧各取一个：81 个候选整轮两键，82 个候选整轮三键。
    for (const size of [9, 10, 81, 82]) {
      const els = buttons(size);
      const labels = collectHints(select(...els), VIEWPORT, { isVisible: visible }).map((h) => h.label);
      expect(new Set(labels.map((label) => label.length)).size).toBe(1);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("produces unique labels", () => {
    const els = buttons(20);
    const labels = collectHints(select(...els), VIEWPORT, { isVisible: visible }).map((h) => h.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("visual order", () => {
  /** 一排等高的候选，x 由调用方给，y 固定。 */
  function row(y: number, xs: number[]): Element[] {
    return xs.map((x) => {
      const el = document.createElement("button");
      place(el, x, y);
      document.body.append(el);
      return el;
    });
  }

  it("labels left to right within a row even when the DOM lists them the other way", () => {
    // 10 个候选把整轮推到两键：首键 as，次键 ad。
    const right = document.createElement("button");
    place(right, 200, 0);
    const left = document.createElement("button");
    place(left, 10, 0);
    const below = row(100, [0, 10, 20, 30, 40, 50, 60, 70]);
    document.body.append(right, left);

    const hints = collectHints(select(right, left, ...below), VIEWPORT, { isVisible: visible });
    const labelOf = (el: Element): string | undefined => hints.find((h) => h.element === el)?.label;
    expect(labelOf(left)).toBe("as");
    expect(labelOf(right)).toBe("ad");
  });

  it("clusters vertically overlapping candidates into one row and orders rows top down", () => {
    // 第二行的候选 y 只差 4px，与第一行不重叠：两行各自按 x 升序。
    const top = row(0, [100, 0]);
    const bottom = row(14, [50, 5]);
    const hints = collectHints(select(...bottom, ...top), VIEWPORT, { isVisible: visible });
    expect(hints.map((h) => h.element)).toEqual([top[1], top[0], bottom[1], bottom[0]]);
  });
});

describe("label memory across rounds", () => {
  /** 一排带身份键的候选，视觉序与 DOM 序一致。 */
  function keyed(n: number): Element[] {
    return Array.from({ length: n }, (_, i) => {
      const el = document.createElement("button");
      el.setAttribute("data-row-key", "k" + String(i));
      place(el, 10 + i * 10, 0);
      document.body.append(el);
      return el;
    });
  }

  function labelOf(hints: { element: Element; label: string }[], el: Element): string | undefined {
    return hints.find((h) => h.element === el)?.label;
  }

  it("returns the remembered label even when a new candidate lands ahead of it", () => {
    const memory = createLabelMemory();
    const els = keyed(10);
    const first = collectHints(select(...els), VIEWPORT, { isVisible: visible, memory });
    expect(labelOf(first, els[4] as Element)).toBe("ah");

    const intruder = document.createElement("button");
    place(intruder, 5, 0);
    document.body.append(intruder);

    // 没有记忆时第 5 个候选会被挤到第 6 位，拿 aj。
    const fresh = collectHints(select(intruder, ...els), VIEWPORT, { isVisible: visible });
    expect(labelOf(fresh, els[4] as Element)).toBe("aj");

    const second = collectHints(select(intruder, ...els), VIEWPORT, { isVisible: visible, memory });
    expect(labelOf(second, els[4] as Element)).toBe("ah");
    // 记忆把 as 到 sa 全占了，新候选只能吃流里剩下的第一个洞。
    expect(labelOf(second, intruder)).toBe("sd");
  });

  it("refuses a two-key memory when this round is single-key", () => {
    const memory = createLabelMemory();
    const els = keyed(10);
    const first = collectHints(select(...els), VIEWPORT, { isVisible: visible, memory });
    expect(labelOf(first, els[4] as Element)).toBe("ah");

    // 去掉最左一个，本轮只剩 9 个候选，整轮单键。
    (els[0] as Element).remove();
    const second = collectHints(select(...els.slice(1)), VIEWPORT, { isVisible: visible, memory });
    expect(second.map((h) => h.label)).toEqual(["a", "s", "d", "f", "g", "h", "j", "k", "l"]);
    expect(labelOf(second, els[4] as Element)).toBe("f");
  });

  it("abandons both memories when two candidates share one identity", () => {
    const memory = createLabelMemory();
    const els = keyed(10);
    // 第 3 与第 7 个候选撞键：整组放弃记忆，谁也不许猜。
    (els[2] as Element).setAttribute("data-row-key", "dup");
    (els[6] as Element).setAttribute("data-row-key", "dup");
    const first = collectHints(select(...els), VIEWPORT, { isVisible: visible, memory });
    expect(labelOf(first, els[2] as Element)).toBe("af");
    expect(labelOf(first, els[6] as Element)).toBe("ak");

    const intruder = document.createElement("button");
    place(intruder, 5, 0);
    document.body.append(intruder);
    const second = collectHints(select(intruder, ...els), VIEWPORT, { isVisible: visible, memory });

    // 唯一身份都回收了，剩下的洞按流序发给新候选与那对撞键候选。
    expect(labelOf(second, intruder)).toBe("af");
    expect(labelOf(second, els[2] as Element)).toBe("ak");
    expect(labelOf(second, els[6] as Element)).toBe("sd");
  });

  it("keeps keyless elements out of the memory", () => {
    const memory = createLabelMemory();
    const els = Array.from({ length: 10 }, (_, i) => {
      const el = document.createElement("button");
      place(el, 10 + i * 10, 0);
      document.body.append(el);
      return el;
    });
    collectHints(select(...els), VIEWPORT, { isVisible: visible, memory });
    expect(memory.size).toBe(0);
  });
});

describe("text entry hosts in a real composer shape", () => {
  it("labels the composer host, not the Lexical chip inside it", () => {
    // 真实 composer：可编辑宿主里嵌 contenteditable=false 的 chip。
    // 宿主与 chip 是同一条祖先链上的一对候选，最深优先会选 chip——除非
    // 选择器把 contenteditable=false 排除掉。
    const host = document.createElement("div");
    host.setAttribute("contenteditable", "true");
    host.setAttribute("role", "textbox");
    host.setAttribute("data-composer-input", "true");
    place(host, 100, 500, 600, 36);
    const chip = document.createElement("span");
    chip.setAttribute("contenteditable", "false");
    place(chip, 110, 506, 60, 20);
    host.append(chip);
    document.body.append(host);

    const hints = collectHints(
      () => Array.from(document.querySelectorAll(CANDIDATE_SELECTOR)),
      VIEWPORT,
      { isVisible: visible },
    );
    expect(hints.map((h) => h.element)).toEqual([host]);
  });

  it("finds the composer when the whole document is queried, as the runtime does", () => {
    // 回归钉子：composer 曾因选择器只认 HTML 控件而整轮不可达。
    const composer = document.createElement("div");
    composer.setAttribute("contenteditable", "true");
    composer.setAttribute("role", "textbox");
    place(composer, 100, 500, 600, 36);
    document.body.append(composer);
    const button = document.createElement("button");
    place(button, 10, 10);
    document.body.append(button);

    const hints = collectHints(
      () => Array.from(document.querySelectorAll(CANDIDATE_SELECTOR)),
      VIEWPORT,
      { isVisible: visible },
    );
    // 标签顺序按视觉序：按钮在 y=10，composer 在 y=500，所以按钮先拿首键。
    expect(hints.map((h) => h.element)).toEqual([button, composer]);
  });
});

