/**
 * UI-element references: what a DOM element is described as, the chip that
 * carries the description, and the two-channel writer that puts it in the
 * composer.
 *
 * This is the one reference kind whose subject is not a record in some store
 * but a node on the page. There is no id to look up later, so the description
 * has to be self-contained: the model reads it and knows which control the
 * reader meant without being able to open it.
 *
 * The host splits writing in two. The span must come from the composer's
 * `captureInsertion()` (detect coordinates plus a draft revision); the chip
 * itself is written through the session input facade's `insertReference`, which
 * refuses a stale revision with a silent `false` rather than throwing. So the
 * retry and the plain-text fallback are this module's job, not the host's.
 */
import type { RowReact } from "./react.ts";

/** The source name the chip is filed under; the host looks the codec up by it. */
export const JUMP_REFERENCE_SOURCE = "lionad.jump";

/** The trigger the source declares. Identity only: it never lists candidates. */
export const JUMP_REFERENCE_TRIGGER = "@";

/** A description is one line; longer text is cut here. */
const TEXT_LIMIT = 80;

/** How many classes a description keeps. */
const CLASS_LIMIT = 3;

/**
 * Class names that carry no meaning to a reader.
 *
 * Two families: the atomic utilities and state classes every UI kit emits
 * (`flex`, `mt-2`, `is-active`), and the hashed names CSS modules and CSS-in-JS
 * produce (`css-1x2y3z`, `sc-bdVaJa`, `_a1b2c3`). A description that lists them
 * tells the model nothing about which control was meant.
 */
const NOISE_CLASS = /^(?:css-|sc-|jsx-|_|svelte-|emotion-)/u;
const NOISE_EXACT: ReadonlySet<string> = new Set([
  "flex",
  "grid",
  "block",
  "inline",
  "hidden",
  "relative",
  "absolute",
  "static",
  "sticky",
  "fixed",
  "container",
  "row",
  "col",
  "wrap",
  "grow",
  "shrink",
  "truncate",
  "sr-only",
  "active",
  "disabled",
  "selected",
  "focused",
  "open",
  "closed",
]);

/** Everything one element reference needs, in the three spellings the host uses. */
export interface UiReferencePayload {
  readonly kind: "ui.element";
  /** The stable identity: `tag#id`, `tag[data-testid=…]`, else the bare tag. */
  readonly id: string;
  /** Chip text: the tag plus the most human of its identifiers. */
  readonly label: string;
  /** Draft text when the chip is copied out or the chip path is unavailable. */
  readonly clipboardText: string;
  /** What the model reads in place of the chip. */
  readonly modelText: string;
  /** The chip's `ref`: the descriptor as JSON, so the codec can rebuild the text. */
  readonly ref: string;
}

/** The facts one element reference carries, as the chip's `ref` stores them. */
export interface DomReferenceDescriptor {
  readonly kind: "ui.element";
  /** Lowercased tag name. */
  readonly tag: string;
  readonly id?: string;
  readonly testId?: string;
  readonly classes?: readonly string[];
  readonly role?: string;
  readonly ariaLabel?: string;
  /** Visible text, whitespace-collapsed and truncated. */
  readonly text?: string;
}

/** The span the composer hands out; only `captureInsertion` may produce one. */
export interface TokenSpanLike {
  readonly start: number;
  readonly end: number;
  readonly draftRev: number;
}

/** The one structured-reference write the facade exposes. */
export interface UiReferenceInsert {
  readonly source: string;
  readonly ref: string;
  readonly label: string;
  readonly clipboardText: string;
  readonly appearance?: "session" | "file" | "folder";
}

/**
 * The composer capabilities the writer needs, injected as a plain object so the
 * state machine is testable without a host.
 */
export interface UiReferenceInsertionDeps {
  readonly captureSpan: () => TokenSpanLike | undefined;
  readonly insertReference: (insert: UiReferenceInsert, span: TokenSpanLike) => boolean;
  readonly insertText: (text: string, span: TokenSpanLike) => boolean;
  /**
   * Whether a chip would survive to send time. Read per write: a source can be
   * disposed after the pick that offered this write began.
   */
  readonly canInsertReference: boolean;
}

/**
 * Which channel took the reference, or why neither did.
 *
 * `no-session` is separate from `failed`: it means there is no composer to
 * write into at all (no session on screen, or a host without the input plane),
 * which the settings page explains differently from a write that was refused.
 */
export type UiReferenceInsertionResult = "reference" | "text" | "failed" | "no-session";

/** Whether a class name says anything about what the element is. */
function isMeaningfulClass(name: string): boolean {
  if (name === "" || NOISE_EXACT.has(name)) return false;
  if (NOISE_CLASS.test(name)) return false;
  // A name with a separator was written by a person; a bare lowercase word is
  // usually a utility. This is a heuristic, and a wrong guess only costs the
  // description one word.
  return name.includes("-") || name.includes("_");
}

/** Collapse whitespace and cut to one bounded line. */
function oneLine(value: string): string {
  const flat = value.replace(/\s+/gu, " ").trim();
  return flat.length <= TEXT_LIMIT ? flat : `${flat.slice(0, TEXT_LIMIT - 1).trimEnd()}…`;
}

/**
 * Describe one element as the facts a chip can carry.
 *
 * The priority order is what makes the description useful: a test id is stable
 * across renders, an id is usually stable, a class is the last resort because
 * it is the one that changes when someone restyles the control.
 * @param element - the element the reader picked.
 * @returns the descriptor; every optional field is absent rather than empty.
 */
export function describeElement(element: Element): DomReferenceDescriptor {
  const tag = element.tagName.toLowerCase();
  const id = element.getAttribute("id")?.trim() ?? "";
  const testId = element.getAttribute("data-testid")?.trim() ?? "";
  const role = element.getAttribute("role")?.trim() ?? "";
  const ariaLabel = element.getAttribute("aria-label")?.trim() ?? "";
  const classes = Array.from(element.classList).filter(isMeaningfulClass).slice(0, CLASS_LIMIT);
  // `textContent` rather than `innerText`: the latter needs layout, which a
  // jsdom test and a hidden element both lack, and the difference only shows up
  // in whitespace the collapse removes anyway.
  const text = oneLine(element.textContent ?? "");
  return {
    kind: "ui.element",
    tag,
    ...(id === "" ? {} : { id }),
    ...(testId === "" ? {} : { testId }),
    ...(classes.length === 0 ? {} : { classes }),
    ...(role === "" ? {} : { role }),
    ...(ariaLabel === "" ? {} : { ariaLabel }),
    ...(text === "" ? {} : { text }),
  };
}

/**
 * The single most identifying fact, in priority order.
 * @param descriptor - the element's description.
 * @returns the identity, or the bare tag when nothing else is known.
 */
function identityOf(descriptor: DomReferenceDescriptor): string {
  if (descriptor.testId !== undefined) return `${descriptor.tag}[data-testid=${descriptor.testId}]`;
  if (descriptor.id !== undefined) return `${descriptor.tag}#${descriptor.id}`;
  return descriptor.tag;
}

/**
 * The human-readable half of the chip label.
 * @param descriptor - the element's description.
 * @returns the aria label, else the visible text, else the first class.
 */
function humanNameOf(descriptor: DomReferenceDescriptor): string | undefined {
  if (descriptor.ariaLabel !== undefined) return descriptor.ariaLabel;
  if (descriptor.text !== undefined) return descriptor.text;
  return descriptor.classes?.[0];
}

/**
 * Spell one descriptor as the text the model reads.
 *
 * Both the payload and the codec go through here so the text a reader sees at
 * insert time and the text the model receives cannot drift apart.
 * @param descriptor - the element's description.
 * @returns one line of `key=value` facts after the tag.
 */
function modelTextOf(descriptor: DomReferenceDescriptor): string {
  const parts = [`[ui element] <${descriptor.tag}>`];
  if (descriptor.testId !== undefined) parts.push(`data-testid="${descriptor.testId}"`);
  if (descriptor.id !== undefined) parts.push(`id="${descriptor.id}"`);
  if (descriptor.role !== undefined) parts.push(`role=${descriptor.role}`);
  if (descriptor.ariaLabel !== undefined) parts.push(`aria-label="${descriptor.ariaLabel}"`);
  if (descriptor.classes !== undefined && descriptor.classes.length > 0) {
    parts.push(`class="${descriptor.classes.join(" ")}"`);
  }
  if (descriptor.text !== undefined) parts.push(`text="${descriptor.text}"`);
  return parts.join(" ");
}

/**
 * Build the three spellings of one element reference.
 * @param descriptor - the element's description.
 * @returns the payload; the draft text never starts with `/` or `@`.
 */
export function uiReferencePayload(descriptor: DomReferenceDescriptor): UiReferencePayload {
  const id = identityOf(descriptor);
  const human = humanNameOf(descriptor);
  return {
    kind: "ui.element",
    id,
    label: human === undefined ? descriptor.tag : `${descriptor.tag}「${human}」`,
    clipboardText: `[ui element ${id}]`,
    modelText: modelTextOf(descriptor),
    ref: JSON.stringify(descriptor),
  };
}

/**
 * Decode a chip's `ref` back into the descriptor it carries.
 *
 * A malformed ref must not block the send: the host treats a throwing codec as
 * a failed submission and keeps the draft, which would strand a chip the reader
 * can no longer explain.
 * @param ref - the chip's `ref` string.
 * @returns the descriptor, or undefined when the ref is not ours.
 */
function decodeRef(ref: string): DomReferenceDescriptor | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(ref);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object") return undefined;
  const fields = parsed as Partial<Record<keyof DomReferenceDescriptor, unknown>>;
  if (typeof fields.tag !== "string" || fields.tag === "") return undefined;
  return {
    kind: "ui.element",
    tag: fields.tag,
    ...(typeof fields.id === "string" ? { id: fields.id } : {}),
    ...(typeof fields.testId === "string" ? { testId: fields.testId } : {}),
    ...(Array.isArray(fields.classes)
      ? { classes: fields.classes.filter((name): name is string => typeof name === "string") }
      : {}),
    ...(typeof fields.role === "string" ? { role: fields.role } : {}),
    ...(typeof fields.ariaLabel === "string" ? { ariaLabel: fields.ariaLabel } : {}),
    ...(typeof fields.text === "string" ? { text: fields.text } : {}),
  };
}

/** The clipboard projection of one chip; the codec's synchronous half. */
export function uiRefClipboardText(ref: string): string {
  const descriptor = decodeRef(ref);
  return descriptor === undefined ? `[ui element ${ref}]` : `[ui element ${identityOf(descriptor)}]`;
}

/** The model text of one chip; the codec's asynchronous half. */
export function uiRefModelText(ref: string): string {
  const descriptor = decodeRef(ref);
  return descriptor === undefined ? `[ui element ${ref}]` : modelTextOf(descriptor);
}

/**
 * Write one element reference into the composer.
 *
 * Order matters: the structured chip is what keeps the reference atomic and
 * clickable, so a plain-text write only happens once the chip path has failed
 * twice. The second attempt re-captures the span because the first attempt's
 * revision may have been superseded by an edit that landed in between.
 * @param deps - the composer capabilities.
 * @param payload - the reference to write.
 * @returns which channel accepted it.
 */
export function insertUiReference(
  deps: UiReferenceInsertionDeps,
  payload: UiReferencePayload,
): UiReferenceInsertionResult {
  const insert: UiReferenceInsert = {
    source: JUMP_REFERENCE_SOURCE,
    ref: payload.ref,
    label: payload.label,
    clipboardText: payload.clipboardText,
    appearance: "session",
  };
  // No registered source means no codec at send time, so the chip path is
  // skipped entirely rather than attempted and refused later.
  if (deps.canInsertReference) {
    const first = deps.captureSpan();
    if (first !== undefined) {
      if (deps.insertReference(insert, first)) return "reference";
      const second = deps.captureSpan();
      if (second !== undefined && deps.insertReference(insert, second)) return "reference";
    }
  }
  // No span at all means the composer has no caret to write at; the text path
  // asks once more because the editor may have settled in between.
  const span = deps.captureSpan();
  if (span === undefined) return "failed";
  return deps.insertText(payload.clipboardText, span) ? "text" : "failed";
}

/** What the session bridge publishes: the composer face for the shown session. */
export interface JumpReferenceBridgeState {
  readonly sessionId: string | null;
  readonly inputActions: InputActionsFace | null;
}

/** The slice of the composer face the reference write reads. */
export interface InputActionsFace {
  captureInsertion?(): TokenSpanLike;
  insertText?(text: string, span: TokenSpanLike): boolean;
}

/** What one bridge mount receives from the framework. */
export interface JumpBridgeProps {
  readonly sessionId?: string;
  readonly inputActions?: InputActionsFace;
}

/**
 * Build the invisible session-scope entry that publishes the composer.
 *
 * A root-level plugin has no public way to ask "which session is on screen";
 * a `session`-scope slot is the documented one, because the framework mounts it
 * for exactly the session being shown and hands it the Session standard props.
 * @param React - the React slice resolved from the platform module table.
 * @param publish - sink for the published state.
 * @returns the component; it always renders null.
 */
export function createJumpBridgeView(
  React: RowReact,
  publish: (state: JumpReferenceBridgeState) => void,
): (props: unknown) => unknown {
  return function JumpSessionBridge(props: unknown): unknown {
    // A host that mounts the entry without the Session standard props is the
    // same as no session: the bridge publishes absence rather than throwing.
    const bridge = (props ?? {}) as JumpBridgeProps;
    const sessionId = bridge.sessionId ?? null;
    const inputActions = bridge.inputActions ?? null;
    // The effect must not depend on `inputActions` identity: the host recreates
    // that face on every render, and publishing it would wake the runtime, which
    // would render the host again. A ref carries the fresh value; a boolean
    // carries "arrived or not".
    const latest = React.useRef<JumpReferenceBridgeState>({ sessionId, inputActions });
    latest.current = { sessionId, inputActions };
    const connected = inputActions !== null;
    React.useEffect(() => {
      publish({ sessionId, inputActions: latest.current.inputActions });
    }, [sessionId, connected]);
    return null;
  };
}

/** The slice of `ctx.inputTriggers` this package registers into. */
export interface InputTriggersFace {
  registerSource(source: JumpReferenceSource): () => void;
}

/** The source shape, narrowed to what this package fills in. */
export interface JumpReferenceSource {
  readonly trigger: string;
  readonly name: string;
  readonly showGroupTitle: boolean;
  candidates(): Promise<readonly never[]>;
  onPick(): undefined;
  readonly codec: {
    clipboardText(ref: string): string;
    serialize(ref: string, signal?: AbortSignal): Promise<string>;
  };
}

/**
 * Build the source that gives element chips an identity at send time.
 *
 * It contributes no `@` menu rows: the reference chord is the only way in, and
 * a group that can never match a query would still take a row in the menu.
 * @returns the source to register.
 */
export function createJumpReferenceSource(): JumpReferenceSource {
  return {
    trigger: JUMP_REFERENCE_TRIGGER,
    name: JUMP_REFERENCE_SOURCE,
    showGroupTitle: false,
    async candidates() {
      return [];
    },
    onPick() {
      return undefined;
    },
    codec: {
      clipboardText: uiRefClipboardText,
      async serialize(ref: string) {
        return uiRefModelText(ref);
      },
    },
  };
}
