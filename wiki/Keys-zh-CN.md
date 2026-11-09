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
