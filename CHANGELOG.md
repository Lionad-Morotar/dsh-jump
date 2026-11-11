# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- 元素很多的界面上，开启一轮标签的耗时不随候选数平方增长：容器判定从两两包含比对改为祖先打标（成本 O(候选数 × 祖先深度)），1189 枚可见标签实测 72ms 降到 8ms

### Added

- 引用模式：设置页第三行，独立和弦、默认关闭。按和弦进入同一轮标签，选中目标不点击、不聚焦，把元素的可定位描述作为结构化 chip 插进当前会话输入框
- 元素描述按 `data-testid` > `id` > 有含义的 class 取身份；宿主缺 `insertReference`、source 未注册时降级纯文本，无会话时返回 `no-session`，任何情况下都不退化成一次点击
- 点击引用 chip 回到对应元素：按 `data-testid` > `id` > tag 加有含义的 class > `role` / `aria-label` > 可见文本重新找回元素，滚到视口中心并以 `preventScroll` 聚焦。每一档都先扫完整候选列表再降一档，页面上别处的旧 `id` 抢不过还活着的 test id；编辑区（`contenteditable`）永远不是候选，否则会滚到刚点的这颗 chip 自己。找不到返回 `false`，宿主保持自己的手势

### Changed

- 聚焦模式改为默认关闭：出厂不再占用 `Cmd+U` / `Ctrl+U`，需在设置页录制和弦后启用；旧文档里已录制的合法聚焦和弦照旧保留，只有从未写过文档或值非法的用户落到未启用

## [0.1.2] - 2026-11-02

### Added

- 进入跳跃后，焦点先让开，输入法暂时切到英文。这一轮结束、离开页面或切到别的应用时，输入法再切回来
- 多键标签里，已经敲下的字母加粗，还没敲的保持原样，看得出这一轮敲到哪了

### Fixed

- 切不到英文输入源时，这一轮不会被记住，结束时不会把输入法还错

## [0.1.1] - 2026-11-01

### Added

- 设置项从通用设置里的一行升为一级导航页：两个模式各自有标题、说明与恢复按钮，恢复一个不再顺带清掉另一个
- 不产生字符的键（Insert、F1 这类）可以不配修饰键直接绑定；输入框聚焦时它们仍归输入框
- 恢复默认时若目标键已被另一模式占用，会一并把它退到自己的出厂键，不留下运行时永远轮不到的重复绑定

### Fixed

- npm 元数据里的源码地址、主页与 issue 入口原先指向插件还在 monorepo 时的 `packages/dsh-jump`，那个目录随拆仓已经移走，三个链接都会 404。本版改为指向 `Lionad-Morotar/dsh-jump`
- 补上 `v0.1.0` 标签。首发时只发了包没打标签，仓库里没有对应的溯源标记

### Changed

- 声明 `dshWorkshop` 清单（`omdsh-workshop-package/v1`），供 DSH Hub Workshop 收录

### Notes

- 0.1.0 的包发布于设置页改版之前，本版把改版一并带上。按语义化版本这原本是一次 minor 变动，这里仍按 patch 发布，因为对外承诺的接口面没有变化：安装命令、配置键与宿主契约都保持原样

## [0.1.0] - 2026-10-30

### Added

- 首次发布。按下组合键后，Web GUI 里每个可见的可交互目标浮出字母标签，敲标签即可点击或聚焦
- 标签长度按候选数量每轮推导，超过九个候选时自动改用两键提示，单键不再吞掉后续字符
- 组合键可在设置页修改，改完立刻生效，不需要刷新
- 设置项从通用列表里的单行升为一级导航页
- 不产生字符的键（如 Insert）可以裸按作为激活键

[Unreleased]: https://github.com/Lionad-Morotar/dsh-jump/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Lionad-Morotar/dsh-jump/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Lionad-Morotar/dsh-jump/releases/tag/v0.1.0
