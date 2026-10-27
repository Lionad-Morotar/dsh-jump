/**
 * 绑定存储的契约：默认值回落、脏文档容错、变更广播、跨标签页刷新。
 *
 * 存储是激活判定的唯一真相来源，所以这里既检查读回来的形状，也检查"写坏了
 * 一份文档"时插件还能不能启动。
 */
import { describe, expect, it, vi } from "vitest";

import { createDefaultBindings } from "../src/client/bindings.ts";
import { BINDINGS_STORAGE_KEY, createBindingsStore, type BindingsStorage } from "../src/client/store.ts";

const MAC = createDefaultBindings("macos");

function memoryStorage(seed?: string): BindingsStorage & { readonly value: string | null } {
  let value: string | null = seed ?? null;
  return {
    get value() {
      return value;
    },
    getItem: (key) => (key === BINDINGS_STORAGE_KEY ? value : null),
    setItem: (key, next) => {
      if (key === BINDINGS_STORAGE_KEY) value = next;
    },
    removeItem: (key) => {
      if (key === BINDINGS_STORAGE_KEY) value = null;
    },
  };
}

describe("createBindingsStore", () => {
  it("starts on the platform defaults when nothing is stored", () => {
    const store = createBindingsStore({ storage: memoryStorage(), platform: "macos" });
    expect(store.get()).toEqual(MAC);
  });

  it("reads a stored document back", () => {
    const custom = { click: { key: "k", meta: true, alt: true, ctrl: false, shift: false }, focus: { key: "j", meta: true, alt: false, ctrl: false, shift: true } };
    const store = createBindingsStore({ storage: memoryStorage(JSON.stringify(custom)), platform: "macos" });
    expect(store.get()).toEqual(custom);
  });

  it("falls back to the defaults for a corrupt or hostile document", () => {
    for (const seed of ["", "not json", "null", "[]", "42", JSON.stringify({ click: { key: 7 } })]) {
      const store = createBindingsStore({ storage: memoryStorage(seed), platform: "macos" });
      expect(store.get(), seed).toEqual(MAC);
    }
  });

  it("persists a change and notifies subscribers", () => {
    const storage = memoryStorage();
    const store = createBindingsStore({ storage, platform: "macos" });
    const listener = vi.fn();
    store.subscribe(listener);

    const next = { ...MAC, click: { key: "k", meta: true, alt: true, ctrl: false, shift: false } };
    store.set(next);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.value ?? "null")).toEqual(next);
    expect(store.get()).toEqual(next);
  });

  it("does not notify when the same pair is written twice", () => {
    const store = createBindingsStore({ storage: memoryStorage(), platform: "macos" });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(MAC);
    expect(listener).not.toHaveBeenCalled();
  });

  it("normalizes before storing, so a half-built chord cannot be persisted", () => {
    const storage = memoryStorage();
    const store = createBindingsStore({ storage, platform: "macos" });
    store.set({ click: { key: "K" }, focus: "j" } as never);
    expect(JSON.parse(storage.value ?? "null")).toEqual({
      click: { key: "k", meta: false, alt: false, ctrl: false, shift: false },
      focus: { key: "j", meta: true, alt: false, ctrl: false, shift: false },
    });
  });

  it("resets back to the defaults and clears the document", () => {
    const storage = memoryStorage();
    const store = createBindingsStore({ storage, platform: "macos" });
    store.set({ ...MAC, click: { key: "k", meta: true, alt: true, ctrl: false, shift: false } });
    store.reset();
    expect(store.get()).toEqual(MAC);
    expect(storage.value).toBeNull();
  });

  it("unsubscribes cleanly and survives a throwing storage", () => {
    const exploding: BindingsStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    // 隐私模式下 localStorage 读写都会抛：插件必须还能用默认值跑起来。
    const store = createBindingsStore({ storage: exploding, platform: "macos" });
    expect(store.get()).toEqual(MAC);
    expect(() => store.set({ ...MAC, click: { key: "k", meta: true, alt: true, ctrl: false, shift: false } })).not.toThrow();
    expect(store.get().click.key).toBe("k");

    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.reset();
    expect(listener).not.toHaveBeenCalled();
  });

  it("reruns a reload when another tab rewrites the document", () => {
    const storage = memoryStorage();
    const store = createBindingsStore({ storage, platform: "macos" });
    const listener = vi.fn();
    store.subscribe(listener);

    storage.setItem(
      BINDINGS_STORAGE_KEY,
      JSON.stringify({ click: { key: "k", meta: true }, focus: { key: "j", meta: true } }),
    );
    store.reload();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get().click.key).toBe("k");
  });

  it("ignores a reload that changes nothing", () => {
    const store = createBindingsStore({ storage: memoryStorage(JSON.stringify(MAC)), platform: "macos" });
    const listener = vi.fn();
    store.subscribe(listener);
    store.reload();
    expect(listener).not.toHaveBeenCalled();
  });
});
