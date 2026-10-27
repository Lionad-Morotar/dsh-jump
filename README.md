# dsh-jump

<img src="./assets/icon.svg" width="72" height="72" alt="dsh-jump icon" align="right" />

Keyboard jump navigation for the DeepSeek Harness Web GUI: press a chord, type a
letter label, and the labelled element is clicked or focused.

[中文](#中文) · [Install](#install) · [What gets labelled](#what-gets-labelled) · [v1 boundaries](#v1-boundaries) · [Layout](#layout)

## Install

### From an index source

Once the package is on npm, the shortest path is the plugin manager: open
Discover, add the market index URL, and install the entry. The entry's install
command is `dsh plugin --profile web add dsh-jump`.

### From this repository

Until the package is published, point the profile at the checkout:

```json
{
  "dependencies": {
    "dsh-jump": "link:../dsh-plugins/packages/dsh-jump"
  },
  "dsh": {
    "profile": {
      "bundles": ["...", "dsh-jump"]
    }
  }
}
```

Then `dsh plugin --profile web install` and restart DSH. The path in `link:`
resolves relative to `~/.dsh/profiles/web`, so adjust it to wherever the
checkout lives on your machine.

### Manual patch

Append to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: jump
      name: 'dsh-jump'
```

The top level of that file must always stay a YAML array (`[]` when empty).

## 中文

给 DeepSeek Harness Web GUI 的键盘跳跃导航：按下一个组合键，视口里的可交互元素
会被打上字母标签，再敲标签即可点击或聚焦到它。

- `Cmd+H` 进入点击模式，`Cmd+U` 进入聚焦模式；非 Mac 上默认是 `Ctrl+H` /
  `Ctrl+U`。`Esc`（或任意 meta 组合键、或再按一次激活键）退出。
- 两个组合键都可以改：设置 → 通用 → 「跳跃导航快捷键」，点一下组合键再按新的即可
  立即生效，无需刷新。绑定存在浏览器的 `localStorage`（`dsh-jump:bindings:v1`），
  不写进包配置。
- 这一行排在宿主自己的「键盘快捷键」之后。设置列表的顺序由行注册时声明的
  `order` 决定，宿主已占用 0 / 10 / 11 / 12 / 15 / 16 / 17 / 20 / 30 / 100，
  本插件取 18。改这个值时先确认没有撞上宿主，两个插件取同一个 `order` 时
  谁在前取决于注册先后，不受控。
- 标签前九个是 `a s d f g h j k l`；超过九个时整轮改用等长的双键标签（`as`、`ad`
  ……），避免短标签抢走长标签的首击；超过 81 个则整轮升到三键。
- 命中的元素决定动的含义：文本输入面（textarea、带光标的 input、
  `contenteditable`）聚焦并把光标落到草稿末尾，其余元素在点击模式下走完整的
  合成指针/鼠标/点击序列，聚焦模式下只调 `focus()`。

## Compatibility

`engines.dsh` is `>=0.2.0-rc.2 <0.3.0-0`. An own `engines.dsh` range decides
alone: the host ignores `peerDependencies` once it is present, and prereleases
participate in the range, so 0.2 release candidates are admitted while 0.3 is
not.

## Display metadata

The plugin manager reads `locale/en.json` and `locale/zh.json` for the title and
one-line description without evaluating the plugin, and resolves the icon
through `exports["./icon"]` as an SVG served as a `data:` URL.
`assets/icon-180.png` is the same artwork rendered at 180px for GitHub-hosted
catalog entries, which reject SVG.
## What gets labelled

Three families, each added because a real element was unreachable:

- Native controls — `a[href]`, `button`, `input`, `select`, `textarea`,
  `summary` — plus anything carrying a `tabindex`.
- ARIA widget roles the Harness actually renders: `button`, `link`, `tab`,
  `treeitem` (the sidebar's project and session rows), `option`, the
  `menuitem*` family, `checkbox`, `radio`, `switch`, `slider`, `spinbutton`.
  Structural roles (`row`, `columnheader`, `gridcell`) are deliberately
  absent: a row is a container and a header is a label, so labelling them
  hands dead labels to every presentational table; an interactive grid gives
  its cells a `tabindex`, which the branch above already catches.
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
- The settings row waits for the host's slot service through `ctx.inject`
  rather than sampling it once. Services start one at a time, so a single
  `ctx.get("slots")` during `apply` can legitimately return undefined; the row
  would then never register, and `ctx.get` reports nothing. With neither the
  slot service nor a React seed, navigation still works; only the ability to
  remap is missing.
- Web and desktop both load this plugin, but the label overlay targets the Web
  GUI's DOM. The chords and the settings row are not Web-specific.

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
