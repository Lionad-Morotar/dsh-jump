/**
 * createApp 的客户端接线契约：监听器生命周期、激活/退出对 overlay 的驱动、
 * label 命中触发真实事件序列、IME 组合与 teardown 的零残留。
 *
 * jsdom 没有布局引擎，矩形与可见性全部装桩；事件一律用 jsdom realm 的
 * KeyboardEvent 真实例派发，断言落在 DOM 副作用与 defaultPrevented 上。
 */
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp, type JumpWindow } from "../src/client/app.ts";
import { generateLabels } from "../src/client/hints.ts";
import type { FrameClock } from "../src/client/overlay.ts";
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

function activate(): void {
  win.dispatchEvent(keydown({ key: "h", metaKey: true }));
}

beforeEach(() => {
  doc.body.replaceChildren();
  // 浮层挂在 documentElement 上，body 清空带不走它；上一轮漏下的容器会让
  // overlayRoot() 找到错误的节点。
  doc.querySelector("[data-dsh-jump-overlay]")?.remove();
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

describe("badge segments in a multi-key round", () => {
  // 断言先失败时也要摘掉监听器，否则漏掉的 app 会接管后续用例的按键。
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  function mount(): void {
    stop = createApp({ window: win, isVisible: () => true }).apply();
  }

  /** 当前轮里某个 label 的徽章。 */
  function badge(label: string): HTMLElement {
    const root = overlayRoot();
    const found = [...(root?.children ?? [])].find(
      (child) => (child as HTMLElement).dataset.jumpLabel === label,
    );
    expect(found).toBeDefined();
    return found as HTMLElement;
  }

  /** 徽章分出的文字段，按 [段名, 文本] 列出。 */
  function parts(label: string): [string | undefined, string | null][] {
    return [...badge(label).children].map((part) => [
      (part as HTMLElement).dataset.jumpPart,
      part.textContent,
    ]);
  }

  it("paints a badge as one whole-label segment while no prefix is typed", () => {
    buttons(12);
    mount();
    activate();

    expect(parts("ad")).toEqual([["whole", "ad"]]);
  });

  it("splits a still-matching badge into the typed letters and the rest", () => {
    buttons(12);
    mount();
    activate();

    win.dispatchEvent(keydown({ key: "a" }));

    expect(parts("ad")).toEqual([
      ["typed", "a"],
      ["rest", "d"],
    ]);
    const [typed, rest] = [...badge("ad").children] as HTMLElement[];
    expect(typed?.style.fontWeight).not.toBe("");
    expect(typed?.style.fontWeight).not.toBe(rest?.style.fontWeight);
    // 连前缀都对不上的徽章仍是一整段完整标签，只是变暗。
    expect(parts("sd")).toEqual([["whole", "sd"]]);
    expect(badge("sd").style.opacity).toBe("0.3");
  });

  it("returns every badge to one whole segment after a dead-end key", () => {
    buttons(12);
    mount();
    activate();

    win.dispatchEvent(keydown({ key: "a" }));
    expect(parts("ad")).toEqual([
      ["typed", "a"],
      ["rest", "d"],
    ]);

    // "x" 不在主行，接不上任何 label，前缀被清空。
    win.dispatchEvent(keydown({ key: "x" }));

    expect(parts("ad")).toEqual([["whole", "ad"]]);
    expect(parts("sd")).toEqual([["whole", "sd"]]);
    expect(badge("sd").style.opacity).toBe("1");
  });
});

describe("a completing stroke tears the round down without repainting it", () => {
  // 断言先失败时也要摘掉监听器，否则漏掉的 app 会接管后续用例的按键。
  let stop: (() => void) | undefined;
  let watcher: MutationObserver | undefined;
  afterEach(() => {
    watcher?.disconnect();
    watcher = undefined;
    stop?.();
    stop = undefined;
  });

  function mount(): void {
    stop = createApp({ window: win, isVisible: () => true }).apply();
  }

  /** 当前轮里某个 label 的徽章。 */
  function badge(label: string): HTMLElement {
    const root = overlayRoot();
    const found = [...(root?.children ?? [])].find(
      (child) => (child as HTMLElement).dataset.jumpLabel === label,
    );
    expect(found).toBeDefined();
    return found as HTMLElement;
  }

  /** 徽章分出的文字段，按 [段名, 文本] 列出。 */
  function parts(label: string): [string | undefined, string | null][] {
    return [...badge(label).children].map((part) => [
      (part as HTMLElement).dataset.jumpPart,
      part.textContent,
    ]);
  }

  /**
   * 观察浮层容器子树的 DOM 变更。
   *
   * 命中完成的那一击里，徽章马上要随容器一起消失，任何 opacity 或
   * replaceChildren 都是白画。MutationObserver 记下的正是这批白画的写操作，
   * 因此「这一击有没有整轮重绘」是可观察工作量，不靠 overlay 的内部状态。
   */
  function watchBadges(): () => MutationRecord[] {
    const root = overlayRoot();
    if (root === null) throw new Error("浮层不存在，无法观察");
    const observer = new dom.window.MutationObserver(() => undefined);
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    watcher = observer;
    return () => observer.takeRecords();
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
    win.dispatchEvent(keydown({ key: "a" }));
    expect(parts("ad")).toEqual([
      ["typed", "a"],
      ["rest", "d"],
    ]);
    expect(badge("sd").style.opacity).toBe("0.3");

    const target = els[1] as HTMLElement;
    const seen = hitSequence(target);
    const drain = watchBadges();

    win.dispatchEvent(keydown({ key: "d" }));

    expect(drain()).toEqual([]);
    expect(seen).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
    expect(overlayRoot()).toBeNull();
  });

  it("single-key label: the hit stroke clicks and closes with no badge write", () => {
    const els = buttons(2);
    mount();
    activate();

    const target = els[0] as HTMLElement;
    const seen = hitSequence(target);
    const drain = watchBadges();

    win.dispatchEvent(keydown({ key: "a" }));

    expect(drain()).toEqual([]);
    expect(seen).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
    expect(overlayRoot()).toBeNull();
  });

  it("three-key label: every prefix stroke repaints the split, the completing stroke only closes", () => {
    // 82 个候选超过双键容量（81），整轮升到三键；前两个按钮的标签是 asa、asd。
    const els = buttons(82);
    mount();
    activate();

    win.dispatchEvent(keydown({ key: "a" }));
    expect(parts("asd")).toEqual([
      ["typed", "a"],
      ["rest", "sd"],
    ]);

    win.dispatchEvent(keydown({ key: "s" }));
    expect(parts("asd")).toEqual([
      ["typed", "as"],
      ["rest", "d"],
    ]);

    const target = els[1] as HTMLElement;
    const seen = hitSequence(target);
    const drain = watchBadges();

    win.dispatchEvent(keydown({ key: "d" }));

    expect(drain()).toEqual([]);
    expect(seen).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
    expect(overlayRoot()).toBeNull();
  });
});

/**
 * 前缀增长时，视觉上没变化的徽章必须整枚跳过。
 *
 * 首键 "a" 之后已经变暗的徽章，到 "as" 仍然不匹配：opacity 还是 0.3，
 * 文字还是单段整标签。它们不该收到 opacity 写入，也不该重建子节点。
 * 断言落在 MutationObserver 记录上，因为修复前后最终视觉完全相同。
 */
describe("a growing prefix only repaints badges whose look changes", () => {
  let stop: (() => void) | undefined;
  let watcher: MutationObserver | undefined;
  afterEach(() => {
    watcher?.disconnect();
    watcher = undefined;
    stop?.();
    stop = undefined;
  });

  function mount(): void {
    stop = createApp({ window: win, isVisible: () => true }).apply();
  }

  function allBadges(): HTMLElement[] {
    return [...(overlayRoot()?.children ?? [])] as HTMLElement[];
  }

  function badge(label: string): HTMLElement {
    const found = allBadges().find((child) => child.dataset.jumpLabel === label);
    expect(found).toBeDefined();
    return found as HTMLElement;
  }

  function parts(label: string): [string | undefined, string | null][] {
    return [...badge(label).children].map((part) => [
      (part as HTMLElement).dataset.jumpPart,
      part.textContent,
    ]);
  }

  function labelsByOpacity(opacity: string): string[] {
    return allBadges()
      .filter((child) => child.style.opacity === opacity)
      .map((child) => child.dataset.jumpLabel ?? "");
  }

  function watch(): () => MutationRecord[] {
    const root = overlayRoot();
    if (root === null) throw new Error("浮层不存在，无法观察");
    const observer = new dom.window.MutationObserver(() => undefined);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
    watcher = observer;
    return () => observer.takeRecords();
  }

  /** 一条记录算在哪枚徽章上；徽章内部 span 的写入也算它的。 */
  function owner(record: MutationRecord): string | undefined {
    const holder = (record.target as Element).closest?.("[data-jump-label]");
    return (holder as HTMLElement | null | undefined)?.dataset.jumpLabel;
  }

  it("leaves the badges that were already dim untouched on the second stroke", () => {
    // 90 个候选超过双键容量（81），整轮升到三键；两击之后 "as" 仍是活前缀。
    // 首键 "a" 留下 81 枚点亮，9 枚以 s 开头的标签在这一击就变暗。
    buttons(90);
    mount();
    activate();
    win.dispatchEvent(keydown({ key: "a" }));

    const lit = labelsByOpacity("1");
    const dim = labelsByOpacity("0.3");
    expect(lit).toHaveLength(81);
    expect(dim).toHaveLength(9);
    expect(dim).toContain("saa");

    const drain = watch();
    win.dispatchEvent(keydown({ key: "s" }));
    const records = drain();

    // 已经变暗的那批继续不匹配，整批零写入。
    const dimWrites = records.filter((record) => dim.includes(owner(record) ?? ""));
    expect(dimWrites).toHaveLength(0);
    // 第二击改动的正好是首键仍点亮的那批：as 组重分段，其余在这一击被排除。
    const touched = [...new Set(records.map(owner).filter((label): label is string => label !== undefined))];
    expect(touched.sort()).toEqual([...lit].sort());
    expect(parts("asd")).toEqual([
      ["typed", "as"],
      ["rest", "d"],
    ]);
  });

  it("dims a badge the moment the growing prefix rules it out", () => {
    buttons(90);
    mount();
    activate();

    win.dispatchEvent(keydown({ key: "a" }));
    expect(badge("ada").style.opacity).toBe("1");
    expect(parts("ada")).toEqual([
      ["typed", "a"],
      ["rest", "da"],
    ]);

    win.dispatchEvent(keydown({ key: "s" }));

    expect(badge("ada").style.opacity).toBe("0.3");
    expect(parts("ada")).toEqual([["whole", "ada"]]);
  });

  it("relights every badge when a dead key clears the prefix", () => {
    buttons(90);
    mount();
    activate();

    // 两击之后只剩 as 组点亮；s 组那 9 枚从首击起就没亮过，第二击也被跳过。
    win.dispatchEvent(keydown({ key: "a" }));
    win.dispatchEvent(keydown({ key: "s" }));
    expect(labelsByOpacity("1")).toHaveLength(9);
    expect(badge("saa").style.opacity).toBe("0.3");

    // "x" 不在主行，接不上任何 label，前缀被清空。
    win.dispatchEvent(keydown({ key: "x" }));

    expect(labelsByOpacity("1")).toHaveLength(90);
    for (const child of allBadges()) {
      expect(child.style.opacity).toBe("1");
      expect([...child.children]).toHaveLength(1);
      expect((child.children[0] as HTMLElement).dataset.jumpPart).toBe("whole");
      expect(child.textContent).toBe(child.dataset.jumpLabel);
    }
  });
});

/**
 * 首击变暗的整批徽章文字没有变化，不许重建子节点。
 *
 * 600 档首击有 519 枚徽章从 whole 转成 whole，唯一变化是 opacity；旧实现每枚
 * 都 replaceChildren 一次，产出与原来完全相同的 span。最终视觉在两种实现下
 * 一样，所以只能观察 MutationObserver 的 childList 记录。
 */
describe("the first stroke only dims the badges it rules out", () => {
  let stop: (() => void) | undefined;
  let watcher: MutationObserver | undefined;
  afterEach(() => {
    watcher?.disconnect();
    watcher = undefined;
    stop?.();
    stop = undefined;
  });

  function mount(): void {
    stop = createApp({ window: win, isVisible: () => true }).apply();
  }

  function allBadges(): HTMLElement[] {
    return [...(overlayRoot()?.children ?? [])] as HTMLElement[];
  }

  function labelsByOpacity(opacity: string): string[] {
    return allBadges()
      .filter((child) => child.style.opacity === opacity)
      .map((child) => child.dataset.jumpLabel ?? "");
  }

  /** 只记 childList：样式写入是允许的，重建子节点才是不该有的工作量。 */
  function watchChildList(): () => MutationRecord[] {
    const root = overlayRoot();
    if (root === null) throw new Error("浮层不存在，无法观察");
    const observer = new dom.window.MutationObserver(() => undefined);
    observer.observe(root, { subtree: true, childList: true });
    watcher = observer;
    return () => observer.takeRecords().filter((record) => record.type === "childList");
  }

  /** 一条记录算在哪枚徽章上；徽章内部 span 的写入也算它的。 */
  function owner(record: MutationRecord): string | undefined {
    const holder = (record.target as Element).closest?.("[data-jump-label]");
    return (holder as HTMLElement | null | undefined)?.dataset.jumpLabel;
  }

  it("dims the ruled-out badges without touching their child nodes", () => {
    // 90 个候选整轮升到三键；首键 a 留下 81 枚点亮，9 枚以 s 开头的在这一击变暗。
    buttons(90);
    mount();
    activate();
    const drain = watchChildList();

    win.dispatchEvent(keydown({ key: "a" }));
    const records = drain();

    const dim = labelsByOpacity("0.3");
    const lit = labelsByOpacity("1");
    expect(dim).toHaveLength(9);
    expect(lit).toHaveLength(81);
    // 变暗的这批文字还是整段，重建只会换掉同样的 span。
    const dimChildList = records.filter((record) => dim.includes(owner(record) ?? ""));
    expect(dimChildList).toHaveLength(0);
    // 点亮的那批要拆成 typed/rest，必须有重建记录，否则观察器本身失效了。
    const litChildList = records.filter((record) => lit.includes(owner(record) ?? ""));
    expect(litChildList.length).toBeGreaterThan(0);
    expect((allBadges()[0]?.children[0] as HTMLElement).dataset.jumpPart).toBe("typed");
  });

  it("relights the dead-key batch without rebuilding their whole-label run", () => {
    // 两击之后只剩 as 组 9 枚点亮，其余 81 枚都是整段文字加 0.3。
    buttons(90);
    mount();
    activate();
    win.dispatchEvent(keydown({ key: "a" }));
    win.dispatchEvent(keydown({ key: "s" }));
    expect(labelsByOpacity("1")).toHaveLength(9);

    const dim = labelsByOpacity("0.3");
    expect(dim).toHaveLength(81);
    const drain = watchChildList();

    // x 不在主行，接不上任何 label，前缀被清空，整轮回亮。
    win.dispatchEvent(keydown({ key: "x" }));
    const records = drain();

    expect(labelsByOpacity("1")).toHaveLength(90);
    const dimChildList = records.filter((record) => dim.includes(owner(record) ?? ""));
    expect(dimChildList).toHaveLength(0);
    for (const child of allBadges()) {
      expect(child.style.opacity).toBe("1");
      expect(textOf(child)).toBe(child.dataset.jumpLabel);
    }
  });
});

/** 徽章当前显示的文字，按子节点顺序拼起来。 */
function textOf(badge: HTMLElement): string {
  return [...badge.children].map((child) => child.textContent ?? "").join("");
}

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
  /** 当前轮徽章上的 label，按绘制顺序（即视觉序）。 */
  function badgeLabels(): (string | undefined)[] {
    return [...(overlayRoot()?.children ?? [])].map((b) => (b as HTMLElement).dataset.jumpLabel);
  }

  it("Cmd+H twice then the same label hits the same element after a new button lands ahead of it", () => {
    const els = buttons(3);
    els.forEach((el, i) => el.setAttribute("data-row-key", "row-" + String(i)));
    const teardown = createApp({ window: win, isVisible: () => true }).apply();

    activate();
    expect(badgeLabels()).toEqual(["a", "s", "d"]);
    win.dispatchEvent(keydown({ key: "d" }));

    // 新按钮插在 DOM 与视觉序里都排在第三个按钮之前，无记忆时它会把 d 顶走。
    const intruder = doc.createElement("button");
    place(intruder, 55, 10);
    doc.body.insertBefore(intruder, els[2] as HTMLElement);

    const hits: string[] = [];
    els[2]?.addEventListener("click", () => hits.push("target"));
    intruder.addEventListener("click", () => hits.push("intruder"));

    activate();
    expect(badgeLabels()).toEqual(["a", "s", "f", "d"]);
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

    const teardown = createApp({ window: win }).apply();
    activate();

    const root = overlayRoot();
    expect(root).not.toBeNull();
    const labels = [...(root?.children ?? [])].map((b) => (b as HTMLElement).dataset.jumpLabel);
    expect(labels).toEqual(["a"]);

    // 唯一的标签属于前景按钮：敲它命中的就是前景按钮本身。
    const hits: string[] = [];
    fgButton.addEventListener("click", () => hits.push("foreground"));
    bgButton.addEventListener("click", () => hits.push("background"));
    win.dispatchEvent(keydown({ key: "a" }));
    expect(hits).toEqual(["foreground"]);

    teardown();
  });
});

/** 手动推进的帧时钟：让分批在测试里只按步进发生。 */
function frameClock(start = 0): FrameClock & { step(ms: number): void } {
  let time = start;
  let nextHandle = 1;
  const queued = new Map<number, (time: number) => void>();
  return {
    now: () => time,
    request: (callback) => {
      const handle = nextHandle++;
      queued.set(handle, callback);
      return handle;
    },
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

function badgeCount(): number {
  return doc.querySelectorAll("[data-jump-label]").length;
}

describe("progressive activation", () => {
  it("settles only after every badge of the current round is in the DOM", async () => {
    gridButtons(300);
    const clock = frameClock();
    const app = createApp({
      window: win,
      isVisible: () => true,
      frameClock: clock,
      frameBudgetMs: 16.7,
    });
    const teardown = app.apply();

    activate();
    expect(badgeCount()).toBe(32);
    let settled = false;
    void app.settled().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    for (let frame = 0; frame < 20 && badgeCount() < 300; frame += 1) clock.step(1);
    await app.settled();
    expect(settled).toBe(true);
    expect(badgeCount()).toBe(300);
    teardown();
  });

  it("accepts a label whose badge has not been inserted yet", () => {
    // 300 个候选升到三键，首批 32 枚之后还有大量标签没画出来。
    const els = gridButtons(300);
    const clock = frameClock();
    const teardown = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 }).apply();

    activate();
    expect(badgeCount()).toBe(32);
    clock.step(1);
    const afterFirstFrame = badgeCount();
    expect(afterFirstFrame).toBeGreaterThan(32);
    expect(afterFirstFrame).toBeLessThan(300);

    const label = [...generateLabels(3)][299] as string;
    const target = els[299] as HTMLElement;
    const hits: string[] = [];
    target.addEventListener("click", () => hits.push("click"));

    // 前缀击键只重绘已插入的徽章，不能把剩下两百多枚同步补上。
    win.dispatchEvent(keydown({ key: label[0] }));
    expect(badgeCount()).toBe(afterFirstFrame);
    win.dispatchEvent(keydown({ key: label[1] }));
    expect(badgeCount()).toBe(afterFirstFrame);
    win.dispatchEvent(keydown({ key: label[2] }));

    expect(hits).toEqual(["click"]);
    expect(overlayRoot()).toBeNull();
    // 命中已结束这一轮，队列里剩下的批次不能再把徽章插回来。
    clock.step(1);
    expect(badgeCount()).toBe(0);
    teardown();
  });

  it("Esc cancels the pending batches and leaves no badge behind", () => {
    gridButtons(300);
    const clock = frameClock();
    const teardown = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 }).apply();

    activate();
    clock.step(1);
    expect(badgeCount()).toBeGreaterThan(32);
    expect(badgeCount()).toBeLessThan(300);

    win.dispatchEvent(keydown({ key: "Escape" }));
    expect(overlayRoot()).toBeNull();
    for (let frame = 0; frame < 5; frame += 1) clock.step(1);
    expect(badgeCount()).toBe(0);
    expect(overlayRoot()).toBeNull();
    teardown();
  });

  it("starts a fresh round from the initial batch after a cancelled one", () => {
    gridButtons(300);
    const clock = frameClock();
    const teardown = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 }).apply();

    activate();
    clock.step(1);
    expect(badgeCount()).toBeGreaterThan(32);
    win.dispatchEvent(keydown({ key: "Escape" }));

    activate();
    // 新轮从首批重新开始，不夹带上一轮已经画出的残余。
    expect(badgeCount()).toBe(32);
    teardown();
  });
});

describe("progressive cancellation surfaces", () => {
  it("visibilitychange cancels the pending batches", () => {
    gridButtons(300);
    const clock = frameClock();
    const teardown = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 }).apply();
    activate();
    clock.step(1);
    expect(badgeCount()).toBeGreaterThan(32);

    Object.defineProperty(doc, "visibilityState", { configurable: true, value: "hidden" });
    try {
      doc.dispatchEvent(new dom.window.Event("visibilitychange"));
      expect(overlayRoot()).toBeNull();
      for (let frame = 0; frame < 5; frame += 1) clock.step(1);
      expect(badgeCount()).toBe(0);
    } finally {
      delete (doc as unknown as Record<string, unknown>)["visibilityState"];
    }
    teardown();
  });

  it("dispose cancels the pending batches", () => {
    gridButtons(300);
    const clock = frameClock();
    const teardown = createApp({ window: win, isVisible: () => true, frameClock: clock, frameBudgetMs: 16.7 }).apply();
    activate();
    clock.step(1);
    expect(badgeCount()).toBeGreaterThan(32);

    teardown();
    expect(overlayRoot()).toBeNull();
    for (let frame = 0; frame < 5; frame += 1) clock.step(1);
    expect(badgeCount()).toBe(0);
  });
});
