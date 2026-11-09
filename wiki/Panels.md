# Panels

[简体中文](Panels-zh-CN)

## Panel buttons

The Files, Changes and Specs buttons at the right of the tab row each show their panel, 360 px wide. Click the button of the panel already showing to hide it. Files is Herdr's own `files` mod.

## Changes

Changes lists the files `git status` reports, up to 1000. Each row has a mark (A, M, D, U), the path, and the added and removed line counts. The list is as tall as its rows, up to 240 px, and the diff starts right below it.

Click a file to see its diff under a header with its name. Added lines sit on `#3d3f1b`, removed lines on `#4e231e`. A file with both staged and unstaged edits shows two groups, labeled `staged` and `unstaged`. A diff stops at 1500 lines and says so.

The list refreshes when files change, and every 10 s. `apollo-changes.next` moves to the next file.

## Specs

Specs lists the repo's `docs/specs/<status>/*.md` files by status: pending, paused, finished and canceled. The filter matches a title or a path. Click a spec to open it in a pane to the right.

Work on it starts the first installed agent, Claude first, in a new tab, with the task "Work on the spec <path>. Read it first." It uses the selected spec only while that spec is shown; otherwise it uses the first one shown. With no agent installed, it shows a warning. The list refreshes on change and every 60 s.

## The + menu

The ⊕ button opens a 220 px menu under it, right-aligned to it: Terminal, Start an agent (installed agents only), New space, New worktree and Open worktree. Before the tab row has been measured, the menu opens at the pointer.
