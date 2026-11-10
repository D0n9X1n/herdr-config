# 快捷键

[English](Keys)

## 相对 Herdr 默认值的改动

| 按键 | 动作 |
|---|---|
| `cmd-shift-t` | 新建标签页 |
| `cmd-w` | 关闭窗格（最后一个窗格会关闭标签页） |
| `cmd-left` / `cmd-right` | 上一个 / 下一个标签页（终端里也一样） |
| `cmd-shift-z` | 放大窗格 |
| `cmd-shift-h` / `cmd-shift-j` / `cmd-shift-k` / `cmd-shift-l` | 转到左 / 下 / 上 / 右边的窗格 |
| `cmd-alt-l` | 切换布局 |
| `cmd-up` / `cmd-down` | 向上 / 向下滚动一行 |
| `cmd-pageup` / `cmd-pagedown` | 向上 / 向下滚动一页 |
| `cmd-home` / `cmd-end` | 滚动到顶部 / 底部 |
| `cmd-shift-=` | 放大 |
| `cmd-[` | 不绑定（在 SonicTerm 里是复制模式） |
| `cmd-9` | 最后一个标签页（`apollo-tabs.last`） |

其他 Herdr 默认快捷键都保留。`cmd-n` 仍然是"新建空间"：Herdr 没有新建窗口的命令。

## 不绑定的 SonicTerm 动作

Herdr 没有这些动作的命令，所以它们没有快捷键：广播输入、调整窗格大小、复制模式、全屏、重新加载和快速选择。

## 可以绑定的命令

- `apollo-tabs.last` 选中当前空间的最后一个标签页。`cmd-9` 运行它。
- `apollo-changes.next` 在 Changes 面板中选中下一个文件并显示它的 diff，到末尾后回到开头。可以在 `keys.json` 里绑定，例如在 `global` 里写 `"cmd-alt-n": "apollo-changes.next"`，也可以运行 `herdr-app do apollo-changes.next`。

## Windows

在 Windows 上，Herdr 把 `cmd` 当作 Windows 键，所以 `user/keys.json` 在那里不合适。`user/keys.windows.json` 是 Windows 快捷键文件。和 Windows 上的 SonicTerm 一样，macOS 用 Cmd 的地方它用 Alt：每个 `cmd-X` 都变成动作相同的 `alt-X`，例外如下：

| macOS | Windows | 原因 |
|---|---|---|
| `cmd-alt-[` / `cmd-alt-]` | `ctrl-shift-pageup` / `ctrl-shift-pagedown` | 在 Windows 上 Ctrl+Alt 就是 AltGr |
| `cmd-alt-l` | `ctrl-shift-l` | AltGr |
| `cmd-alt-shift-left`（以及其他方向键） | `alt-shift-left` | AltGr |
| `cmd-alt-left`（以及其他方向键） | 无 | `alt-left` / `alt-right` 切换标签页；`alt-shift-h` / `alt-shift-j` / `alt-shift-k` / `alt-shift-l` 在窗格间移动 |
| `cmd-v` | `ctrl-shift-v`、`shift-insert` | Windows 的粘贴键 |
| `cmd-backspace` | 无 | |
| 终端里的 `alt-backspace`、`alt-left`、`alt-right` | `ctrl-backspace`、`ctrl-left`、`ctrl-right` | Windows 的按词移动键 |
| `cmd-h`、`cmd-alt-h`、`cmd-q` | 无 | 仅限 macOS；Alt+F4 关闭窗口 |

它还加了几个 Windows 按键：`alt-{`、`alt-}`、`alt-?` 和 `alt-shift-?` 是对应 Shift 写法的重复；终端里加了 `ctrl-shift-c` 和 `ctrl-insert`（复制）以及 `ctrl-shift-f`（搜索）。`alt-9` 运行 `apollo-tabs.last`。有一个测试检查 `user/keys.json` 里的每个按键都有对应的 Windows 按键，或者是有意去掉的，所以两个快捷键文件会一起改。
