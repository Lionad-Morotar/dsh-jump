/**
 * The settings page: a section of its own, one row per mode.
 *
 * The surface moved here from the General list because the two shortcuts are
 * the whole of this plugin's configuration, and a single combined row made them
 * look like one setting. A page can give each mode a heading, its own chord and
 * its own restore control, which is what the reader is actually choosing.
 *
 * Two constraints shape the code:
 *
 *   - React arrives from the module loader, so the tree is built with
 *     `createElement`; there is no JSX runtime to lean on.
 *   - The page is a function component rendered by the host's slot renderer.
 *     It subscribes through `useSyncExternalStore`, because a chord saved in one
 *     row changes the other row's collision-free state immediately.
 */
import { createDefaultBindings, formatBinding, type JumpAction, type JumpPlatform } from "./bindings.ts";
import type { Copy } from "./copy.ts";
import type { BindingRowController } from "./settings-controller.ts";
import { useRecordingListener, type RowReact } from "./react.ts";

export interface SettingsPageProps {
  React: RowReact;
  controller: BindingRowController;
  platform: JumpPlatform;
  copy: Copy;
}

/** The stylesheet for the page, scoped to this plugin's section. */
export const PAGE_CSS = `
[data-dsh-jump-page] {
  display: flex;
  flex-direction: column;
  width: 100%;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-jump-page] [data-dsh-jump-head] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
}
[data-dsh-jump-page] [data-dsh-jump-heading] {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
[data-dsh-jump-page] [data-dsh-jump-lede] {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
[data-dsh-jump-page] [data-dsh-jump-mode] {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 60px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
[data-dsh-jump-page] [data-dsh-jump-mode]:last-of-type {
  border-bottom: none;
}
[data-dsh-jump-page] [data-dsh-jump-text] {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4px;
  min-width: 0;
}
[data-dsh-jump-page] [data-dsh-jump-title] {
  font-size: 14px;
  line-height: 22px;
}
[data-dsh-jump-page] [data-dsh-jump-description] {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
[data-dsh-jump-page] [data-dsh-jump-actions] {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}
[data-dsh-jump-page] [data-dsh-jump-chord] {
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
[data-dsh-jump-page] [data-dsh-jump-chord]:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-dsh-jump-page] [data-dsh-jump-chord][data-recording] {
  outline: 1px solid var(--dsw-alias-label-primary);
  outline-offset: -1px;
}
[data-dsh-jump-page] [data-dsh-jump-reset] {
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
[data-dsh-jump-page] [data-dsh-jump-reset]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
[data-dsh-jump-page] [data-dsh-jump-reset]:disabled {
  cursor: default;
  opacity: 0.45;
}
[data-dsh-jump-page] [data-dsh-jump-issue] {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
[data-dsh-jump-page] [data-dsh-jump-note] {
  margin: 0;
  padding-top: 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
`;

/** Tag id for the page stylesheet, so a reload does not insert a second copy. */
const STYLE_TAG = "dsh-jump/page.css";

/** Insert the page's stylesheet once; returns the symmetric teardown. */
export function insertPageStyles(doc: Document): () => void {
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`;
  if (doc.querySelector(selector) !== null) return () => undefined;
  const tag = doc.createElement("style");
  tag.dataset.plugin = "dsh-jump";
  tag.dataset.pluginCss = STYLE_TAG;
  tag.textContent = PAGE_CSS;
  doc.head.append(tag);
  return () => tag.remove();
}

interface ModeRowProps {
  React: RowReact;
  action: JumpAction;
  controller: BindingRowController;
  platform: JumpPlatform;
  copy: Copy;
  title: string;
  description: string;
  name: string;
}

/** One mode: its heading, its chord, and its own restore control. */
function modeRow(props: ModeRowProps): unknown {
  const { React, action, controller, platform, copy, title, description, name } = props;
  const state = React.useSyncExternalStore(
    (listener) => controller.subscribe(() => listener()),
    () => controller.getState(),
  );
  const recording = state.recording === action;
  const printed = formatBinding(state.bindings[action], platform);
  const shipped = formatBinding(createDefaultBindings(platform)[action], platform);
  return React.createElement(
    "div",
    { "data-dsh-jump-mode": action },
    React.createElement(
      "div",
      { "data-dsh-jump-text": "" },
      React.createElement("span", { "data-dsh-jump-title": "" }, title),
      React.createElement("p", { "data-dsh-jump-description": "" }, recording ? copy.recordingHint : description),
    ),
    React.createElement(
      "div",
      { "data-dsh-jump-actions": "" },
      React.createElement(
        "button",
        {
          type: "button",
          "data-dsh-jump-chord": action,
          "data-recording": recording ? "" : undefined,
          // The visible text of a recording button is an instruction, not a
          // chord, so the accessible name and the announced shortcut stay out
          // of that swap.
          "aria-label": name,
          "aria-keyshortcuts": printed,
          onClick: () => {
            controller.begin(action);
          },
        },
        recording ? copy.recording : printed,
      ),
      React.createElement(
        "button",
        {
          type: "button",
          "data-dsh-jump-reset": action,
          disabled: printed === shipped,
          onClick: () => {
            controller.resetAction(action);
          },
        },
        copy.reset,
      ),
    ),
  );
}

export function JumpSettingsPage(props: SettingsPageProps): unknown {
  const { React, controller, platform, copy } = props;
  const state = React.useSyncExternalStore(
    (listener) => controller.subscribe(() => listener()),
    () => controller.getState(),
  );
  useRecordingListener(React, state.recording, (event: KeyboardEvent) => {
    controller.press({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.isComposing,
    });
  });

  return React.createElement(
    "div",
    { "data-dsh-jump-page": "" },
    React.createElement(
      "div",
      { "data-dsh-jump-head": "" },
      React.createElement("h3", { "data-dsh-jump-heading": "" }, copy.title),
      React.createElement("p", { "data-dsh-jump-lede": "" }, copy.description),
    ),
    modeRow({
      React,
      action: "click",
      controller,
      platform,
      copy,
      title: copy.clickTitle,
      description: copy.clickDescription,
      name: copy.clickName,
    }),
    modeRow({
      React,
      action: "focus",
      controller,
      platform,
      copy,
      title: copy.focusTitle,
      description: copy.focusDescription,
      name: copy.focusName,
    }),
    // A refusal belongs to the recording row; the page repeats it once under the
    // rows so it is announced even while the reader's focus is on the button.
    state.issue === null ? null : React.createElement("p", { "data-dsh-jump-issue": "", role: "status" }, copy.issues[state.issue]),
    React.createElement("p", { "data-dsh-jump-note": "" }, copy.bareNote),
  );
}
