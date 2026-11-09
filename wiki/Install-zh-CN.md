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

## 应用图标

`scripts/set-app-icon.sh` 把 Herdr 在程序坞和访达里的图标换成 Apollo 标志（`assets/logo/apollo.icns`）。它只给应用设置访达自定义图标，从不改动 `Contents/` 里的任何东西。它使用 `~/Applications/Herdr.app`，没有时使用 `/Applications/Herdr.app`；用 `--app PATH` 可以指定别的位置。

```sh
scripts/set-app-icon.sh --restart-dock
```

`--restart-dock` 会重启程序坞，让新图标立刻显示。`--check` 只有在设置了自定义图标时才以 0 退出。`--remove` 会恢复 Herdr 自己的图标。

Herdr 更新会替换整个应用并重置图标，所以每次更新后要再运行一次。

之后 `codesign --verify --strict` 会报告 "Finder information" 残留。这是正常的：`spctl`（Gatekeeper）仍然接受这个经过公证的应用。

## Windows

在 Windows 上，Herdr 主目录是你的用户文件夹里的 `~/.config/herdr-app`。在 PowerShell 里复制同样的文件。Windows 快捷键文件复制为 `keys.json`：

```powershell
$H = "$HOME\.config\herdr-app"
Copy-Item layouts\apollo.json, layouts\apollo.svg "$H\layouts\"
Copy-Item themes\apollo.json "$H\themes\"
Copy-Item -Recurse -Force mods\apollo-* "$H\mods\"
Copy-Item user\keys.windows.json "$H\keys.json"
herdr-app do layout.switch '{"name":"apollo"}'
```

`herdr-app.exe` 是窗口程序：PowerShell 不会等它结束，也不显示它的输出。请在 Git Bash 里运行上面的 `herdr-app check` 循环。

Apollo 隐藏了系统标题栏，这时 Herdr 在 Windows 上不画窗口按钮。所以只要 `window().buttons` 为真（Windows 和 Linux），`apollo-tabs` 就在标签栏右端画出最小化、最大化和关闭按钮。窗口最大化时，最大化按钮显示还原图标。macOS 保留红绿灯按钮，不多画任何东西。
