# Keys

[简体中文](Keys-zh-CN)

## Changes from the Herdr defaults

| Key | Action |
|---|---|
| `cmd-t`, `cmd-shift-t` | new tab, unnamed so its title follows the folder (`apollo-tabs.terminal`, Apollo layout only) |
| `cmd-n` | new space, unnamed so it follows the folder (`apollo-tabs.space`, Apollo layout only) |
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

Every other Herdr default stays. The `cmd-t`, `cmd-shift-t` and `cmd-n` keys above sit in a `layout:apollo` section, so they work this way only while the Apollo layout shows; in any other layout they are Herdr's own new tab and new space. `cmd-n` stays "new space": Herdr has no new-window command.

## Unbound SonicTerm actions

Herdr has no command for these, so they have no key: broadcast, pane resize, copy mode, fullscreen, reload and quick select.

## Commands you can bind

- `apollo-tabs.last` selects the last tab of the space. `cmd-9` runs it.
- `apollo-tabs.terminal` makes an unnamed terminal tab and `apollo-tabs.space` an unnamed space, so both follow the folder (see [Sidebar](Sidebar)).
- `apollo-changes.next` selects the next file in the Changes panel and shows its diff. It wraps at the end. Bind it in `keys.json`, for example `"cmd-alt-n": "apollo-changes.next"` in `global`, or run `herdr-app do apollo-changes.next`.

## Windows

On Windows Herdr reads `cmd` as the Windows key, so `user/keys.json` doesn't fit there. `user/keys.windows.json` is the Windows keymap. Like SonicTerm on Windows, it uses Alt where macOS uses Cmd: every `cmd-X` key becomes `alt-X` with the same action, except:

| macOS | Windows | Why |
|---|---|---|
| `cmd-alt-[` / `cmd-alt-]` | `ctrl-shift-pageup` / `ctrl-shift-pagedown` | Ctrl+Alt is AltGr on Windows |
| `cmd-alt-l` | `ctrl-shift-l` | AltGr |
| `cmd-alt-shift-left` (and the other arrows) | `alt-shift-left` | AltGr |
| `cmd-alt-left` (and the other arrows) | none | `alt-left` / `alt-right` switch tabs; `alt-shift-h` / `alt-shift-j` / `alt-shift-k` / `alt-shift-l` move between panes |
| `cmd-v` | `ctrl-shift-v`, `shift-insert` | Windows paste keys |
| `cmd-backspace` | none | |
| terminal `alt-backspace`, `alt-left`, `alt-right` | `ctrl-backspace`, `ctrl-left`, `ctrl-right` | Windows word keys |
| `cmd-h`, `cmd-alt-h`, `cmd-q` | none | macOS only; Alt+F4 closes the window |

It adds a few Windows keys: `alt-{`, `alt-}`, `alt-?` and `alt-shift-?` repeat their shifted spellings, and the terminal adds `ctrl-shift-c` and `ctrl-insert` (copy) and `ctrl-shift-f` (search). `alt-9` runs `apollo-tabs.last`, and `alt-t`, `alt-shift-t` and `alt-n` run `apollo-tabs.terminal` and `apollo-tabs.space` in the Apollo layout. A test checks that every key in `user/keys.json` has its Windows key or is dropped on purpose, so the two keymaps change together.
