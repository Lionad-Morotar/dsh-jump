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
- `src/client/keys.ts` key state machine
- `src/client/config.ts` default keys and selectors
- `lib/` committed build products (`pnpm --filter dsh-jump build`)
