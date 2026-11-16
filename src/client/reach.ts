/**
 * User-reachability oracle: a candidate no real user can interact with must not
 * eat a label, because the synthetic click after a label stroke would land on
 * something the user can neither see nor hit (the host's stacked notification
 * cards keep their background card `aria-hidden` + `pointer-events:none`).
 *
 * Three markers block, each checked along the ancestor chain including the
 * element itself:
 * - `aria-hidden` present with any value except "false" ("" blocks too);
 * - the `inert` attribute;
 * - computed `pointer-events: none`.
 *
 * The style check walks every ancestor instead of reading the element alone
 * because jsdom does not resolve CSS inheritance, so each level is queried by
 * hand; in real browsers the walk is redundant (pointer-events inherits) but
 * still correct. dsh-jump's own overlay container is pointer-events:none and
 * never an ancestor of candidates, so it needs no special case.
 *
 * Verdicts are intentionally stateless: a cached "blocked" ancestor would
 * outlive the host un-hiding that card between rounds and wrongly keep it out
 * of the label set. With ~1200 candidates × ~20 ancestors the walk stays in
 * single-digit milliseconds; if a busy page ever measures slower, a per-round
 * cache belongs in app.ts's collectRound, not here.
 */
export function isUserReachable(element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const hidden = node.getAttribute("aria-hidden");
    if (hidden !== null && hidden !== "false") return false;
    if (node.hasAttribute("inert")) return false;
    const view = node.ownerDocument?.defaultView;
    if (view !== null && view !== undefined && view.getComputedStyle(node).pointerEvents === "none") return false;
  }
  return true;
}
