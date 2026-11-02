/**
 * 输入源一轮的契约：记住当前源、切到英文、结束时还原。
 *
 * 真实的 im-select 不进测试：它会改掉正在用的输入法。这里只驱动一个可替换的运行器。
 */
import { describe, expect, it } from "vitest";

import {
  ABC_SOURCE,
  createImSelectRunner,
  createInputSourceRound,
  type InputSourceRunner,
} from "../src/host/input-source.ts";

function runner(initial: string | null): InputSourceRunner & { log: string[] } {
  let current = initial;
  const log: string[] = [];
  return {
    log,
    current() {
      log.push("read");
      return current;
    },
    select(id: string) {
      log.push(`select:${id}`);
      current = id;
      return true;
    },
  };
}

describe("input source round", () => {
  it("remembers the source that was active and switches to ABC", () => {
    const ime = runner("com.sogou.inputmethod.sogou.pinyin");
    const round = createInputSourceRound(ime);

    round.begin();

    expect(ime.current()).toBe(ABC_SOURCE);
    expect(ime.log).toEqual(["read", `select:${ABC_SOURCE}`, "read"]);
  });

  it("puts the remembered source back when the round ends", () => {
    const ime = runner("com.sogou.inputmethod.sogou.pinyin");
    const round = createInputSourceRound(ime);

    round.begin();
    ime.log.length = 0;
    round.end();

    expect(ime.current()).toBe("com.sogou.inputmethod.sogou.pinyin");
  });

  it("does not switch twice when begin is called again before end", () => {
    const ime = runner("com.apple.keylayout.ABC");
    const round = createInputSourceRound(ime);

    round.begin();
    round.begin();

    expect(ime.log.filter((line) => line.startsWith("select:"))).toEqual([`select:${ABC_SOURCE}`]);
  });

  it("does nothing on end when no round was opened", () => {
    const ime = runner("com.sogou.inputmethod.sogou.pinyin");
    const round = createInputSourceRound(ime);

    round.end();

    expect(ime.log).toEqual([]);
    expect(ime.current()).toBe("com.sogou.inputmethod.sogou.pinyin");
  });

  it("leaves the current source alone when it cannot be read", () => {
    const ime = runner(null);
    const round = createInputSourceRound(ime);

    round.begin();

    expect(ime.log).toEqual(["read"]);
    expect(ime.current()).toBeNull();
  });
});

describe("im-select runner", () => {
  it("reads the id im-select prints and nothing else", () => {
    const calls: (readonly string[])[] = [];
    const ime = createImSelectRunner((args) => {
      calls.push(args);
      return { code: 0, stdout: "com.apple.keylayout.ABC\n" };
    });

    expect(ime.current()).toBe("com.apple.keylayout.ABC");
    expect(calls).toEqual([[]]);
  });

  it("selects by passing the id and treats a zero exit as success", () => {
    const calls: (readonly string[])[] = [];
    const ime = createImSelectRunner((args) => {
      calls.push(args);
      return { code: 0, stdout: "" };
    });

    expect(ime.select("com.apple.keylayout.ABC")).toBe(true);
    expect(calls).toEqual([["com.apple.keylayout.ABC"]]);
  });

  it("reports failure instead of throwing when the binary is missing or the id is refused", () => {
    const missing = createImSelectRunner(() => {
      throw new Error("spawn ENOENT");
    });
    const refused = createImSelectRunner(() => ({ code: 1, stdout: "" }));

    expect(missing.current()).toBeNull();
    expect(missing.select(ABC_SOURCE)).toBe(false);
    expect(refused.current()).toBeNull();
    expect(refused.select("not.a.real.source")).toBe(false);
  });
});
