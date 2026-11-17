/**
 * User-reachability oracle: a candidate no real user can interact with must not
 * eat a label, because the synthetic click after a label stroke would land on
 * something the user can neither see nor hit (the host's stacked notification
 * cards keep their background card `aria-hidden` + `pointer-events:none`).
 *
 * Two markers block along the ancestor chain, including the element itself:
 * - `aria-hidden` present with any value except "false" ("" blocks too);
 * - the `inert` attribute.
 * Both describe a subtree, so a descendant can never opt back in.
 *
 * `pointer-events` is a different matter: it inherits, but a descendant may
 * re-declare it and become hittable again. Hit-testing reads the target's own
 * computed value, which already carries the inherited result, so this reads
 * that one value and never walks up. The right sidebar's start page is exactly
 * that shape: the panel shell is `pointer-events:none` so the gaps between
 * cards pass clicks through, and every tile re-enables itself with `auto`.
 * Walking the chain would strip the label off all of them.
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
  }
  const view = element.ownerDocument?.defaultView;
  if (view !== null && view !== undefined && view.getComputedStyle(element).pointerEvents === "none") return false;
  return true;
}
