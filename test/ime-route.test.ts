/**
 * 宿主路由契约：POST begin / end 驱动同一轮，别的请求被拒绝，没有 webServer 时不注册。
 */
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";

import { attachImeRoute, handleImeRequest, IME_PATH, type ImeHostContext, type ImeRouteServer } from "../src/host/ime-route.ts";
import { createInputSourceRound, type InputSourceRunner } from "../src/host/input-source.ts";

function runner(initial: string): InputSourceRunner & { currentValue: () => string | null } {
  let current: string | null = initial;
  return {
    current: () => current,
    select: (id) => {
      current = id;
      return true;
    },
    currentValue: () => current,
  };
}

function request(method: string, body?: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  queueMicrotask(() => {
    if (body !== undefined) req.emit("data", Buffer.from(body));
    req.emit("end");
  });
  return req;
}

function response(): ServerResponse & { status: number; text: string } {
  const res = {
    status: 0,
    text: "",
    headersSent: false,
    writableEnded: false,
    writeHead(status: number) {
      res.status = status;
      res.headersSent = true;
      return res;
    },
    end(text?: string) {
      res.text = text ?? "";
      res.writableEnded = true;
    },
  };
  return res as unknown as ServerResponse & { status: number; text: string };
}

describe("ime route handler", () => {
  it("switches to ABC on begin and restores on end", async () => {
    const ime = runner("com.sogou.inputmethod.sogou.pinyin");
    const round = createInputSourceRound(ime);

    const begin = response();
    await handleImeRequest(request("POST", '{"op":"begin"}'), begin, round);
    expect(begin.status).toBe(204);
    expect(ime.currentValue()).toBe("com.apple.keylayout.ABC");

    const end = response();
    await handleImeRequest(request("POST", '{"op":"end"}'), end, round);
    expect(end.status).toBe(204);
    expect(ime.currentValue()).toBe("com.sogou.inputmethod.sogou.pinyin");
  });

  it("refuses anything that is not a begin or end post", async () => {
    const ime = runner("com.sogou.inputmethod.sogou.pinyin");
    const round = createInputSourceRound(ime);

    const get = response();
    await handleImeRequest(request("GET"), get, round);
    expect(get.status).toBe(405);

    const bad = response();
    await handleImeRequest(request("POST", '{"op":"switch"}'), bad, round);
    expect(bad.status).toBe(400);
    expect(ime.currentValue()).toBe("com.sogou.inputmethod.sogou.pinyin");
  });
});

describe("attaching the route", () => {
  function host(server: ImeRouteServer | undefined) {
    const listeners = new Set<(name: string) => void>();
    const effects: (() => void)[] = [];
    const ctx: ImeHostContext = {
      get: <T>(name: string) => (name === "webServer" ? (server as T) : undefined),
      on: (_event, listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      effect: (fn) => {
        effects.push(fn());
        return () => undefined;
      },
    };
    return {
      ctx,
      appear(next: ImeRouteServer) {
        server = next;
        for (const listener of listeners) listener("webServer");
      },
      unload() {
        while (effects.length > 0) effects.pop()?.();
      },
    };
  }

  it("registers nothing when the host has no web server", () => {
    const registered: string[] = [];
    const h = host(undefined);
    attachImeRoute(h.ctx, createInputSourceRound(runner("x")));
    expect(registered).toEqual([]);
  });

  it("registers the ime path and drops it on dispose", () => {
    const paths: string[] = [];
    let dropped = 0;
    const server: ImeRouteServer = {
      register: (route) => {
        paths.push(route.path);
        return () => {
          dropped += 1;
        };
      },
    };
    const h = host(server);
    const dispose = attachImeRoute(h.ctx, createInputSourceRound(runner("x")));

    expect(paths).toEqual([IME_PATH]);
    dispose();
    expect(dropped).toBe(1);
  });

  it("restores the input source if the plugin unloads mid-round", () => {
    const ime = runner("com.sogou.inputmethod.sogou.pinyin");
    const round = createInputSourceRound(ime);
    const server: ImeRouteServer = { register: () => () => undefined };
    const h = host(server);
    attachImeRoute(h.ctx, round);

    round.begin();
    expect(ime.currentValue()).toBe("com.apple.keylayout.ABC");
    h.unload();
    expect(ime.currentValue()).toBe("com.sogou.inputmethod.sogou.pinyin");
  });
});
