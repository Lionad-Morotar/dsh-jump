/**
 * The React slice this plugin needs, and the recording listener both surfaces use.
 *
 * React is not a dependency of this package: the host seeds it as a platform
 * module through the loader factory's `require`, so it can only be reached as an
 * injected value. Narrowing it to the four APIs the plugin actually calls keeps
 * that seam honest, and a host that shims React without one of them is caught
 * where it is resolved rather than on first render.
 */
import type { JumpAction } from "./bindings.ts";

/** The slice of React this plugin uses; the rest comes from the host. */
export interface RowReact {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown;
  useEffect(effect: () => void | (() => void), deps: readonly unknown[]): void;
  useRef<T>(initial: T): { current: T };
  useSyncExternalStore<T>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T): T;
}

/**
 * Attach the capture-phase recorder while an action is being recorded.
 *
 * The handler is held in a ref so the effect keys off the recording state alone;
 * keying it off the callback would reattach the listener on every keystroke and,
 * worse, could miss the stroke that ended the recording.
 */
export function useRecordingListener(
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
