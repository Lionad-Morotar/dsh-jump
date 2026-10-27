/**
 * Where the activation chords are remembered.
 *
 * The document lives in `localStorage` rather than on the host: the chords are
 * a property of this plugin alone, the host's own shortcut registry would refuse
 * the label strokes anyway, and a page-local document keeps the desktop and web
 * profiles from having to agree on a storage format.
 *
 * Two things are deliberate. Every read is total: a hostile or half-written
 * document falls back per action instead of throwing, because a plugin that
 * cannot boot is worse than one that forgot a preference. And every write is
 * normalized first, so a half-built chord (a key with no modifiers, a legacy
 * letter) is settled into its final shape before it is persisted and never seen
 * again in two forms.
 */
import {
  bindingsEqual,
  createDefaultBindings,
  normalizeBindings,
  type JumpBindings,
  type JumpPlatform,
} from "./bindings.ts";

/** The document key. Versioned, because a future shape must not read this one. */
export const BINDINGS_STORAGE_KEY = "dsh-jump:bindings:v1";

/** The slice of `Storage` this module needs, so a test can hand in a plain object. */
export interface BindingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BindingsStore {
  /** The chords in force right now. */
  get(): JumpBindings;
  /** Persist a pair, normalized; a no-op when nothing actually changed. */
  set(next: JumpBindings): void;
  /** Drop the document and return to the platform defaults. */
  reset(): void;
  /** Re-read the document, for a change made by another tab. */
  reload(): void;
  /** Called on every effective change; returns the unsubscribe. */
  subscribe(listener: (next: JumpBindings) => void): () => void;
}

export interface BindingsStoreOptions {
  /** Defaults to `localStorage`, absent in a worker or a locked-down page. */
  storage?: BindingsStorage | null;
  platform: JumpPlatform;
}

function samePair(left: JumpBindings, right: JumpBindings): boolean {
  return bindingsEqual(left.click, right.click) && bindingsEqual(left.focus, right.focus);
}

/**
 * Resolve the page's storage, or null where touching it throws.
 *
 * Merely reading `localStorage` throws in a sandboxed iframe and in some
 * privacy modes, so the access itself is what has to be guarded, not only the
 * calls on the result.
 */
export function resolveStorage(): BindingsStorage | null {
  try {
    const storage = globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

export function createBindingsStore(options: BindingsStoreOptions): BindingsStore {
  const defaults = createDefaultBindings(options.platform);
  const storage = options.storage === undefined ? resolveStorage() : options.storage;
  const listeners = new Set<(next: JumpBindings) => void>();

  const read = (): JumpBindings => {
    if (storage === null) return defaults;
    try {
      const document = storage.getItem(BINDINGS_STORAGE_KEY);
      if (document === null) return defaults;
      return normalizeBindings(JSON.parse(document) as unknown, options.platform);
    } catch {
      // Unparseable or unreadable: the defaults are a usable plugin.
      return defaults;
    }
  };

  let current = read();

  const commit = (next: JumpBindings): void => {
    if (samePair(current, next)) return;
    current = next;
    for (const listener of listeners) listener(current);
  };

  return {
    get: () => current,

    set(next: JumpBindings): void {
      commit(normalizeBindings(next, options.platform));
      if (storage === null) return;
      try {
        storage.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(current));
      } catch {
        // A full or blocked quota keeps the change for this page's lifetime.
      }
    },

    reset(): void {
      commit(defaults);
      if (storage === null) return;
      try {
        storage.removeItem(BINDINGS_STORAGE_KEY);
      } catch {
        // Nothing to do: the defaults are already in force in memory.
      }
    },

    reload(): void {
      commit(read());
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
