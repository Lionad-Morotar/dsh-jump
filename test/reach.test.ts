/**
 * isUserReachable 的契约测试：aria-hidden / inert / pointer-events:none 三种
 * 「用户看得见的候选集里其实点不到」的标记，沿祖先链（含自身）任一命中即阻断。
 *
 * jsdom 的 getComputedStyle 只可靠反映内联样式，所以 pointer-events 用内联
 * 样式构造；判定沿祖先链逐层查 computed style，不依赖继承被解析。
 */
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it } from "vitest";

import { isUserReachable } from "../src/client/reach.ts";
import { collectHints } from "../src/client/hints.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1/" });
const { document } = dom.window;

beforeEach(() => {
  document.body.replaceChildren();
});

describe("isUserReachable", () => {
  /** 把按钮嵌进给定的祖先容器（挂到 body），返回按钮。 */
  function buttonIn(container: Element): Element {
    const button = document.createElement("button");
    container.append(button);
    document.body.append(container);
    return button;
  }

  it("drops a button inside an aria-hidden ancestor, the stacked background card", () => {
    const card = document.createElement("aside");
    card.setAttribute("aria-hidden", "true");
    expect(isUserReachable(buttonIn(card))).toBe(false);
  });

  it("drops a button inside an inert ancestor", () => {
    const card = document.createElement("aside");
    card.setAttribute("inert", "");
    expect(isUserReachable(buttonIn(card))).toBe(false);
  });

  it("drops a button inside a pointer-events:none ancestor", () => {
    const card = document.createElement("aside");
    card.setAttribute("style", "pointer-events: none");
    expect(isUserReachable(buttonIn(card))).toBe(false);
  });

  it("keeps a plain button without any blocking marker", () => {
    expect(isUserReachable(buttonIn(document.createElement("aside")))).toBe(true);
  });

  it("treats an empty aria-hidden value as blocking, same as true", () => {
    const card = document.createElement("aside");
    card.setAttribute("aria-hidden", "");
    expect(isUserReachable(buttonIn(card))).toBe(false);
  });

  it("does not treat aria-hidden=false as blocking", () => {
    const card = document.createElement("aside");
    card.setAttribute("aria-hidden", "false");
    expect(isUserReachable(buttonIn(card))).toBe(true);
  });

  it("drops an element that carries the marker on itself, not only on an ancestor", () => {
    const button = document.createElement("button");
    button.setAttribute("inert", "");
    document.body.append(button);
    expect(isUserReachable(button)).toBe(false);
  });

  it("blocks on a marker several levels up, not only on the direct parent", () => {
    const card = document.createElement("aside");
    card.setAttribute("aria-hidden", "true");
    const section = document.createElement("section");
    const row = document.createElement("div");
    const button = document.createElement("button");
    row.append(button);
    section.append(row);
    card.append(section);
    document.body.append(card);
    expect(isUserReachable(button)).toBe(false);
  });
});

describe("stacked cards through collectHints", () => {
  /** 给元素装视口坐标矩形桩；缺省 10x10、位于 (0,0)。 */
  function place(el: Element, x = 0, y = 0, w = 10, h = 10): void {
    (el as HTMLElement).getBoundingClientRect = () =>
      ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
  }

  it("keeps the foreground button and drops the background card's button", () => {
    // 宿主叠放通知栈：前景卡正常，后台卡 aria-hidden + pointer-events:none + 按钮 tabIndex=-1。
    const foreground = document.createElement("aside");
    const fgButton = document.createElement("button");
    foreground.append(fgButton);

    const background = document.createElement("aside");
    background.setAttribute("aria-hidden", "true");
    background.setAttribute("style", "pointer-events: none");
    const bgButton = document.createElement("button");
    bgButton.setAttribute("tabindex", "-1");
    background.append(bgButton);

    document.body.append(foreground, background);
    place(fgButton, 10, 10);
    place(bgButton, 30, 30);

    const hints = collectHints(
      () => [fgButton, bgButton],
      { width: 800, height: 600 },
      { isVisible: isUserReachable },
    );
    expect(hints.map((h) => h.element)).toEqual([fgButton]);
  });
});
