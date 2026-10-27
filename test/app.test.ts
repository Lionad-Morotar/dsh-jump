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

    win.dispatchEvent(keydown({ key: "a" }));
    let root = overlayRoot();
    const dim = (label: string): string | undefined => {
      const kids = [...(root?.children ?? [])] as HTMLElement[];
      return kids.find((b) => b.dataset.jumpLabel === label)?.style.opacity;
    };
    expect(dim("ad")).toBe("1");
    expect(dim("sd")).toBe("0.3");

    // "x" is off the home row, so it can never extend "a" to a label.
    win.dispatchEvent(keydown({ key: "x" }));
    root = overlayRoot();
    expect(root).not.toBeNull();
    expect(dim("ad")).toBe("1");
    expect(dim("sd")).toBe("1");

    win.dispatchEvent(keydown({ key: "Escape" }));
    teardown();
  });
});

describe("focus mode (Cmd+U)", () => {
  it("Cmd+U then full label focuses the target and tears down overlay", () => {
    const input = doc.createElement("input");
    place(input, 5, 5);
    doc.body.append(input);
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

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
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

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
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

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
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

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
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

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

    const teardown = createApp({ window: win, isVisible: () => true }).apply();

    win.dispatchEvent(keydown({ key: "u", metaKey: true }));
    // 第一个 label 指向 fake（DOM 顺序在前）。
    win.dispatchEvent(keydown({ key: "a" }));

    expect(doc.activeElement).toBe(other);
    const selection = doc.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    expect(range !== null && fake.contains(range.commonAncestorContainer)).toBe(false);
    teardown();
  });
});

describe("configurable activation chords", () => {
  const custom = {
    click: { key: "k", meta: true, alt: true, ctrl: false, shift: false },
    focus: { key: "j", meta: false, alt: false, ctrl: true, shift: true },
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
    });

    win.dispatchEvent(keydown({ key: "k", metaKey: true, altKey: true }));
    expect(overlayRoot()).toBeNull();
    win.dispatchEvent(keydown({ key: "p", metaKey: true }));
    expect(overlayRoot()).not.toBeNull();
    teardown();
  });
});

