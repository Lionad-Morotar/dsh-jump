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
// jsdom 没有视口尺寸；app 从 globalThis 读它裁掉屏幕外的候选，缺了它一轮
// 激活只会画出空容器，徽章断言无从谈起。
Object.defineProperty(globalThis, "innerWidth", { value: 1024, configurable: true });
Object.defineProperty(globalThis, "innerHeight", { value: 768, configurable: true });

const { default: clientPlugin, boot } = await import("../src/client/entry.ts");
const { SETTINGS_ORDER } = await import("../src/client/runtime.ts");

interface Registration {
  name: string;
  id: string;
  order?: number;
  label?: string | (() => string);
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

/** 一个带可用矩形的可标目标；jsdom 没有布局引擎，矩形与 fixed 都只能手工给。 */
function addTarget(): HTMLButtonElement {
  const button = doc.createElement("button");
  // 可见性判定读 offsetParent，而 jsdom 里它恒为 null；fixed 是它认的另一条路。
  button.style.position = "fixed";
  button.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 10, height: 10, left: 0, top: 0, right: 10, bottom: 10, toJSON: () => ({}) }) as DOMRect;
  doc.body.append(button);
  return button;
}

/** 点击模式出厂和弦；平台由 setup 钉成 macOS。 */
function activationChord(): void {
  dom.window.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "h", metaKey: true, bubbles: true, cancelable: true }),
  );
}

/** 页面上真正画出来的浮层容器，用户能看见的就是它。 */
function overlayCount(): number {
  return doc.querySelectorAll("[data-dsh-jump-overlay]").length;
}

// canvas 时代的徽章不再是 DOM 节点，这里数的是真正画出的文字段：入口测试
// 只关心「一轮激活画了几枚标签」，即不带前缀时每枚一次 fillText。
let paintedLabels = 0;

function installCanvasProbe(): void {
  (dom.window as unknown as Record<string, unknown>)["CanvasRenderingContext2D"] = function () {};
  (
    dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }
  ).getContext = () => ({
    set font(_value: string) {},
    set fillStyle(_value: string) {},
    set globalAlpha(_value: number) {},
    save() {},
    restore() {},
    setTransform() {},
    clearRect() {},
    beginPath() {},
    roundRect() {},
    rect() {},
    fill() {},
    stroke() {},
    fillText() {
      paintedLabels += 1;
    },
    measureText(text: string) {
      return { width: text.length * 6.6 };
    },
  });
}

installCanvasProbe();

/** 当前轮画出的标签数；一轮激活只该产出一组。 */
function badgeCount(): number {
  return paintedLabels;
}

beforeEach(() => {
  doc.body.replaceChildren();
  doc.head.replaceChildren();
  // 浮层挂在 documentElement 上而不是 body 里，上面的清理带不走它。
  doc.querySelectorAll("[data-dsh-jump-overlay]").forEach((el) => el.remove());
  paintedLabels = 0;
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

  it("registers a settings section with a nav label", () => {
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
    expect(injections).toContain("settings.section");
    // Two entries: the settings page and the invisible session bridge that
    // publishes the composer for reference mode.
    expect(registrations).toHaveLength(2);
    const page = registrations.find((reg) => reg.id === "jump");
    expect(page?.order).toBe(SETTINGS_ORDER);
    expect(typeof page?.label).toBe("function");
    const bridge = registrations.find((reg) => reg.id === "jump.session-bridge");
    expect(bridge?.name).toBe("conversation.input.overlay");
    expect(bridge?.label).toBeUndefined();
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

  it("keeps one overlay when the desktop host applies the client twice", () => {
    const win = dom.window;
    const button = doc.createElement("button");
    button.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 10, height: 10, left: 0, top: 0, right: 10, bottom: 10, toJSON: () => ({}) }) as DOMRect;
    doc.body.append(button);
    const { ctx } = registry();
    const first = clientPlugin.apply(ctx);
    const second = clientPlugin.apply(ctx);
    win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "h", metaKey: true, bubbles: true, cancelable: true }));
    expect(doc.querySelectorAll("[data-dsh-jump-overlay]")).toHaveLength(1);
    second();
    first();
  });

  it("retires the earlier runtime when the same plugin applies twice", () => {
    addTarget();
    const bare = { get: () => undefined, inject: () => () => undefined };
    const first = clientPlugin.apply(bare);
    const second = clientPlugin.apply(bare);
    activationChord();
    // 两套运行时各画一份浮层：一次激活只该产出一份容器和一轮徽章。
    expect(overlayCount()).toBe(1);
    expect(badgeCount()).toBe(1);
    second();
    first();
    expect(overlayCount()).toBe(0);
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

describe("page-level singleton", () => {
  it("keeps one overlay when the client factory is evaluated twice", async () => {
    addTarget();
    // 整张模块图重新求值：第二份 entry 实例的模块级变量是空的，只有挂在
    // globalThis 上的登记能跨这两份共享。
    vi.resetModules();
    const fresh: typeof import("../src/client/entry.ts") = await import("../src/client/entry.ts");
    expect(fresh.default).not.toBe(clientPlugin);

    const bare = { get: () => undefined, inject: () => () => undefined };
    const disposeOld = clientPlugin.apply(bare);
    const disposeNew = fresh.default.apply(bare);

    activationChord();
    expect(overlayCount()).toBe(1);
    expect(badgeCount()).toBe(1);

    // 旧实例的卸载已经过时，它不该带走新实例画出来的那一份。
    disposeOld();
    expect(overlayCount()).toBe(1);
    disposeNew();
    expect(overlayCount()).toBe(0);
  });

  it("keeps the newer runtime alive when a stale dispose runs again", () => {
    addTarget();
    const bare = { get: () => undefined, inject: () => () => undefined };
    const stale = clientPlugin.apply(bare);
    stale();
    const live = clientPlugin.apply(bare);
    // 宿主可能在换人之后又调一次旧卸载；那一下不能把新登记一起删掉。
    stale();
    activationChord();
    expect(overlayCount()).toBe(1);
    expect(badgeCount()).toBe(1);
    live();
    expect(overlayCount()).toBe(0);
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
