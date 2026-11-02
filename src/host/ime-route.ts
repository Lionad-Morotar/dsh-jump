/**
 * 宿主侧的输入源路由。
 *
 * 页面在沙箱里，切输入法只能由宿主进程做。这里挂一条同源路由，
 * 页面用 POST {"op":"begin"} / {"op":"end"} 驱动同一轮。
 * 没有 webServer 的宿主（纯 CLI）什么都不注册，导航不受影响。
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { createInputSourceRound, type InputSourceRound } from "./input-source.ts";

export const IME_PATH = "/api/dsh-jump/ime";

export interface ImeRouteServer {
  register(route: {
    kind: "exact";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
}

/** 宿主上下文里这一层真正用到的两个方法。 */
export interface ImeHostContext {
  get<T>(name: string, required?: boolean): T | undefined;
  on(event: string, listener: (name: string) => void): () => void;
  effect(fn: () => () => void): () => void;
}

interface ImeBody {
  op?: unknown;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1024) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** 处理一次请求。begin / end 都回 204；别的方法与别的 op 回 4xx。 */
export async function handleImeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  round: InputSourceRound,
): Promise<void> {
  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false });
    return;
  }
  let body: ImeBody;
  try {
    body = JSON.parse(await readBody(req)) as ImeBody;
  } catch {
    writeJson(res, 400, { ok: false });
    return;
  }
  if (body.op === "begin") round.begin();
  else if (body.op === "end") round.end();
  else {
    writeJson(res, 400, { ok: false });
    return;
  }
  writeJson(res, 204, { ok: true });
}

/**
 * 在宿主上挂上输入源路由，并在 webServer 晚出现或被换掉时重新挂。
 *
 * 返回的函数摘掉路由。插件卸载时调用它，进行中的一轮也会被还回去。
 */
export function attachImeRoute(ctx: ImeHostContext, round: InputSourceRound): () => void {
  let disposeRoute: (() => void) | undefined;

  const register = (): void => {
    const webServer = ctx.get<ImeRouteServer>("webServer", false);
    if (webServer === undefined) return;
    disposeRoute = webServer.register({
      kind: "exact",
      path: IME_PATH,
      handler: (req, res) => {
        void handleImeRequest(req, res, round).catch(() => {
          if (!res.headersSent) writeJson(res, 500, { ok: false });
          else if (!res.writableEnded) res.end();
        });
      },
    });
  };

  register();
  // 页面刷新时 end 到不了。到点自己还原，不把输入法留在英文上。
  const timer = setInterval(() => round.sweep(), 1000);
  if (typeof timer.unref === "function") timer.unref();
  const stopWatching = ctx.on("internal/service", (name) => {
    if (name !== "webServer") return;
    disposeRoute?.();
    disposeRoute = undefined;
    register();
  });
  ctx.effect(() => () => {
    disposeRoute?.();
    round.end();
  });

  return () => {
    clearInterval(timer);
    stopWatching();
    disposeRoute?.();
    disposeRoute = undefined;
    round.end();
  };
}

export { createInputSourceRound };
