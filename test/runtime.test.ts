/**
 * 组合契约：监听器与设置行必须共用同一个 store。
 *
 * 分开建 store 也能把改动写进 localStorage，但要等下一次刷新才生效——这个
 * bug 在单测里只有把两条路径拼起来才看得见，所以这一层必须存在。
 */
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it } from "vitest";

import { createDefaultBindings } from "../src/client/bindings.ts";
import type { JumpWindow } from "../src/client/app.ts";
import { createRuntime, SETTINGS_ID, SETTINGS_ORDER, SETTINGS_SLOT, type RuntimeContext } from "../src/client/runtime.ts";
import type { RowReact } from "../src/client/react.ts";
import { createBindingsStore, type BindingsStorage } from "../src/client/store.ts";

const MAC = createDefaultBindings("macos");

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://127.0.0.1/" });
const doc = dom.window.document;
// runtime 的两个可选注入点就是为这种宿主准备的：jsdom 里 globalThis 既不是
// window 也没有 document。
const HOST = { window: dom.window as unknown as JumpWindow, document: doc };

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

/** React 替身：渲染不参与本层断言，只要够组件调用即可。 */
const REACT: RowReact = {
  createElement: () => null,
  useEffect: () => undefined,
  useRef: <T>(initial: T) => ({ current: initial }),
  useSyncExternalStore: <T>(_subscribe: unknown, snapshot: () => T) => snapshot(),
};

interface Captured {
  slotKey: string;
  registration: { name: string; id: string; order: number; label?: string | (() => string) };
  component: unknown;
}

function host() {
  const captured: Captured[] = [];
  let localeReads = 0;
  const services: Record<string, unknown> = {
    slots: {
      inject: (key: string, callback: () => () => void) => {
        void key;
        return callback();
      },
      register: (
        registration: { name: string; id: string; order: number; label?: string | (() => string) },
        component: unknown,
      ) => {
        captured.push({ slotKey: "unused", registration, component });
        return () => undefined;
      },
    },
    locale: {
      getSnapshot: () => {
        localeReads += 1;
        return { active: "zh" };
      },
    },
  };
  const get = <T>(name: string): T | undefined => services[name] as T | undefined;
  return {
    captured,
    localeReads: () => localeReads,
    ctx: {
      get,
      // 服务都已就绪的宿主：回调立刻跑，作用域与根上下文同源。
      inject: (names: string[], callback: (scope: { get<T>(n: string): T | undefined }) => void) => {
        void names;
        return callback({ get }) as unknown as () => void;
      },
    } as unknown as RuntimeContext,
  };
}

beforeEach(() => {
  doc.body.replaceChildren();
  doc.head.replaceChildren();
});

function place(el: Element): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 10, height: 10, left: 0, top: 0, right: 10, bottom: 10, toJSON: () => ({}) }) as DOMRect;
}

function key(win: typeof dom.window, init: Record<string, unknown>): void {
  win.dispatchEvent(new win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

describe("createRuntime", () => {
  it("exposes the store both halves read", () => {
    const store = createBindingsStore({ storage: memory(), platform: "macos" });
    const runtime = createRuntime({ ctx: host().ctx, platform: "macos", React: null, store, ...HOST });
    expect(runtime.store).toBe(store);
    runtime.dispose();
  });

  it("follows a store change immediately, without a remount", () => {
    const win = dom.window;
    const button = doc.createElement("button");
    place(button);
    doc.body.append(button);
    const store = createBindingsStore({ storage: memory(), platform: "macos" });
    const runtime = createRuntime({ ctx: host().ctx, platform: "macos", React: null, store, ...HOST });

    key(win, { key: "k", metaKey: true, altKey: true });
    expect(doc.querySelector("[data-dsh-jump-overlay]")).toBeNull();

    store.set({ ...MAC, click: { key: "k", meta: true, alt: true, ctrl: false, shift: false } });
    key(win, { key: "k", metaKey: true, altKey: true });
    expect(doc.querySelector("[data-dsh-jump-overlay]")).not.toBeNull();

    runtime.dispose();
  });

  it("stops honouring the old chord once it is replaced", () => {
    const win = dom.window;
    const button = doc.createElement("button");
    place(button);
    doc.body.append(button);
    const runtime = createRuntime({ ctx: host().ctx, platform: "macos", React: null, ...HOST });

    win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "h", metaKey: true, bubbles: true, cancelable: true }));
    expect(doc.querySelector("[data-dsh-jump-overlay]")).not.toBeNull();
    key(win, { key: "Escape" });
    win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

    runtime.store.set({ ...MAC, click: { key: "p", meta: true, alt: false, ctrl: false, shift: false } });
    win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "h", metaKey: true, bubbles: true, cancelable: true }));
    expect(doc.querySelector("[data-dsh-jump-overlay]")).toBeNull();

    runtime.dispose();
  });

  it("registers a settings section with a nav label", () => {
    const h = host();
    const runtime = createRuntime({ ctx: h.ctx, platform: "macos", React: REACT, ...HOST });
    expect(h.captured).toHaveLength(1);
    const registration = h.captured[0]?.registration;
    expect(registration).toEqual({ name: SETTINGS_SLOT, id: SETTINGS_ID, order: SETTINGS_ORDER, label: expect.any(Function) });
    // label 是 thunk：宿主每次投影都重读，语言切换因此不需要重新注册。
    expect(typeof registration?.label).toBe("function");
    expect((registration?.label as () => string)()).toBe("跳跃导航");
    runtime.dispose();
  });

  it("keeps the listener working when the host has no settings slot", () => {
    const win = dom.window;
    const button = doc.createElement("button");
    place(button);
    doc.body.append(button);
    // 一个连 inject 都没有的宿主：导航照旧，只是没有可配置的面。
    const bare = { get: () => undefined, inject: () => () => undefined } as unknown as RuntimeContext;
    const runtime = createRuntime({ ctx: bare, platform: "macos", React: REACT, ...HOST });
    key(win, { key: "h", metaKey: true });
    expect(doc.querySelector("[data-dsh-jump-overlay]")).not.toBeNull();
    runtime.dispose();
  });

  it("skips the row when the loader seeded no usable React", () => {
    const h = host();
    const runtime = createRuntime({ ctx: h.ctx, platform: "macos", React: null, ...HOST });
    expect(h.captured).toHaveLength(0);
    runtime.dispose();
  });

  it("inserts the row's stylesheet only when the row is registered, and removes it on dispose", () => {
    const runtime = createRuntime({ ctx: host().ctx, platform: "macos", React: REACT, ...HOST });
    expect(doc.querySelectorAll("style[data-plugin-css]")).toHaveLength(1);
    runtime.dispose();
    expect(doc.querySelectorAll("style[data-plugin-css]")).toHaveLength(0);
  });

  it("waits for the slots service instead of sampling it once", () => {
    // 宿主的服务是逐个就绪的。apply 早于 slots 建立时，ctx.get 会静默返回
    // undefined，行就再也不会注册。真实宿主里这就是"插件装了但设置里没有"。
    const win = dom.window;
    const button = doc.createElement("button");
    place(button);
    doc.body.append(button);

    const captured: Captured[] = [];
    // 用持有对象而不是裸 let：赋值发生在闭包里，TS 的控制流分析会把
    // 调用点的 let 收窄成 never。
    const pending: { release: (() => void) | null } = { release: null };
    const slots = {
      inject: (key: string, callback: () => () => void) => {
        void key;
        return callback();
      },
      register: (
        registration: { name: string; id: string; order: number; label?: string | (() => string) },
        component: unknown,
      ) => {
        captured.push({ slotKey: "unused", registration, component });
        return () => undefined;
      },
    };
    let injected = false;
    // 服务表在回调前是空的：slots 尚不存在，locale 可以先有。
    const services: Record<string, unknown> = { locale: { getSnapshot: () => ({ active: "zh" }) } };
    const scopedGet = <T>(name: string): T | undefined => services[name] as T | undefined;
    const ctx = {
      get: () => undefined,
      inject: (names: string[], callback: (scope: { get<T>(n: string): T | undefined }) => void) => {
        injected = true;
        expect(names).toContain("slots");
        pending.release = () => {
          services.slots = slots;
          callback({ get: scopedGet });
        };
        return () => undefined;
      },
    } as unknown as RuntimeContext;

    const runtime = createRuntime({ ctx, platform: "macos", React: REACT, ...HOST });
    // 服务还没起来时，行不该被注册，但导航必须立刻可用。
    expect(injected).toBe(true);
    expect(captured).toHaveLength(0);
    key(win, { key: "h", metaKey: true });
    expect(doc.querySelector("[data-dsh-jump-overlay]")).not.toBeNull();

    // 服务就绪后页面才出现。
    pending.release?.();
    expect(captured).toHaveLength(1);
    expect(captured[0]?.registration).toEqual({
      name: SETTINGS_SLOT,
      id: SETTINGS_ID,
      order: SETTINGS_ORDER,
      label: expect.any(Function),
    });

    runtime.dispose();
  });

  it("keeps the section id and order clear of the host's own entries", () => {
    // 设置导航的实测占用：account -10、general 0、models 10、plugins 15、
    // agent-presets 20，第三方从 30（cost-meter）一直到 115/116（皮肤管理器）。
    // 撞上同一个 order 时谁在前取决于注册先后，不受控。
    for (const order of [-10, 0, 10, 15, 20, 30, 31, 45, 100, 115, 116]) expect(SETTINGS_ORDER).not.toBe(order);
    for (const id of ["account", "general", "models", "plugins", "agent-presets"]) expect(SETTINGS_ID).not.toBe(id);
    for (const id of ["shortcuts", "link-opening", "composer-enter", "developer-tools"]) {
      expect(SETTINGS_ID).not.toBe(id);
    }
  });

  it("is safe to dispose twice", () => {
    const runtime = createRuntime({ ctx: host().ctx, platform: "macos", React: REACT, ...HOST });
    runtime.dispose();
    expect(() => runtime.dispose()).not.toThrow();
  });
});
