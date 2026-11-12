/**
 * 宿主点击契约的端到端镜像：从宿主 0.2.2 的 dispatch 代码逐行翻过来的最小复现。
 *
 * 用户报告「点击输入框里的引用 chip 没反应」。宿主链路（composer 的
 * registerReferenceActivation → controller.openReference(source, reference)
 * → 按 owner.name === source 分发）已在宿主产物里逐环核验，这一层把它
 * 原样搭出来：注册进 inputTriggers 的 source 必须能被宿主按名字找到、
 * 按它递回来的 reference 形状（{ref, appearance}）反查到元素。
 */
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it } from "vitest";

import type { JumpWindow } from "../src/client/app.ts";
import { createRuntime, type RuntimeContext } from "../src/client/runtime.ts";
import type { RowReact } from "../src/client/react.ts";
import type { JumpReferenceSource } from "../src/client/reference.ts";

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://127.0.0.1/" });
const doc = dom.window.document;
const HOST = { window: dom.window as unknown as JumpWindow, document: doc };

const REACT: RowReact = {
  createElement: () => null,
  useEffect: () => undefined,
  useRef: <T>(initial: T) => ({ current: initial }),
  useSyncExternalStore: <T>(_subscribe: unknown, snapshot: () => T) => snapshot(),
};

interface HostServices {
  registered: JumpReferenceSource[];
}

function host(services: HostServices) {
  const map: Record<string, unknown> = {
    slots: {
      inject: (_key: string, callback: () => () => void) => callback(),
      register: () => () => undefined,
    },
    locale: { getSnapshot: () => ({ active: "zh" }) },
    inputTriggers: {
      registerSource: (source: JumpReferenceSource) => {
        services.registered.push(source);
        return () => undefined;
      },
    },
  };
  const get = <T>(name: string): T | undefined => map[name] as T | undefined;
  return {
    get,
    inject: (names: string[], callback: (scope: { get<T>(n: string): T | undefined }) => void) => {
      void names;
      return callback({ get }) as unknown as () => void;
    },
  } as unknown as RuntimeContext;
}

beforeEach(() => {
  doc.body.replaceChildren();
  doc.head.replaceChildren();
  // 提示挂在 documentElement 上，不会随 body 清空消失；留着会让下一条断言读到上一条的文案
  doc.querySelectorAll("[data-dsh-jump-notice]").forEach(node => node.remove());
});

describe("host click contract (dsh 0.2.2 dispatch mirror)", () => {
  it("finds the registered source by name and reveals the described element", () => {
    const services: HostServices = { registered: [] };
    const runtime = createRuntime({ ctx: host(services), platform: "macos", React: REACT, ...HOST });

    const button = doc.createElement("button");
    button.setAttribute("data-testid", "send-button");
    button.textContent = "发送";
    doc.body.appendChild(button);

    const roster = services.registered;
    expect(roster).toHaveLength(1);
    const owner = roster[0] as JumpReferenceSource & { openReference?: (s: unknown, r: unknown) => boolean };

    // 宿主 InputTriggerController.openReference(source, reference) 的分发形状：
    // 显式 source 时按 owner.name === source 取人，reference 是 {ref, appearance?}。
    const ref = JSON.stringify({
      kind: "ui.element",
      tag: "button",
      testId: "send-button",
      text: "发送",
    });
    const handled = owner.openReference?.({ sessionId: "s" }, { ref, appearance: "session" });
    expect(handled).toBe(true);
    expect(doc.activeElement).toBe(button);
    expect(doc.querySelector("[data-dsh-jump-notice]")).toBeNull();

    runtime.dispose();
  });

  it("says the element is gone instead of staying silent when the lookup fails", () => {
    const services: HostServices = { registered: [] };
    const runtime = createRuntime({ ctx: host(services), platform: "macos", React: REACT, ...HOST });

    const owner = services.registered[0] as JumpReferenceSource & {
      openReference?: (s: unknown, r: unknown) => boolean;
    };
    const ref = JSON.stringify({ kind: "ui.element", tag: "button", testId: "gone-button" });

    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    let handled: boolean | undefined;
    try {
      handled = owner.openReference?.({ sessionId: "s" }, { ref, appearance: "session" });
    } finally {
      console.warn = originalWarn;
    }

    expect(handled).toBe(false);
    const notice = doc.querySelector("[data-dsh-jump-notice]");
    expect(notice?.textContent).toContain("找不到");
    expect(warnings.some(args => args[0] === "[dsh-jump] reference reveal failed:")).toBe(true);

    runtime.dispose();
  });

  it("flags a malformed ref the same visible way", () => {
    const services: HostServices = { registered: [] };
    const runtime = createRuntime({ ctx: host(services), platform: "macos", React: REACT, ...HOST });

    const owner = services.registered[0] as JumpReferenceSource & {
      openReference?: (s: unknown, r: unknown) => boolean;
    };
    const originalWarn = console.warn;
    console.warn = () => undefined;
    let handled: boolean | undefined;
    try {
      handled = owner.openReference?.({ sessionId: "s" }, { ref: "not-json", appearance: "session" });
    } finally {
      console.warn = originalWarn;
    }

    expect(handled).toBe(false);
    expect(doc.querySelector("[data-dsh-jump-notice]")?.textContent).toContain("找不到");

    runtime.dispose();
  });

  it("says so when the page refuses to scroll the element into view", async () => {
    const services: HostServices = { registered: [] };
    const runtime = createRuntime({ ctx: host(services), platform: "macos", React: REACT, ...HOST });

    const button = doc.createElement("button");
    button.setAttribute("aria-label", "far-away");
    doc.body.appendChild(button);
    // 布局层替身：元素始终在视口下方 5000px 处，页面谁也不许滚
    button.getBoundingClientRect = () =>
      ({ x: 0, y: 5000, width: 40, height: 20, top: 5000, bottom: 5020, left: 0, right: 40, toJSON: () => ({}) }) as DOMRect;

    const owner = services.registered[0] as JumpReferenceSource & {
      openReference?: (s: unknown, r: unknown) => boolean;
    };
    const ref = JSON.stringify({ kind: "ui.element", tag: "button", ariaLabel: "far-away" });

    const originalWarn = console.warn;
    const warnings: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    let handled: boolean | undefined;
    try {
      handled = owner.openReference?.({ sessionId: "s" }, { ref, appearance: "session" });
      await new Promise(resolve => setTimeout(resolve, 60));
    } finally {
      console.warn = originalWarn;
    }

    expect(handled).toBe(true);
    expect(doc.querySelector("[data-dsh-jump-notice]")?.textContent).toContain("没有滚动过去");
    expect(warnings.some(args => String(args[0]).includes("found-hidden"))).toBe(true);

    runtime.dispose();
  });
});
