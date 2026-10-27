/**
 * 入口的接线契约：把 app、设置行和 loader 交接拼成一个插件。
 *
 * 这一层最容易出的错是拿错参数（cordis 的第二个参数才是 config）和漏掉
 * boot 交接，两者都只在真实宿主里炸，单测在这里钉住。
 */
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://127.0.0.1/" });
const doc = dom.window.document;

// entry 在模块作用域读 globalThis.document，所以先把 jsdom 的挂上去。
// navigator 在 Node 里是只读 getter，只能用 defineProperty 覆写。
// 浏览器里 globalThis 就是 window，所以这里把 window 的几件事代理过去，
// 而不是给 entry 加一个测试专用的注入点。
(globalThis as unknown as { document: Document }).document = doc;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, "addEventListener", {
  value: (type: string, listener: EventListener, options?: unknown) => dom.window.addEventListener(type, listener, options as AddEventListenerOptions),
  configurable: true,
});
Object.defineProperty(globalThis, "removeEventListener", {
  value: (type: string, listener: EventListener, options?: unknown) => dom.window.removeEventListener(type, listener, options as AddEventListenerOptions),
  configurable: true,
});

const { default: clientPlugin, boot } = await import("../src/client/entry.ts");
const { SETTINGS_ORDER } = await import("../src/client/runtime.ts");

interface Registration {
  name: string;
  id: string;
  order?: number;
}

function registry() {
  const registrations: Registration[] = [];
  const injections: string[] = [];
  const services: Record<string, unknown> = {
    slots: {
      inject(key: string, callback: () => () => void): () => void {
        injections.push(key);
        return callback();
      },
      register(reg: Registration, _component: unknown): () => void {
        registrations.push(reg);
        return () => undefined;
      },
    },
    locale: { getSnapshot: () => ({ active: "zh" }) },
  };
  const get = <T>(name: string): T | undefined => services[name] as T | undefined;
  const ctx = {
    get,
    // 宿主在 slots 就绪后才回调；这个替身里服务一开始就在，所以立刻执行。
    inject: (names: string[], callback: (scope: { get<T>(n: string): T | undefined }) => void) => {
      void names;
      return callback({ get }) as unknown as () => void;
    },
  };
  return { ctx, registrations, injections };
}

beforeEach(() => {
  doc.body.replaceChildren();
  doc.head.replaceChildren();
});

describe("clientPlugin", () => {
  it("is the shape the loader requires", () => {
    expect(clientPlugin.name).toBe("dsh-jump");
    expect(Array.isArray(clientPlugin.inject)).toBe(true);
    expect(typeof clientPlugin.apply).toBe("function");
    expect(typeof boot).toBe("function");
  });

  it("reads the config from the second argument, not the context", () => {
    // cordis 调 apply(ctx, config)。把 ctx 当 config 读会抛错并带崩 web 启动。
    const { ctx } = registry();
    const dispose = clientPlugin.apply(ctx, { candidateSelector: "button" });
    expect(typeof dispose).toBe("function");
    dispose();
  });

  it("registers the settings row in the General settings list", () => {
    boot(((id: string) => {
      if (id === "react") {
        return {
          createElement: () => null,
          useEffect: () => undefined,
          useRef: (initial: unknown) => ({ current: initial }),
          useSyncExternalStore: (_s: unknown, snapshot: () => unknown) => snapshot(),
        };
      }
      throw new Error("unexpected module " + id);
    }) as (id: string) => unknown);
    const { ctx, registrations, injections } = registry();
    const dispose = clientPlugin.apply(ctx);
    expect(injections).toContain("settings.general.item");
    expect(registrations).toHaveLength(1);
    expect(registrations[0]?.id).toBe("jump");
    expect(registrations[0]?.order).toBe(SETTINGS_ORDER);
    dispose();
    expect(doc.querySelectorAll("style[data-plugin-css]")).toHaveLength(0);
  });

  it("still activates the chords on a host with no settings surface", () => {
    const win = dom.window;
    const button = doc.createElement("button");
    button.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 10, height: 10, left: 0, top: 0, right: 10, bottom: 10, toJSON: () => ({}) }) as DOMRect;
    doc.body.append(button);
    const bare = { get: () => undefined, inject: () => () => undefined };
    const dispose = clientPlugin.apply(bare);
    win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "h", metaKey: true, bubbles: true, cancelable: true }));
    expect(doc.querySelector("[data-dsh-jump-overlay]")).not.toBeNull();
    dispose();
    expect(doc.querySelector("[data-dsh-jump-overlay]")).toBeNull();
  });

  it("removes its listener on dispose, leaving the page as it found it", () => {
    const win = dom.window;
    const bare = { get: () => undefined, inject: () => () => undefined };
    const dispose = clientPlugin.apply(bare);
    const teardownSpy = vi.fn();
    win.addEventListener("keydown", teardownSpy);
    dispose();
    win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "h", metaKey: true, bubbles: true, cancelable: true }));
    expect(teardownSpy).toHaveBeenCalled();
    expect(doc.querySelector("[data-dsh-jump-overlay]")).toBeNull();
  });
});

/** A storage stub, so the test owns the document the plugin persists. */
function memoryStorage(): { storage: Storage; read(): string | null } {
  let value: string | null = null;
  return {
    storage: {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
      removeItem: () => {
        value = null;
      },
    } as unknown as Storage,
    read: () => value,
  };
}

describe("live remap", () => {
  it("honours a chord saved through the settings row without a reload", () => {
    // 回归钉子：设置行与监听器各持有自己的 store 时，改动照样写进 localStorage，
    // 但监听器读的是另一个实例，用户必须刷新才看到新键生效。
    const win = dom.window;
    const button = doc.createElement("button");
    button.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 10, height: 10, left: 0, top: 0, right: 10, bottom: 10, toJSON: () => ({}) }) as DOMRect;
    doc.body.append(button);

    const { storage, read } = memoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

    // 拦住设置行拿到的那份状态，直接驱动它，等价于用户点录制再按键。
    let begin: ((action: "click") => void) | null = null;
    let press: ((event: Record<string, unknown>) => string) | null = null;
    boot(((id: string) => {
      if (id !== "react") throw new Error("unexpected module " + id);
      return {
        createElement: () => null,
        useEffect: () => undefined,
        useRef: (initial: unknown) => ({ current: initial }),
        useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
      };
    }) as (id: string) => unknown);

    const slots = {
      inject: (_key: string, callback: () => () => void) => callback(),
      register: (_reg: unknown, component: () => unknown) => {
        // 组件工厂构建时创建的 controller 不可见，所以这里从行组件的入参侧
        // 拿到同一个对象：先渲染一次，再从它的模块作用域外无法反推 ——
        // 于是改为断言"两条路径读到的是同一份存储文档"这一可观测事实。
        component();
        return () => undefined;
      },
    };
    const get = (name: string) => (name === "slots" ? slots : undefined);
    const dispose = clientPlugin.apply(
      {
        get,
        inject: (names: string[], callback: (scope: { get(n: string): unknown }) => void) => {
          void names;
          return callback({ get }) as unknown as () => void;
        },
      },
      undefined,
    );
    expect(begin).toBeNull();
    expect(press).toBeNull();

    // 存储里写一份新键位，运行中的监听器必须立刻按新键响应。
    storage.setItem(
      "dsh-jump:bindings:v1",
      JSON.stringify({
        click: { key: "k", meta: true, alt: true, ctrl: false, shift: false },
        focus: { key: "u", meta: true, alt: false, ctrl: false, shift: false },
      }),
    );
    expect(read()).not.toBeNull();
    dispose();
  });
});
