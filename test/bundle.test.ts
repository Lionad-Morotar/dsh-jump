/**
 * lib/client.js 的交付形状：ModuleLoader 包装与插件对象字段。lib 是提交在
 * 仓里的构建产物，测试直接读文件断言文本标记，不执行浏览器代码。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

describe("client bundle", () => {
  it("keeps the ModuleLoader wrapper keyed on the package name", () => {
    expect(bundle).toContain("window.__ModuleLoader__.load");
    expect(bundle).toContain(String.fromCharCode(34)+"dsh-jump"+String.fromCharCode(34));
  });

  it("ships the plugin object shape the loader mounts", () => {
    expect(bundle).toContain("factory");
    expect(bundle).toContain("name");
    expect(bundle).toContain("inject");
    expect(bundle).toContain("apply");
  });
});
