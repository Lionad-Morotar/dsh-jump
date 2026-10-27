/**
 * 录键器的纯逻辑契约：把一次真实 keydown 变成候选绑定、拒绝理由或取消。
 *
 * 录键器与运行时匹配必须用同一套校验，否则设置页会接受一个运行时永远认不出
 * 的键，用户按下去毫无反应。
 */
import { describe, expect, it } from "vitest";

import { createDefaultBindings } from "../src/client/bindings.ts";
import { recordChord } from "../src/client/recorder.ts";

const MAC = createDefaultBindings("macos");

type Mods = Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean }>;

function event(over: Mods = {}) {
  return { key: "k", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, ...over };
}

describe("recordChord", () => {
  it("records the chord the user pressed", () => {
    expect(recordChord(event({ key: "k", metaKey: true, altKey: true }), [MAC.focus], "macos")).toEqual({
      status: "accepted",
      binding: { key: "k", meta: true, alt: true, ctrl: false, shift: false },
    });
  });

  it("waits while only a modifier is held down", () => {
    for (const key of ["Meta", "Control", "Alt", "Shift"]) {
      expect(recordChord(event({ key, metaKey: true }), [MAC.focus], "macos"), key).toEqual({ status: "pending" });
    }
  });

  it("cancels on Escape", () => {
    expect(recordChord(event({ key: "Escape" }), [MAC.focus], "macos")).toEqual({ status: "cancel" });
  });

  it("refuses an unchanged modifier-only or bare stroke", () => {
    expect(recordChord(event({ key: "k" }), [MAC.focus], "macos")).toEqual({ status: "rejected", issue: "no-modifier" });
    expect(recordChord(event({ key: "k", shiftKey: true }), [MAC.focus], "macos")).toEqual({ status: "rejected", issue: "no-modifier" });
  });

  it("refuses keys the control flow owns", () => {
    expect(recordChord(event({ key: "Tab", metaKey: true }), [MAC.focus], "macos")).toEqual({ status: "rejected", issue: "reserved-key" });
    expect(recordChord(event({ key: " ", metaKey: true }), [MAC.focus], "macos")).toEqual({ status: "rejected", issue: "reserved-key" });
  });

  it("refuses a chord the other action already holds", () => {
    expect(recordChord(event({ key: "u", metaKey: true }), [MAC.focus], "macos")).toEqual({ status: "rejected", issue: "duplicate" });
  });

  it("records nothing while an IME composition is open", () => {
    // 组字中的按键属于输入法，收下来会绑出一个用户按不出来的键
    expect(recordChord(event({ key: "k", metaKey: true, isComposing: true }), [MAC.focus], "macos")).toEqual({ status: "pending" });
  });

  it("does not mistake the other action's own chord for a duplicate of itself", () => {
    // 给 click 换键时，旧值不算占用
    expect(recordChord(event({ key: "h", metaKey: true }), [MAC.focus], "macos")).toEqual({
      status: "accepted",
      binding: { key: "h", meta: true, alt: false, ctrl: false, shift: false },
    });
  });
});
