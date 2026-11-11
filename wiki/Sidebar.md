# Sidebar

[简体中文](Sidebar-zh-CN)

## Spaces and agents

Each space shows a tile, its name, its branch and one status mark. The tile is a small icon on the space's color: a server for another machine, a house for the home folder, a book for a git repo, and a folder otherwise. Under a space, each agent has a row with its icon, title and mark. Claude Code shows Apollo's own star in Claude orange, here, on tab pills and in pane headers; other programs keep Herdr's icon. A working agent shows a spinning arc, a blocked one a diamond, and a done one a check; an idle one shows nothing. A space shows its most urgent agent: blocked, then done, then working.

Click a space to select it; right-click it for Herdr's space menu. Click an agent to focus it. Rest the pointer on a space for half a second to see its full name, also when the sidebar is collapsed.

## Names

Herdr calls a tab nobody named by its number: 1, 2, 3. Apollo names every tab it makes:

- A terminal tab is called after its folder, such as `api`; the home folder is `~`.
- An agent tab is called after the agent, such as `Claude Code`.
- A name already used in the space gets a number: `api 2`.
- A new space's first tab is called after the folder the space starts in. In a new space on another machine, it is called after the machine.

This covers New space, New space here, the + menu, Work on it, and the new-tab and new-space keys (see [Keys](Keys)). A space keeps no name of its own, so Herdr keeps calling it after its repo or folder. A tab made some other way, such as by a script, keeps Herdr's number, but its pill shows the program, or the folder for a shell. Rename a tab with Herdr's rename; an empty name gives back Herdr's number.

## Footer

The footer has only the Settings row; it does not show the user name. It is 48 px tall. To add a machine, run `hc machine add <host>` in a terminal.

## Folds

A space with agents has a chevron: `⌄` when open, `›` when folded. Click it to hide or show the agents. Folds are remembered.

## Collapse

The sidebar is 256 px wide at first. The collapse button saves the width and shrinks the sidebar to 184 px. Tiles, names, the highlight and the marks stay; branch lines, agent rows, chevrons and search hide. The top row shows only the Apollo icon, with no app name, in both widths. The expand button brings back the saved width, or 256 px. A width under 220 px counts as collapsed. Zoom never changes.

## Width bounds

The sidebar stays between 184 and 480 px. `layout.resize` ignores the layout's `min` and `max`, so the mods put any width outside that range back once.

## Search

The search button opens a filter at the top. Typing keeps the spaces whose name matches, in any case. Escape, or the search button again, clears and closes it.

## Watch out

- `SIZE_IS_ZOOMED` in `mods/apollo-spaces/lib.js` says the sidebar's reported width is design px. That is checked only at zoom 1. At other zooms, collapse and expand may pick the wrong width.
- Every icon uses one line weight: 2 on the 24 grid, 3 for the status marks, and 2.4 for the Windows buttons. A new icon must follow it; `test/glyphs.test.js` checks it.
- Mods don't share files, so `apollo-spaces`, `apollo-pane` and `apollo-status` each keep the same `branch.svg`. The status marks (`arc.svg`, `diamond.svg`, `check.svg`) are copied the same way. `agentIcon` and `star.svg` are in `apollo-spaces`, `apollo-tabs` and `apollo-pane`; `folderName` is in both `apollo-tabs` and `apollo-spaces`, and `uniqueName` in both `apollo-tabs` and `apollo-specs`. Change all copies together.
