/**
 * Reference mode: the element descriptor, the chip it becomes, the writer's
 * state machine, the third settings row, and the one behaviour that defines the
 * mode — picking a label must not click or focus anything.
 *
 * The DOM cases run under jsdom because the subject is a real element; the
 * writer is driven through an injected deps object, since the interesting
 * behaviour is the order it tries the channels in.
 */
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  JUMP_REFERENCE_SOURCE,
  createJumpBridgeView,
  createJumpReferenceSource,
  describeElement,
  findDescribedElement,
  insertUiReference,
  revealElement,
  uiRefClipboardText,
  uiRefModelText,
  uiReferencePayload,
  type UiReferenceInsert,
  type UiReferenceInsertionDeps,
  type TokenSpanLike,
} from "../src/client/reference.ts";
import { createApp, type JumpWindow } from "../src/client/app.ts";
import { createDefaultBindings, type JumpBindings } from "../src/client/bindings.ts";
import { createKeyState, matchKey } from "../src/client/keys.ts";
import { createBindingsController } from "../src/client/settings-controller.ts";
import { JumpSettingsPage } from "../src/client/settings-page.ts";
import { ZH } from "../src/client/copy.ts";
import { createBindingsStore, type BindingsStorage } from "../src/client/store.ts";
import type { RowReact } from "../src/client/react.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const doc = dom.window.document;

beforeEach(() => {
  doc.body.replaceChildren();
});

/** A chord with the primary modifier, the shape the recorder produces. */
function chord(key: string): JumpBindings["click"] {
  return { key, meta: true, alt: false, ctrl: false, shift: false };
}

describe("describeElement", () => {
  it("prefers the test id over the id over the classes", () => {
    const element = doc.createElement("button");
    element.setAttribute("data-testid", "gx-reference");
    element.setAttribute("id", "gx-reference");
    element.className = "gx-btn";
    const descriptor = describeElement(element);
    expect(descriptor.testId).toBe("gx-reference");
    expect(descriptor.id).toBe("gx-reference");
    expect(descriptor.tag).toBe("button");
  });

  it("drops utility words and generated hashes, keeping authored names", () => {
    const element = doc.createElement("div");
    element.className = "flex hidden css-1x2y3z sc-bdVaJa _a1b2c3 gx-reference-panel";
    // A name with a separator was written by a person; the rest are a utility
    // word or a hash from CSS modules / CSS-in-JS.
    expect(describeElement(element).classes).toEqual(["gx-reference-panel"]);
  });

  it("keeps at most three meaningful classes", () => {
    const element = doc.createElement("div");
    element.className = "a-one b-two c-three d-four";
    expect(describeElement(element).classes).toEqual(["a-one", "b-two", "c-three"]);
  });

  it("collapses whitespace and truncates long text", () => {
    const element = doc.createElement("button");
    element.textContent = `  ${"引用".repeat(60)}  `;
    const text = describeElement(element).text ?? "";
    expect(text).not.toContain("\n");
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(80);
  });

  it("omits empty fields rather than storing empty strings", () => {
    const descriptor = describeElement(doc.createElement("span"));
    expect(descriptor).toEqual({ kind: "ui.element", tag: "span" });
  });
});

describe("uiReferencePayload", () => {
  it("identifies the element by its most stable fact", () => {
    const element = doc.createElement("button");
    element.setAttribute("data-testid", "gx-reference");
    element.textContent = "引用";
    const payload = uiReferencePayload(describeElement(element));
    expect(payload.id).toBe("button[data-testid=gx-reference]");
    expect(payload.clipboardText).toBe("[ui element button[data-testid=gx-reference]]");
    expect(payload.label).toBe("button「引用」");
    expect(payload.modelText).toContain('<button>');
    expect(payload.modelText).toContain('data-testid="gx-reference"');
    expect(payload.modelText).toContain('text="引用"');
  });

  it("falls back to the id, then to the bare tag", () => {
    const withId = doc.createElement("button");
    withId.id = "gx-reference";
    expect(uiReferencePayload(describeElement(withId)).id).toBe("button#gx-reference");
    expect(uiReferencePayload(describeElement(doc.createElement("div"))).id).toBe("div");
  });

  it("never starts the draft text with a character the host parses", () => {
    const payload = uiReferencePayload(describeElement(doc.createElement("button")));
    expect(payload.clipboardText.startsWith("/")).toBe(false);
    expect(payload.clipboardText.startsWith("@")).toBe(false);
    expect(payload.clipboardText.startsWith("[ui element ")).toBe(true);
    expect(payload.modelText.startsWith("@")).toBe(false);
  });

  it("carries the same facts in the chip ref as in the model text", () => {
    const element = doc.createElement("button");
    element.setAttribute("aria-label", "引用");
    element.className = "gx-btn";
    const payload = uiReferencePayload(describeElement(element));
    expect(uiRefModelText(payload.ref)).toBe(payload.modelText);
    expect(uiRefClipboardText(payload.ref)).toBe(payload.clipboardText);
  });

  it("falls back to the raw ref instead of throwing on a malformed chip", () => {
    expect(uiRefModelText("{not json")).toBe("[ui element {not json]");
    expect(uiRefClipboardText("{not json")).toBe("[ui element {not json]");
    expect(uiRefModelText(JSON.stringify({ id: "no tag" }))).toBe(
      `[ui element ${JSON.stringify({ id: "no tag" })}]`,
    );
  });
});

describe("insertUiReference", () => {
  const span = (draftRev: number): TokenSpanLike => ({ start: 0, end: 0, draftRev });
  const payload = uiReferencePayload(describeElement(doc.createElement("button")));

  function deps(
    script: {
      readonly spans?: readonly (TokenSpanLike | undefined)[];
      readonly reference?: readonly boolean[];
      readonly text?: readonly boolean[];
      readonly canInsertReference?: boolean;
    } = {},
  ): UiReferenceInsertionDeps & { readonly inserts: UiReferenceInsert[]; readonly texts: string[] } {
    const inserts: UiReferenceInsert[] = [];
    const texts: string[] = [];
    const spans = script.spans ?? [span(1)];
    const reference = script.reference ?? [true];
    const text = script.text ?? [true];
    let spanCall = 0;
    let referenceCall = 0;
    let textCall = 0;
    return {
      inserts,
      texts,
      captureSpan: () => spans[Math.min(spanCall++, spans.length - 1)],
      insertReference: (insert, _at) => {
        inserts.push(insert);
        return reference[Math.min(referenceCall++, reference.length - 1)] ?? false;
      },
      insertText: (value) => {
        texts.push(value);
        return text[Math.min(textCall++, text.length - 1)] ?? false;
      },
      canInsertReference: script.canInsertReference ?? true,
    };
  }

  it("writes the chip and stops there when the first attempt lands", () => {
    const d = deps();
    expect(insertUiReference(d, payload)).toBe("reference");
    expect(d.inserts).toHaveLength(1);
    expect(d.inserts[0]?.source).toBe(JUMP_REFERENCE_SOURCE);
    expect(d.texts).toHaveLength(0);
  });

  it("retries once with a fresh span when the revision went stale", () => {
    const d = deps({ spans: [span(1), span(2)], reference: [false, true] });
    expect(insertUiReference(d, payload)).toBe("reference");
    expect(d.inserts).toHaveLength(2);
  });

  it("never builds a chip when the source is not registered", () => {
    // Reference mode stays usable without the source; it just writes the plain
    // text form, which the host can still send.
    const d = deps({ canInsertReference: false });
    expect(insertUiReference(d, payload)).toBe("text");
    expect(d.inserts).toHaveLength(0);
    expect(d.texts).toEqual([payload.clipboardText]);
  });

  it("degrades to plain text when the chip path refuses twice", () => {
    const d = deps({ reference: [false] });
    expect(insertUiReference(d, payload)).toBe("text");
    expect(d.texts).toEqual([payload.clipboardText]);
  });

  it("reports failure when neither channel accepts the write", () => {
    expect(insertUiReference(deps({ reference: [false], text: [false] }), payload)).toBe("failed");
  });

  it("goes straight to plain text when the chip path has no span", () => {
    const d = deps({ spans: [undefined, span(1)] });
    expect(insertUiReference(d, payload)).toBe("text");
    expect(d.inserts).toHaveLength(0);
  });

  it("reports failure when no span is available for the fallback either", () => {
    expect(insertUiReference(deps({ spans: [undefined] }), payload)).toBe("failed");
  });
});

describe("createJumpReferenceSource", () => {
  it("declares an identity-only source on the @ trigger", async () => {
    const source = createJumpReferenceSource();
    expect(source.trigger).toBe("@");
    expect(source.name).toBe("lionad.jump");
    expect(source.showGroupTitle).toBe(false);
    await expect(source.candidates()).resolves.toEqual([]);
    expect(source.onPick()).toBeUndefined();
  });

  it("serializes a valid ref and falls back on a malformed one", async () => {
    const source = createJumpReferenceSource();
    const payload = uiReferencePayload(describeElement(doc.createElement("button")));
    await expect(source.codec.serialize(payload.ref, new AbortController().signal)).resolves.toBe(
      payload.modelText,
    );
    await expect(source.codec.serialize("not-json", new AbortController().signal)).resolves.toBe(
      "[ui element not-json]",
    );
  });

  it("carries the click handler only when the runtime supplied one", () => {
    // A source with no handler must not answer the host's click at all: the
    // host reads the key's presence, and a stub returning false would be the
    // same thing written twice.
    expect(createJumpReferenceSource().openReference).toBeUndefined();
    const handler = vi.fn(() => true);
    const source = createJumpReferenceSource(handler);
    expect(source.openReference).toBe(handler);
    expect(source.openReference?.({}, { ref: "x" })).toBe(true);
    expect(handler).toHaveBeenCalledWith({}, { ref: "x" });
  });
});

describe("revealElement", () => {
  /** A fresh page per case: the lookup walks the whole document. */
  function page(html: string): Document {
    return new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;
  }

  /** jsdom has no layout, so `scrollIntoView` has to be stubbed to observe it. */
  function spyOnReveal(element: Element): { scrolled: (boolean | ScrollIntoViewOptions)[]; focused: FocusOptions[] } {
    const scrolled: (boolean | ScrollIntoViewOptions)[] = [];
    const focused: FocusOptions[] = [];
    (element as Element & { scrollIntoView: (arg?: boolean | ScrollIntoViewOptions) => void }).scrollIntoView =
      arg => {
        if (arg !== undefined) scrolled.push(arg);
      };
    (element as Element & { focus: (options?: FocusOptions) => void }).focus = options => {
      if (options !== undefined) focused.push(options);
    };
    return { scrolled, focused };
  }

  const refOf = (element: Element): string => JSON.stringify(describeElement(element));

  it("finds the element by its test id and centres it", () => {
    const document = page('<button data-testid="gx-reference">引用</button>');
    const element = document.querySelector("button");
    if (element === null) throw new Error("fixture button missing");
    const seen = spyOnReveal(element);
    expect(revealElement(refOf(element), document)).toBe(true);
    expect(seen.scrolled).toEqual([{ block: "center", inline: "center" }]);
    // The focus must not scroll on its own: the centring above is the decision.
    expect(seen.focused).toEqual([{ preventScroll: true }]);
  });

  it("finds the test id after the element changes tag", () => {
    const document = page('<a data-testid="gx-reference" href="#">引用</a>');
    const element = document.querySelector("a");
    if (element === null) throw new Error("fixture anchor missing");
    const seen = spyOnReveal(element);
    // The chip was taken from a button; the page re-rendered it as a link.
    const ref = JSON.stringify({ kind: "ui.element", tag: "button", testId: "gx-reference" });
    expect(revealElement(ref, document)).toBe(true);
    expect(seen.scrolled).toEqual([{ block: "center", inline: "center" }]);
    expect(seen.focused).toEqual([{ preventScroll: true }]);
  });

  it("finds the id without the recorded tag", () => {
    const document = page('<section id="gx-panel">面板</section>');
    const ref = JSON.stringify({ kind: "ui.element", tag: "div", id: "gx-panel" });
    const hit = findDescribedElement(JSON.parse(ref) as never, document);
    expect(hit?.tagName).toBe("SECTION");
  });

  it("prefers the painted copy when the test id appears twice", () => {
    const document = page(
      '<button data-testid="gx-save" style="display:none">旧</button>' +
        '<button data-testid="gx-save">新</button>',
    );
    const ref = JSON.stringify({ kind: "ui.element", tag: "button", testId: "gx-save" });
    const hit = findDescribedElement(JSON.parse(ref) as never, document);
    expect(hit?.textContent).toBe("新");
  });

  it("matches a test id that could not be written into a selector", () => {
    const document = page('<button data-testid="gx:save &quot;draft&quot;">保存</button>');
    const ref = JSON.stringify({ kind: "ui.element", tag: "button", testId: 'gx:save "draft"' });
    expect(revealElement(ref, document)).toBe(true);
  });

  it("falls back to the id when the test id is gone", () => {
    const document = page('<div id="gx-panel">面板</div>');
    const element = document.querySelector("div");
    if (element === null) throw new Error("fixture div missing");
    const ref = JSON.stringify({ kind: "ui.element", tag: "div", id: "gx-panel" });
    const seen = spyOnReveal(element);
    expect(revealElement(ref, document)).toBe(true);
    expect(seen.scrolled).toHaveLength(1);
  });

  it("falls back to the tag plus its meaningful classes", () => {
    const document = page('<div class="gx-row">a</div><div class="gx-row gx-row-active">b</div>');
    const ref = JSON.stringify({ kind: "ui.element", tag: "div", classes: ["gx-row", "gx-row-active"] });
    const hit = findDescribedElement(JSON.parse(ref) as never, document);
    expect(hit?.textContent).toBe("b");
  });

  it("falls back to role and aria label", () => {
    const document = page('<span role="button" aria-label="关闭">×</span><span role="button">+</span>');
    const ref = JSON.stringify({ kind: "ui.element", tag: "span", role: "button", ariaLabel: "关闭" });
    const hit = findDescribedElement(JSON.parse(ref) as never, document);
    expect(hit?.textContent).toBe("×");
  });

  it("falls back to the visible text", () => {
    const document = page('<button>保存</button><button>取消</button>');
    const ref = JSON.stringify({ kind: "ui.element", tag: "button", text: "取消" });
    const hit = findDescribedElement(JSON.parse(ref) as never, document);
    expect(hit?.textContent).toBe("取消");
  });

  it("prefers a live test id over a stale id elsewhere on the page", () => {
    const document = page('<div id="gx-panel">old</div><div data-testid="gx-panel">new</div>');
    const ref = JSON.stringify({ kind: "ui.element", tag: "div", id: "gx-panel", testId: "gx-panel" });
    const hit = findDescribedElement(JSON.parse(ref) as never, document);
    expect(hit?.textContent).toBe("new");
  });

  it("never reveals the composer the chip itself lives in", () => {
    const document = page('<div contenteditable="true"><span>保存</span></div>');
    const ref = JSON.stringify({ kind: "ui.element", tag: "span", text: "保存" });
    expect(revealElement(ref, document)).toBe(false);
  });

  it("reports a miss instead of throwing", () => {
    const document = page("<p>nothing here</p>");
    expect(revealElement("not-json", document)).toBe(false);
    expect(revealElement(JSON.stringify({ kind: "ui.element", tag: "" }), document)).toBe(false);
    expect(revealElement(JSON.stringify({ kind: "ui.element", tag: "button" }), document)).toBe(false);
  });

  it("skips the scroll when the element cannot scroll and still focuses", () => {
    const document = page('<input id="gx-field" />');
    const element = document.querySelector("input");
    if (element === null) throw new Error("fixture input missing");
    const focused: FocusOptions[] = [];
    (element as Element & { focus: (options?: FocusOptions) => void }).focus = options => {
      if (options !== undefined) focused.push(options);
    };
    const ref = JSON.stringify({ kind: "ui.element", tag: "input", id: "gx-field" });
    expect(revealElement(ref, document)).toBe(true);
    expect(focused).toEqual([{ preventScroll: true }]);
  });
});

describe("createJumpBridgeView", () => {
  const REACT: RowReact = {
    createElement: () => null,
    // The bridge publishes from its effect, so the fake has to run it.
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useRef: <T,>(initial: T) => ({ current: initial }),
    useSyncExternalStore: () => undefined as never,
  };

  it("publishes the session and the composer it was handed", () => {
    const published: unknown[] = [];
    const Bridge = createJumpBridgeView(REACT, (state) => published.push(state));
    const actions = { captureInsertion: () => ({ start: 0, end: 0, draftRev: 1 }) };
    expect(Bridge({ sessionId: "s1", inputActions: actions })).toBeNull();
    expect(published).toEqual([{ sessionId: "s1", inputActions: actions }]);
  });

  it("publishes absence when the host hands it no props", () => {
    const published: unknown[] = [];
    const Bridge = createJumpBridgeView(REACT, (state) => published.push(state));
    expect(Bridge(undefined)).toBeNull();
    expect(published).toEqual([{ sessionId: null, inputActions: null }]);
  });
});

describe("reference mode in the key machine", () => {
  const LABELS = ["a", "b"];

  function key(over: Record<string, unknown> = {}) {
    return { key: "r", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, ...over };
  }

  it("opens a round on the configured chord", () => {
    const bindings: JumpBindings = { ...createDefaultBindings("macos"), reference: chord("r") };
    const state = createKeyState();
    expect(matchKey(state, key({ metaKey: true }), [], bindings)).toEqual({ type: "activate-reference" });
    expect(state.mode).toBe("reference");
  });

  it("stays unreachable while unbound", () => {
    const bindings = createDefaultBindings("macos");
    expect(bindings.reference).toBeNull();
    expect(matchKey(createKeyState(), key({ metaKey: true }), [], bindings)).toEqual({ type: "ignore" });
  });

  it("leaves on Escape and on the same chord again", () => {
    const bindings: JumpBindings = { ...createDefaultBindings("macos"), reference: chord("r") };
    const a = createKeyState();
    matchKey(a, key({ metaKey: true }), [], bindings);
    expect(matchKey(a, key({ key: "Escape" }), LABELS, bindings)).toEqual({ type: "exit" });

    // The chord pressed again means with its modifiers; a bare "r" is a label
    // attempt, which is why the modifier branch is what cancels it.
    const b = createKeyState();
    matchKey(b, key({ metaKey: true }), [], bindings);
    expect(matchKey(b, key({ metaKey: true }), LABELS, bindings)).toEqual({ type: "exit" });
  });
});

describe("reference mode leaves the page alone", () => {
  const win = dom.window as unknown as JumpWindow;

  function button(label: string): HTMLButtonElement {
    const element = doc.createElement("button");
    element.textContent = label;
    element.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 10, height: 10, left: 0, top: 0, right: 10, bottom: 10, toJSON: () => ({}) }) as DOMRect;
    doc.body.append(element);
    return element;
  }

  function keydown(over: Record<string, unknown>): KeyboardEvent {
    return new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...over });
  }

  it("calls onReference once and never clicks or focuses", () => {
    const target = button("引用");
    const clicks = vi.fn();
    target.addEventListener("click", clicks);
    const onReference = vi.fn();
    const bindings: JumpBindings = { ...createDefaultBindings("macos"), reference: chord("r") };
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      bindings: { get: () => bindings },
      onReference,
    }).apply();

    win.dispatchEvent(keydown({ key: "r", metaKey: true }));
    // One button on the page, so its label is whatever the round assigned.
    const label = doc.querySelector("[data-dsh-jump-overlay]")?.textContent ?? "";
    expect(label).not.toBe("");
    win.dispatchEvent(keydown({ key: "a" }));

    expect(onReference).toHaveBeenCalledTimes(1);
    expect(onReference.mock.calls[0]?.[0]).toBe(target);
    expect(clicks).not.toHaveBeenCalled();
    expect(doc.activeElement).not.toBe(target);
    teardown();
  });

  it("does not open a round when the chord is unbound", () => {
    button("引用");
    const onReference = vi.fn();
    const teardown = createApp({
      window: win,
      isVisible: () => true,
      bindings: { get: () => createDefaultBindings("macos") },
      onReference,
    }).apply();
    win.dispatchEvent(keydown({ key: "r", metaKey: true }));
    expect(doc.querySelector("[data-dsh-jump-overlay]")).toBeNull();
    expect(onReference).not.toHaveBeenCalled();
    teardown();
  });
});

describe("the reference row", () => {
  function memory(): BindingsStorage {
    let value: string | null = null;
    return {
      getItem: () => value,
      setItem: (_key, next) => {
        value = next;
      },
      removeItem: () => {
        value = null;
      },
    };
  }

  function setup() {
    const store = createBindingsStore({ storage: memory(), platform: "macos" });
    const controller = createBindingsController({ store, platform: "macos" });
    return { store, controller };
  }

  function press(over: Record<string, unknown>) {
    return { key: "r", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, ...over };
  }

  it("saves a recorded chord and unbinds on demand", () => {
    const { controller, store } = setup();
    controller.begin("reference");
    expect(controller.press(press({ key: "r", metaKey: true }))).toBe("saved");
    expect(store.get().reference).toEqual(chord("r"));

    controller.disableAction("reference");
    expect(store.get().reference).toBeNull();
  });

  it("restores reference mode to unbound rather than to a shipped chord", () => {
    const { controller, store } = setup();
    controller.begin("reference");
    controller.press(press({ key: "r", metaKey: true }));
    controller.resetAction("reference");
    expect(store.get().reference).toBeNull();
  });

  it("refuses a chord another mode already holds", () => {
    const { controller } = setup();
    controller.begin("reference");
    // ⌘H is the shipped click chord.
    expect(controller.press(press({ key: "h", metaKey: true }))).toBe("rejected");
    expect(controller.getState().issue).toBe("duplicate");
  });

  it("leaves click and focus alone when reference is disabled", () => {
    const { controller, store } = setup();
    const before = store.get();
    controller.disableAction("click");
    expect(store.get()).toEqual(before);
  });

  it("renders three rows, the third showing the off state", () => {
    const { controller } = setup();
    const REACT: RowReact = {
      createElement: (type: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) => ({
        type,
        props,
        children,
      }),
      useEffect: () => undefined,
      useRef: <T,>(initial: T) => ({ current: initial }),
      useSyncExternalStore: <T,>(_subscribe: unknown, snapshot: () => T) => snapshot(),
    };
    interface Node {
      props: Record<string, unknown>;
      children: Node[];
    }
    const tree = JumpSettingsPage({ React: REACT, controller, platform: "macos", copy: ZH }) as unknown as Node;
    // The page emits nulls for the conditional rows, so the filter has to
    // survive them before it can read a mode off anything.
    const rows = tree.children.filter(
      (child) => child !== null && child.props["data-dsh-jump-mode"] !== undefined,
    );
    expect(rows.map((row) => row.props["data-dsh-jump-mode"])).toEqual(["click", "focus", "reference"]);
    // The reference row's chord button shows the off word, and it offers the
    // control that unbinds it.
    const referenceRow = rows[2];
    const actions = referenceRow?.children.find(
      (child) => child.props["data-dsh-jump-actions"] !== undefined,
    );
    const buttons = actions?.children ?? [];
    const chordButton = buttons.find((node) => node.props["data-dsh-jump-chord"] === "reference");
    expect(chordButton?.children).toEqual([ZH.referenceDisabled]);
    expect(chordButton?.props["aria-keyshortcuts"]).toBeUndefined();
    const disable = buttons.find((node) => node.props["data-dsh-jump-disable"] === "reference");
    expect(disable?.props.disabled).toBe(true);
  });
});
