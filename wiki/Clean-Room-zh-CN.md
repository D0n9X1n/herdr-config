# 净室

[English](Clean-Room)

## 允许的来源

Apollo 只用下面这些资料做成：

- Herdr 自己的文档和类型：`~/.config/herdr-app/AGENTS.md`、`~/.config/herdr-app/herdr.d.ts` 和 `~/.config/herdr-app/gpui-kit.d.ts`。
- 命令输出：`herdr-app commands`、`herdr-app --skill` 和 `hc --skill`。
- `data/apollo-palette.json`：Apollo 调色板 v0.2.0，sha256 `550f8c36cf4ef6ac99551541d1fe9554f77d563fa1e7c129a6a82583321d61ef`。
- `data/herdr-default-keys.json`：Herdr 0.1.14 的默认快捷键，sha256 `0660aaf35e31a8f168619ff463189421aeba95e95f2ec6ad2bc8a368ff1af94e`。
- `data/owner-settings.json`：作者自己的设置。
- 仅在运行时：Herdr 的数据文件 `layouts/.state/<name>.json`（侧边栏宽度、面板状态），供测试和冒烟检查读取。

## 不允许

- `~/.config/herdr-app/mods/` 或 `~/.config/herdr-app/layouts/` 下的任何内容，上面的数据文件除外。
- 任何自带 mod 的代码。自带 mod（`files`、`menu`、`worktree`）只按名称使用。

## 做法

1. 根据允许的来源写出每个部分。
2. 把纯逻辑放在每个 mod 的 `lib.js` 里，并测试它。
3. 让 `data/` 成为调色板和默认快捷键的唯一副本。主题和快捷键由它们生成，而不是复制。
4. 运行 `scripts/check.sh cleanroom`。如果 `data/` 之外的文件带有调色板或默认快捷键的 sha256，或者某个 mod 导入了 `../`，它就会失败。
