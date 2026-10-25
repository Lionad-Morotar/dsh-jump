# dsh-jump

Keyboard jump navigation for the DeepSeek Harness Web GUI.

- **Cmd+H** activates click mode: every interactive element in the viewport
  gets a home-row label, and typing a label activates that element.
- **Cmd+U** activates focus mode: same labels, same activation.
- **Esc** (or any meta chord, or pressing the activation key again) leaves
  jump mode.

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
- The Cmd+H / Cmd+U activation keys are fixed in v1; if a host bundle ever
  claims these chords first, remapping via package config is a follow-up.
- Web profile only: this plugin targets the DSH Web GUI and is not wired into
  the desktop profile.

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
- `src/client/hints.ts` hint collection and label stream
- `src/client/target.ts` which action a matched target needs (click vs focus)
- `src/client/keys.ts` key state machine
- `src/client/config.ts` default keys and selectors
- `lib/` committed build products (`pnpm --filter dsh-jump build`)
