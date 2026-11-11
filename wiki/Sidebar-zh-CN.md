# 侧边栏

[English](Sidebar)

## 空间和 agent

每个空间显示一个图块、名称、分支和一个状态标记。图块是空间颜色上的一个小图标：另一台机器显示服务器，主文件夹显示房子，git 仓库显示一本书，其他显示文件夹。空间下面每个 agent 有一行，显示图标、标题和标记。Claude Code 在这里、标签和窗格标题中都显示 Apollo 自己的星形图标，颜色为 Claude 橙色；其他程序保留 Herdr 的图标。工作中的 agent 显示旋转的弧线，被阻塞的显示菱形，已完成的显示对勾，空闲的不显示。空间显示它最紧急的 agent：先是阻塞，然后是完成，然后是工作中。

单击空间选中它；右键单击打开 Herdr 的空间菜单。单击 agent 聚焦它。鼠标在空间上停半秒会显示它的完整名称，侧边栏收起时也一样。

## 名称

Herdr 用编号称呼没人命名的标签页：1、2、3。Apollo 会给它创建的每个标签页起名：

- 终端标签页用它的文件夹命名，比如 `api`；主文件夹是 `~`。
- agent 标签页用 agent 命名，比如 `Claude Code`。
- 空间里已经用过的名称会加一个编号：`api 2`。
- 新空间的第一个标签页用空间开始时所在的文件夹命名。在另一台机器上新建的空间，用那台机器命名。

这适用于 New space、New space here、+ 菜单、Work on it，以及新建标签页和新建空间的快捷键（见[快捷键](Keys-zh-CN)）。空间本身不保存名称，所以 Herdr 继续用它的仓库或文件夹称呼它。用其他方式（比如脚本）创建的标签页保留 Herdr 的编号，但它的标签显示程序名，shell 则显示文件夹。用 Herdr 的重命名可以改标签页的名称；名称留空就恢复 Herdr 的编号。

## 底栏

底栏只有 Settings 行，不显示用户名，高 48 px。要添加机器，在终端里运行 `hc machine add <host>`。

## 折叠

有 agent 的空间带一个箭头：展开时是 `⌄`，折叠时是 `›`。单击它可以隐藏或显示 agent。折叠状态会被记住。

## 收起

侧边栏一开始宽 256 px。收起按钮会保存当前宽度，并把侧边栏缩到 184 px。图块、名称、高亮和标记保留；分支行、agent 行、箭头和搜索隐藏。顶行在两种宽度下都只显示 Apollo 图标，不显示应用名称。展开按钮恢复保存的宽度，没有时恢复为 256 px。宽度小于 220 px 就算收起。缩放永远不变。

## 宽度范围

侧边栏宽度保持在 184 到 480 px 之间。`layout.resize` 不理会布局的 `min` 和 `max`，所以 mod 会把超出范围的宽度改回一次。

## 搜索

搜索按钮在顶部打开一个过滤框。输入后只保留名称匹配的空间，不分大小写。按 Escape，或再点一次搜索按钮，会清空并关闭它。

## 注意

- `mods/apollo-spaces/lib.js` 里的 `SIZE_IS_ZOOMED` 认为侧边栏报告的宽度是设计像素。这只在缩放为 1 时验证过。在其他缩放下，收起和展开可能选错宽度。
- 所有图标使用同一种线宽：24 网格上为 2，状态标记为 3，Windows 按钮为 2.4。新图标也要遵守；`test/glyphs.test.js` 会检查。
- mod 之间不能共享文件，所以 `apollo-spaces`、`apollo-pane` 和 `apollo-status` 各自保存同一个 `branch.svg`。状态标记（`arc.svg`、`diamond.svg`、`check.svg`）也是这样复制的。`agentIcon` 和 `star.svg` 在 `apollo-spaces`、`apollo-tabs` 和 `apollo-pane` 里；`folderName` 同时在 `apollo-tabs` 和 `apollo-spaces` 里，`uniqueName` 同时在 `apollo-tabs` 和 `apollo-specs` 里。修改时要一起改所有副本。
