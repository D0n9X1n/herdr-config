# 安装

[English](Install)

## 复制文件

把布局、主题和 mod 复制到你的 Herdr 主目录。然后逐个检查 mod，再切换到 Apollo。

```sh
H=~/.config/herdr-app
cp layouts/apollo.json layouts/apollo.svg "$H/layouts/"
cp themes/apollo.json "$H/themes/"
cp -R mods/apollo-* "$H/mods/"
for m in "$H"/mods/apollo-*; do herdr-app check "$m"; done
herdr-app do layout.switch '{"name":"apollo"}'
```

如果你的主目录里已经有同名的文件，先给新文件改名。你自己的布局保持不变。删除这些文件即可移除 Apollo。

## 用复制，不用链接

Herdr 不会通过符号链接的 mod 文件夹加载 `svg()` 图标。mod 的代码能加载，但图标是空白的。所以请复制 `mods/apollo-*`，不要用符号链接。更新后要重新复制。

## 快捷键和设置

`user/keys.json` 是一个完整的快捷键文件：Herdr 0.1.14 的默认值，加上[快捷键](Keys-zh-CN)里的改动。只有你想全部使用时，才用它覆盖你的 `keys.json`。`user/settings.json` 是作者自己的设置，你不需要它。
