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

/**
 * 执行一遍 bundle，而不只是 grep 文本。
 *
 * 只断言字符串出现过会漏掉真实缺陷：包装器里的 boot 交接曾经存在，而 boot 从
 * 没导出到模块顶层（它当时是插件对象的方法），文本断言全绿、宿主里一加载就
 * TypeError。所以这里用假的 window 与 require 真跑一次工厂。
 */
describe("client bundle at runtime", () => {
  interface LoadSpec {
    id: string;
    factory: (require: (specifier: string) => unknown) => unknown;
  }

  function load(): LoadSpec {
    const specs: LoadSpec[] = [];
    const fakeWindow = {
      __ModuleLoader__: {
        load(spec: LoadSpec) {
          specs.push(spec);
        },
      },
    };
    new Function("window", "document", bundle)(fakeWindow, {});
    const spec = specs[0];
    if (spec === undefined) throw new Error("bundle registered no module");
    return spec;
  }

  function react() {
    return {
      createElement: () => null,
      useEffect: () => undefined,
      useRef: <T>(initial: T) => ({ current: initial }),
      useSyncExternalStore: <T>(_subscribe: unknown, snapshot: () => T) => snapshot(),
    };
  }

  const requireReact = (specifier: string): unknown => {
    if (specifier === "react") return react();
    throw new Error("unexpected module " + specifier);
  };

  it("registers under the package name", () => {
    expect(load().id).toBe("dsh-jump");
  });

  it("boots the factory without throwing", () => {
    // 回归钉子：boot 必须是模块顶层导出，否则宿主加载即崩。
    const spec = load();
    expect(() => spec.factory(requireReact)).not.toThrow();
  });

  it("returns the plugin object the loader mounts", () => {
    const plugin = load().factory(requireReact) as { name?: unknown; inject?: unknown; apply?: unknown };
    expect(plugin.name).toBe("dsh-jump");
    expect(Array.isArray(plugin.inject)).toBe(true);
    expect(typeof plugin.apply).toBe("function");
  });
});
