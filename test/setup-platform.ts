/**
 * 测试平台的确定性锚点：修饰键解析（bindings.ts 的 detectPlatform）读取
 * globalThis.navigator.platform，而 Node 21+ 的这个字段返回的是进程平台
 * （darwin / linux / win32）。用例统一按 macOS 语义派发 metaKey 和弦事件，
 * 故任何宿主平台上都把平台钉成 MacIntel，检测不再随跑测试的机器漂移。
 */
if (typeof globalThis.navigator === "undefined") {
  Object.defineProperty(globalThis, "navigator", { value: { platform: "MacIntel" }, configurable: true });
} else {
  Object.defineProperty(globalThis.navigator, "platform", { value: "MacIntel", configurable: true });
}
