# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
