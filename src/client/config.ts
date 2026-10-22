/**
 * Default key map and selectors.
 *
 * The shape mirrors what a later slice will receive from cordis config, so the
 * runtime wiring can spread a user config over DEFAULT_CONFIG without the pure
 * logic modules knowing cordis exists.
 */

/** Home row in label order: singles first, then ordered combinations. */
export const HOME_ROW_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l"] as const;

/** Cmd+H activates click mode. */
export const ACTIVATION_CLICK = "h";
/** Cmd+U activates focus mode. */
export const ACTIVATION_FOCUS = "u";

export interface JumpConfig {
  /** Key that activates click mode, with meta held. */
  activationClick: string;
  /** Key that activates focus mode, with meta held. */
  activationFocus: string;
  /** Selector that enumerates labelable elements. */
  candidateSelector: string;
  /** Extra selector whose matches are also labelable. */
  extraSelector: string;
}

export const DEFAULT_CONFIG: JumpConfig = {
  activationClick: ACTIVATION_CLICK,
  activationFocus: ACTIVATION_FOCUS,
  candidateSelector: "a[href], button, input, select, textarea, [role=button], [role=link], [role=tab], [tabindex]",
  extraSelector: "",
};
