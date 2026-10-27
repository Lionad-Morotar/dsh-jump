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
import { insertRowStyles, JumpSettingsRow, type RowReact } from "./settings-row.ts";
import { createBindingsStore, type BindingsStore } from "./store.ts";

/** The one part of the Cordis context this plugin reads. */
export interface RuntimeContext {
  get<T>(name: string): T | undefined;
}

interface SlotService {
  inject(key: string, callback: () => () => void): () => void;
  register(registration: { name: string; id: string; order: number }, component: unknown): () => void;
}

interface LocaleService {
  getSnapshot(): { active: string };
}

/** The host slot the row occupies: the General settings list. */
export const SETTINGS_SLOT = "settings.general.item";
/** The row id; must not collide with the host's own rows. */
export const SETTINGS_ID = "jump";
/** Right after the host's own shortcut row, which sits at order 16. */
export const SETTINGS_ORDER = 17;

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

  const slots = ctx.get<SlotService>("slots");
  if (React !== null && slots !== undefined) {
    const locale = ctx.get<LocaleService>("locale");
    const controller = createBindingsController({ store, platform });
    // slots.inject owns the registration's lifecycle: it runs the callback once
    // the slot exists and again if the host re-creates it, and disposes on
    // unload. Wrapping it in ctx.effect as well would register twice.
    disposers.push(
      slots.inject(SETTINGS_SLOT, () =>
        slots.register({ name: SETTINGS_SLOT, id: SETTINGS_ID, order: SETTINGS_ORDER }, () =>
          JumpSettingsRow({
            React,
            controller,
            platform,
            copy: copyFor(locale?.getSnapshot().active ?? "zh"),
          }),
        ),
      ),
    );
    const doc = deps.document ?? globalThis.document;
    if (doc !== undefined) disposers.push(insertRowStyles(doc));
  }

  return {
    store,
    app,
    dispose() {
      while (disposers.length > 0) disposers.pop()?.();
    },
  };
}
