import { test } from "node:test";
import assert from "node:assert/strict";
import { recorder } from "./helpers/stubs.js";
import { tabSpace, tabPanes } from "./fixtures/tabs.js";
import { folderName, uniqueName, newTabName, handleCommand, tabPills } from "../mods/apollo-tabs/lib.js";
import { folderName as spacesFolderName, newSpaceHere, newSpace } from "../mods/apollo-spaces/lib.js";
import { workOnIt } from "../mods/apollo-specs/lib.js";

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

test("newTabName: the focused pane's folder in the space, made unique among its tabs", () => {
  const space = tabSpace(3);
  assert.equal(newTabName(space, focusedIn(space, 0, "/w/api"), { home: "/home/ann" }), "api");
  const named = { ...space, tabs: [...space.tabs, { id: "b9", name: "api", named: true }] };
  assert.equal(newTabName(named, focusedIn(space, 0, "/w/api"), { home: "/home/ann" }), "api 2");
});

test("newTabName: an agent's name; no pane folder falls back to the space folder, then Terminal", () => {
  const space = tabSpace(3);
  assert.equal(newTabName(space, [], { home: "/home/ann", agent: "Claude Code" }), "Claude Code");
  assert.equal(newTabName(space, [], { home: "/home/ann" }), "dot-configs");
  assert.equal(newTabName({ ...space, folder: "" }, [], { home: "/home/ann" }), "Terminal");
});

test("apollo-tabs.terminal names the new tab; apollo-tabs.space names the first tab; last still works", () => {
  const space = tabSpace(3);
  const panes = focusedIn(space, 0, "/w/api");
  const r = recorder();
  assert.equal(handleCommand("terminal", [space], r, { panes, home: "/home/ann" }), true);
  assert.equal(handleCommand("space", [space], r, { panes, home: "/home/ann" }), true);
  assert.equal(handleCommand("last", [space], r, { panes, home: "/home/ann" }), true);
  assert.equal(handleCommand("nope", [space], r, { panes, home: "/home/ann" }), false);
  assert.deepEqual(runs(r), [
    { name: "tab.new", args: { space: "s1", name: "api" } },
    { name: "space.new", args: { tab: "api" } },
    { name: "tab.select", args: { id: "b3" } },
  ]);
});

test("apollo-tabs.terminal with no space open still makes a tab (Herdr starts a space)", () => {
  const r = recorder();
  assert.equal(handleCommand("terminal", [], r, { panes: [], home: "/home/ann" }), true);
  assert.deepEqual(runs(r), [{ name: "tab.new", args: { name: "Terminal" } }]);
});

test("a shell tab nobody named shows its folder, not its number or the shell's name", () => {
  const pills = tabPills(tabSpace(), tabPanes(), { home: "/home/ann" });
  assert.deepEqual(pills.map((p) => p.label), ["Claude Code", "fix login", "w"]);
});

test("New space here: a remote space's first tab is the machine; here, the focused folder", () => {
  const r = recorder();
  newSpaceHere({ machine: "devbox" }, r, { cwd: "/w/api", home: "/home/ann" });
  newSpaceHere({ machine: null }, r, { cwd: "/w/api", home: "/home/ann" });
  newSpaceHere({ machine: null }, r, { cwd: null, home: "/home/ann" });
  assert.deepEqual(runs(r), [
    { name: "space.new", args: { machine: "devbox", tab: "devbox" } },
    { name: "space.new", args: { machine: "", tab: "api" } },
    { name: "space.new", args: { machine: "", tab: "Terminal" } },
  ]);
});

test("Work on it names the agent's tab, unique in the space", () => {
  const agent = { key: "claude", name: "Claude Code", installed: true, run: ["claude"] };
  const space = { id: "s1", machine: null, tabs: [{ id: "b1", name: "Claude Code", named: true }] };
  const r = recorder();
  workOnIt({ path: "docs/specs/pending/x.md" }, { space, repo: "/w/repo", agents: [agent] }, r);
  assert.equal(r.calls[0].args.name, "Claude Code 2");
});

test("the New space button keeps Herdr's default machine and names the first tab", () => {
  const r = recorder();
  newSpace(r, { cwd: "/w/api", home: "/home/ann" });
  newSpace(r, { cwd: "/home/ann", home: "/home/ann" });
  assert.deepEqual(runs(r), [{ name: "space.new", args: { tab: "api" } }, { name: "space.new", args: { tab: "~" } }]);
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
