<div align="center">

# Apollo

**Yet, just another Herdr layout, made for working with coding agents.**

An original Herdr layout with Apollo colors and a SonicTerm-aligned macOS keymap.

[![CI](https://github.com/D0n9X1n/herdr-config/actions/workflows/ci.yml/badge.svg)](https://github.com/D0n9X1n/herdr-config/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/tag/D0n9X1n/herdr-config?sort=semver&label=version)](https://github.com/D0n9X1n/herdr-config/tags)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Documentation](wiki/Home.md) · [简体中文文档](wiki/Home-zh-CN.md)

</div>

<p align="center">
  <img src="assets/screenshots/preview.png" alt="Apollo with the Changes panel open on a demo repo" width="100%"/>
</p>

<p align="center">
  <b>The Changes panel on a demo repo: one file with staged and unstaged parts.</b>
</p>

## Highlights

- **Spaces and agents** in a sidebar with branches and status marks. It collapses to 184 px and keeps the names. See [Sidebar](wiki/Sidebar.md).
- **Changes and Specs panels**: diffs with staged and unstaged groups, and your repo's specs with a "Work on it" button. See [Panels](wiki/Panels.md).
- **A SonicTerm keymap** for macOS and one for Windows, plus window buttons on Windows. See [Keys](wiki/Keys.md) and [Install](wiki/Install.md).
- **Agent context**: a hook script tells Claude Code or Copilot CLI that they run in Herdr. See [Agent Context](wiki/Agent-Context.md).
- **Apollo app icon** for the Dock: `scripts/set-app-icon.sh`. See [Install](wiki/Install.md).

## Install

```sh
H=~/.config/herdr-app
cp layouts/apollo.json layouts/apollo.svg "$H/layouts/"
cp themes/apollo.json "$H/themes/"
cp -R mods/apollo-* "$H/mods/"
herdr-app do layout.switch '{"name":"apollo"}'
```

Use copies, not links. See [Install](wiki/Install.md) for why, and for the keymap.

## License

MIT. See [LICENSE](LICENSE).
