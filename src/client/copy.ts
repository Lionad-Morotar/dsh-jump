/**
 * The settings surface's copy, one dictionary per language.
 *
 * Kept as data rather than inline strings so the labels, the descriptions and
 * the rejection reasons cannot drift apart between the two languages, and so a
 * test can assert a message without reaching into the component.
 */
import type { BindingIssue } from "./bindings.ts";

export interface Copy {
  /** The settings nav label; a section shows it beside the gear glyph. */
  navLabel: string;
  /** The page title. */
  title: string;
  /** The line under the page title: what the two chords do. */
  description: string;
  /** Heading over the click-mode row. */
  clickTitle: string;
  /** One line under the click-mode heading. */
  clickDescription: string;
  /** Heading over the focus-mode row. */
  focusTitle: string;
  /** One line under the focus-mode heading. */
  focusDescription: string;
  /** Shown in place of a chord while the reader is pressing keys. */
  recording: string;
  /** The instruction under the rows while recording. */
  recordingHint: string;
  /** The per-row restore control. */
  reset: string;
  /** Accessible name for the click-mode chord button. */
  clickName: string;
  /** Accessible name for the focus-mode chord button. */
  focusName: string;
  /** The note about how a bare named key behaves while typing. */
  bareNote: string;
  /** Why a chord was refused, keyed by the code the recorder reports. */
  issues: Record<BindingIssue, string>;
}

export const ZH: Copy = {
  navLabel: "跳跃导航",
  title: "跳跃导航",
  description: "按下组合键后，用字母标签选中要点击或聚焦的目标。",
  clickTitle: "点击模式",
  clickDescription: "选中后触发一次完整的点击。",
  focusTitle: "聚焦模式",
  focusDescription: "选中后只把焦点移过去。",
  recording: "按下快捷键",
  recordingHint: "Esc 取消",
  reset: "恢复默认",
  clickName: "点击模式的快捷键",
  focusName: "聚焦模式的快捷键",
  bareNote: "Insert、F1 这类不产生字符的键可以不配修饰键；在输入框里它们仍归输入框。",
  issues: {
    "no-modifier": "单个字符的键需要⌘或⌃或⌥，不产生字符的键（Insert、F1 等）可以直接用",
    "reserved-key": "这个键被界面占用了",
    duplicate: "已经分配给另一个模式",
  },
};

export const EN: Copy = {
  navLabel: "Jump navigation",
  title: "Jump navigation",
  description: "Press a shortcut, then type a label to click or focus a target.",
  clickTitle: "Click mode",
  clickDescription: "The selected target receives a full click.",
  focusTitle: "Focus mode",
  focusDescription: "The selected target only receives focus.",
  recording: "Press a shortcut",
  recordingHint: "Esc to cancel",
  reset: "Restore default",
  clickName: "Click-mode shortcut",
  focusName: "Focus-mode shortcut",
  bareNote: "Keys that print nothing, such as Insert or F1, can be bound bare; while a text field has focus they still belong to it.",
  issues: {
    "no-modifier": "A single-character key needs ⌘, ⌃ or ⌥; a key that prints nothing (Insert, F1) can be used bare",
    "reserved-key": "That key belongs to the interface",
    duplicate: "Already bound to the other mode",
  },
};

/** Pick a dictionary from a BCP 47 tag, defaulting to Chinese like the host. */
export function copyFor(language: string): Copy {
  return language.toLowerCase().startsWith("en") ? EN : ZH;
}
