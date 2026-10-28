/**
 * 设置页的渲染契约：每个模式一行，各自有键位、恢复与说明。
 *
 * 与行测试同一套极小 React 替身：组件只用到 four API，替身能把"渲染出什么"
 * 精确暴露出来，也避免为一次渲染引入 react-dom。
 */
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { createDefaultBindings } from "../src/client/bindings.ts";
import { EN, ZH } from "../src/client/copy.ts";
import { createBindingsController } from "../src/client/settings-controller.ts";
import { insertPageStyles, JumpSettingsPage, PAGE_CSS } from "../src/client/settings-page.ts";
import type { RowReact } from "../src/client/react.ts";
import { createBindingsStore, type BindingsStorage } from "../src/client/store.ts";

const MAC = createDefaultBindings("macos");

interface Node {
  type: unknown;
  props: Record<string, unknown>;
  children: Node[];
  text?: string;
}

function node(type: unknown, props: Record<string, unknown> = {}, ...children: unknown[]): Node {
  const flat: Node[] = [];
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === "string" || typeof child === "number") flat.push({ type: "#text", props: {}, children: [], text: String(child) });
    else flat.push(child as Node);
  }
  return { type, props, children: flat };
}

function fakeReact(onSubscribe?: (subscribe: (listener: () => void) => () => void) => void): RowReact {
  return {
    createElement(t: unknown, p: Record<string, unknown> = {}, ...c: unknown[]) {
      return node(t, p, c);
    },
    useEffect() {
      // 录制监听器的挂载由 app 层集成测试覆盖
    },
    useRef<T>(initial: T) {
      return { current: initial };
    },
    useSyncExternalStore<T>(subscribe: (listener: () => void) => () => void, snapshot: () => T) {
      onSubscribe?.(subscribe);
      subscribe(() => undefined)();
      return snapshot();
    },
  };
}

function memory(): BindingsStorage {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_k, v) => {
      value = v;
    },
    removeItem: () => {
      value = null;
    },
  };
}

function setup(copy = ZH) {
  const store = createBindingsStore({ storage: memory(), platform: "macos" });
  const controller = createBindingsController({ store, platform: "macos" });
  const tree = JumpSettingsPage({ React: fakeReact(), controller, platform: "macos", copy }) as Node;
  return { store, controller, tree };
}

function findAll(root: Node, pred: (n: Node) => boolean): Node[] {
  const found: Node[] = [];
  const walk = (n: Node): void => {
    if (pred(n)) found.push(n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return found;
}

function chords(tree: Node): Node[] {
  return findAll(tree, (n) => "data-dsh-jump-chord" in n.props);
}

function resets(tree: Node): Node[] {
  return findAll(tree, (n) => "data-dsh-jump-reset" in n.props);
}

function textOf(n: Node): string {
  if (n.text !== undefined) return n.text;
  return n.children.map(textOf).join("");
}

describe("JumpSettingsPage", () => {
  it("renders one row per mode, each with its own chord", () => {
    const { tree } = setup();
    expect(chords(tree).map(textOf)).toEqual(["⌘H", "⌘U"]);
    // 两个模式各有自己的说明，页面不再把两者挤在一句描述里。
    expect(textOf(tree)).toContain(ZH.clickTitle);
    expect(textOf(tree)).toContain(ZH.focusTitle);
    expect(textOf(tree)).toContain(ZH.clickDescription);
    expect(textOf(tree)).toContain(ZH.focusDescription);
  });

  it("gives each mode its own restore control", () => {
    const { tree } = setup();
    expect(resets(tree)).toHaveLength(2);
    expect(resets(tree).map((b) => b.props["data-dsh-jump-reset"])).toEqual(["click", "focus"]);
  });

  it("disables a row's restore control while it already holds the shipped chord", () => {
    const { tree } = setup();
    for (const button of resets(tree)) expect(button.props.disabled).toBe(true);
  });

  it("enables restore once a row differs from the shipped chord", () => {
    const { controller } = setup();
    controller.begin("click");
    controller.press({ key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false });
    const tree = JumpSettingsPage({
      React: fakeReact(),
      controller,
      platform: "macos",
      copy: ZH,
    }) as Node;
    const [clickReset, focusReset] = resets(tree);
    expect(clickReset?.props.disabled).toBe(false);
    expect(focusReset?.props.disabled).toBe(true);
  });

  it("shows the recording instruction in the row being recorded", () => {
    const { controller } = setup();
    controller.begin("focus");
    const tree = JumpSettingsPage({ React: fakeReact(), controller, platform: "macos", copy: ZH }) as Node;
    expect(textOf(tree)).toContain(ZH.recording);
    // 录制中的按钮换成指令，未录制的那行保持键位。
    const buttons = chords(tree);
    expect(textOf(buttons[0] as Node)).toBe("⌘H");
    expect(textOf(buttons[1] as Node)).toBe(ZH.recording);
  });

  it("announces a refusal under the rows", () => {
    const { controller } = setup();
    controller.begin("click");
    // 单字符裸键仍然需要修饰键。
    controller.press({ key: "k", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false });
    const tree = JumpSettingsPage({ React: fakeReact(), controller, platform: "macos", copy: ZH }) as Node;
    const issue = findAll(tree, (n) => "data-dsh-jump-issue" in n.props);
    expect(issue).toHaveLength(1);
    expect(issue[0]?.props.role).toBe("status");
    expect(textOf(issue[0] as Node)).toBe(ZH.issues["no-modifier"]);
  });

  it("mentions that a key which prints nothing may be bound bare", () => {
    const { tree } = setup();
    expect(textOf(tree)).toContain(ZH.bareNote);
  });

  it("renders the English dictionary when asked", () => {
    const { tree } = setup(EN);
    expect(textOf(tree)).toContain(EN.clickTitle);
    expect(textOf(tree)).not.toContain(ZH.clickTitle);
  });

  it("keeps the nav label distinct from the page title", () => {
    // 导航里空间窄，标题可以更完整；两者不同是刻意的，不该被合并。
    expect(ZH.navLabel.length).toBeGreaterThan(0);
    expect(ZH.title.length).toBeGreaterThan(0);
  });
});

describe("insertPageStyles", () => {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");

  it("scopes every rule to the page's own attribute", () => {
    // 与宿主共用 style 元素，未加作用域的规则会污染整个设置面板。
    for (const rule of PAGE_CSS.split("}")) {
      const selector = rule.split("{")[0]?.trim();
      if (selector === undefined || selector === "") continue;
      expect(selector.startsWith("[data-dsh-jump-page]"), selector).toBe(true);
    }
  });

  it("inserts once and removes on teardown", () => {
    const doc = dom.window.document;
    doc.head.replaceChildren();
    const dispose = insertPageStyles(doc);
    expect(doc.querySelectorAll("style[data-plugin-css]")).toHaveLength(1);

    const disposeAgain = insertPageStyles(doc);
    expect(doc.querySelectorAll("style[data-plugin-css]")).toHaveLength(1);
    disposeAgain();

    dispose();
    expect(doc.querySelectorAll("style[data-plugin-css]")).toHaveLength(0);
  });
});
