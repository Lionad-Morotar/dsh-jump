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
 * The desktop host applies the client plugin twice against the same page: once
 * from the profile sync and once from the client mount. A second runtime would
 * attach a second key listener and draw a second overlay, so the newer apply
 * owns the page and the older one must be torn down first.
 */
let activeDispose: (() => void) | null = null;

/**
 * Page-level runtime registry, shared by every copy of this module.
 *
 * `activeDispose` only covers a second apply inside one module instance. A host
 * that evaluates the client factory again gets a second module scope with its
 * own `activeDispose`, so the module-level fast path alone leaves two runtimes
 * on one page, each with its own listener and overlay. The registry therefore
 * lives on globalThis under a registered symbol, which is the one thing two
 * evaluations of the same source agree on, and it keys runtimes by document so
 * a page that goes away is not kept alive by the guard itself.
 */
const RUNTIME_SLOTS_KEY = Symbol.for("dsh-jump.runtime-slots");

interface RuntimeSlots {
  /** Document -> the dispose of the runtime that currently owns it. */
  readonly live: WeakMap<Document, () => void>;
}

function isRuntimeSlots(value: unknown): value is RuntimeSlots {
  return typeof value === "object" && value !== null && (value as { live?: unknown }).live instanceof WeakMap;
}

function runtimeSlots(): RuntimeSlots {
  const host = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const existing = host[RUNTIME_SLOTS_KEY];
  if (isRuntimeSlots(existing)) return existing;
  const created: RuntimeSlots = { live: new WeakMap() };
  host[RUNTIME_SLOTS_KEY] = created;
  return created;
}

/** The page this runtime draws on; Node hosts and bare test stubs have none. */
function pageDocument(): Document | null {
  return typeof globalThis.document === "undefined" ? null : globalThis.document;
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
    activeDispose?.();
    const doc = pageDocument();
    const slots = doc === null ? null : runtimeSlots();
    // Whoever holds the page goes first, including a copy of this plugin that
    // came from another module instance and knows nothing about activeDispose.
    if (slots !== null && doc !== null) slots.live.get(doc)?.();
    const runtime = createRuntime({
      ctx: ctx as RuntimeContext,
      platform: platformOf(),
      React: resolveReact(),
      config,
    });
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      runtime.dispose();
      if (activeDispose === dispose) activeDispose = null;
      // A runtime applied after this one may already hold the document; only
      // the entry this dispose owns leaves the registry.
      if (slots !== null && doc !== null && slots.live.get(doc) === dispose) slots.live.delete(doc);
    };
    activeDispose = dispose;
    if (slots !== null && doc !== null) slots.live.set(doc, dispose);
    return dispose;
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
