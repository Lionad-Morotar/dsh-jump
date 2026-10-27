/**
 * The settings row's copy, one dictionary per language.
 *
 * Kept as data rather than inline strings so the label, the description and the
 * three rejection reasons cannot drift apart between the two languages, and so
 * the test can assert a message without reaching into the component.
 */
import type { BindingIssue } from "./bindings.ts";

export interface Copy {
  /** The row's title. */
  title: string;
  /** One line under it: what the two chords do. */
  description: string;
  /** Shown in place of the chord while the reader is pressing keys. */
  recording: string;
  /** The instruction under the two chords while recording. */
  recordingHint: string;
  /** The restore control. */
  reset: string;
  /** Accessible name for the click-mode chord button. */
  clickName: string;
  /** Accessible name for the focus-mode chord button. */
  focusName: string;
  /** Why a chord was refused, keyed by the code the recorder reports. */
  issues: Record<BindingIssue, string>;
}

export const ZH: Copy = {
  title: "跳跃导航快捷键",
  description: "按下组合键后，用字母标签选中点击或聚焦目标。",
  recording: "按下组合键",
  recordingHint: "Esc 取消",
  reset: "恢复默认",
  clickName: "点击模式的快捷键",
  focusName: "聚焦模式的快捷键",
  issues: {
    "no-modifier": "需要一个 ⌘ 或 ⌃ 或 ⌥ 修饰键",
    "reserved-key": "这个键被界面占用了",
    duplicate: "已经分配给另一个模式",
  },
};

export const EN: Copy = {
  title: "Jump navigation shortcuts",
  description: "Press a chord, then type a label to click or focus a target.",
  recording: "Press a chord",
  recordingHint: "Esc to cancel",
  reset: "Restore defaults",
  clickName: "Click-mode shortcut",
  focusName: "Focus-mode shortcut",
  issues: {
    "no-modifier": "Needs a ⌘, ⌃ or ⌥ modifier",
    "reserved-key": "That key belongs to the interface",
    duplicate: "Already bound to the other mode",
  },
};

/** Pick a dictionary from a BCP 47 tag, defaulting to Chinese like the host. */
export function copyFor(language: string): Copy {
  return language.toLowerCase().startsWith("en") ? EN : ZH;
}
