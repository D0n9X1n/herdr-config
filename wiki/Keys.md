# Keys

[简体中文](Keys-zh-CN)

## Changes from the Herdr defaults

| Key | Action |
|---|---|
| `cmd-shift-t` | new tab |
| `cmd-w` | close pane (the last pane closes the tab) |
| `cmd-left` / `cmd-right` | previous / next tab (also in the terminal) |
| `cmd-shift-z` | zoom pane |
| `cmd-shift-h` / `cmd-shift-j` / `cmd-shift-k` / `cmd-shift-l` | go to the pane left / down / up / right |
| `cmd-alt-l` | switch layout |
| `cmd-up` / `cmd-down` | scroll one line up / down |
| `cmd-pageup` / `cmd-pagedown` | scroll one page up / down |
| `cmd-home` / `cmd-end` | scroll to top / bottom |
| `cmd-shift-=` | zoom in |
| `cmd-[` | unbound (copy mode in SonicTerm) |
| `cmd-9` | last tab (`apollo-tabs.last`) |

Every other Herdr default stays. `cmd-n` stays "new space": Herdr has no new-window command.

## Unbound SonicTerm actions

Herdr has no command for these, so they have no key: broadcast, pane resize, copy mode, fullscreen, reload and quick select.

## Commands you can bind

- `apollo-tabs.last` selects the last tab of the space. `cmd-9` runs it.
- `apollo-changes.next` selects the next file in the Changes panel and shows its diff. It wraps at the end. Bind it in `keys.json`, for example `"cmd-alt-n": "apollo-changes.next"` in `global`, or run `herdr-app do apollo-changes.next`.
