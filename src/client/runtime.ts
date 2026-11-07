/**
 * Assembling the two halves of the plugin that must share state.
 *
 * The navigation listener and the settings row have to read the same bindings
 * instance. Giving each its own store still works on paper: both would read the
 * same localStorage document and both would persist correctly. What breaks is
 * the notification, and it breaks invisibly: the row saves a new chord, the
 * document holds it, and the listener keeps matching the old one until the page
 * is reloaded. Keeping the composition in one place, with one store passed to
 * both, is what makes that impossible rather than merely unlikely.
 *
 * This module exists so that composition can be exercised directly. `entry.ts`
 * only adapts the real Cordis context and the loader's `require` onto it.
 */
import { createApp, type JumpApp, type JumpWindow } from "./app.ts";
import type { JumpConfig } from "./config.ts";
import { notifyInputSource, type ImeFetch } from "./ime.ts";
import type { JumpPlatform } from "./bindings.ts";
import { copyFor } from "./copy.ts";
import { createBindingsController } from "./settings-controller.ts";
import { JumpSettingsPage, insertPageStyles } from "./settings-page.ts";
import type { RowReact } from "./react.ts";
import { createBindingsStore, type BindingsStore } from "./store.ts";
import {
  createJumpBridgeView,
  createJumpReferenceSource,
  describeElement,
  insertUiReference,
  uiReferencePayload,
  type InputActionsFace,
  type InputTriggersFace,
  type JumpReferenceBridgeState,
  type UiReferenceInsertionResult,
} from "./reference.ts";

/** The one part of the Cordis context this plugin reads. */
export interface RuntimeContext {
  get<T>(name: string): T | undefined;
  /**
   * Run a callback once the named services exist.
   *
   * Services come up one at a time; `get` samples and returns undefined for any
   * that are not ready yet. Deferring through this hook is what makes the row
   * appear at all on a host whose slot service starts after this plugin.
   */
  inject(names: string[], callback: (scope: ScopedContext) => void): () => void;
}

/** The subset of the context handed to a deferred callback. */
export interface ScopedContext {
  get<T>(name: string): T | undefined;
}

interface SlotService {
  inject(key: string, callback: () => () => void): () => void;
  register(
    registration: { name: string; id: string; order: number; label?: string | (() => string) },
    component: unknown,
  ): () => void;
}

/** The slice of the session input facade the reference write calls. */
interface SessionInputFace {
  insertReference(
    insert: {
      source: string;
      ref: string;
      label: string;
      clipboardText: string;
      appearance?: "session" | "file" | "folder";
    },
    span: { readonly start: number; readonly end: number; readonly draftRev: number },
  ): boolean;
  focus?(): void;
}

/** The slice of the session service the reference write reads. */
interface SessionsFace {
  scope?(sessionId: string): unknown;
}

/** The slice of the conversation service the reference write reads. */
interface ConversationFace {
  input?: { for(actx: unknown): SessionInputFace };
}

interface LocaleService {
  getSnapshot(): { active: string };
}

/**
 * The host slot this plugin occupies: one page in the settings panel.
 *
 * It started as a row inside the General list, which is the slot the host offers
 * for a single preference. Two shortcuts are not a single preference, and a list
 * row can only show them side by side under one restore control. A section gets
 * its own nav entry, a heading per mode and a restore control per mode.
 */
export const SETTINGS_SLOT = "settings.section";
/** The section id; a fresh id adds a nav entry rather than replacing a shipped one. */
export const SETTINGS_ID = "jump";
/**
 * Position among the settings nav entries.
 *
 * Occupied at the time of writing: account -10, general 0, models 10,
 * plugins 15, agent-presets 20, then third parties from 30 (cost-meter) up to
 * 115/116 (skin managers). 25 puts this page directly after the host's own
 * built-ins without landing on any of them.
 */
export const SETTINGS_ORDER = 25;

/**
 * The session-scope slot the invisible bridge occupies.
 *
 * A root-level plugin has no public way to ask "which session is on screen";
 * this slot is mounted for exactly the session being shown and hands its entry
 * the Session standard props, which is what makes the composer reachable.
 */
export const BRIDGE_SLOT = "conversation.input.overlay";
/** The bridge's entry id; stable so a re-register replaces rather than stacks. */
export const BRIDGE_ID = "jump.session-bridge"; /** Below the host's own composer overlays, which own the visible surfaces. */
export const BRIDGE_ORDER = 95;

export interface RuntimeDeps {
  ctx: RuntimeContext;
  platform: JumpPlatform;
  /** The loader-resolved React slice; null when the host seeded none. */
  React: RowReact | null;
  config?: JumpConfig;
  /** Injected by tests; the page's storage is resolved when absent. */
  store?: BindingsStore;
  /** Injected under jsdom, where globalThis is not a window. */
  window?: JumpWindow;
  /** Injected under jsdom, where there is no page document. */
  document?: Document;
  /** Injected by tests; the page uses its own fetch when absent. */
  imeFetch?: ImeFetch;
}

export interface JumpRuntime {
  /** The bindings both halves read. */
  store: BindingsStore;
  app: JumpApp;
  /** Tear everything down; idempotent. */
  dispose(): void;
}

/**
 * Build the plugin's runtime: one store, one listener, one settings row.
 *
 * A host with no settings slot still gets the listener. That is a deliberate
 * order of operations rather than defensive code: navigation is the product, the
 * row is how it is configured, and a missing surface should cost the reader the
 * ability to remap, not the ability to jump.
 */
export function createRuntime(deps: RuntimeDeps): JumpRuntime {
  const { ctx, platform, React, config } = deps;
  const store = deps.store ?? createBindingsStore({ platform });
  const imeFetch = deps.imeFetch;

  // What the bridge last published. A plain object rather than a store: the
  // only reader is the insert closure, and it reads at click time.
  const bridge: { state: JumpReferenceBridgeState } = { state: { sessionId: null, inputActions: null } };
  // Whether the chip's trigger source is registered. A mutable flag rather than
  // a captured boolean: the inject path registers asynchronously, and the insert
  // closure outlives any single registration.
  const source: { registered: boolean } = { registered: false };

  /**
   * Write one picked element into the session's composer.
   *
   * Every service is read per call: the facade is per session generation and
   * throws once that generation is released, and this closure outlives any one
   * of them. A missing bridge is `no-session` rather than a failure, because
   * "no session is open" is a state the reader can fix.
   */
  const insertFor = (element: Element): UiReferenceInsertionResult => {
    const { sessionId, inputActions } = bridge.state;
    if (sessionId === null || inputActions === null) return "no-session";
    let facade: SessionInputFace | undefined;
    try {
      const sessions = ctx.get<SessionsFace>("sessions");
      const conversation = ctx.get<ConversationFace>("conversation");
      const actx = sessions?.scope?.(sessionId);
      if (actx === undefined || conversation?.input?.for === undefined) return "no-session";
      facade = conversation.input.for(actx);
    } catch {
      // A released generation is the same answer as no session at all.
      return "no-session";
    }
    if (facade === undefined || facade === null) return "no-session";
    const result = insertUiReference(
      {
        captureSpan: () => inputActions.captureInsertion?.(),
        insertReference: (insert, span) => facade?.insertReference?.(insert, span) ?? false,
        insertText: (text, span) => inputActions.insertText?.(text, span) ?? false,
        // Without the source a chip would be refused at send time and keep the
        // draft, so the plain-text write is the honest outcome here.
        canInsertReference: source.registered,
      },
      uiReferencePayload(describeElement(element)),
    );
    if (result === "reference" || result === "text") facade.focus?.();
    return result;
  };

  const app = createApp({
    config,
    bindings: store,
    platform,
    window: deps.window,
    onRound: (phase) => notifyInputSource(phase, imeFetch),
    onReference: (element) => {
      insertFor(element);
    },
  });

  const disposers: (() => void)[] = [app.apply()];

  // The chip's send-time identity. Registered outside the React branch: a host
  // without React still navigates, and a chip already in a draft must still be
  // sendable there.
  if (typeof ctx.inject === "function") {
    disposers.push(
      ctx.inject(["inputTriggers"], (scope) => {
        const triggers = scope.get<InputTriggersFace>("inputTriggers");
        if (triggers === undefined) return;
        const dispose = triggers.registerSource(createJumpReferenceSource());
        source.registered = true;
        return () => {
          dispose();
          source.registered = false;
        };
      }),
    );
  }

  // Registering the page has to wait for the slot service to exist. Sampling it
  // once with `get` is the bug this shape exists to prevent: on a host where
  // slots comes up after this plugin, the sample is undefined, the branch is
  // skipped, and the plugin looks installed but has nowhere to be configured.
  if (React !== null) {
    disposers.push(
      ctx.inject(["slots"], (scope) => {
        const slots = scope.get<SlotService>("slots");
        if (slots === undefined) return;
        const locale = scope.get<LocaleService>("locale");
        const controller = createBindingsController({ store, platform });
        // The nav label is a thunk so the host re-reads it on every projection:
        // the panel then follows a locale change without re-registering.
        const label = (): string => copyFor(locale?.getSnapshot().active ?? "zh").navLabel;
        const page = (): unknown =>
          JumpSettingsPage({
            React,
            controller,
            platform,
            copy: copyFor(locale?.getSnapshot().active ?? "zh"),
          });
        // slots.inject owns the registration's lifecycle: it runs the callback
        // once the slot exists and again if the host re-creates it, and
        // disposes on unload. Wrapping it in ctx.effect as well registers twice.
        const disposePage = slots.inject(SETTINGS_SLOT, () =>
          slots.register({ name: SETTINGS_SLOT, id: SETTINGS_ID, order: SETTINGS_ORDER, label }, page),
        );
        // The invisible bridge that publishes the composer. It renders nothing,
        // so it needs no label; the host only needs the session standard props
        // it hands every entry of this slot.
        const Bridge = createJumpBridgeView(React, (state) => {
          bridge.state = state;
        });
        const disposeBridge = slots.inject(BRIDGE_SLOT, () =>
          slots.register({ name: BRIDGE_SLOT, id: BRIDGE_ID, order: BRIDGE_ORDER }, Bridge),
        );
        const doc = deps.document ?? globalThis.document;
        const disposeStyles = doc === undefined ? undefined : insertPageStyles(doc);
        return () => {
          disposePage();
          disposeBridge();
          disposeStyles?.();
        };
      }),
    );
  }

  return {
    store,
    app,
    dispose() {
      while (disposers.length > 0) disposers.pop()?.();
    },
  };
}
