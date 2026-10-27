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
import type { RowReact } from "../src/client/settings-row.ts";
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
  registration: { name: string; id: string; order: number };
}

function host() {
  const captured: Captured[] = [];
  let localeReads = 0;
  return {
    captured,
    localeReads: () => localeReads,
    ctx: {
      get<T>(name: string): T | undefined {
        if (name === "slots") {
          return {
            inject: (key: string, callback: () => () => void) => callback(),
            register: (registration: { name: string; id: string; order: number }, _component: unknown) => {
              captured.push({ slotKey: "unused", registration });
              return () => undefined;
            },
          } as unknown as T;
        }
        if (name === "locale") {
          return {
            getSnapshot: () => {
              localeReads += 1;
              return { active: "zh" };
            },
          } as unknown as T;
        }
        return undefined;
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

  it("registers the row right after the host's own shortcut row", () => {
    const h = host();
    const runtime = createRuntime({ ctx: h.ctx, platform: "macos", React: REACT, ...HOST });
    expect(h.captured).toHaveLength(1);
    expect(h.captured[0]?.registration).toEqual({ name: SETTINGS_SLOT, id: SETTINGS_ID, order: SETTINGS_ORDER });
    expect(SETTINGS_ORDER).toBeGreaterThan(16);
    runtime.dispose();
  });

  it("keeps the listener working when the host has no settings slot", () => {
    const win = dom.window;
    const button = doc.createElement("button");
    place(button);
    doc.body.append(button);
    const runtime = createRuntime({ ctx: { get: () => undefined } as RuntimeContext, platform: "macos", React: REACT, ...HOST });
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

  it("is safe to dispose twice", () => {
    const runtime = createRuntime({ ctx: host().ctx, platform: "macos", React: REACT, ...HOST });
    runtime.dispose();
    expect(() => runtime.dispose()).not.toThrow();
  });
});
