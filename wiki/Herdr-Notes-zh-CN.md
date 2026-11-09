# Herdr 笔记

[English](Herdr-Notes)

## 我们发现的事实

这些是 Apollo 依赖的 Herdr 0.1.14 事实，在缩放为 1 时用 `scripts/probe-runtime.sh` 验证过。

| # | 问题 | 结论 |
|---|---|---|
| P1 | mod 根元素 `on_size_change` 报告的宽度是设计像素，还是设计像素 × 缩放？ | 缩放为 1 时等于布局的 px。其他缩放没有验证，所以 `SIZE_IS_ZOOMED` 保留为一个设置。 |
| P2 | 调整后的宽度存在哪里？ | 只有在拖动或调整大小之后，才存在 `layouts/.state/<name>.json` 的 `nodes.<id>.size.px`。它可能是小数。没有这一项时，使用布局文件里的 px。 |
| P3 | `layout.resize` 会存下这个 px 吗？ | 会，原样存下，即使超出 `min`/`max`；之后节点按它的 `min` 绘制。 |
| P4 | `layout()` 会反映隐藏和选择吗？ | 会。状态文件只保存与布局文件不同的字段：`nodes.<id>.hidden` 和 `nodes.<id>.active`。`layout.show` 之后这个节点项会消失。 |
| P5 | `herdr-app do <mod>.<command>` 能到达 `nextCommand()` 吗？ | 能，会到达 mod 每个正在显示的副本；隐藏的 stack 子项里的副本收不到。`herdr-app status` 把 `overlays` 列成纯 mod 名称。 |
| P6 | 窗口宽度在哪里？ | `window.json` 的 `bounds` 是 `[x, y, width, height]`，单位是逻辑像素。`herdr-app shot` 按显示器的缩放比例截图（Retina 显示器上是 2×）。`window()` 不含尺寸。 |
| P7 | mod 能打开空间菜单吗？ | 能：`openOverlay({mod: "menu", kind: "popup", props: {tab: "space", target: {space: id}}})` 会显示 Rename 和 Close。 |
| P8 | id 和 `herdr-app do` 是什么样子？ | 空间 `sp<32 hex>`，标签页 `tb<32 hex>`，窗格 `p<32 hex>`，终端 `t<n>`。`herdr-app do <command> '<one JSON object>'`；不创建东西的命令回复 `{"ok": true}`，`tab.new` 回复 `{space, tab, terminal}`。 |
| P9 | 新标签页知道自己的地址吗？ | 知道：它的 shell 里有 `HC_TERMINAL_ID`，等于 `tab.new` 回复中的 `terminal`。 |
| P10 | Herdr 会往 mod 文件夹里写什么？ | `jsconfig.json` 和 `gpui-kit.d.ts`（Herdr 和 `herdr-app check` 都会写，它们已被 git 忽略），以及在 Herdr 主目录里为每个已加载的 mod 创建一个空的 `data/<mod>/`。 |

## 另外值得知道

- Herdr 不会通过符号链接的 mod 文件夹加载 `svg()` 图标；mod 的代码仍会加载。
- `pane.split` 会把焦点移到新窗格。
- `herdr-app ls` 只列出终端，不列出 mod 窗格。
- 同一台机器上的每个窗口显示相同的空间，即使是用另一个 `HERDR_APP_HOME` 启动的窗口。
- 关闭的空间会留在最近列表里；没有命令能移除它。
- `openOverlay` 不能锚定到元素：弹出框在鼠标指针处或某个 `{x, y}` 处打开。
