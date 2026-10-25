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
 * Widget roles whose whole purpose is "activate me".
 *
 * An explicit list rather than a `[role]:not([role=none])` broad match, so
 * decorative and landmark roles (`img`, `status`, `alert`, `tooltip`,
 * `navigation`, `tabpanel`…) never get a label.
 *
 * Deliberately absent: `row`, `columnheader` and `gridcell`. Those are
 * structure, not targets — a row is a container and a column header is a label.
 * A cell only becomes interactive inside an interactive grid, and a grid that
 * makes its cells reachable also gives them a tabindex (usually a roving one),
 * which the `[tabindex]` branch already catches. Including them would hand
 * dead labels to every presentational table, because hint collection only
 * reconciles a row that actually contains a deeper candidate.
 */
const ACTIVATABLE_ROLES = [
  "button",
  "link",
  "tab",
  "treeitem",
  "option",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
] as const;

/**
 * Roles that promise a text caret, for hosts that are neither a form control
 * nor `contenteditable`.
 *
 * Single source: `target.ts` reads this to decide focus-vs-click, so a role
 * can never be labelable while being classified the wrong way.
 *
 * `combobox` is deliberately absent. ARIA defines it as a composite
 * "textbox + popup list", and the common rendering puts it on the button that
 * opens the popup. Classifying that as focus would leave a label that neither
 * mode can honour: focus does nothing to a button, and only a click opens it.
 * A combobox that really is editable carries `contenteditable` and is caught
 * there instead.
 */
export const TEXT_ENTRY_ROLES = ["textbox", "searchbox"] as const;

/**
 * The labelable surface.
 *
 * Three families, each earning its place from a real gap rather than from a
 * completeness instinct:
 *
 * - Native controls and anything carrying a tabindex (the original set).
 * - The ARIA widget roles above. The sidebar's project and session rows are
 *   `div[role=treeitem]` with no tabindex at all, and a disclosure is a
 *   `<summary>`: all clickable, none matching a native selector.
 *   Real-browser measurement over the DSH web GUI found these were the only
 *   visible `cursor: pointer` elements the original selector missed.
 * - Text entry hosts. The composer is a Lexical-managed
 *   `div[contenteditable=true][role=textbox]`: no tag and no tabindex
 *   attribute, so it was unreachable from the keyboard entirely.
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
  ...ACTIVATABLE_ROLES.map((role) => `[role=${role}]`),
  ...TEXT_ENTRY_ROLES.map((role) => `[role=${role}]`),
].join(", ");

export const DEFAULT_CONFIG: JumpConfig = {
  activationClick: ACTIVATION_CLICK,
  activationFocus: ACTIVATION_FOCUS,
  candidateSelector: CANDIDATE_SELECTOR,
};
