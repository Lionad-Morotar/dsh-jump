/**
 * 快捷键绑定的纯逻辑契约：归一化、校验、匹配与展示。
 *
 * 绑定是"物理按键 + 修饰键集合"的结构化描述。激活判定与设置页录入共用同一套
 * 规则，因此这里既覆盖合法形状，也覆盖手改存储文档、系统默认值差异这类脏输入。
 */
import { describe, expect, it } from "vitest";

import {
  bindingIssue,
  bindingsEqual,
  createDefaultBindings,
  detectPlatform,
  formatBinding,
  matchesBinding,
  normalizeBinding,
  normalizeBindings,
  type JumpBinding,
} from "../src/client/bindings.ts";

const MAC = createDefaultBindings("macos");
const OTHER = createDefaultBindings("other");

function binding(over: Partial<JumpBinding> = {}): JumpBinding {
  return { key: "h", meta: true, alt: false, ctrl: false, shift: false, ...over };
}

type Mods = Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean }>;

function event(over: Mods = {}) {
  return { key: "h", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, ...over };
}

describe("defaults", () => {
  it("ships one binding per action and nothing shares a chord", () => {
    expect(Object.keys(MAC).sort()).toEqual(["click", "focus"]);
    expect(bindingsEqual(MAC.click, MAC.focus)).toBe(false);
    expect(bindingIssue(MAC.click, [MAC.focus])).toBeNull();
    expect(bindingIssue(MAC.focus, [MAC.click])).toBeNull();
  });

  it("uses the platform's own primary modifier rather than hard-coding meta", () => {
    expect(MAC.click).toEqual(binding({ key: "h", meta: true }));
    expect(MAC.focus).toEqual(binding({ key: "u", meta: true }));
    expect(OTHER.click).toEqual(binding({ key: "h", meta: false, ctrl: true }));
    expect(OTHER.focus).toEqual(binding({ key: "u", meta: false, ctrl: true }));
  });

  it("detects a mac host from the navigator platform string", () => {
    expect(detectPlatform("MacIntel")).toBe("macos");
    expect(detectPlatform("iPhone")).toBe("macos");
    expect(detectPlatform("Win32")).toBe("other");
    expect(detectPlatform("Linux x86_64")).toBe("other");
    // 空报告是"环境没说"，落在历史默认值而不是猜一个平台
    expect(detectPlatform("")).toBe("macos");
    expect(detectPlatform("   ")).toBe("macos");
  });
});

describe("normalizeBinding", () => {
  it("lowercases a single-character key but keeps named keys intact", () => {
    expect(normalizeBinding({ key: "H", meta: true }, binding()).key).toBe("h");
    expect(normalizeBinding({ key: "F5", meta: true }, binding()).key).toBe("F5");
    expect(normalizeBinding({ key: " ", meta: true }, binding()).key).toBe(" ");
  });

  it("fills missing modifiers with false rather than inheriting them from the fallback", () => {
    expect(normalizeBinding({ key: "k", ctrl: true }, binding({ alt: true }))).toEqual({
      key: "k",
      meta: false,
      alt: false,
      ctrl: true,
      shift: false,
    });
  });

  it("falls back wholesale for anything that is not a usable binding", () => {
    const fallback = binding();
    for (const bad of [undefined, null, 7, "h", [], { key: 3 }, { meta: true }, { key: "" }]) {
      expect(normalizeBinding(bad, fallback), JSON.stringify(bad)).toEqual(fallback);
    }
  });

  it("normalizes a whole pair and falls back per action, not for the pair", () => {
    const pair = normalizeBindings({ click: { key: "k", ctrl: true }, focus: "nonsense" });
    expect(pair.click).toEqual({ key: "k", meta: false, alt: false, ctrl: true, shift: false });
    expect(pair.focus).toEqual(MAC.focus);
  });

  it("accepts a single letter as the legacy config shape, meta implied", () => {
    expect(normalizeBinding("k", binding({ key: "z" }), "macos")).toEqual({
      key: "k",
      meta: true,
      alt: false,
      ctrl: false,
      shift: false,
    });
    expect(normalizeBinding("K", binding({ key: "z" }), "other").key).toBe("k");
    expect(normalizeBinding("K", binding({ key: "z" }), "other").ctrl).toBe(true);
    expect(normalizeBinding("kk", binding({ key: "z" }), "macos").key).toBe("z");
  });
});

describe("bindingIssue", () => {
  it("requires a modifier beyond shift", () => {
    expect(bindingIssue(binding({ meta: false }), [])).toBe("no-modifier");
    expect(bindingIssue(binding({ meta: false, shift: true }), [])).toBe("no-modifier");
  });

  it("rejects keys the control flow already owns", () => {
    for (const key of [
      "Escape",
      "Tab",
      "Enter",
      " ",
      "Backspace",
      "Delete",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Dead",
      "CapsLock",
      "AltGraph",
      "Unidentified",
      "",
    ]) {
      expect(bindingIssue(binding({ key }), []), key).toBe("reserved-key");
    }
  });

  it("rejects a bare modifier key, which no keydown can report on its own", () => {
    for (const key of ["Meta", "Control", "Alt", "Shift"]) {
      expect(bindingIssue(binding({ key }), []), key).toBe("reserved-key");
    }
  });

  it("rejects a chord the other action already holds", () => {
    expect(bindingIssue(binding(), [binding()])).toBe("duplicate");
    // 大小写不该影响判等
    expect(bindingIssue(binding({ key: "H" }), [binding({ key: "h" })])).toBe("duplicate");
    // 修饰键多了就不冲突
    expect(bindingIssue(binding({ alt: true }), [binding()])).toBeNull();
  });

  it("accepts a bare named key that prints nothing", () => {
    // Insert / F1 / Home 这类键没有可打印字符，裸按不会在文本里留下痕迹，
    // 所以"必须带修饰键"这条规则对它们不成立。
    for (const key of ["Insert", "F1", "F12", "Home", "End", "PageUp", "PageDown"]) {
      expect(bindingIssue(binding({ key, meta: false, alt: false, ctrl: false, shift: false }), []), key).toBeNull();
    }
  });

  it("still requires a modifier on a bare printable key", () => {
    // 单个字符裸按会打字，抢走它就是抢走输入法之外的所有输入。
    for (const key of ["h", "1", "/", "F"]) {
      expect(bindingIssue(binding({ key, meta: false, alt: false, ctrl: false, shift: false }), []), key).toBe("no-modifier");
    }
  });

  it("reports modifierless named keys that the interface owns", () => {
    // 免修饰键不等于免保留：这些键即使不带修饰键也仍然属于界面。
    for (const key of ["Escape", "Tab", "Enter", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      expect(bindingIssue(binding({ key, meta: false, alt: false, ctrl: false, shift: false }), []), key).toBe("reserved-key");
    }
  });

  it("accepts ordinary chords with any non-shift modifier", () => {
    expect(bindingIssue(binding(), [])).toBeNull();
    expect(bindingIssue(binding({ meta: false, ctrl: true }), [])).toBeNull();
    expect(bindingIssue(binding({ meta: false, alt: true, shift: true }), [])).toBeNull();
    expect(bindingIssue(binding({ key: "F5", meta: false, ctrl: true }), [])).toBeNull();
    // alt / ctrl / meta 三选一都算有修饰键；shift 单独不算
    expect(bindingIssue(binding({ meta: false, alt: true }), [])).toBeNull();
  });
});

describe("matchesBinding", () => {
  it("matches only when every modifier agrees", () => {
    expect(matchesBinding(event({ metaKey: true }), binding())).toBe(true);
    expect(matchesBinding(event({ metaKey: true, shiftKey: true }), binding())).toBe(false);
    expect(matchesBinding(event({ metaKey: true, altKey: true }), binding())).toBe(false);
    expect(matchesBinding(event({ metaKey: true, ctrlKey: true }), binding())).toBe(false);
    expect(matchesBinding(event({ metaKey: false }), binding())).toBe(false);
  });

  it("compares the key case-insensitively, so a shift-carrying keydown still lands", () => {
    expect(matchesBinding(event({ key: "H", metaKey: true, shiftKey: true }), binding({ key: "h", shift: true }))).toBe(true);
  });

  it("never matches while an IME composition is open", () => {
    expect(matchesBinding(event({ metaKey: true, isComposing: true }), binding())).toBe(false);
  });

  it("supports non-meta activation chords", () => {
    expect(matchesBinding(event({ ctrlKey: true }), binding({ meta: false, ctrl: true }))).toBe(true);
    expect(matchesBinding(event({ altKey: true }), binding({ meta: false, alt: true }))).toBe(true);
  });
});

describe("formatBinding", () => {
  it("draws mac chords in the canonical modifier order", () => {
    expect(formatBinding(binding(), "macos")).toBe("⌘H");
    expect(formatBinding(binding({ alt: true, shift: true }), "macos")).toBe("⌥⇧⌘H");
    expect(formatBinding(binding({ meta: false, ctrl: true }), "macos")).toBe("⌃H");
  });

  it("spells chords out where the symbols are not universal", () => {
    expect(formatBinding(OTHER.click, "other")).toBe("Ctrl+H");
    expect(formatBinding(binding({ meta: false, ctrl: true, alt: true, shift: true }), "other")).toBe("Ctrl+Alt+Shift+H");
    expect(formatBinding(binding({ key: "h", meta: false, shift: true }), "other")).toBe("Shift+H");
    // A meta chord on a non-mac host is still Meta, not Ctrl: the field is which
    // key the user actually presses, not which one is primary there.
    expect(formatBinding(binding(), "other")).toBe("Meta+H");
  });

  it("prints named keys by their spoken name", () => {
    expect(formatBinding(binding({ key: "F5" }), "macos")).toBe("⌘F5");
    expect(formatBinding(OTHER.click, "other")).toBe("Ctrl+H");
    expect(formatBinding(binding({ key: " " }), "macos")).toBe("⌘Space");
    expect(formatBinding(binding({ key: "ArrowUp" }), "macos")).toBe("⌘↑");
  });
});
