import { test } from "node:test";
import assert from "node:assert/strict";
import { recorder } from "./helpers/stubs.js";
import { tabSpace, tabPanes } from "./fixtures/tabs.js";
import { folderName, spaceLabel, handleCommand, tabPills } from "../mods/apollo-tabs/lib.js";
import { folderName as spacesFolderName, spaceLabel as spacesSpaceLabel, newSpaceHere, newSpace, spacesView } from "../mods/apollo-spaces/lib.js";
import { workOnIt, uniqueName } from "../mods/apollo-specs/lib.js";
import { findAll } from "./helpers/tree.js";

const runs = (r) => r.calls.map(({ name, args }) => ({ name, args }));

for (const [tag, fn] of [["apollo-tabs", folderName], ["apollo-spaces", spacesFolderName]]) {
  test(`folderName (${tag}): last folder, ~ at home, macOS and Windows paths`, () => {
    assert.equal(fn("/home/ann/Public/herdr-config", "/home/ann"), "herdr-config");
    assert.equal(fn("/home/ann/api/", "/home/ann"), "api");
    assert.equal(fn("/home/ann", "/home/ann"), "~");
    assert.equal(fn("/home/ann/", "/home/ann"), "~");
    assert.equal(fn("C:\\Users\\ann\\api", "C:\\Users\\ann"), "api");
    assert.equal(fn("C:\\Users\\ann", "C:\\Users\\ann"), "~");
    assert.equal(fn("C:\\Users\\Ann", "c:\\users\\ann"), "~", "Windows paths match in any case");
    assert.equal(fn("/", "/home/ann"), null);
    assert.equal(fn("", "/home/ann"), null);
    assert.equal(fn(null, "/home/ann"), null);
  });
}

test("uniqueName: free names stay; taken ones get 2, 3, ...", () => {
  assert.equal(uniqueName("api", ["1", "web"]), "api");
  assert.equal(uniqueName("api", ["api"]), "api 2");
  assert.equal(uniqueName("api", ["api", "api 2"]), "api 3");
});

const focusedIn = (space, tab, cwd) => [
  { pane: "x1", tab: space.tabs[tab].id, cwd: "/elsewhere", focused: false, program: null },
  { pane: "x2", tab: space.tabs[tab].id, cwd, focused: true, program: null },
];

// A space with two tabs; tab b2 is active. Panes: b1 in /w/api, b2 in /w/web/src (p3 focused) and /w/web.
const twoTabs = (over = {}) => ({ id: "s1", name: "dot-configs", named: false, folder: "/w/start", machine: null,
  tabs: [{ id: "b1", index: 1, name: "1", named: false, active: false }, { id: "b2", index: 2, name: "2", named: false, active: true }], ...over });
const twoTabPanes = () => [
  { pane: "p1", tab: "b1", cwd: "/w/api", focused: false },
  { pane: "p2", tab: "b2", cwd: "/w/web", focused: false },
  { pane: "p3", tab: "b2", cwd: "/w/web/src", focused: true },
];

for (const [tag, fn] of [["apollo-tabs", spaceLabel], ["apollo-spaces", spacesSpaceLabel]]) {
  test(`spaceLabel (${tag}): a given name, else the folder the space is in now`, () => {
    assert.equal(fn(twoTabs({ name: "Work", named: true }), twoTabPanes(), "/home/ann"), "Work");
    assert.equal(fn(twoTabs(), twoTabPanes(), "/home/ann"), "src", "the active tab's focused terminal");
    assert.equal(fn(twoTabs(), twoTabPanes().map((p) => ({ ...p, focused: false })), "/home/ann"), "web", "else that tab's first terminal");
    assert.equal(fn(twoTabs(), twoTabPanes().filter((p) => p.tab === "b1"), "/home/ann"), "api", "else any terminal of the space");
    assert.equal(fn(twoTabs(), [], "/home/ann"), "dot-configs", "no terminal folder known: Herdr's name, not the start folder");
    assert.equal(fn(twoTabs(), [{ pane: "p", tab: "b2", cwd: "C:\\Users\\ann", focused: true }], "C:\\Users\\ann"), "~");
  });
}

test("apollo-tabs.terminal and apollo-tabs.space leave the new tab and space unnamed; last still works", () => {
  const space = tabSpace(3);
  const panes = focusedIn(space, 0, "/w/api");
  const r = recorder();
  assert.equal(handleCommand("terminal", [space], r, { panes, home: "/home/ann" }), true);
  assert.equal(handleCommand("space", [space], r, { panes, home: "/home/ann" }), true);
  assert.equal(handleCommand("last", [space], r, { panes, home: "/home/ann" }), true);
  assert.equal(handleCommand("nope", [space], r, { panes, home: "/home/ann" }), false);
  assert.deepEqual(runs(r), [
    { name: "tab.new", args: { space: "s1" } },
    { name: "space.new", args: {} },
    { name: "tab.select", args: { id: "b3" } },
  ]);
});

test("apollo-tabs.terminal with no space open still makes a tab (Herdr starts a space)", () => {
  const r = recorder();
  assert.equal(handleCommand("terminal", [], r, { panes: [], home: "/home/ann" }), true);
  assert.deepEqual(runs(r), [{ name: "tab.new", args: {} }]);
});

test("tab titles: the space's folder, or the tab's given name, always followed by #position", () => {
  const space = twoTabs({ tabs: [...twoTabs().tabs, { id: "b3", index: 3, name: "notes", named: true, active: false }] });
  const panes = [...twoTabPanes(), { pane: "p4", tab: "b3", cwd: "/w/api", focused: false }];
  assert.deepEqual(tabPills(space, panes).map((p) => p.label), ["src #1", "src #2", "notes #3"]);
  // cd in the focused terminal: the unnamed titles follow the folder; the renamed one keeps its name and number.
  const moved = panes.map((p) => (p.pane === "p3" ? { ...p, cwd: "/w/docs" } : p));
  assert.deepEqual(tabPills(space, moved).map((p) => p.label), ["docs #1", "docs #2", "notes #3"]);
  // A named space keeps its name in the titles.
  assert.deepEqual(tabPills({ ...space, name: "Work", named: true }, moved).map((p) => p.label), ["Work #1", "Work #2", "notes #3"]);
});

test("the sidebar row shows the folder an unnamed space is in now; a named space keeps its name", () => {
  const names = (spaces, panes) => findAll(spacesView({ spaces, panes, home: "/home/ann" }), (n) => n.kind === "name").map((n) => n.attrs.text);
  assert.deepEqual(names([twoTabs({ active: true })], twoTabPanes()), ["src"]);
  assert.deepEqual(names([twoTabs({ active: true, name: "Work", named: true })], twoTabPanes()), ["Work"]);
  assert.deepEqual(names([twoTabs({ active: true })], [{ pane: "h", tab: "b2", cwd: "/home/ann", focused: true }]), ["~"]);
});

test("New space and New space here make unnamed spaces (they follow their folder)", () => {
  const r = recorder();
  newSpace(r);
  newSpaceHere({ machine: "devbox" }, r);
  newSpaceHere({ machine: null }, r);
  assert.deepEqual(runs(r), [
    { name: "space.new", args: {} },
    { name: "space.new", args: { machine: "devbox" } },
    { name: "space.new", args: { machine: "" } },
  ]);
});

test("Work on it names the agent's tab, unique in the space", () => {
  const agent = { key: "claude", name: "Claude Code", installed: true, run: ["claude"] };
  const space = { id: "s1", machine: null, tabs: [{ id: "b1", name: "Claude Code", named: true }] };
  const r = recorder();
  workOnIt({ path: "docs/specs/pending/x.md" }, { space, repo: "/w/repo", agents: [agent] }, r);
  assert.equal(r.calls[0].args.name, "Claude Code 2");
});

test("Work on it twice in a row: the second tab is numbered (tabs read when clicked)", () => {
  const agent = { key: "claude", name: "Claude Code", installed: true, run: ["claude"] };
  const space = { id: "s1", machine: null, tabs: [] };
  const names = [];
  const run = (_name, args) => { names.push(args.name); space.tabs.push({ id: `b${space.tabs.length}`, name: args.name }); };
  for (let i = 0; i < 2; i++) workOnIt({ path: "docs/specs/pending/x.md" }, { space, repo: "/w/repo", agents: [agent] }, { run, notify() {} });
  assert.deepEqual(names, ["Claude Code", "Claude Code 2"]);
});

// Claude Code shows Apollo's own star, in Claude orange, wherever its program icon shows. Other programs keep theirs.
import { agentIcon as spacesIcon } from "../mods/apollo-spaces/lib.js";
import { agentIcon as tabsIcon } from "../mods/apollo-tabs/lib.js";
import { agentIcon as paneIcon } from "../mods/apollo-pane/lib.js";
const CLAUDE = { key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: false, agent: true };
const NVIM = { key: "nvim", name: "Neovim", icon: "icons/nvim.svg", tint: true, agent: false };
for (const [mod, fn] of [["apollo-spaces", spacesIcon], ["apollo-tabs", tabsIcon], ["apollo-pane", paneIcon]]) {
  test(`${mod}: Claude Code is the orange star; other programs keep Herdr's icon`, () => {
    assert.deepEqual(fn(CLAUDE), { icon: `mods/${mod}/star.svg`, tint: true, color: "#d97757" });
    assert.deepEqual(fn(NVIM), { icon: "icons/nvim.svg", tint: true, color: null });
    assert.deepEqual(fn(null), { icon: null, tint: false, color: null });
  });
}
