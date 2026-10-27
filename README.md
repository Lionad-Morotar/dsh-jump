# dsh-jump

Keyboard jump navigation for the DeepSeek Harness Web GUI.

- **Cmd+H** activates click mode: every interactive element in the viewport
  gets a home-row label, and typing a label activates that element.
- **Cmd+U** activates focus mode: same labels, same activation.
- **Esc** (or any meta chord, or pressing the activation key again) leaves
  jump mode.

Both chords are remappable. Settings → General → "Jump navigation shortcuts"
records a replacement chord per mode: click a chord, press the combination, and
it takes effect immediately, without a reload. The same row restores the shipped
chords. Off a Mac the defaults are Ctrl+H / Ctrl+U and are shown as such.

Labels run `a s d f g h j k l` for up to nine hints; past nine, every hint in
that round gets an equal-length two-key label (`as`, `ad`, …) so no shorter
label can shadow the first stroke of a longer one. Past 81 the whole round
moves to three keys, and so on.

## What gets labelled

Three families, each added because a real element was unreachable:

- Native controls — `a[href]`, `button`, `input`, `select`, `textarea`,
  `summary` — plus anything carrying a `tabindex`.
- ARIA widget roles the Harness actually renders: `button`, `link`, `tab`,
  `treeitem` (the sidebar's project and session rows), `option`, the
  `menuitem*` family, `checkbox`, `radio`, `switch`, `slider`, `spinbutton`,
  `gridcell`, `row`, `columnheader`.
- Editable hosts (`[contenteditable]:not([contenteditable=false])`) and the
  text-entry roles `textbox` / `searchbox` / `combobox`. This is what makes
  the composer reachable: it is a Lexical-managed
  `div[contenteditable=true][role=textbox]` with no tag and no `tabindex`, so
  no native selector matches it. `contenteditable=false` is excluded on
  purpose — Lexical marks chips and command tokens inside the composer with
  it, and the deepest-candidate rule would otherwise let a chip steal the
  label from the composer that owns it.

## Click versus focus is decided by the target

Both activation keys jump to the same set, and the matched element decides
what "jumping" means:

- Text entry surfaces (textarea, caret-bearing inputs, contenteditable hosts)
  are focused, and the caret is collapsed to the end of the draft so the next
  keystroke continues writing. A field that already owns the caret keeps its
  offset.
- Everything else gets the full synthetic pointer/mouse/click sequence in
  click mode, and a plain `focus()` in focus mode.

The split is not stylistic. Synthetic pointer and mouse events are untrusted,
so the browser performs no focusing default action for them: dispatching the
whole sequence at a button, an input and a contenteditable element left
`activeElement` unchanged in all three cases. Conversely a button does
nothing when focused. Mode therefore only picks the fallback; the target picks
the action.

Labels are rendered as an overlay by the client entry; while jump mode is
active all keydown events are consumed by the state machine, so typing inside
a focused input never leaks through.

## v1 boundaries

- Hints are snapshotted at the moment of activation: elements that appear or
  move after activation do not get labels until you re-activate.
- The activation chords are stored per browser profile in `localStorage`
  (`dsh-jump:bindings:v1`), not in package config. The host's own shortcut
  registry cannot hold them: a bare home-row label stroke is rejected as
  modifier-less, and the shipped `Cmd+H` / `Cmd+U` defaults collide with
  reserved primary chords. The listener is therefore plugin-owned, and the
  settings row writes to the same plugin-owned document.
- A chord must carry ⌘, ⌃ or ⌥. Shift alone is refused, as are keys the
  interface owns (Tab, Enter, Space, the arrow keys, Escape) and the chord the
  other mode already holds.
- The settings row is registered only where the host exposes the General
  settings slot and the module loader seeds React. Without either, navigation
  still works; only the ability to remap is missing.
- Web and desktop both load this plugin, but the label overlay targets the Web
  GUI's DOM. The chords and the settings row are not Web-specific.

## Install (web profile)

Same as the skin packages, two ways:

**A. As a profile dependency (recommended)**

Add to `~/.dsh/profiles/web/package.json`:

```json
{
  "dependencies": {
    "dsh-jump": "link:/Users/lionad/Github/Lionad-Morotar/dsh-plugins/packages/dsh-jump"
  },
  "dsh": {
    "profile": {
      "bundles": ["...", "dsh-jump"]
    }
  }
}
```

Then `dsh plugin --profile web install` and restart DSH.

**B. Manual patch**

Append to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: jump
      name: 'dsh-jump'
```

The top level of that file must always stay a YAML array (`[]` when empty).

## Layout

- `src/index.ts` host half (empty `apply`; the Loader requires it to resolve)
- `src/client/entry.ts` loader adapter: takes the factory's `require`, resolves
  React, then hands the real context to `runtime.ts`
- `src/client/runtime.ts` composition: one bindings store shared by the listener
  and the settings row
- `src/client/hints.ts` hint collection and label stream
- `src/client/target.ts` which action a matched target needs (click vs focus)
- `src/client/keys.ts` key state machine
- `src/client/bindings.ts` chord model, platform defaults, validation, formatting
- `src/client/store.ts` the persisted pair, total on read, normalized on write
- `src/client/recorder.ts` one keydown into a candidate chord
- `src/client/settings-controller.ts` the recording mode's rules, renderer-free
- `src/client/settings-row.ts` the React row, built with `createElement`
- `src/client/copy.ts` the row's Chinese and English copy
- `src/client/config.ts` selectors and the label key map
- `lib/` committed build products (`pnpm --filter dsh-jump build`)
