/**
 * 设置行的渲染契约：把 controller 的状态投影成两个按键按钮。
 *
 * 这里用一个极小的 React 替身来渲染，而不是拉进真实 React：组件只调用
 * createElement/useSyncExternalStore/useRef/useEffect 四个 API，替身能把
 * "订阅了谁、拿到什么状态、渲染出什么"精确暴露出来，也避免为一次渲染引入
 * react-dom 依赖。
 */
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { createDefaultBindings } from "../src/client/bindings.ts";
import { ZH } from "../src/client/copy.ts";
import { createBindingsController } from "../src/client/settings-controller.ts";
import { insertRowStyles, JumpSettingsRow, ROW_CSS, type RowReact } from "../src/client/settings-row.ts";
import { createBindingsStore, type BindingsStorage } from "../src/client/store.ts";

const MAC = createDefaultBindings("macos");

interface Node {
  type: unknown;
  props: Record<string, unknown>;
  children: Node[];
  text?: string;
}

/** 把 createElement 的结果摊平成可断言的树。 */
function node(type: unknown, props: Record<string, unknown> = {}, ...children: unknown[]): Node {
  const flat: Node[] = [];
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === "string" || typeof child === "number") flat.push({ type: "#text", props: {}, children: [], text: String(child) });
    else flat.push(child as Node);
  }
  return { type, props, children: flat };
}

function fakeReact(): RowReact & { lastSubscribe: unknown } {
  const api = {
    lastSubscribe: null as unknown,
    createElement(t: unknown, p: Record<string, unknown> = {}, ...c: unknown[]) {
      return node(t, p, c);
    },
    useEffect() {
      // 录制监听器的挂载由 app 层集成测试覆盖，这里只关心投影
    },
    useRef<T>(initial: T) {
      return { current: initial };
    },
    useSyncExternalStore<T>(subscribe: (l: () => void) => () => void, snapshot: () => T) {
      api.lastSubscribe = subscribe;
      subscribe(() => undefined)();
      return snapshot();
    },
  };
  return api;
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

function setup() {
  const store = createBindingsStore({ storage: memory(), platform: "macos" });
  const controller = createBindingsController({ store, platform: "macos" });
  const React = fakeReact();
  const tree = JumpSettingsRow({ React, controller, platform: "macos", copy: ZH }) as Node;
  return { store, controller, React, tree };
}

/** 找到所有挂在 data-dsh-jump-chord 上的按钮。 */
function chords(tree: Node): Node[] {
  const found: Node[] = [];
  const walk = (n: Node): void => {
    if ("data-dsh-jump-chord" in n.props) found.push(n);
    for (const c of n.children) walk(c);
  };
  walk(tree);
  return found;
}

function textOf(n: Node): string {
  if (n.text !== undefined) return n.text;
  return n.children.map(textOf).join("");
}

describe("JumpSettingsRow", () => {
  it("renders both chords with the platform's labels", () => {
    const { tree } = setup();
    expect(chords(tree).map(textOf)).toEqual(["⌘H", "⌘U"]);
  });

  it("renders the title and the description", () => {
    const { tree } = setup();
    expect(textOf(tree)).toContain(ZH.title);
    expect(textOf(tree)).toContain(ZH.description);
  });

  it("announces the chord through aria-keyshortcuts", () => {
    const { tree } = setup();
    expect(chords(tree).map((n) => n.props["aria-keyshortcuts"])).toEqual(["⌘H", "⌘U"]);
    expect(chords(tree).map((n) => n.props["aria-label"])).toEqual([ZH.clickName, ZH.focusName]);
  });

  it("swaps the recorded button's text for the prompt and keeps its accessible name", () => {
    const { controller, tree, React } = setup();
    controller.begin("click");
    const next = JumpSettingsRow({ React, controller, platform: "macos", copy: ZH }) as Node;
    const [click, focus] = chords(next);
    expect(textOf(click as Node)).toBe(ZH.recording);
    expect(click?.props["data-recording"]).toBe("");
    expect(click?.props["aria-label"]).toBe(ZH.clickName);
    expect(textOf(focus as Node)).toBe("⌘U");
  });

  it("shows the rejection reason under the description", () => {
    const { controller, React } = setup();
    controller.begin("click");
    controller.press({ key: "u", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false });
    const next = JumpSettingsRow({ React, controller, platform: "macos", copy: ZH }) as Node;
    expect(textOf(next)).toContain(ZH.issues.duplicate);
  });

  it("asks the controller to start recording when a chord button is pressed", () => {
    const { tree, controller } = setup();
    const spy = vi.spyOn(controller, "begin");
    const [click] = chords(tree);
    (click?.props.onClick as () => void)();
    expect(spy).toHaveBeenCalledWith("click");
  });

  it("restores the defaults from the reset control", () => {
    const { tree, controller, store } = setup();
    controller.begin("click");
    controller.press({ key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false });
    expect(store.get().click.key).toBe("k");
    const reset = (tree.children[1] as Node).children.find((n) => "data-dsh-jump-reset" in n.props);
    (reset?.props.onClick as () => void)();
    expect(store.get()).toEqual(MAC);
  });

  it("subscribes to the controller, so a remap repaints without a new mount", () => {
    const { tree, controller } = setup();
    const before = textOf(chords(tree)[0] as Node);
    controller.begin("click");
    controller.press({ key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false });
    const after = JumpSettingsRow({
      React: fakeReact(),
      controller,
      platform: "macos",
      copy: ZH,
    }) as Node;
    expect(before).toBe("⌘H");
    expect(textOf(chords(after)[0] as Node)).toBe("⌘K");
  });
});

describe("insertRowStyles", () => {
  it("scopes every rule to the row", () => {
    for (const rule of ROW_CSS.split("}")) {
      const selector = rule.split("{")[0]?.trim();
      if (selector === undefined || selector === "") continue;
      expect(selector.startsWith("[data-dsh-jump-settings]")).toBe(true);
    }
  });

  it("inserts the stylesheet once and removes it on teardown", () => {
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const dispose = insertRowStyles(dom.window.document);
    expect(dom.window.document.querySelectorAll("style[data-plugin-css]")).toHaveLength(1);
    // 第二次调用不再插入；它的拆除也不能清掉第一个的样式
    const disposeAgain = insertRowStyles(dom.window.document);
    expect(dom.window.document.querySelectorAll("style[data-plugin-css]")).toHaveLength(1);
    disposeAgain();
    expect(dom.window.document.querySelectorAll("style[data-plugin-css]")).toHaveLength(1);
    dispose();
    expect(dom.window.document.querySelectorAll("style[data-plugin-css]")).toHaveLength(0);
  });
});
