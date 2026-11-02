/**
 * 页面侧通知宿主去切输入源。
 *
 * 请求发到宿主注册的同源路由。失败（宿主没有这条路由、网络层拒绝）被吞掉：
 * 切不了输入法不应该让标签模式打不开。测试注入 fetch，页面上用浏览器自带的。
 */

export const IME_PATH = "/api/dsh-jump/ime";

export type ImePhase = "begin" | "end";

export interface ImeFetch {
  (url: string, init: { method: "POST"; headers: { "content-type": string }; body: string }): Promise<unknown>;
}

export function notifyInputSource(phase: ImePhase, fetchImpl: ImeFetch = globalThis.fetch.bind(globalThis)): void {
  void fetchImpl(IME_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: phase }),
  }).catch(() => undefined);
}
