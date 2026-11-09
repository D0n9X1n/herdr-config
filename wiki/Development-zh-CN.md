# 开发

[English](Development)

## 测试

每个 mod 把逻辑放在 `lib.js`，把界面放在 `main.js`。运行测试和仓库检查：

```sh
npm test
scripts/check.sh all
scripts/in-clone.sh bash test/safe-rm.test.sh
scripts/in-clone.sh bash test/live.test.sh
scripts/in-clone.sh bash test/in-clone.test.sh
scripts/in-clone.sh bash test/set-app-icon.test.sh
scripts/in-clone.sh bash test/smoke.test.sh
scripts/in-clone.sh bash -c 'for m in mods/apollo-*; do herdr-app check "$m"; done'
```

`scripts/check.sh all` 会检查 JSON、主题和快捷键表、agent 脚本、净室规则、隐私（没有作者的路径或真实 id）、wiki 双语页面和文档。会创建或删除文件的测试只在一次性克隆中运行（`scripts/in-clone.sh`）。

`scripts/gen-logo.sh` 根据 `assets/logo/apollo.svg` 重新生成 `mods/apollo-chrome/logo.png` 和 `assets/logo/apollo.icns`；`scripts/check.sh logo` 检查它们是否一致。

## 实机安全

`scripts/smoke.sh all` 和 `scripts/shots.sh` 在这台 Mac 上真实的 Herdr 中运行。它们遵守这些规则：

- 每次运行都以 `live_begin rollback` 开始，登记它可能动到的每个路径，并在退出时回滚：布局、快捷键、侧边栏宽度、标签页、空间以及空间的顺序。然后 `live_verify` 检查这些全部一致。
- 它们从不改变缩放或设置，从不发送按键，也从不通过链接写入。
- 测试仓库和测试文件只放在 `/private/tmp/apollo-test.*` 下，测试端的每次删除都通过 `safe_rm`。
- 截图在保留前要由人查看：不能有作者的路径、命令、文件或对话内容。只跟踪 `assets/screenshots/preview.png`。

## CI

`.github/workflows/ci.yml` 在每次 push 和 pull request 时于 `ubuntu-latest` 上运行，不用任何 secret。它运行 `node --check` 和 JSON 检查、`npm test`、不需要 Herdr 的 `scripts/check.sh` 各部分、在临时克隆中运行的 safe-rm、live（假主目录）和 in-clone 测试，以及对每个脚本运行 `shellcheck`。

## 发布

发布前，在装有 Herdr 的 Mac 上运行 `scripts/check.sh all`、上面的离线测试、对全部七个 mod 运行 `herdr-app check`，以及运行一次 `scripts/smoke.sh all`。然后 push，等 CI 通过，打上 `v0.0.1` 标签，并创建 GitHub release。
