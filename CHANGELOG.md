# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-12

### Changed

- 优化高密度界面的响应速度，上千个标签同屏时开启标签与连续敲击均即时响应（实测约 1200 个标签下，开启耗时从 72ms 降至 8ms）
- 聚焦模式改为默认未启用，不再默认占用 `Cmd+U` / `Ctrl+U`；需要时可在「设置 → 跳跃导航」中自行设置快捷键（此前已修改过聚焦模式快捷键的用户不受影响）
- 优化标签分配顺序，按屏幕从上到下、从左到右排列；页面局部增删按钮或消息时，已有元素的标签保持稳定不再跟着重排

### Added

- 新增「引用模式」（默认未启用，可在「设置 → 跳跃导航」中设置快捷键）：敲标签选中页面元素后，不触发点击也不移走光标，而是将该元素作为引用标签插入当前会话输入框
- 支持点击输入框中的元素引用标签，自动将对应页面元素滚动到屏幕中央并聚焦，方便核对所引用的位置

### Fixed

- 上下紧挨的两排按钮不再被归入同一行，从上往下扫读时标签顺序不再错乱
- 跳转到输入框后光标不再丢失，敲完标签即可直接打字，无需再补点一次鼠标

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
