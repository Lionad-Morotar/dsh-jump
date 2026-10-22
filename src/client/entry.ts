// Browser-half entry. The build wraps this module's compiled text inside a
// ModuleLoader factory, so its job is only to make the plugin object reachable
// as the module's default export; the DOM wiring lands in a later slice.
import { DEFAULT_CONFIG, type JumpConfig } from "./config.ts";

export interface ClientContext {
  config?: JumpConfig;
}

/** The object the loader's factory returns; shape mirrors the host half. */
export const clientPlugin = {
  name: "dsh-jump",
  inject: [] as string[],
  apply(_ctx: ClientContext): void {
    void _ctx;
    void DEFAULT_CONFIG;
  },
};

export default clientPlugin;
