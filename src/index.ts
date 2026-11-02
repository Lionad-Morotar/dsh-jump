/**
 * Host half of dsh-jump.
 *
 * The label overlay lives in the browser half. This half only exists so the
 * host process can change the system input source, which the sandboxed page
 * cannot do. A host without a web server still loads: navigation simply keeps
 * whatever input source the user already has.
 */
import { spawnSync } from "node:child_process";

import { attachImeRoute, type ImeHostContext } from "./host/ime-route.ts";
import { createImSelectRunner, createInputSourceRound } from "./host/input-source.ts";

export const name = "dsh-jump";
export const inject: string[] = [];

/** im-select with no arguments prints the current source; one argument selects it. */
function execImSelect(args: readonly string[]): { code: number; stdout: string } {
  const result = spawnSync("im-select", [...args], { encoding: "utf8", timeout: 1500 });
  return { code: result.status ?? 1, stdout: result.stdout ?? "" };
}

export function apply(ctx: ImeHostContext): () => void {
  const round = createInputSourceRound(createImSelectRunner(execImSelect));
  return attachImeRoute(ctx, round);
}
