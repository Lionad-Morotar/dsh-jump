/**
 * 身份键与跨轮记忆的契约测试。
 *
 * 身份键的取值顺序就是它的规格：页面自己已经用来标识行的属性优先于任何
 * 推断，推断只在 data-slot 边界内成立，越界就返回空键（该元素不进记忆）。
 */
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it } from "vitest";

import { createLabelMemory, identityKey, recallLabels } from "../src/client/identity.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1/" });
const { document } = dom.window;

/** 分隔符是键格式的一部分，测试里写字面量而不是引用常量。 */
const SEP = "\u0001";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("identity key", () => {
  it("reads data-row-key before any accessible name", () => {
    const el = document.createElement("button");
    el.setAttribute("data-row-key", "row-7");
    el.setAttribute("aria-label", "Save");
    el.setAttribute("title", "Save file");
    document.body.append(el);

    expect(identityKey(el)).toBe("row-7");
  });

  it("keys the composer by its marker, ahead of the slot it sits in", () => {
    const slot = document.createElement("div");
    slot.setAttribute("data-slot", "composer");
    const host = document.createElement("div");
    host.setAttribute("contenteditable", "true");
    host.setAttribute("data-composer-input", "true");
    host.setAttribute("aria-label", "Message");
    slot.append(host);
    document.body.append(slot);

    expect(identityKey(host)).toBe("composer");
  });

  it("composes slot, accessible name and tag for a control inside a slot", () => {
    const slot = document.createElement("div");
    slot.setAttribute("data-slot", "toolbar");
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Save");
    slot.append(button);
    document.body.append(slot);

    expect(identityKey(button)).toBe("toolbar" + SEP + "Save" + SEP + "button");
  });

  it("falls back from aria-label to title", () => {
    const slot = document.createElement("div");
    slot.setAttribute("data-slot", "toolbar");
    const button = document.createElement("button");
    button.setAttribute("title", "Save");
    slot.append(button);
    document.body.append(slot);

    expect(identityKey(button)).toBe("toolbar" + SEP + "Save" + SEP + "button");
  });

  it("falls back to collapsed text when there is neither aria-label nor title", () => {
    const slot = document.createElement("div");
    slot.setAttribute("data-slot", "toolbar");
    const button = document.createElement("button");
    button.textContent = "  Save\n  draft  ";
    slot.append(button);
    document.body.append(slot);

    expect(identityKey(button)).toBe("toolbar" + SEP + "Save draft" + SEP + "button");
  });

  it("truncates the text fallback to forty characters", () => {
    const slot = document.createElement("div");
    slot.setAttribute("data-slot", "toolbar");
    const button = document.createElement("button");
    button.textContent = "x".repeat(50);
    slot.append(button);
    document.body.append(slot);

    expect(identityKey(button)).toBe("toolbar" + SEP + "x".repeat(40) + SEP + "button");
  });

  it("returns an empty key outside any slot", () => {
    const plain = document.createElement("button");
    plain.setAttribute("aria-label", "Save");
    plain.textContent = "Save";
    document.body.append(plain);

    expect(identityKey(plain)).toBe("");
  });

  it("returns an empty key for an unlabelled control inside a slot", () => {
    const slot = document.createElement("div");
    slot.setAttribute("data-slot", "toolbar");
    const button = document.createElement("button");
    slot.append(button);
    document.body.append(slot);

    expect(identityKey(button)).toBe("");
  });
});

describe("label memory", () => {
  it("drops the entry that went longest without a hit once the table is full", () => {
    const memory = createLabelMemory();
    for (let i = 0; i < 65; i += 1) memory.record("key-" + String(i), "a");

    expect(memory.size).toBe(64);
    expect(memory.lookup("key-0")).toBeUndefined();
    expect(memory.lookup("key-1")).toBe("a");
    expect(memory.lookup("key-64")).toBe("a");
  });

  it("counts a hit as a fresh use, so the evicted entry is the one never touched again", () => {
    const memory = createLabelMemory();
    for (let i = 0; i < 64; i += 1) memory.record("key-" + String(i), "a");
    memory.lookup("key-0");
    memory.record("key-64", "a");

    expect(memory.lookup("key-0")).toBe("a");
    expect(memory.lookup("key-1")).toBeUndefined();
  });
});

describe("recall", () => {
  it("hands a remembered label back when the identity is unique and the length matches", () => {
    const memory = createLabelMemory();
    memory.record("row-1", "as");
    const el = document.createElement("button");
    el.setAttribute("data-row-key", "row-1");

    expect([...recallLabels(memory, [el], 2)]).toEqual([[el, "as"]]);
    expect(recallLabels(memory, [el], 1).size).toBe(0);
  });

  it("abandons the memory of an identity that two candidates share", () => {
    const memory = createLabelMemory();
    memory.record("dup", "d");
    const first = document.createElement("button");
    first.setAttribute("data-row-key", "dup");
    const second = document.createElement("button");
    second.setAttribute("data-row-key", "dup");

    expect(recallLabels(memory, [first, second], 1).size).toBe(0);
  });

  it("never recalls a keyless element", () => {
    const memory = createLabelMemory();
    memory.record("", "a");
    const plain = document.createElement("button");

    expect(recallLabels(memory, [plain], 1).size).toBe(0);
  });

  it("drops both memories when two identities hold the same label", () => {
    // 两个不同身份在不同轮里先后拿到同一枚标签是可能的（前一个元素离场后，
    // 新元素吃了它的洞，旧元素又回来）。同时回收会让本轮出现重号。
    const memory = createLabelMemory();
    memory.record("old", "as");
    memory.record("new", "as");
    const first = document.createElement("button");
    first.setAttribute("data-row-key", "old");
    const second = document.createElement("button");
    second.setAttribute("data-row-key", "new");

    expect(recallLabels(memory, [first, second], 2).size).toBe(0);
  });
});
