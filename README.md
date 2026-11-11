# dsh-jump

<img src="./assets/icon.svg" width="72" height="72" alt="dsh-jump icon" align="right" />

Keyboard jump navigation for the DeepSeek Harness Web GUI: press the click or
focus chord, type a letter label, and the labelled element is clicked or
focused.

[![npm](https://img.shields.io/npm/v/dsh-jump.svg?style=flat-square)](https://www.npmjs.com/package/dsh-jump)
[![license](https://img.shields.io/npm/l/dsh-jump.svg?style=flat-square)](./LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-0e7490.svg?style=flat-square)](https://github.com/topics/dsh-plugin)

[![dsh-jump on dsh.fish](https://dsh.fish/a/dsh-jump/badge.svg)](https://dsh.fish/a/dsh-jump)
[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/lionad-morotar/dsh-jump)
[![Open Plugin Market](https://img.shields.io/endpoint?url=https%3A%2F%2Fdshopen.org%2Fbadge%2Fdsh-jump.json%3Flang%3Den)](https://dshopen.org/plugins/dsh-jump)

![dsh-jump active: letter labels covering the sidebar and composer of the DeepSeek Harness web UI](./assets/jump-active.png)

[中文](#中文) · [Install](#install) · [What gets labelled](#what-gets-labelled) · [How labels are assigned](#how-labels-are-assigned) · [Performance](#performance-on-a-busy-page) · [v1 boundaries](#v1-boundaries) · [Layout](#layout)

## Install

### From npm

```
dsh plugin --profile web add dsh-jump
```

The package on npm is `dsh-jump`. Restart the profile afterwards; the bundle
patch registers its Loader row, so no manual `cordis.patch.yml` edit is needed.

### From a checkout

To track this repository instead of the published version:

```json
{
  "dependencies": {
    "dsh-jump": "link:../dsh-jump"
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
checkout lives on your machine. Pointing at a git URL works too:
`dsh plugin --profile web add github:Lionad-Morotar/dsh-jump`.

### Manual patch

Append to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: jump
      name: 'dsh-jump'
```

The top level of that file must always stay a YAML array (`[]` when empty).

## 中文

给 DeepSeek Harness Web GUI 的键盘跳跃导航：按下点击或聚焦的组合键，视口里的可交互元素
会被打上字母标签，再敲标签即可点击或聚焦到它。

- `Cmd+H` 进入点击模式；非 Mac 上是 `Ctrl+H`。`Esc`（或任意 meta 组合键、或再按
  一次激活键）退出。
- 聚焦模式与引用模式默认未启用，没有和弦就没有按键能打开它们。要开启就进
  设置 → 「跳跃导航」，点该行的快捷键再按一个组合键；行内另有「关闭」把它解绑
  回未启用，「恢复默认」对这两行同样是解绑（它们没有出厂和弦可回）。点击模式
  始终保留一个和弦。
- 组合键都可以改：点一下快捷键再按新的即可立即生效，无需刷新。绑定存在浏览器的
  `localStorage`（`dsh-jump:bindings:v1`），不写进包配置。
- `Insert`、`F1`、`Home` 这类不产生字符的键可以不配修饰键。它们在输入框里
  仍然归输入框：焦点在可编辑区域时裸键不触发，带修饰键的组合键照旧生效。
- 这一页在设置导航里排第 25 位。位置由注册时声明的 `order` 决定；宿主占用
  -10 / 0 / 10 / 15 / 20，已装第三方从 30 起。改这个值时先重新扫一遍，
  两个插件取同一个 `order` 时谁在前取决于注册先后，不受控。
- 标签前九个是 `a s d f g h j k l`；超过九个时整轮改用等长的双键标签（`as`、`ad`
  ……），避免短标签抢走长标签的首击；超过 81 个则整轮升到三键。
- 激活时先放掉当前焦点，再采集标签。焦点留在输入框里时，下一击会被输入法吃掉；
  放掉之后，从输入框和从按钮激活是同一条路。
- macOS 上，激活还会记住当前输入源并切到美式键盘（`com.apple.keylayout.ABC`）。
  `Esc`、打完一个标签、切到别的应用、或插件卸载时还回去。切换由宿主进程调用本机的 `im-select`
  完成，页面本身切不了输入法。二进制不在、或宿主没有 web 服务时，这一步跳过，
  标签模式照常打开。
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

## How labels are assigned

Labels follow the eye, not the DOM. Candidates are clustered into rows by
vertical overlap, rows are ordered top to bottom, and each row is consumed left
to right, so a row rendered right-to-left in the markup still reads `as`, `ad`
from the left edge. Nothing about this is remembered: the same page always
produces the same order.

An element keeps the label it had last round. After each round the plugin
records which label each element carried, keyed by the element's identity (an
explicit `data-row-key`, the composer marker, or a `data-slot` boundary plus the
control's accessible name and tag). The next round hands a remembered label
back to its element first, and the remaining labels fill the gaps, so a button
that appears above the one you use does not push its label onto a neighbour.

Memory is spent only when it is unambiguous. A remembered label is ignored when
its length differs from the round's label length, and when two candidates share
one identity both are dropped rather than guessed. The table holds 64 entries
for the current page load and evicts the entry that has gone longest without a
hit. It is never written to `localStorage` or `sessionStorage`, so a reload
starts with no memory and labels are assigned fresh.

## Click versus focus is decided by the target

Both activation modes jump to the same set, and the matched element decides
what "jumping" means. Click mode ships bound; focus mode ships unbound, so a
reader who wants it records a chord on its settings row first:

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

Activation blurs the focused element before it collects labels, so a letter
typed next is a label even when the chord was pressed inside a text field. On
macOS the host process also remembers the current input source and switches to
`com.apple.keylayout.ABC` for the round, then switches back on Escape, on a
completed label, or when the plugin unloads. The page cannot do this itself;
it asks the host over `POST /api/dsh-jump/ime`, and the host runs `im-select`.
A missing binary or a host without a web server skips the switch. Labels still
appear. `im-select` is a machine dependency, not a package dependency: install
it yourself (`brew install im-select`) if you want the switch.

## Reference mode

A third activation mode, off by default. It uses the same label round as the
other two, but picking a label does not click and does not move focus: it
inserts a description of the element into the current session's composer as a
structured chip.

- **Off until recorded.** Reference mode ships unbound, so no chord is taken
  from the host on install. It is the third row of the Jump navigation settings
  section (`settings.section`, id `jump`, order 25), under click and focus. That
  row shows "Off" instead of a chord; its chord button starts recording, and a
  "turn off reference mode" control unbinds it again. Restoring that row means
  unbinding, not falling back to a shipped chord, because it has none.
- **Nothing on the page changes.** The reference branch is checked before the
  target's own activation, so neither the synthetic click sequence nor the
  focus path runs. The element keeps whatever selection and focus it had.
- **The chip.** `clipboardText` is `[ui element button#gx-reference]` or
  `[ui element button[data-testid=gx-reference]]`; the label is
  `button「引用」`. The model text is one line of facts:
  `[ui element] <button> data-testid="gx-reference" role=button aria-label="引用" class="gx-btn" text="引用"`.
  Identity priority is `data-testid` > `id` > up to three authored classes; a
  class counts as authored when it carries a `-` or `_` and is not a utility
  word or a generated hash (`css-…`, `sc-…`, `_…`).
- **It needs a session.** The plugin is root-level, so it cannot ask which
  session is on screen. An invisible entry in `conversation.input.overlay`
  publishes `{ sessionId, inputActions }`; with no session, or on a host
  without that slot, the insert answers `no-session` and nothing is clicked.
- **Degrades, never throws.** A host without `insertReference`, or one whose
  trigger source never registered, falls back to
  `inputActions.insertText(clipboardText)`: the plain text is still sendable,
  whereas a chip with no codec would be refused at send time and keep the
  draft. If neither channel accepts the write the pick is silently dropped
  rather than escalating into a click.
  `inputTriggers`, `sessions` and `conversation` are all soft-probed, so a host
  missing any of them keeps the navigation and loses only the chip's send-time
  identity.
- **Clicking the chip goes back to the element.** The chip carries a
  description rather than a live reference, so the element is looked up again
  on every click, in the same order the description was written in:
  `data-testid` > `id` > tag plus its authored classes > `role` / `aria-label`
  > visible text. The identity steps search the whole document: a live
  `data-testid` wins even when the element's tag changed since the chip was
  written, and an `id` is matched without consulting the tag. Only the weaker
  steps stay inside the original tag's candidate list. Each step is exhausted
  before the next one starts, so a stale `id` elsewhere on the page cannot beat
  a live test id.
  A hit is scrolled to the centre of the viewport and focused with
  `preventScroll`, which keeps the focus from undoing the centring. The
  composer is never a candidate: it is `contenteditable` and its text can hold
  the very words the target carried, so revealing it would scroll to the chip
  the reader just clicked and call that a success. A miss answers `false` and
  the host keeps its own gesture.

## Performance on a busy page

A round costs one collection pass and one paint, and both used to grow with the
square of the page. Measured on a 1841×1274 view with 1189 visible candidates
over 25k DOM nodes, a round took 72ms to collect and 5.4ms to repaint on every
stroke of a three-key label. Neither is on the critical path now:

- Containers are decided by ancestor marking. A candidate that contains another
  candidate is a wrapper and the deepest target wins; comparing every pair is
  quadratic with an ancestor walk inside it, while walking up from each
  candidate and marking the candidates it passes costs O(n · depth) and lands
  on the same set, because `contains` means exactly "is an ancestor of". 72ms
  to 8ms.
- Badges are keyed by label and updated in place. The lit/dim split is a
  function of the typed prefix alone, so a badge whose prefix did not change is
  not touched at all; only the badges the prefix rules out get an opacity
  write, and only the few it still reaches are re-segmented. 5.4ms to 0.1ms per
  stroke.
- Badges share one containing block. They are `position:absolute` inside a
  container that is `fixed; inset:0` rather than fixed themselves: the viewport
  coordinate system is the same, and the browser tracks one containing block
  instead of one per badge. Rendering was verified pixel-identical against the
  previous build.

In-place updating leans on the snapshot rule in
[v1 boundaries](#v1-boundaries): label, target and rect are fixed when the round
opens, so only the prefix can change inside a round. A new round mints new
badges, which is what stops a label from staying over a target that has moved
since.

## v1 boundaries

- Hints are snapshotted at the moment of activation: elements that appear or
  move after activation do not get labels until you re-activate.
- The activation chords are stored per browser profile in `localStorage`
  (`dsh-jump:bindings:v1`), not in package config. The host's own shortcut
  registry cannot hold them: a bare home-row label stroke is rejected as
  modifier-less, and the shipped `Cmd+H` default collides with reserved primary
  chords. The listener is therefore plugin-owned, and the settings page writes
  to the same plugin-owned document.
- A chord that prints a character must carry ⌘, ⌃ or ⌥: a bare letter would
  type into whatever field has focus, and Shift alone is refused for the same
  reason. A key that prints nothing (Insert, F1, Home, PageUp) may be bound
  bare; the runtime then steps aside while a text surface has focus, so the
  editor keeps its own meaning of that key. Keys the interface owns (Tab,
  Enter, Space, the arrow keys, Escape) are refused at any modifier count, as
  is the chord the other mode already holds.
- The settings section waits for the host's slot service through `ctx.inject`
  rather than sampling it once. Services start one at a time, so a single
  `ctx.get("slots")` during `apply` can legitimately return undefined; the
  section would then never register, and `ctx.get` reports nothing. With
  neither the slot service nor a React seed, navigation still works; only the
  ability to remap is missing.
- Web and desktop both load this plugin, but the label overlay targets the Web
  GUI's DOM. The chords and the settings section are not Web-specific.

## Layout

- `src/index.ts` host half: serves `POST /api/dsh-jump/ime` and runs `im-select`
- `src/host/input-source.ts` one round: remember, switch to ABC, restore
- `src/host/ime-route.ts` the route, re-attached if the web server appears late
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
- `src/client/settings-page.ts` the settings page: one row per mode
- `src/client/react.ts` the narrowed React slice and the recording listener
- `src/client/copy.ts` the page's Chinese and English copy
- `src/client/config.ts` selectors and the label key map
- `src/client/ime.ts` the page's begin/end notice to the host route
- `lib/` committed build products (`pnpm run build`)

## Development

```sh
pnpm install
pnpm test        # vitest, 12 files
pnpm typecheck   # tsc --noEmit
pnpm run build   # esbuild src -> lib, committed
```

`lib/` is committed on purpose: an installed profile loads `lib/` straight from
the package and never runs a build step, so the built files have to be in the
tarball and in the repository.

The build produces a two-entry package: `lib/index.js` is the host half (the
input-source route) and `lib/client.js` is the browser half inlined with its
React imports resolved at load time.

## Releasing

```sh
npm version <patch|minor|major>   # or edit package.json
pnpm run release                  # test, build, then publish to registry.npmjs.org
git push --follow-tags
```

`release` runs the tests and the build before publishing, so a failing suite
stops the release. Publishing goes to `registry.npmjs.org` explicitly because a
global `registry` setting elsewhere (a mirror, for instance) would otherwise
send the tarball to the wrong place while reads still succeed.
