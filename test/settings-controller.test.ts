/**
 * 设置行状态机的契约：进入录制、提交、拒绝后重试、取消与恢复默认。
 *
 * 视图只做投影，状态全在这里，所以这一层覆盖了"点了录制之后按什么键会发生
 * 什么"的全部规则，不需要渲染任何 React 组件。
 */
import { describe, expect, it, vi } from "vitest";

import { createDefaultBindings } from "../src/client/bindings.ts";
import { createBindingsController } from "../src/client/settings-controller.ts";
import { createBindingsStore, type BindingsStorage } from "../src/client/store.ts";

const MAC = createDefaultBindings("macos");

function memory(): BindingsStorage {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
}

function setup() {
  const store = createBindingsStore({ storage: memory(), platform: "macos" });
  const controller = createBindingsController({ store, platform: "macos" });
  return { store, controller };
}

type Mods = Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean }>;

function press(over: Mods = {}) {
  return { key: "k", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, ...over };
}

describe("createBindingsController", () => {
  it("starts idle with the platform defaults", () => {
    const { controller } = setup();
    expect(controller.getState()).toEqual({ bindings: MAC, recording: null, issue: null });
  });

  it("enters recording for one action at a time", () => {
    const { controller } = setup();
    controller.begin("click");
    expect(controller.getState().recording).toBe("click");
    controller.begin("focus");
    expect(controller.getState().recording).toBe("focus");
    expect(controller.getState().issue).toBeNull();
  });

  it("ignores strokes when nothing is being recorded", () => {
    const { controller } = setup();
    expect(controller.press(press({ key: "k", metaKey: true }))).toBe("idle");
    expect(controller.getState().bindings).toEqual(MAC);
  });

  it("commits an accepted chord and leaves recording", () => {
    const { controller, store } = setup();
    controller.begin("click");
    expect(controller.press(press({ key: "k", metaKey: true, altKey: true }))).toBe("saved");
    expect(controller.getState()).toEqual({
      bindings: { click: { key: "k", meta: true, alt: true, ctrl: false, shift: false }, focus: MAC.focus },
      recording: null,
      issue: null,
    });
    expect(store.get().click.key).toBe("k");
  });

  it("keeps recording after a rejected chord, so the reader can try again", () => {
    const { controller } = setup();
    controller.begin("click");
    expect(controller.press(press({ key: "u", metaKey: true }))).toBe("rejected");
    expect(controller.getState().recording).toBe("click");
    expect(controller.getState().issue).toBe("duplicate");
    // 接着按一个合法键就成功，拒绝状态被清掉
    expect(controller.press(press({ key: "k", metaKey: true }))).toBe("saved");
    expect(controller.getState().issue).toBeNull();
  });

  it("waits through a modifier-only stroke and an open composition", () => {
    const { controller } = setup();
    controller.begin("click");
    expect(controller.press(press({ key: "Meta", metaKey: true }))).toBe("pending");
    expect(controller.press(press({ key: "k", metaKey: true, isComposing: true }))).toBe("pending");
    expect(controller.getState().recording).toBe("click");
  });

  it("cancels on Escape without touching the binding", () => {
    const { controller, store } = setup();
    controller.begin("click");
    expect(controller.press(press({ key: "Escape" }))).toBe("cancelled");
    expect(controller.getState().recording).toBeNull();
    expect(store.get()).toEqual(MAC);
  });

  it("clears a stale rejection when recording restarts", () => {
    const { controller } = setup();
    controller.begin("click");
    controller.press(press({ key: "u", metaKey: true }));
    expect(controller.getState().issue).toBe("duplicate");
    controller.begin("focus");
    expect(controller.getState().issue).toBeNull();
  });

  it("restores the defaults and drops any recording", () => {
    const { controller, store } = setup();
    controller.begin("click");
    controller.press(press({ key: "k", metaKey: true, altKey: true }));
    controller.begin("focus");
    controller.reset();
    expect(controller.getState()).toEqual({ bindings: MAC, recording: null, issue: null });
    expect(store.get()).toEqual(MAC);
  });

  it("mirrors a change made elsewhere, such as another tab", () => {
    const { controller, store } = setup();
    const listener = vi.fn();
    const off = controller.subscribe(listener);

    store.set({ ...MAC, click: { key: "p", meta: true, alt: false, ctrl: false, shift: false } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.getState().bindings.click.key).toBe("p");

    off();
    store.set({ ...MAC, click: { key: "q", meta: true, alt: false, ctrl: false, shift: false } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  describe("resetAction", () => {
    it("restores only the named action", () => {
      const { controller, store } = setup();
      controller.begin("click");
      controller.press(press({ key: "k", metaKey: true, altKey: true }));
      controller.begin("focus");
      controller.press(press({ key: "j", ctrlKey: true, shiftKey: true }));
      expect(store.get().focus.key).toBe("j");

      controller.resetAction("click");
      expect(store.get().click).toEqual(MAC.click);
      // 重置一个不该动另一个：页面把两者呈现为独立的行，读者点哪行的
      // 恢复就只该还原哪行。
      expect(store.get().focus.key).toBe("j");
    });

    it("sweeps a resulting collision onto the other action's default", () => {
      // 录制器不允许现存的重复，但"改过再还原"能造出来：先把 click 挪走，
      // 再把 focus 改成 click 的出厂键，最后把 click 还原，两者就撞上了。
      // 直接写文档（模拟另一个标签页或旧版本留下的状态）同样能到这一步。
      const { controller, store } = setup();
      controller.begin("click");
      controller.press(press({ key: "k", metaKey: true, altKey: true }));
      controller.begin("focus");
      controller.press(press({ key: "h", metaKey: true }));
      expect(store.get().focus.key).toBe("h");

      controller.resetAction("click");
      expect(store.get().click).toEqual(MAC.click);
      // 撞上就必须一起扫开，否则还原会产出一个运行时永远轮不到的重复键。
      expect(store.get().focus).toEqual(MAC.focus);
    });

    it("drops an open recording", () => {
      const { controller } = setup();
      controller.begin("click");
      controller.resetAction("focus");
      expect(controller.getState().recording).toBeNull();
    });
  });

  it("exposes the action the reader is recording and the chord it will replace", () => {
    const { controller } = setup();
    expect(controller.getState().recording).toBeNull();
    controller.begin("focus");
    expect(controller.getState().recording).toBe("focus");
    expect(controller.getState().bindings.focus).toEqual(MAC.focus);
  });
});
