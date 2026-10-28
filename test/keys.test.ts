/**
 * matchKey 状态机契约：激活键、label 前缀推进、退出与忽略。
 * 事件是纯数据形状，不依赖 DOM Event 类型。
 */
import { describe, expect, it } from "vitest";

import { createDefaultBindings } from "../src/client/bindings.ts";
import { HOME_ROW_KEYS } from "../src/client/config.ts";
import { createKeyState, matchKey } from "../src/client/keys.ts";

type Mods = Partial<{ shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; isComposing: boolean }>;

function key(k: string, mods: Mods = {}) {
  return { key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, ...mods };
}

const LABELS = [...HOME_ROW_KEYS];
const MAC = createDefaultBindings("macos");
const OTHER = createDefaultBindings("other");

describe("bare named chord as the activation", () => {
  const BARE = {
    click: { key: "Insert", meta: false, alt: false, ctrl: false, shift: false },
    focus: { key: "F2", meta: false, alt: false, ctrl: false, shift: false },
  };

  it("activates on the bare key", () => {
    expect(matchKey(createKeyState(), key("Insert"), [], BARE)).toEqual({ type: "activate-click" });
  });

  it("leaves when the same bare key is pressed again", () => {
    // 裸键没有修饰键，"任意修饰键即退出"那条分支罩不住它；不显式比对，
    // 它就会成为唯一一个不能用键盘取消的激活键。
    const state = createKeyState();
    matchKey(state, key("Insert"), [], BARE);
    expect(matchKey(state, key("Insert"), LABELS, BARE)).toEqual({ type: "exit" });
    expect(state.mode).toBe("idle");
  });

  it("still leaves on Escape and on any modifier stroke", () => {
    const a = createKeyState();
    matchKey(a, key("Insert"), [], BARE);
    expect(matchKey(a, key("Escape"), LABELS, BARE)).toEqual({ type: "exit" });

    const b = createKeyState();
    matchKey(b, key("Insert"), [], BARE);
    expect(matchKey(b, key("q", { metaKey: true }), LABELS, BARE)).toEqual({ type: "exit" });
  });
});

describe("activation", () => {
  it("meta+h in idle activates click mode", () => {
    expect(matchKey(createKeyState(), key("h", { metaKey: true }), LABELS, MAC)).toEqual({ type: "activate-click" });
  });

  it("meta+u in idle activates focus mode", () => {
    expect(matchKey(createKeyState(), key("u", { metaKey: true }), LABELS, MAC)).toEqual({ type: "activate-focus" });
  });

  it("plain h or u without meta does not activate", () => {
    expect(matchKey(createKeyState(), key("h"), LABELS, MAC)).toEqual({ type: "ignore" });
    expect(matchKey(createKeyState(), key("u"), LABELS, MAC)).toEqual({ type: "ignore" });
  });

  it("shift or alt alongside meta does not activate", () => {
    expect(matchKey(createKeyState(), key("h", { metaKey: true, shiftKey: true }), LABELS, MAC)).toEqual({ type: "ignore" });
    expect(matchKey(createKeyState(), key("h", { metaKey: true, altKey: true }), LABELS, MAC)).toEqual({ type: "ignore" });
  });

  it("ctrl+h does not activate on a mac keymap", () => {
    expect(matchKey(createKeyState(), key("h", { ctrlKey: true }), LABELS, MAC)).toEqual({ type: "ignore" });
  });

  it("activation moves the state out of idle", () => {
    const state = createKeyState();
    matchKey(state, key("h", { metaKey: true }), LABELS, MAC);
    expect(state.mode).toBe("click");
  });

  it("follows the configured chord rather than the shipped letter", () => {
    const custom = { click: { key: "k", meta: true, alt: true, ctrl: false, shift: false }, focus: { key: "j", meta: false, alt: false, ctrl: true, shift: false } };
    expect(matchKey(createKeyState(), key("k", { metaKey: true, altKey: true }), LABELS, custom)).toEqual({ type: "activate-click" });
    expect(matchKey(createKeyState(), key("j", { ctrlKey: true }), LABELS, custom)).toEqual({ type: "activate-focus" });
    // 旧默认值不再生效
    expect(matchKey(createKeyState(), key("h", { metaKey: true }), LABELS, custom)).toEqual({ type: "ignore" });
    expect(matchKey(createKeyState(), key("u", { metaKey: true }), LABELS, custom)).toEqual({ type: "ignore" });
  });

  it("uses the platform keymap, where primary is control off a mac", () => {
    expect(matchKey(createKeyState(), key("h", { ctrlKey: true }), LABELS, OTHER)).toEqual({ type: "activate-click" });
    expect(matchKey(createKeyState(), key("h", { metaKey: true }), LABELS, OTHER)).toEqual({ type: "ignore" });
  });

  it("does not start a round mid-composition", () => {
    expect(matchKey(createKeyState(), key("h", { metaKey: true, isComposing: true }), LABELS, MAC)).toEqual({ type: "ignore" });
  });
});

describe("label prefix matching", () => {
  it("a single-key label emits a label action and leaves no pending prefix", () => {
    const state = createKeyState();
    matchKey(state, key("h", { metaKey: true }), LABELS, MAC);
    expect(matchKey(state, key("a"), LABELS, MAC)).toEqual({ type: "label", key: "a" });
    expect(state.pending).toBe("");
  });

  it("the first half of a two-key label goes pending, the second completes it", () => {
    const labels = ["as", "ad"];
    const state = createKeyState();
    matchKey(state, key("u", { metaKey: true }), LABELS, MAC);
    expect(matchKey(state, key("a"), labels, MAC)).toEqual({ type: "label", key: "a" });
    expect(state.pending).toBe("a");
    expect(matchKey(state, key("s"), labels, MAC)).toEqual({ type: "label", key: "s" });
    expect(state.pending).toBe("");
  });

  it("treats a pure two-key label set as prefixes until the second key lands", () => {
    // collectHints hands out equal-length two-key labels past nine hints, so
    // the first character must stay pending instead of completing a hit.
    const labels = ["as", "ad", "sd"];
    const state = createKeyState();
    matchKey(state, key("h", { metaKey: true }), LABELS, MAC);
    expect(matchKey(state, key("s"), labels, MAC)).toEqual({ type: "label", key: "s" });
    expect(state.pending).toBe("s");
    expect(matchKey(state, key("d"), labels, MAC)).toEqual({ type: "label", key: "d" });
    expect(state.pending).toBe("");
  });

  it("a key matching no label resets the pending prefix", () => {
    const labels = ["as"];
    const state = createKeyState();
    matchKey(state, key("h", { metaKey: true }), LABELS, MAC);
    matchKey(state, key("a"), labels, MAC);
    expect(matchKey(state, key("z"), labels, MAC)).toEqual({ type: "ignore" });
    expect(state.pending).toBe("");
    expect(matchKey(state, key("s"), labels, MAC)).toEqual({ type: "ignore" });
  });

  it("keys outside the home row are ignored in active mode", () => {
    const state = createKeyState();
    matchKey(state, key("h", { metaKey: true }), LABELS, MAC);
    expect(matchKey(state, key("m"), LABELS, MAC)).toEqual({ type: "ignore" });
  });

  it("shifted or composing label keys are ignored", () => {
    const state = createKeyState();
    matchKey(state, key("h", { metaKey: true }), LABELS, MAC);
    expect(matchKey(state, key("a", { shiftKey: true }), LABELS, MAC)).toEqual({ type: "ignore" });
    expect(matchKey(state, key("a", { isComposing: true }), LABELS, MAC)).toEqual({ type: "ignore" });
  });
});

describe("exit", () => {
  it("Esc in active mode exits back to idle", () => {
    const state = createKeyState();
    matchKey(state, key("h", { metaKey: true }), LABELS, MAC);
    expect(matchKey(state, key("Escape"), LABELS, MAC)).toEqual({ type: "exit" });
    expect(state.mode).toBe("idle");
  });

  it("Esc in idle is ignored", () => {
    expect(matchKey(createKeyState(), key("Escape"), LABELS, MAC)).toEqual({ type: "ignore" });
  });

  it("any modified stroke in active mode exits instead of typing a label", () => {
    const state = createKeyState();
    matchKey(state, key("h", { metaKey: true }), LABELS, MAC);
    expect(matchKey(state, key("Meta", { metaKey: true }), LABELS, MAC)).toEqual({ type: "exit" });
    expect(state.mode).toBe("idle");
    // 重新按下激活键同样是退出而不是重开一轮
    matchKey(state, key("h", { metaKey: true }), LABELS, MAC);
    expect(matchKey(state, key("h", { metaKey: true }), LABELS, MAC)).toEqual({ type: "exit" });
    expect(state.mode).toBe("idle");
  });

  it("exits on a non-primary modifier too, so a remapped chord cannot be half-typed", () => {
    const custom = { click: { key: "k", meta: false, alt: true, ctrl: false, shift: false }, focus: { key: "j", meta: false, alt: false, ctrl: true, shift: false } };
    const state = createKeyState();
    matchKey(state, key("k", { altKey: true }), LABELS, custom);
    expect(state.mode).toBe("click");
    expect(matchKey(state, key("k", { ctrlKey: true }), LABELS, custom)).toEqual({ type: "exit" });
    expect(state.mode).toBe("idle");
  });
});
