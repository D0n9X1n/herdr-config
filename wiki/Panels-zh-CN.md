# 面板

[English](Panels)

## 面板按钮

标签栏右侧的 Files、Changes 和 Specs 按钮各自显示对应的面板，宽 360 px。再点一次正在显示的面板的按钮会隐藏它。Files 是 Herdr 自带的 `files` mod。

## Changes

Changes 列出 `git status` 报告的文件，最多 1000 个。每行显示一个标记（A、M、D、U）、路径，以及增加和删除的行数。列表的高度随行数变化，最高 240 px，diff 紧接在列表下面。

单击文件，可以在带文件名的标题下看到它的 diff。增加的行底色是 `#3d3f1b`，删除的行底色是 `#4e231e`。一个文件同时有已暂存和未暂存的改动时，会显示两组，分别标为 `staged` 和 `unstaged`。diff 最多显示 1500 行，并会说明被截断。

文件变化时列表会刷新，另外每 10 秒刷新一次。`apollo-changes.next` 会移到下一个文件。

## Specs

Specs 按状态列出仓库里的 `docs/specs/<status>/*.md` 文件：pending、paused、finished 和 canceled。过滤框匹配标题或路径。单击一个 spec，会在右侧的窗格中打开它。

"Work on it" 会在一个用 agent 命名的新标签页里启动第一个已安装的 agent（优先 Claude），任务是"Work on the spec <path>. Read it first."。只有选中的 spec 正在显示时，它才会用这个 spec；否则用显示的第一个。没有安装任何 agent 时，它会显示一条警告。文件变化时以及每 60 秒刷新一次。

## + 菜单

+ 按钮会在它下方打开一个 220 px 宽的菜单，并与它右对齐：Terminal、Start an agent（只列出已安装的 agent）、New space、New worktree 和 Open worktree。Terminal、agent 和 New space 会给它们创建的标签页命名（见[侧边栏](Sidebar-zh-CN)）。标签栏还没测量好之前，菜单会在鼠标指针处打开。鼠标所在的行会用浅色填充和边框高亮。
