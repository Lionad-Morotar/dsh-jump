/**
 * 目标激活语义：一轮 label 里混着两类目标，它们的"跳到它"完全不是同一件事。
 *
 * 文本输入面（textarea、有光标的 input、contenteditable、role=textbox）没有
 * click 语义：合成鼠标事件不是可信事件，浏览器不会把它们当成真实点击去放焦点，
 * 所以派发鼠标序列等于什么都没发生。这类目标只能 focus。
 *
 * 其余控件（按钮、链接、树行、复选）反过来：focus 不让它们产生行为，
 * 真实鼠标序列才会触发 React 的 onClick。
 *
 * 判定必须是纯函数。jsdom 不推导 isContentEditable，浏览器里也不该为了测试塞桩，
 * 所以这里只读元素自身的静态特征。
 */

import { TEXT_ENTRY_ROLES } from "./config.ts";

/** 一个目标需要哪种动作才能"被跳到"。 */
export type Activation = "click" | "focus";

/**
 * 带文本光标的 input 类型。
 *
 * 日期时间五类型（date/month/week/time/datetime-local）无 `selectionStart`
 * 但确有分段编辑（方向键跳段、数字键入），语义上是文本输入面；而且合成 click
 * 无法聚焦它们，归 click 会让 click 模式跳过去毫无反应。
 */
const CARET_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
]);

/** 天生就是文本输入面的标签。 */
const TEXT_ENTRY_TAGS = new Set(["TEXTAREA"]);

function isEditable(element: Element): boolean {
  const raw = element.getAttribute("contenteditable");
  if (raw === null) return false;
  // contenteditable 是枚举属性：空串与 "true" 都表示可编辑，只有 "false" 关闭。
  // 属性值大小写不敏感，所以先归一。
  return raw.trim().toLowerCase() !== "false";
}

/**
 * 判定一个元素要哪种动作。
 *
 * 顺序即优先级：先认 contenteditable（最强的可编辑信号），再按标签分流，最后才
 * 看 role。标签优先于文本输入面 role，是为了处理 `<button role=combobox>` 这种
 * ARIA 上合法、但交互上是按钮的形态——按钮没有光标，聚焦它什么都不发生，只有
 * 真实点击才展开它的弹出层。
 */
export function activationOf(element: Element): Activation {
  if (isEditable(element)) return "focus";

  const tag = element.tagName;
  if (tag === "INPUT") {
    // 缺省 type 就是 text：getAttribute 为 null 时不能当作"没有类型"。
    const type = (element.getAttribute("type") ?? "text").trim().toLowerCase();
    return CARET_INPUT_TYPES.has(type) ? "focus" : "click";
  }
  if (TEXT_ENTRY_TAGS.has(tag)) return "focus";

  const role = element.getAttribute("role");
  if (role !== null && (TEXT_ENTRY_ROLES as readonly string[]).includes(role.trim().toLowerCase())) {
    return "focus";
  }

  return "click";
}

/**
 * 焦点是否落在一个会吞掉裸按键的输入面里。
 *
 * 与 activationOf 共用同一套判据。两处若各写一套，"什么算输入面"就会有两个
 * 版本，而裸按键该不该让路正好取决于这个判断。
 *
 * 两层：元素自身按 activationOf 判，另外顺祖先链找 contenteditable ——
 * 可编辑区域的焦点常常落在它的子节点上，而子节点自身没有 contenteditable 属性。
 */
export function isTextEntry(element: Element | null): boolean {
  if (element === null) return false;
  if (activationOf(element) === "focus") return true;
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (isEditable(node)) return true;
  }
  return false;
}
