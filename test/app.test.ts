/**
 * createApp 的客户端接线契约：监听器生命周期、激活/退出对 overlay 的驱动、
 * label 命中触发真实事件序列、IME 组合与 teardown 的零残留。
 *
 * jsdom 没有布局引擎，矩形与可见性全部装桩；事件一律用 jsdom realm 的
 * KeyboardEvent 真实例派发，断言落在 DOM 副作用与 defaultPrevented 上。
 */
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp, type JumpWindow } from "../src/client/app.ts";

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

function activate(): void {
  win.dispatchEvent(keydown({ key: "h", metaKey: true }));
}

beforeEach(() => {
  doc.body.replaceChildren();
});

describe("createApp wiring", () => {
  it("Cmd+H activates on capture: badges appear, stroke is eaten before bubble listeners", () => {
    const els = buttons(3);
    const leaked = vi.fn();
    win.addEventListener("keydown", leaked);
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

    doc.body.dispatchEvent(keydown({ key: "h", metaKey: true }));
    expect(leaked).not.toHaveBeenCalled();

    const root = overlayRoot();
    expect(root).not.toBeNull();
    const labels = [...(root?.children ?? [])].map((b) => (b as HTMLElement).dataset.jumpLabel);
    expect(labels).toEqual(["a", "s", "d"]);
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

    win.dispatchEvent(keydown({ key: "a" }));
    const root = overlayRoot();
    const opacity = (label: string): string | undefined => {
      const badge = [...(root?.children ?? [])].find(
        (b) => (b as HTMLElement).dataset.jumpLabel === label,
      );
      return (badge as HTMLElement | undefined)?.style.opacity;
    };
    expect(opacity("ad")).toBe("1");
    expect(opacity("sd")).toBe("0.3");

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
    const added = addSpy.mock.calls.filter((c) => c[0] === "keydown").length;
    expect(added).toBe(1);
    addSpy.mockRestore();

    const removeSpy = vi.spyOn(win, "removeEventListener");
    teardown();
    const removed = removeSpy.mock.calls.filter((c) => c[0] === "keydown").length;
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
