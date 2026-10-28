/**
 * Browser-half entry. The build wraps this module's compiled text inside a
 * ModuleLoader factory, so this file only adapts the host's handover points onto
 * `createRuntime` and returns the plugin object.
 *
 * Two handovers happen here rather than in the modules below, for the same
 * reason: the loader factory's arguments are gone by the time apply runs.
 *
 *   - boot receives the factory's require. React is a platform module the host
 *     seeds, never a dependency of this package, so that function is the only
 *     way to reach it.
 *   - The services are looked up through the context rather than declared as
 *     inject. Jump's core (chords and labels) works against the DOM alone, and a
 *     host without a settings surface should still get the navigation.
 */
import type { JumpConfig } from "./config.ts";
import { detectPlatform, type JumpPlatform } from "./bindings.ts";
import type { RuntimeContext } from "./runtime.ts";
import { createRuntime } from "./runtime.ts";
import type { RowReact } from "./react.ts";

type ModuleRequire = (specifier: string) => unknown;

/** The factory's require, captured at boot because apply never sees it. */
let loaderRequire: ModuleRequire | null = null;

/** The modifier family of this host; it cannot change for the life of a page. */
function platformOf(): JumpPlatform {
  return detectPlatform(globalThis.navigator?.platform ?? "");
}

/** Resolve React through the loader, or null where the host seeded none. */
function resolveReact(): RowReact | null {
  if (loaderRequire === null) return null;
  const React = loaderRequire("react") as RowReact;
  // The row needs these four; a host that shims React without them would throw
  // on first render, so the check happens at the seam instead.
  for (const name of ["createElement", "useEffect", "useRef", "useSyncExternalStore"] as const) {
    if (typeof React?.[name] !== "function") return null;
  }
  return React;
}

/**
 * The object the loader factory returns; the shape mirrors the host half.
 *
 * Cordis calls apply(ctx, config): the context first, this plugin's config
 * second. Reading config off the first argument throws (a context has no such
 * property) and takes the whole web boot down with it, so the context stays a
 * context here.
 */
export const clientPlugin = {
  name: "dsh-jump",
  inject: [] as string[],

  apply(ctx: unknown, config?: JumpConfig): () => void {
    const runtime = createRuntime({
      ctx: ctx as RuntimeContext,
      platform: platformOf(),
      React: resolveReact(),
      config,
    });
    return () => runtime.dispose();
  },
};

/**
 * Hand the factory's require to the plugin.
 *
 * The build calls module.exports.boot(require) inside the factory, so this must
 * be a top-level export rather than a method on the plugin object: the loader
 * keeps {name, inject, apply} and drops the rest.
 */
export function boot(require: ModuleRequire): void {
  loaderRequire = require;
}

export default clientPlugin;
