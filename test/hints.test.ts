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
import { HOME_ROW_KEYS } from "../src/client/config.ts";

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

  it("extends to three-key labels after the two-key space is exhausted", () => {
    const els = buttons(81 + 1);
    const hints = collectHints(select(...els), VIEWPORT, { isVisible: visible });
    const labels = hints.map((h) => h.label);
    expect(labels[81 - 1]).toBe("ll");
    expect(labels[81]).toBe("asa");
  });

  it("produces unique labels", () => {
    const els = buttons(20);
    const labels = collectHints(select(...els), VIEWPORT, { isVisible: visible }).map((h) => h.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
