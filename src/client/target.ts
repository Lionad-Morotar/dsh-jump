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

/** 一个目标需要哪种动作才能"被跳到"。 */
export type Activation = "click" | "focus";

/** 带文本光标的 input 类型；其余类型（checkbox/range/file…）没有光标。 */
const CARET_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "number"]);

/** 天生就是文本输入面的标签。 */
const TEXT_ENTRY_TAGS = new Set(["TEXTAREA"]);

/** 声明自己是文本输入面的 ARIA 角色。 */
const TEXT_ENTRY_ROLES = new Set(["textbox", "searchbox", "combobox"]);

function contentEditableValue(element: Element): string | null {
  const raw = element.getAttribute("contenteditable");
  if (raw === null) return null;
  // contenteditable 是枚举属性：空串与 "true" 都表示可编辑，只有 "false" 关闭。
  // 大小写不敏感（HTML 属性值），所以先归一。
  return raw.trim().toLowerCase();
}

function isEditable(element: Element): boolean {
  const value = contentEditableValue(element);
  return value !== null && value !== "false";
}

/**
 * 判定一个元素要哪种动作。
 *
 * 顺序即优先级：先认 contenteditable 与 role，再按标签分流——一个
 * <div contenteditable role=button> 之类的不存在，但 role 比标签更靠得住
 * （framework 常用 div 承担语义）。
 */
export function activationOf(element: Element): Activation {
  if (isEditable(element)) return "focus";

  const role = element.getAttribute("role");
  if (role !== null && TEXT_ENTRY_ROLES.has(role.toLowerCase())) return "focus";

  const tag = element.tagName;
  if (TEXT_ENTRY_TAGS.has(tag)) return "focus";
  if (tag === "INPUT") {
    // 缺省 type 就是 text：getAttribute 为 null 时不能当作"没有类型"。
    const type = (element.getAttribute("type") ?? "text").trim().toLowerCase();
    return CARET_INPUT_TYPES.has(type) ? "focus" : "click";
  }

  return "click";
}
