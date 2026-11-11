/**
 * Element identity and the label memory that keeps a label on its element
 * across activation rounds.
 *
 * A key is a guess about when two rounds mean "the same element", so it is
 * built from evidence the page publishes itself before any inferred text: an
 * explicit row key, the composer marker, or a slot boundary plus the control's
 * accessible name. Outside a slot nothing is inferred, because a bare name
 * repeats across unrelated regions and would move labels between them.
 */

/** Separator inside a composed key; a control character cannot appear in a name. */
const KEY_SEPARATOR = "\u0001";

/** Text fallback length, long enough to tell rows apart and short enough to stay stable. */
const TEXT_LIMIT = 40;

/** Memory entries kept for one page load. */
const MEMORY_LIMIT = 64;

/** The composer is a single surface per page, so its marker is its whole key. */
const COMPOSER_KEY = "composer";

function nonEmpty(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * What the control is called, in the order assistive tech reads it.
 *
 * The text fallback collapses whitespace first: rendered text carries the
 * template's indentation, and a re-render that changes only the wrapping would
 * otherwise look like a different element.
 */
function accessibleName(element: Element): string | undefined {
  const labelled = nonEmpty(element.getAttribute("aria-label"));
  if (labelled !== undefined) return labelled;
  const titled = nonEmpty(element.getAttribute("title"));
  if (titled !== undefined) return titled;
  const text = nonEmpty(element.textContent?.replace(/\s+/g, " "));
  return text === undefined ? undefined : text.slice(0, TEXT_LIMIT);
}

/** The nearest enclosing slot boundary, not the element itself. */
function slotAncestor(element: Element): Element | undefined {
  let node = element.parentElement;
  while (node !== null) {
    if (node.hasAttribute("data-slot")) return node;
    node = node.parentElement;
  }
  return undefined;
}

/**
 * The identity of one candidate, or "" when the page gives nothing to anchor
 * on. An empty key is not an error: it only means the element stays out of the
 * memory and takes its label from the stream every round.
 */
export function identityKey(element: Element): string {
  const rowKey = nonEmpty(element.getAttribute("data-row-key"));
  if (rowKey !== undefined) return rowKey;
  // Checked before the slot branch: the composer is the one surface whose slot
  // holds a single control, so the slot would add nothing but a second name.
  if (element.hasAttribute("data-composer-input")) return COMPOSER_KEY;
  const slot = slotAncestor(element);
  if (slot === undefined) return "";
  const slotName = nonEmpty(slot.getAttribute("data-slot"));
  if (slotName === undefined) return "";
  const name = accessibleName(element);
  if (name === undefined) return "";
  return [slotName, name, element.tagName.toLowerCase()].join(KEY_SEPARATOR);
}

export interface LabelMemory {
  /** Remember that `key` carried `label` this round. Empty keys are ignored. */
  record(key: string, label: string): void;
  /** The remembered label, counting as a use; undefined when unknown. */
  lookup(key: string): string | undefined;
  readonly size: number;
}

/**
 * A bounded least-recently-used table of key to label.
 *
 * Map keeps insertion order, so the first key is always the one that has gone
 * longest without a hit and a lookup re-inserts to move it to the back. The
 * table lives in this closure only: no storage is touched, so a reload starts
 * empty and a stale key can never outlive the page that produced it.
 */
export function createLabelMemory(limit = MEMORY_LIMIT): LabelMemory {
  const entries = new Map<string, string>();
  return {
    record(key: string, label: string): void {
      if (key === "") return;
      entries.delete(key);
      entries.set(key, label);
      while (entries.size > limit) {
        const oldest = entries.keys().next();
        if (oldest.done === true) break;
        entries.delete(oldest.value);
      }
    },
    lookup(key: string): string | undefined {
      if (key === "") return undefined;
      const label = entries.get(key);
      if (label === undefined) return undefined;
      entries.delete(key);
      entries.set(key, label);
      return label;
    },
    get size(): number {
      return entries.size;
    },
  };
}

/**
 * Which candidates may keep the label they had last round.
 *
 * A memory is only spent when it can be spent unambiguously: the label has to
 * be the length this round issues (a two-key memory beside single-key labels
 * would let matchKey complete the short ones early), and the identity has to
 * point at exactly one candidate. Two candidates sharing a key means the key
 * cannot tell them apart, so that whole key is dropped rather than guessed.
 *
 * A label claimed by two identities is dropped for both. That happens without
 * any collision in the candidates: an element leaves, a new one eats the hole
 * it left, and the old one comes back. Honouring both would issue one label
 * twice in a round, which makes the second candidate unreachable.
 */
export function recallLabels(
  memory: LabelMemory,
  candidates: readonly Element[],
  labelLength: number,
): Map<Element, string> {
  const byKey = new Map<string, Element[]>();
  for (const element of candidates) {
    const key = identityKey(element);
    if (key === "") continue;
    const group = byKey.get(key);
    if (group === undefined) byKey.set(key, [element]);
    else group.push(element);
  }
  const claims: { element: Element; label: string }[] = [];
  for (const group of byKey.values()) {
    if (group.length !== 1) continue;
    const label = memory.lookup(identityKey(group[0] as Element));
    if (label === undefined || label.length !== labelLength) continue;
    claims.push({ element: group[0] as Element, label });
  }
  const perLabel = new Map<string, number>();
  for (const claim of claims) perLabel.set(claim.label, (perLabel.get(claim.label) ?? 0) + 1);
  const recalled = new Map<Element, string>();
  for (const claim of claims) {
    if (perLabel.get(claim.label) !== 1) continue;
    recalled.set(claim.element, claim.label);
  }
  return recalled;
}
