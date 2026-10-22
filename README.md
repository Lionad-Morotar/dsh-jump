# dsh-jump

Keyboard jump navigation for the DeepSeek Harness Web GUI.

- **Cmd+H** activates click mode: every interactive element in the viewport
  gets a home-row label (up to nine hints get `a s d f g h j k l`; past nine,
  every hint gets an equal-length ordered two-key label so no single-key
  label can shadow the first character of a longer one).
  Type a label to click that element.
- **Cmd+U** activates focus mode: same labels, but the matched element is
  focused instead of clicked.
- **Esc** (or any meta chord, or pressing the activation key again) leaves
  jump mode.

This slice ships the pure logic (viewport/visibility filtering, nested-target
dedupe, label assignment, key state machine) plus the package scaffold; the
DOM overlay wiring arrives in a later slice.

## Layout

- `src/index.ts` host half (empty `apply`; the Loader requires it to resolve)
- `src/client/hints.ts` hint collection and label stream
- `src/client/keys.ts` key state machine
- `src/client/config.ts` default keys and selectors
- `lib/` committed build products (`pnpm --filter dsh-jump build`)
