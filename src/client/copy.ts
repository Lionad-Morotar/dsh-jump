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
  /** Heading over the reference-mode row. */
  referenceTitle: string;
  /** One line under the reference-mode heading. */
  referenceDescription: string;
  /** Shown in place of a chord while focus mode has none. */
  focusDisabled: string;
  /** The control that unbinds focus mode again. */
  focusDisable: string;
  /** Shown in place of a chord while reference mode has none. */
  referenceDisabled: string;
  /** The control that unbinds reference mode again. */
  referenceDisable: string;
  /** Why reference mode cannot be used right now, when it cannot. */
  referenceNeedsSession: string;
  /** One-shot notice when a chip's element can no longer be found on the page. */
  referenceLost: string;
  /** One-shot notice when the element exists but the page would not scroll to it. */
  referenceHidden: string;
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
  /** Accessible name for the reference-mode chord button. */
  referenceName: string;
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
  focusDescription: "默认未启用。录制一个和弦后，选中目标只把焦点移过去。",
  focusDisabled: "未启用",
  focusDisable: "关闭聚焦模式",
  referenceTitle: "引用模式",
  referenceDescription: "选中后把该元素作为引用插入输入框，不点击也不移动焦点。",
  referenceDisabled: "未启用",
  referenceDisable: "关闭引用模式",
  referenceNeedsSession: "需要先打开一个会话，引用要插进它的输入框。",
  referenceLost: "找不到引用的那个元素了，它可能已被页面移除。",
  referenceHidden: "找到了那个元素，但页面没有滚动过去。",
  recording: "按下快捷键",
  recordingHint: "Esc 取消",
  reset: "恢复默认",
  clickName: "点击模式的快捷键",
  focusName: "聚焦模式的快捷键",
  referenceName: "引用模式的快捷键",
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
  focusDescription: "Off by default. Record a shortcut and the selected target only receives focus.",
  focusDisabled: "Off",
  focusDisable: "Turn off focus mode",
  referenceTitle: "Reference mode",
  referenceDescription: "The selected element is inserted into the composer as a reference; nothing is clicked and focus does not move.",
  referenceDisabled: "Off",
  referenceDisable: "Turn off reference mode",
  referenceNeedsSession: "Open a session first: the reference is inserted into its composer.",
  referenceLost: "The referenced element could not be found; the page may have removed it.",
  referenceHidden: "The element is there, but the page would not scroll to it.",
  recording: "Press a shortcut",
  recordingHint: "Esc to cancel",
  reset: "Restore default",
  clickName: "Click-mode shortcut",
  focusName: "Focus-mode shortcut",
  referenceName: "Reference-mode shortcut",
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
