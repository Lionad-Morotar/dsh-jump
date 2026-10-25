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
}

/**
 * The labelable surface.
 *
 * Three families, each earning its place from a real gap rather than from a
 * completeness instinct:
 *
 * - Native controls and anything carrying a tabindex (the original set).
 * - Every ARIA widget role the Harness actually renders. The sidebar's project
 *   and session rows are `div[role=treeitem]` with no tabindex at all, and a
 *   disclosure is a `<summary>`: all clickable, none matching a native
 *   selector. Real-browser measurement over the DSH web GUI found these were
 *   the only visible `cursor: pointer` elements the original selector missed.
 * - Text entry hosts. The composer is a Lexical-managed
 *   `div[contenteditable=true][role=textbox]`: no tag, no role, and no
 *   tabindex attribute in the original set, so it was unreachable from the
 *   keyboard entirely.
 *
 * `contenteditable=false` is excluded on purpose: Lexical marks chips and
 * command tokens inside the composer with it, and hint collection keeps only
 * the deepest candidate on a chain, so a chip in the set would steal the
 * label from the composer that owns it.
 */
export const CANDIDATE_SELECTOR = [
  // Native interactive elements.
  "a[href]",
  "area[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  // Anything the author already made focusable by hand.
  "[tabindex]",
  // Editable hosts; the negative branch keeps Lexical chips out.
  "[contenteditable]:not([contenteditable=false])",
  // ARIA widget roles. Kept as an explicit list rather than a
  // `[role]:not([role=none])` broad match so decorative and landmark roles
  // (img, status, alert, tooltip, navigation, tabpanel…) never get a label.
  "[role=button]",
  "[role=link]",
  "[role=tab]",
  "[role=treeitem]",
  "[role=option]",
  "[role=menuitem]",
  "[role=menuitemcheckbox]",
  "[role=menuitemradio]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=switch]",
  "[role=slider]",
  "[role=spinbutton]",
  "[role=gridcell]",
  "[role=columnheader]",
  "[role=row]",
  // Text entry roles, for hosts that are neither a form control nor editable.
  "[role=textbox]",
  "[role=searchbox]",
  "[role=combobox]",
].join(", ");

export const DEFAULT_CONFIG: JumpConfig = {
  activationClick: ACTIVATION_CLICK,
  activationFocus: ACTIVATION_FOCUS,
  candidateSelector: CANDIDATE_SELECTOR,
};
