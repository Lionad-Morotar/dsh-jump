/**
 * 回跳失败提示的可达性：读屏能听到，连点不叠出一摞。
 */
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { flashNotice } from "../src/client/notice.ts";

function page(): Document {
  return new JSDOM("<!doctype html><html><head></head><body></body></html>").window.document;
}

describe("flashNotice", () => {
  it("is announced to assistive technology, not only painted", () => {
    const doc = page();
    const notice = flashNotice(doc, "找不到引用的那个元素了");
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.getAttribute("aria-live")).toBe("polite");
  });

  it("replaces the previous notice instead of stacking pills on repeated clicks", () => {
    const doc = page();
    flashNotice(doc, "第一次");
    flashNotice(doc, "第二次");
    const notices = doc.querySelectorAll("[data-dsh-jump-notice]");
    expect(notices).toHaveLength(1);
    expect(notices[0]?.textContent).toBe("第二次");
  });
});
