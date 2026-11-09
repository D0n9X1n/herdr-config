# Sidebar

[简体中文](Sidebar-zh-CN)

## Spaces and agents

Each space shows a two-letter tile, its name, its branch and one status mark. Under a space, each agent has a row with its icon, title and mark. A working agent shows a spinning arc, a blocked one a diamond, and a done one a check; an idle one shows nothing. A space shows its most urgent agent: blocked, then done, then working.

Click a space to select it; right-click it for Herdr's space menu. Click an agent to focus it.

## Folds

A space with agents has a chevron: `⌄` when open, `›` when folded. Click it to hide or show the agents. Folds are remembered.

## Collapse

The sidebar is 256 px wide at first. The collapse button saves the width and shrinks the sidebar to 184 px. Tiles, names, the highlight and the marks stay; branch lines, agent rows, chevrons and search hide. The expand button brings back the saved width, or 256 px. A width under 220 px counts as collapsed. Zoom never changes.

## Width bounds

The sidebar stays between 184 and 480 px. `layout.resize` ignores the layout's `min` and `max`, so the mods put any width outside that range back once.

## Search

The search button opens a filter at the top. Typing keeps the spaces whose name matches, in any case. Escape, or the search button again, clears and closes it.

## Watch out

- `SIZE_IS_ZOOMED` in `mods/apollo-spaces/lib.js` says the sidebar's reported width is design px. That is checked only at zoom 1. At other zooms, collapse and expand may pick the wrong width.
- Mods don't share files, so `apollo-spaces`, `apollo-pane` and `apollo-status` each keep the same `branch.svg`. The status marks (`arc.svg`, `diamond.svg`, `check.svg`) are copied the same way. Change all copies together.
