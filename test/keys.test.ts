/**
 * matchKey 状态机契约：激活键、label 前缀推进、退出与忽略。
 * 事件是纯数据形状，不依赖 DOM Event 类型。
 */
import { describe, expect, it } from "vitest";

import { createKeyState, matchKey } from "../src/client/keys.ts";
import { ACTIVATION_CLICK, ACTIVATION_FOCUS, HOME_ROW_KEYS } from "../src/client/config.ts";

type Mods = Partial<{ shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; isComposing: boolean }>;

function key(k: string, mods: Mods = {}) {
  return { key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, ...mods };
}

const LABELS = [...HOME_ROW_KEYS];

describe("activation", () => {
  it("meta+h in idle activates click mode", () => {
    expect(matchKey(createKeyState(), key(ACTIVATION_CLICK, { metaKey: true }))).toEqual({ type: "activate-click" });
  });

  it("meta+u in idle activates focus mode", () => {
    expect(matchKey(createKeyState(), key(ACTIVATION_FOCUS, { metaKey: true }))).toEqual({ type: "activate-focus" });
  });

  it("plain h or u without meta does not activate", () => {
    expect(matchKey(createKeyState(), key(ACTIVATION_CLICK))).toEqual({ type: "ignore" });
    expect(matchKey(createKeyState(), key(ACTIVATION_FOCUS))).toEqual({ type: "ignore" });
  });

  it("shift or alt alongside meta does not activate", () => {
    expect(matchKey(createKeyState(), key(ACTIVATION_CLICK, { metaKey: true, shiftKey: true }))).toEqual({ type: "ignore" });
    expect(matchKey(createKeyState(), key(ACTIVATION_CLICK, { metaKey: true, altKey: true }))).toEqual({ type: "ignore" });
  });

  it("ctrl+h does not activate", () => {
    expect(matchKey(createKeyState(), key(ACTIVATION_CLICK, { ctrlKey: true }))).toEqual({ type: "ignore" });
  });

  it("activation moves the state out of idle", () => {
    const state = createKeyState();
    matchKey(state, key(ACTIVATION_CLICK, { metaKey: true }));
    expect(state.mode).toBe("click");
  });
});

describe("label prefix matching", () => {
  it("a single-key label emits a label action and leaves no pending prefix", () => {
    const state = createKeyState();
    matchKey(state, key(ACTIVATION_CLICK, { metaKey: true }));
    expect(matchKey(state, key("a"), LABELS)).toEqual({ type: "label", key: "a" });
    expect(state.pending).toBe("");
  });

  it("the first half of a two-key label goes pending, the second completes it", () => {
    const labels = ["as", "ad"];
    const state = createKeyState();
    matchKey(state, key(ACTIVATION_FOCUS, { metaKey: true }));
    expect(matchKey(state, key("a"), labels)).toEqual({ type: "label", key: "a" });
    expect(state.pending).toBe("a");
    expect(matchKey(state, key("s"), labels)).toEqual({ type: "label", key: "s" });
    expect(state.pending).toBe("");
  });

  it("a key matching no label resets the pending prefix", () => {
    const labels = ["as"];
    const state = createKeyState();
    matchKey(state, key(ACTIVATION_CLICK, { metaKey: true }));
    matchKey(state, key("a"), labels);
    expect(matchKey(state, key("z"), labels)).toEqual({ type: "ignore" });
    expect(state.pending).toBe("");
    expect(matchKey(state, key("s"), labels)).toEqual({ type: "ignore" });
  });

  it("keys outside the home row are ignored in active mode", () => {
    const state = createKeyState();
    matchKey(state, key(ACTIVATION_CLICK, { metaKey: true }));
    expect(matchKey(state, key("m"), LABELS)).toEqual({ type: "ignore" });
  });

  it("shifted or composing label keys are ignored", () => {
    const state = createKeyState();
    matchKey(state, key(ACTIVATION_CLICK, { metaKey: true }));
    expect(matchKey(state, key("a", { shiftKey: true }), LABELS)).toEqual({ type: "ignore" });
    expect(matchKey(state, key("a", { isComposing: true }), LABELS)).toEqual({ type: "ignore" });
  });
});

describe("exit", () => {
  it("Esc in active mode exits back to idle", () => {
    const state = createKeyState();
    matchKey(state, key(ACTIVATION_CLICK, { metaKey: true }));
    expect(matchKey(state, key("Escape"))).toEqual({ type: "exit" });
    expect(state.mode).toBe("idle");
  });

  it("Esc in idle is ignored", () => {
    expect(matchKey(createKeyState(), key("Escape"))).toEqual({ type: "ignore" });
  });

  it("the meta key itself exits active mode, and repeated activation keys exit too", () => {
    const state = createKeyState();
    matchKey(state, key(ACTIVATION_CLICK, { metaKey: true }));
    expect(matchKey(state, key("Meta", { metaKey: true }))).toEqual({ type: "exit" });
    expect(state.mode).toBe("idle");
    matchKey(state, key(ACTIVATION_CLICK, { metaKey: true }));
    expect(matchKey(state, key(ACTIVATION_CLICK, { metaKey: true }))).toEqual({ type: "exit" });
    expect(state.mode).toBe("idle");
  });
});
