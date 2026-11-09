# Herdr Notes

[简体中文](Herdr-Notes-zh-CN)

## What we found

These are facts about Herdr 0.1.14 that Apollo depends on, checked with `scripts/probe-runtime.sh` at zoom 1.

| # | Question | Finding |
|---|---|---|
| P1 | Is a mod root's `on_size_change` width design px, or design px × zoom? | At zoom 1 it equals the layout px. Other zooms were not checked, so `SIZE_IS_ZOOMED` stays a setting. |
| P2 | Where is a resized width stored? | In `layouts/.state/<name>.json` at `nodes.<id>.size.px`, only after a drag or a resize. It may be a float. With no entry, the layout file's px applies. |
| P3 | Does `layout.resize` store the px? | Yes, as given, even outside `min`/`max`; the node is then drawn at its `min`. |
| P4 | Does `layout()` show hide and select? | Yes. The state file keeps only the fields that differ from the layout file: `nodes.<id>.hidden` and `nodes.<id>.active`. After `layout.show` the node entry goes away. |
| P5 | Does `herdr-app do <mod>.<command>` reach `nextCommand()`? | Yes, in every shown copy of the mod; a copy in a hidden stack child does not get it. `herdr-app status` lists `overlays` as bare mod names. |
| P6 | Where is the window width? | `window.json` `bounds` is `[x, y, width, height]` in logical px. `herdr-app shot` captures at the display scale (2× on a Retina display). `window()` has no size. |
| P7 | Can a mod open the space menu? | Yes: `openOverlay({mod: "menu", kind: "popup", props: {tab: "space", target: {space: id}}})` shows Rename and Close. |
| P8 | What do ids and `herdr-app do` look like? | Space `sp<32 hex>`, tab `tb<32 hex>`, pane `p<32 hex>`, terminal `t<n>`. `herdr-app do <command> '<one JSON object>'`; commands that make nothing reply `{"ok": true}`, and `tab.new` replies `{space, tab, terminal}`. |
| P9 | Does a new tab know its address? | Yes: its shell has `HC_TERMINAL_ID`, equal to the `terminal` in the `tab.new` reply. |
| P10 | What does Herdr write into a mod folder? | `jsconfig.json` and `gpui-kit.d.ts` (Herdr and `herdr-app check` both write them; they are git-ignored), and an empty `data/<mod>/` in the Herdr home for each loaded mod. |

## Also worth knowing

- Herdr doesn't load `svg()` glyphs through a symlinked mod folder; the mod's code still loads.
- `pane.split` moves focus to the new pane.
- `herdr-app ls` lists terminals only, not mod panes.
- Every window on a machine shows the same spaces, even one started with another `HERDR_APP_HOME`.
- A closed space stays in the recent list; no command removes it.
- `openOverlay` has no element anchor: a popup opens at the pointer or at an `{x, y}`.
