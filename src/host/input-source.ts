/**
 * 一轮标签模式占用的系统输入源。
 *
 * 页面跑在沙箱渲染进程里，切不了输入法。这一层只描述「记住、切到英文、还回去」，
 * 真正去跑 im-select 的是宿主进程里的运行器。测试换一个假的运行器，不碰本机输入法。
 */

/** macOS 自带的美式键盘。im-select 用这个 id 切到英文。 */
export const ABC_SOURCE = "com.apple.keylayout.ABC";

/** 读当前输入源、切到指定输入源。失败时读回 null、切换回 false，不抛。 */
export interface InputSourceRunner {
  current(): string | null;
  select(id: string): boolean;
}

/** im-select 一次调用的结果。无参是读取，带一个 id 是切换。 */
export interface ImSelectResult {
  code: number;
  stdout: string;
}

export type ImSelectExec = (args: readonly string[]) => ImSelectResult;

/**
 * 把 im-select 的 stdout / 退出码收成运行器。
 *
 * 二进制不存在、退出码非 0、打印的不是一个输入源 id，都当成这次没做成。
 * 调用方据此跳过，而不是让一轮标签模式因为输入法失败而打不开。
 */
export function createImSelectRunner(exec: ImSelectExec): InputSourceRunner {
  return {
    current() {
      try {
        const result = exec([]);
        if (result.code !== 0) return null;
        const id = result.stdout.trim();
        return id.length > 0 ? id : null;
      } catch {
        return null;
      }
    },
    select(id) {
      try {
        return exec([id]).code === 0;
      } catch {
        return false;
      }
    },
  };
}

export interface InputSourceRound {
  /** 记下当前输入源并切到英文。已经在一轮里时不再记第二次。 */
  begin(): void;
  /** 把 begin 时记下的输入源还回去。没有进行中的一轮则什么都不做。 */
  end(): void;
}

export function createInputSourceRound(runner: InputSourceRunner): InputSourceRound {
  let saved: string | null = null;

  return {
    begin() {
      if (saved !== null) return;
      const current = runner.current();
      if (current === null) return;
      saved = current;
      runner.select(ABC_SOURCE);
    },
    end() {
      if (saved === null) return;
      const back = saved;
      saved = null;
      runner.select(back);
    },
  };
}
