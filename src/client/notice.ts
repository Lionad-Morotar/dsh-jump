/**
 * A one-shot notice the page cannot miss: a pill at the bottom centre that
 * fades out and removes itself.
 *
 * The composer owns toasts on the host side, but a plugin has no channel into
 * it, and a failed reveal is exactly the moment to say why nothing happened:
 * silently returning false reads as "the click did nothing", which is how a
 * stale or unresolvable reference gets reported as a plugin bug.
 */
const FADE_MS = 160;

/** Paint one notice and schedule its removal; returns the element for tests. */
export function flashNotice(doc: Document, text: string, durationMs = 1400): HTMLElement {
  const el = doc.createElement("div");
  el.dataset.dshJumpNotice = "";
  el.textContent = text;
  el.style.cssText =
    "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);" +
    "z-index:2147483647;padding:6px 12px;border-radius:6px;" +
    "background:rgba(20,20,22,.92);color:#f5f5f7;font:13px/1.4 system-ui,sans-serif;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.35);transition:opacity " + String(FADE_MS) + "ms ease;" +
    "pointer-events:none";
  doc.documentElement.append(el);
  const remove = (): void => {
    el.style.opacity = "0";
    const win = doc.defaultView;
    if (win === null) {
      el.remove();
      return;
    }
    win.setTimeout(() => el.remove(), FADE_MS);
  };
  const win = doc.defaultView;
  if (win === null) remove();
  else win.setTimeout(remove, durationMs);
  return el;
}

/**
 * Run `task` after the page has settled one frame.
 *
 * A scroll issued during the click's own turn can be undone by whichever
 * surface owns the scroll position (a chat that follows the newest message
 * re-asserts the bottom on the next layout). One frame later that surface has
 * had its say, so the retry is the last word rather than a race.
 * @param doc - the document whose window schedules the callback.
 * @param task - what to run.
 */
export function scheduleAfterLayout(doc: Document, task: () => void): void {
  const view = doc.defaultView;
  if (view === null) {
    task();
    return;
  }
  if (typeof view.requestAnimationFrame === "function") {
    view.requestAnimationFrame(() => view.requestAnimationFrame(task));
    return;
  }
  view.setTimeout(task, 16);
}
