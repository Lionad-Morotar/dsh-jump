/**
 * Browser-half entry. The build wraps this module's compiled text inside a
 * ModuleLoader factory, so this file only assembles the plugin object and
 * delegates the DOM wiring to createApp.
 */
import type { JumpConfig } from "./config.ts";
import { createApp } from "./app.ts";

export interface ClientContext {
  config?: JumpConfig;
}

/** The object the loader factory returns; shape mirrors the host half. */
export const clientPlugin = {
  name: "dsh-jump",
  inject: [] as string[],
  apply(ctx: ClientContext = {}): () => void {
    return createApp({ config: ctx?.config }).apply();
  },
};

export default clientPlugin;
