/**
 * Browser-half entry. The build wraps this module's compiled text inside a
 * ModuleLoader factory, so this file only assembles the plugin object and
 * delegates the DOM wiring to createApp.
 */
import type { JumpConfig } from "./config.ts";
import { createApp } from "./app.ts";

/**
 * The object the loader factory returns; shape mirrors the host half.
 *
 * cordis calls `apply(ctx, config)` — the context first, this plugin's config
 * second. Reading config off the first argument throws ("cannot get property
 * without inject") and takes the whole web boot down with it, so the context
 * stays untouched here.
 */
export const clientPlugin = {
  name: "dsh-jump",
  inject: [] as string[],
  apply(_ctx: unknown, config?: JumpConfig): () => void {
    return createApp({ config }).apply();
  },
};

export default clientPlugin;
