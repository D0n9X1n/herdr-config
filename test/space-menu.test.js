// The space context menu (apollo-spaces popup, props.menu "space"): its items, geometry and keys, as pure logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { recorder } from "./helpers/stubs.js";
import { sidebarSpaces } from "./fixtures/sidebar.js";
import { spaceMenuItems, spaceMenuHeight, nextSel, letterSel, runSpaceItem, spaceMenu, SPACE_MENU_W } from "../mods/apollo-spaces/lib.js";

const shape = (entries) => entries.map((e) => (e.kind === "item" ? e.id : e.kind));
const rowsOf = (entries) => entries.filter((e) => e.kind === "item");
const byId = (entries, id) => entries.find((e) => e.id === id);
const plain = (over = {}) => sidebarSpaces().map((s) => ({ ...s, branch: null, ...over }));
const menu = (id, opts = {}) => {
  const spaces = opts.spaces ?? sidebarSpaces();
  return spaceMenuItems({ space: spaces.find((s) => s.id === id), spaces, platform: "macos", ...opts });
};

test("space menu: title, Rename…, New tab, worktrees, Move up/down and Close space…, with separators", () => {
  const m = menu("s1");
  assert.deepEqual(shape(m), ["title", "rename", "sep", "new-tab", "new-worktree", "open-worktree", "sep", "move-up", "move-down", "sep", "close"]);
  assert.deepEqual(rowsOf(m).map((r) => r.label), ["Rename…", "New tab", "New worktree…", "Open worktree…", "Move up", "Move down", "Close space…"]);
  assert.equal(m[0].text, "dot-configs");
});

test("space menu: the title is the space's shown name (the folder it is in now)", () => {
  const spaces = sidebarSpaces();
  const panes = [{ tab: "s2-b1", cwd: "/home/ann/notes", focused: true }];
  assert.equal(menu("s2", { spaces, panes, home: "/home/ann" })[0].text, "notes");
});

test("space menu: Use folder name only for a named space; it renames to \"\"", () => {
  assert.equal(byId(menu("s1"), "folder-name"), undefined);
  const spaces = sidebarSpaces().map((s) => (s.id === "s1" ? { ...s, named: true } : s));
  const m = menu("s1", { spaces });
  assert.deepEqual(shape(m).slice(0, 4), ["title", "rename", "folder-name", "sep"]);
  assert.equal(byId(m, "folder-name").label, "Use folder name");
  assert.deepEqual(byId(m, "folder-name").action, { run: "space.rename", args: { id: "s1", name: "" } });
});

test("space menu: worktree rows only for git spaces: Herdr's branch or the probed repo", () => {
  const spaces = plain();
  assert.deepEqual(shape(menu("s2", { spaces })).filter((x) => /worktree/.test(x)), []);
  assert.deepEqual(shape(menu("s2", { spaces, git: { s2: { repo: true, branch: "main" } } })).filter((x) => /worktree/.test(x)),
    ["new-worktree", "open-worktree"]);
  assert.deepEqual(shape(menu("s2", { spaces, git: { s2: { repo: false, branch: null } } })).filter((x) => /worktree/.test(x)), []);
});

test("space menu: actions target the clicked space; Rename and Close leave the asking to Herdr", () => {
  const m = menu("s2");
  assert.deepEqual(byId(m, "rename").action, { run: "space.rename", args: { id: "s2" } });
  assert.deepEqual(byId(m, "new-tab").action, { run: "tab.new", args: { space: "s2" } });
  assert.deepEqual(byId(m, "new-worktree").action, { open: { mod: "worktree", kind: "dialog", props: { space: "s2", action: "new" } } });
  assert.deepEqual(byId(m, "open-worktree").action, { open: { mod: "worktree", kind: "dialog", props: { space: "s2", action: "open" } } });
  assert.deepEqual(byId(m, "close").action, { run: "space.close", args: { id: "s2" } });
  assert.equal(byId(m, "close").danger, true);
});

test("space menu: shortcuts show only on the active space; New tab is Alt+T on Windows, ⌘T on macOS", () => {
  const mac = menu("s1", { platform: "macos" });
  assert.equal(byId(mac, "rename").shortcut, "Shift+F2");
  assert.equal(byId(mac, "new-tab").shortcut, "⌘T");
  assert.equal(byId(menu("s1", { platform: "windows" }), "new-tab").shortcut, "Alt+T");
  const other = menu("s2", { platform: "windows" });
  assert.deepEqual(rowsOf(other).map((r) => r.shortcut ?? null), rowsOf(other).map(() => null));
});

test("space menu: Move up/down stay inside the space's machine block and use the neighbour's index (space.move: 1 = first)", () => {
  const base = sidebarSpaces();
  const spaces = [...base, { ...base[2], id: "devbox/s4", name: "web", active: false, index: 4 }];
  const s1 = menu("s1", { spaces }), s2 = menu("s2", { spaces });
  assert.equal(byId(s1, "move-up").enabled, false, "first local space");
  assert.deepEqual(byId(s1, "move-down").action, { run: "space.move", args: { id: "s1", index: 2 } });
  assert.deepEqual(byId(s2, "move-up").action, { run: "space.move", args: { id: "s2", index: 1 } });
  assert.equal(byId(s2, "move-down").enabled, false, "last local space, even with devbox after it");
  const s3 = menu("devbox/s3", { spaces }), s4 = menu("devbox/s4", { spaces });
  assert.equal(byId(s3, "move-up").enabled, false, "first devbox space");
  assert.deepEqual(byId(s3, "move-down").action, { run: "space.move", args: { id: "devbox/s3", index: 4 } });
  assert.deepEqual(byId(s4, "move-up").action, { run: "space.move", args: { id: "devbox/s4", index: 3 } });
  assert.equal(byId(s4, "move-down").enabled, false);
  const alone = menu("devbox/s3");
  assert.deepEqual([byId(alone, "move-up").enabled, byId(alone, "move-down").enabled], [false, false]);
  for (const r of rowsOf(s2).filter((x) => !x.id.startsWith("move-"))) assert.equal(r.enabled, true, r.id);
});

test("space menu height: padding 4+4, title 24, rows 30 with gap 2, separators 1 with 4 above and below", () => {
  // title, Rename, sep, New tab, New/Open worktree, sep, Move up/down, sep, Close: 8 + 24 + 7×30 + 3×9 + 4 gaps×2
  assert.equal(spaceMenuHeight(menu("s1")), 277);
  // no worktrees: 8 + 24 + 5×30 + 3×9 + 2 gaps×2
  assert.equal(spaceMenuHeight(menu("s1", { spaces: plain() })), 213);
});

const R = (...en) => en.map((e, i) => ({ id: `r${i}`, label: `r${i}`, enabled: e }));

test("nextSel: ↓ from none is the first enabled row, ↑ the last; both wrap and skip disabled rows", () => {
  const rows = R(false, true, true, false);
  assert.equal(nextSel(rows, null, "down"), 1);
  assert.equal(nextSel(rows, null, "up"), 2);
  assert.equal(nextSel(rows, 1, "down"), 2);
  assert.equal(nextSel(rows, 2, "down"), 1, "wraps past the disabled last row");
  assert.equal(nextSel(rows, 1, "up"), 2, "wraps past the disabled first row");
  assert.equal(nextSel(rows, 2, "home"), 1);
  assert.equal(nextSel(rows, 1, "end"), 2);
  assert.equal(nextSel(R(false, false), null, "down"), null, "nothing enabled");
});

test("letterSel: a letter jumps to the next enabled row starting with it, cycling; other letters keep the selection", () => {
  const rows = rowsOf(menu("s1"));
  const at = (i) => rows[i]?.id;
  let sel = letterSel(rows, null, "n");
  assert.equal(at(sel), "new-tab");
  sel = letterSel(rows, sel, "N");
  assert.equal(at(sel), "new-worktree");
  sel = letterSel(rows, sel, "n");
  assert.equal(at(sel), "new-tab", "cycles");
  assert.equal(at(letterSel(rows, null, "m")), "move-down", "Move up is disabled on the first space");
  assert.equal(letterSel(rows, 2, "z"), 2);
});

test("runSpaceItem closes the menu first, then runs; a disabled item does nothing", () => {
  const r = recorder();
  const host = { ...r, closeOverlay: (id) => r.record("closeOverlay", id) };
  const m = menu("s1");
  runSpaceItem(byId(m, "rename"), "o1", host);
  runSpaceItem(byId(m, "new-worktree"), "o2", host);
  runSpaceItem(byId(m, "move-up"), "o3", host);
  assert.deepEqual(r.calls.map(({ fn, name, args }) => [fn, name, args]), [
    ["closeOverlay", "o1", undefined],
    ["run", "space.rename", { id: "s1" }],
    ["closeOverlay", "o2", undefined],
    ["openOverlay", "worktree", { mod: "worktree", kind: "dialog", props: { space: "s1", action: "new" } }],
  ]);
});

test("spaceMenu opens this mod's 220 px space popup, sized to its items, at the pointer", () => {
  const r = recorder();
  const spaces = sidebarSpaces();
  spaceMenu(spaces[1], r, { spaces, platform: "macos" });
  const spec = r.calls[0].args;
  assert.deepEqual(spec, { mod: "apollo-spaces", kind: "popup", width: SPACE_MENU_W, height: spaceMenuHeight(menu("s2")) + 8,
    props: { menu: "space", space: "s2", repo: true } });
  assert.equal(SPACE_MENU_W, 220);
  const r2 = recorder();
  spaceMenu(plain()[1], r2, { spaces: plain(), git: { s2: { repo: true } } });
  assert.equal(r2.calls[0].args.props.repo, true, "the probed repo travels to the popup");
});
