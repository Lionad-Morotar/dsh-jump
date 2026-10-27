/**
 * The General Settings row: two chords, each re-recordable in place.
 *
 * The row is a projection of `createBindingsController` and holds no rules of
 * its own. Three things follow and are worth stating, because each is easy to
 * get wrong:
 *
 *   - While recording, the row owns the keyboard. It listens on `keydown` in
 *     the capture phase and stops every stroke, so pressing a chord is not also
 *     triggering whatever the application binds to it. The listener detaches the
 *     moment recording ends.
 *   - State arrives through `useSyncExternalStore`. `useState` plus an effect
 *     would tear under concurrent rendering, since the store can change between
 *     render and subscribe.
 *   - The component cannot import React: it comes from the module loader, so the
 *     caller hands in the slice it resolved and the tree is built with
 *     `createElement`.
 */
import { formatBinding, type JumpAction, type JumpBindings, type JumpPlatform } from "./bindings.ts";
import type { Copy } from "./copy.ts";
import type { BindingRowController, BindingRowState } from "./settings-controller.ts";

/** The slice of React this component uses; the rest comes from the host. */
export interface RowReact {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown;
  useEffect(effect: () => void | (() => void), deps: readonly unknown[]): void;
  useRef<T>(initial: T): { current: T };
  useSyncExternalStore<T>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T): T;
}

export interface SettingsRowProps {
  React: RowReact;
  controller: BindingRowController;
  platform: JumpPlatform;
  copy: Copy;
}

/**
 * The stylesheet, scoped to this row.
 *
 * The host's own shortcut row uses the same geometry (a 60px row, a 36px pill,
 * the tertiary label colour for the description), and matching it is the point:
 * this row shares a list with the official ones and must not look foreign. The
 * colours are the host's tokens, so light and dark both come out right.
 */
export const ROW_CSS = `
[data-dsh-jump-settings] {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 60px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
[data-dsh-jump-settings] [data-dsh-jump-text] {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4px;
  min-width: 0;
  padding-right: 48px;
}
[data-dsh-jump-settings] [data-dsh-jump-title] {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
}
[data-dsh-jump-settings] [data-dsh-jump-description] {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
[data-dsh-jump-settings] [data-dsh-jump-actions] {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}
[data-dsh-jump-settings] [data-dsh-jump-chord] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 92px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
  white-space: nowrap;
}
[data-dsh-jump-settings] [data-dsh-jump-chord]:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-dsh-jump-settings] [data-dsh-jump-chord][data-recording] {
  outline: 1px solid var(--dsw-alias-label-primary);
  outline-offset: -1px;
}
[data-dsh-jump-settings] [data-dsh-jump-reset] {
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
[data-dsh-jump-settings] [data-dsh-jump-reset]:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
[data-dsh-jump-settings] [data-dsh-jump-issue] {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
`;

/** Tag id for the stylesheet, so a reload does not insert a second copy. */
const STYLE_TAG = "dsh-jump/settings.css";

/** Insert the row's stylesheet once; returns the symmetric teardown. */
export function insertRowStyles(doc: Document): () => void {
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`;
  if (doc.querySelector(selector) !== null) return () => undefined;
  const tag = doc.createElement("style");
  tag.dataset.plugin = "dsh-jump";
  tag.dataset.pluginCss = STYLE_TAG;
  tag.textContent = ROW_CSS;
  doc.head.append(tag);
  return () => tag.remove();
}

/** One chord button, plus the recording state it is in. */
function chordButton(props: {
  React: RowReact;
  action: JumpAction;
  state: BindingRowState;
  copy: Copy;
  platform: JumpPlatform;
  onBegin(action: JumpAction): void;
}): unknown {
  const { React, action, state, copy, platform, onBegin } = props;
  const recording = state.recording === action;
  const binding = state.bindings[action];
  const printed = formatBinding(binding, platform);
  return React.createElement(
    "button",
    {
      type: "button",
      "data-dsh-jump-chord": action,
      "data-recording": recording ? "" : undefined,
      // The visible text of a recording button is an instruction, not a chord,
      // so the accessible name and the announced shortcut stay out of that swap.
      "aria-label": action === "click" ? copy.clickName : copy.focusName,
      "aria-keyshortcuts": printed,
      onClick: () => {
        onBegin(action);
      },
    },
    recording ? copy.recording : printed,
  );
}

/**
 * The row itself.
 *
 * `useRecordingListener` is called unconditionally and decides for itself
 * whether to attach, because a hook cannot be skipped.
 */
export function JumpSettingsRow(props: SettingsRowProps): unknown {
  const { React, controller, platform, copy } = props;
  const state = React.useSyncExternalStore(
    (listener) => controller.subscribe(() => listener()),
    () => controller.getState(),
  );
  useRecordingListener(React, state.recording, (event) => {
    controller.press({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.isComposing,
    });
  });

  const issue = state.issue === null ? null : copy.issues[state.issue];
  return React.createElement(
    "div",
    { "data-dsh-jump-settings": "" },
    React.createElement(
      "div",
      { "data-dsh-jump-text": "" },
      React.createElement("div", { "data-dsh-jump-title": "" }, copy.title),
      React.createElement(
        "p",
        { "data-dsh-jump-description": "" },
        state.recording === null ? copy.description : copy.recordingHint,
      ),
      issue === null ? null : React.createElement("p", { "data-dsh-jump-issue": "", role: "status" }, issue),
    ),
    React.createElement(
      "div",
      { "data-dsh-jump-actions": "" },
      chordButton({ React, action: "click", state, copy, platform, onBegin: (action) => controller.begin(action) }),
      chordButton({ React, action: "focus", state, copy, platform, onBegin: (action) => controller.begin(action) }),
      React.createElement(
        "button",
        { type: "button", "data-dsh-jump-reset": "", onClick: () => controller.reset() },
        copy.reset,
      ),
    ),
  );
}

/**
 * Attach the capture-phase recorder while an action is being recorded.
 *
 * The handler is held in a ref so the effect keys off the recording state alone;
 * keying it off the callback would reattach the listener on every keystroke and,
 * worse, could miss the stroke that ended the recording.
 */
function useRecordingListener(
  React: RowReact,
  recording: JumpAction | null,
  onKeyDown: (event: KeyboardEvent) => void,
): void {
  const handler = React.useRef(onKeyDown);
  handler.current = onKeyDown;
  React.useEffect(() => {
    if (recording === null) return undefined;
    const listener = (event: KeyboardEvent): void => {
      // Every stroke belongs to the recorder while it is open: letting one
      // through would run the application's own binding for the chord the reader
      // is trying to assign.
      event.preventDefault();
      event.stopPropagation();
      handler.current(event);
    };
    const doc = globalThis.document;
    doc.addEventListener("keydown", listener, { capture: true });
    return () => {
      doc.removeEventListener("keydown", listener, { capture: true });
    };
  }, [recording]);
}
