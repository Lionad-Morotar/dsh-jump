/**
 * Assembling the two halves of the plugin that must share state.
 *
 * The navigation listener and the settings row have to read the same bindings
 * instance. Giving each its own store still works on paper: both would read the
 * same localStorage document and both would persist correctly. What breaks is
 * the notification, and it breaks invisibly: the row saves a new chord, the
 * document holds it, and the listener keeps matching the old one until the page
 * is reloaded. Keeping the composition in one place, with one store passed to
 * both, is what makes that impossible rather than merely unlikely.
 *
 * This module exists so that composition can be exercised directly. `entry.ts`
 * only adapts the real Cordis context and the loader's `require` onto it.
 */
import { createApp, type JumpApp, type JumpWindow } from "./app.ts";
import type { JumpConfig } from "./config.ts";
import type { JumpPlatform } from "./bindings.ts";
import { copyFor } from "./copy.ts";
import { createBindingsController } from "./settings-controller.ts";
import { JumpSettingsPage, insertPageStyles } from "./settings-page.ts";
import type { RowReact } from "./react.ts";
import { createBindingsStore, type BindingsStore } from "./store.ts";

/** The one part of the Cordis context this plugin reads. */
export interface RuntimeContext {
  get<T>(name: string): T | undefined;
  /**
   * Run a callback once the named services exist.
   *
   * Services come up one at a time; `get` samples and returns undefined for any
   * that are not ready yet. Deferring through this hook is what makes the row
   * appear at all on a host whose slot service starts after this plugin.
   */
  inject(names: string[], callback: (scope: ScopedContext) => void): () => void;
}

/** The subset of the context handed to a deferred callback. */
export interface ScopedContext {
  get<T>(name: string): T | undefined;
}

interface SlotService {
  inject(key: string, callback: () => () => void): () => void;
  register(
    registration: { name: string; id: string; order: number; label?: string | (() => string) },
    component: unknown,
  ): () => void;
}

interface LocaleService {
  getSnapshot(): { active: string };
}

/**
 * The host slot this plugin occupies: one page in the settings panel.
 *
 * It started as a row inside the General list, which is the slot the host offers
 * for a single preference. Two shortcuts are not a single preference, and a list
 * row can only show them side by side under one restore control. A section gets
 * its own nav entry, a heading per mode and a restore control per mode.
 */
export const SETTINGS_SLOT = "settings.section";
/** The section id; a fresh id adds a nav entry rather than replacing a shipped one. */
export const SETTINGS_ID = "jump";
/**
 * Position among the settings nav entries.
 *
 * Occupied at the time of writing: account -10, general 0, models 10,
 * plugins 15, agent-presets 20, then third parties from 30 (cost-meter) up to
 * 115/116 (skin managers). 25 puts this page directly after the host's own
 * built-ins without landing on any of them.
 */
export const SETTINGS_ORDER = 25;

export interface RuntimeDeps {
  ctx: RuntimeContext;
  platform: JumpPlatform;
  /** The loader-resolved React slice; null when the host seeded none. */
  React: RowReact | null;
  config?: JumpConfig;
  /** Injected by tests; the page's storage is resolved when absent. */
  store?: BindingsStore;
  /** Injected under jsdom, where globalThis is not a window. */
  window?: JumpWindow;
  /** Injected under jsdom, where there is no page document. */
  document?: Document;
}

export interface JumpRuntime {
  /** The bindings both halves read. */
  store: BindingsStore;
  app: JumpApp;
  /** Tear everything down; idempotent. */
  dispose(): void;
}

/**
 * Build the plugin's runtime: one store, one listener, one settings row.
 *
 * A host with no settings slot still gets the listener. That is a deliberate
 * order of operations rather than defensive code: navigation is the product, the
 * row is how it is configured, and a missing surface should cost the reader the
 * ability to remap, not the ability to jump.
 */
export function createRuntime(deps: RuntimeDeps): JumpRuntime {
  const { ctx, platform, React, config } = deps;
  const store = deps.store ?? createBindingsStore({ platform });
  const app = createApp({ config, bindings: store, platform, window: deps.window });

  const disposers: (() => void)[] = [app.apply()];

  // Registering the page has to wait for the slot service to exist. Sampling it
  // once with `get` is the bug this shape exists to prevent: on a host where
  // slots comes up after this plugin, the sample is undefined, the branch is
  // skipped, and the plugin looks installed but has nowhere to be configured.
  if (React !== null) {
    disposers.push(
      ctx.inject(["slots"], (scope) => {
        const slots = scope.get<SlotService>("slots");
        if (slots === undefined) return;
        const locale = scope.get<LocaleService>("locale");
        const controller = createBindingsController({ store, platform });
        // The nav label is a thunk so the host re-reads it on every projection:
        // the panel then follows a locale change without re-registering.
        const label = (): string => copyFor(locale?.getSnapshot().active ?? "zh").navLabel;
        const page = (): unknown =>
          JumpSettingsPage({
            React,
            controller,
            platform,
            copy: copyFor(locale?.getSnapshot().active ?? "zh"),
          });
        // slots.inject owns the registration's lifecycle: it runs the callback
        // once the slot exists and again if the host re-creates it, and
        // disposes on unload. Wrapping it in ctx.effect as well registers twice.
        const disposePage = slots.inject(SETTINGS_SLOT, () =>
          slots.register({ name: SETTINGS_SLOT, id: SETTINGS_ID, order: SETTINGS_ORDER, label }, page),
        );
        const doc = deps.document ?? globalThis.document;
        const disposeStyles = doc === undefined ? undefined : insertPageStyles(doc);
        return () => {
          disposePage();
          disposeStyles?.();
        };
      }),
    );
  }

  return {
    store,
    app,
    dispose() {
      while (disposers.length > 0) disposers.pop()?.();
    },
  };
}
