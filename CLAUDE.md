# CLAUDE.md — herdr-config

Apollo is an original MIT Herdr layout: mods, a theme and a keymap. Keep changes small and tested.

## Read first

- [`wiki/Home.md`](wiki/Home.md) — what Apollo is, and the page map.
- [`wiki/Development.md`](wiki/Development.md) — tests, live-safety rules, CI and release.
- [`wiki/Clean-Room.md`](wiki/Clean-Room.md) — the only allowed sources.

## Documentation rule

`wiki/` is the canonical and only documentation folder. Each page has an English `wiki/<Page>.md` and a Chinese `wiki/<Page>-zh-CN.md` with the same headings and facts; change both together. Pages link by bare name (`[Install](Install)`), and `wiki/_Sidebar.md` links every page. Use short, simple words.

Never track design notes, specs or plans. `docs/` is git-ignored; keep local drafts there.

## Check

```sh
scripts/check.sh all
```
