/**
 * 目标激活语义：同一个 label 分支下，两类目标需要两种完全不同的动作。
 *
 * 文本输入面（textarea / 文本类 input / contenteditable）的"点"只是聚焦并把
 * 光标叫人到末尾；其余控件（按钮、树行、复选）才需要真实鼠标序列。
 * 这个判定必须是纯函数：jsdom 里没有布局也没有可靠的 isContentEditable 推导，
 * 浏览器里又不该为了测试塞桩。
 */
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../src/client/config.ts";
import { TEXT_ENTRY_ROLES } from "../src/client/config.ts";
import { activationOf } from "../src/client/target.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1/" });
const { document } = dom.window;

function el(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  document.body.append(node);
  return node;
}

describe("activationOf: text entry surfaces", () => {
  it("classifies a textarea as focus", () => {
    expect(activationOf(el("textarea"))).toBe("focus");
  });

  it("classifies every caret-bearing input type as focus", () => {
    for (const type of ["text", "search", "url", "tel", "email", "password", "number"]) {
      expect(activationOf(el("input", { type }))).toBe("focus");
    }
  });

  it("classifies a typeless input as focus, because the default type is text", () => {
    expect(activationOf(el("input"))).toBe("focus");
  });

  it("classifies a contenteditable host as focus", () => {
    expect(activationOf(el("div", { contenteditable: "true" }))).toBe("focus");
  });

  it("classifies an empty contenteditable attribute as focus, which is its true value", () => {
    expect(activationOf(el("div", { contenteditable: "" }))).toBe("focus");
  });

  it("classifies a role=textbox host as focus even without contenteditable", () => {
    expect(activationOf(el("div", { role: "textbox" }))).toBe("focus");
  });
});

describe("activationOf: everything else is a click", () => {
  it("classifies buttons, links and tree rows as click", () => {
    expect(activationOf(el("button"))).toBe("click");
    expect(activationOf(el("a", { href: "#" }))).toBe("click");
    expect(activationOf(el("div", { role: "treeitem" }))).toBe("click");
  });

  it("classifies non-text input types as click, because a checkbox has no caret", () => {
    for (const type of ["checkbox", "radio", "range", "file", "color", "submit"]) {
      expect(activationOf(el("input", { type }))).toBe("click");
    }
  });

  it("classifies an explicitly non-editable contenteditable as click", () => {
    expect(activationOf(el("span", { contenteditable: "false" }))).toBe("click");
  });
});

describe("candidate selector coverage", () => {
  it("matches a composer-shaped contenteditable host", () => {
    const composer = el("div", {
      contenteditable: "true",
      role: "textbox",
      "aria-multiline": "true",
      "data-composer-input": "true",
    });
    expect(composer.matches(DEFAULT_CONFIG.candidateSelector)).toBe(true);
  });

  it("matches sidebar tree rows, which carry neither tabindex nor a focusable tag", () => {
    expect(el("div", { role: "treeitem" }).matches(DEFAULT_CONFIG.candidateSelector)).toBe(true);
  });

  it("matches every activatable ARIA widget role the Harness renders", () => {
    for (const role of ["treeitem", "option", "menuitem", "checkbox", "radio", "switch", "slider", "spinbutton"]) {
      expect(el("div", { role }).matches(DEFAULT_CONFIG.candidateSelector)).toBe(true);
    }
  });

  it("leaves structural roles out, because a row or a header is not a target", () => {
    // row / columnheader / gridcell 是结构不是目标：给它们 label 等于给每个
    // 纯展示表格发一堆点了没反应的死标签。可交互的 grid 会给 cell 装 tabindex
    // （通常是 roving），那条分支已经覆盖。
    for (const role of ["row", "columnheader", "gridcell"]) {
      expect(el("div", { role }).matches(DEFAULT_CONFIG.candidateSelector)).toBe(false);
    }
  });

  it("matches a summary disclosure, which is clickable but not a button", () => {
    expect(el("summary").matches(DEFAULT_CONFIG.candidateSelector)).toBe(true);
  });

  it("still matches the original HTML controls", () => {
    for (const node of [el("a", { href: "#" }), el("button"), el("input"), el("select"), el("textarea"), el("div", { tabindex: "0" })]) {
      expect(node.matches(DEFAULT_CONFIG.candidateSelector)).toBe(true);
    }
  });

  it("does not match a non-editable chip nested inside the composer", () => {
    // Lexical 的 chip/command span 带 contenteditable=false，它们必须是候选之外，
    // 否则"最深优先"去重会拿 chip 顶掉真正的宿主。
    expect(el("span", { contenteditable: "false" }).matches(DEFAULT_CONFIG.candidateSelector)).toBe(false);
  });
});


describe("activationOf: date and time inputs are text entry surfaces", () => {
  it("classifies the date family as focus, because they take segmented keyboard input", () => {
    // 这五种没有 selectionStart，但方向键跳段、数字键入都是真实的分段编辑；
    // 且合成 click 无法聚焦它们，归 click 等于给它们一个点了没反应的 label。
    for (const type of ["date", "month", "week", "time", "datetime-local"]) {
      expect(activationOf(el("input", { type }))).toBe("focus");
    }
  });
});

describe("activationOf: tag beats a text-entry role", () => {
  it("classifies a button carrying role=combobox as click, because a button has no caret", () => {
    // ARIA 允许 combobox 落在 button 上（点击展开弹出层的形态）。这类控件
    // focus 什么也不发生，只有真实点击才展开——按 role 归 focus 会变成死标签。
    expect(activationOf(el("button", { role: "combobox" }))).toBe("click");
  });

  it("still classifies a div carrying role=combobox as click: nothing says it has a caret", () => {
    expect(activationOf(el("div", { role: "combobox" }))).toBe("click");
  });

  it("classifies a contenteditable host that also claims role=combobox as focus", () => {
    // 可编辑信号最强：任何带 caret 的宿主都该 focus。
    expect(activationOf(el("div", { role: "combobox", contenteditable: "true" }))).toBe("focus");
  });
});

describe("TEXT_ENTRY_ROLES is the single source for the text-entry slice", () => {
  it("drives the candidate selector, so a role cannot be labelable yet classified wrong", () => {
    expect([...TEXT_ENTRY_ROLES]).toEqual(["textbox", "searchbox"]);
    for (const role of TEXT_ENTRY_ROLES) {
      expect(el("div", { role }).matches(DEFAULT_CONFIG.candidateSelector)).toBe(true);
    }
  });

  it("classifies every role in that list as focus", () => {
    // 两处共用同一份清单：选择器收进来的文本面角色必然被判为 focus，
    // 反向也成立，漂移在类型与断言两层都拦得住。
    for (const role of TEXT_ENTRY_ROLES) {
      expect(activationOf(el("div", { role }))).toBe("focus");
    }
  });
});

