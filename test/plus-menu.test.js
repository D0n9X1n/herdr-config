import { test } from "node:test";
import assert from "node:assert/strict";
import { recorder } from "./helpers/stubs.js";
import { walk, findAll } from "./helpers/tree.js";
import { tabSpace } from "./fixtures/tabs.js";
import { readFileSync } from "node:fs";
import { loadAgents, plusMenu, pickPlus, plusAnchor, PLUS_MENU_W } from "../mods/apollo-tabs/lib.js";

const APOLLO = JSON.parse(readFileSync(new URL("../layouts/apollo.json", import.meta.url), "utf8"));
const withSidebar = (px) => {
  const l = structuredClone(APOLLO);
  l.children.find((c) => c.id === "sidebar").size.px = px;
  return l;
};

// The tabs block starts at sidebar 256 + main padding 6 + card border 1 = 263, top 6 + 1 = 7, 40 tall.
// Root px 8; ⊕ (28) sits 4 px left of the panels group, so its right edge = 263 + 1400 - 8 - 270 - 4 = 1381
// and its bottom = 7 + (40 - 28) / 2 + 28 = 41. The popup is right-aligned to it, 4 px below.
test("plusAnchor: the popup opens under ⊕, right-aligned to it", () => {
  assert.equal(PLUS_MENU_W, 220);
  assert.deepEqual(plusAnchor({ layout: APOLLO, rootW: 1400, panelsW: 270 }), { x: 1381 - 220, y: 45 });
  assert.deepEqual(plusAnchor({ layout: withSidebar(320), rootW: 1336, panelsW: 270 }), { x: 1381 - 220, y: 45 });
});

test("plusAnchor: an out-of-range stored sidebar px counts at its rendered min; unmeasured gives null", () => {
  assert.deepEqual(plusAnchor({ layout: withSidebar(100), rootW: 1400, panelsW: 270 }), { x: 184 + 7 + 1400 - 8 - 270 - 4 - 220, y: 45 });
  assert.equal(plusAnchor({ layout: APOLLO, rootW: 0, panelsW: 270 }), null);
  assert.equal(plusAnchor({ layout: APOLLO, rootW: 1400, panelsW: 0 }), null);
  assert.equal(plusAnchor({ layout: null, rootW: 1400, panelsW: 270 }), null);
});

const agent = (key, name, installed) => ({ key, name, icon: `icons/${key}.svg`, tint: true, tile: null, color: null,
  shell: false, agent: true, run: [key], installed });
const KNOWN = [agent("codex", "Codex", false), agent("claude", "Claude Code", true), agent("pi", "Pi Agent", true)];

for (const machine of [null, "devbox"]) {
  test(`loadAgents asks knownAgents on the space's machine (${machine}) and keeps installed ones`, async () => {
    const asked = [];
    const got = await loadAgents(tabSpace(3, { machine }), async (opts) => { asked.push(opts); return KNOWN; });
    assert.deepEqual(asked, [{ on: machine }]);
    assert.deepEqual(got.map((a) => a.key), ["claude", "pi"]);
  });
}

test("loadAgents survives a failing knownAgents", async () => {
  assert.deepEqual(await loadAgents(tabSpace(), async () => { throw new Error("offline"); }), []);
});

test("an uninstalled agent never appears anywhere in the menu tree", () => {
  const tree = plusMenu(KNOWN.filter((a) => a.installed));
  const text = JSON.stringify([...walk(tree)].map((n) => n.attrs));
  assert.ok(!text.includes("Codex") && !text.includes("codex"));
  const all = plusMenu(KNOWN);
  assert.ok(!JSON.stringify([...walk(all)].map((n) => n.attrs)).includes("Codex"), "plusMenu filters too");
});

test("menu order: Terminal ⌘T, the agents, New space ⌘N, New worktree…, Open worktree…", () => {
  const tree = plusMenu(KNOWN);
  const items = findAll(tree, (n) => n.kind === "item").map((n) => [n.attrs.id, n.attrs.label, n.attrs.shortcut ?? null]);
  assert.deepEqual(items, [
    ["terminal", "Terminal", "⌘T"],
    ["agent-claude", "Claude Code", null],
    ["agent-pi", "Pi Agent", null],
    ["new-space", "New space", "⌘N"],
    ["new-worktree", "New worktree…", null],
    ["open-worktree", "Open worktree…", null],
  ]);
  const section = findAll(tree, (n) => n.kind === "agent-section");
  assert.equal(section.length, 1);
  assert.equal(section[0].attrs.label, "Start an agent");
});

test("no installed agents: no agent section", () => {
  const tree = plusMenu([agent("codex", "Codex", false)]);
  assert.equal(findAll(tree, (n) => n.kind === "agent-section").length, 0);
  assert.deepEqual(findAll(tree, (n) => n.kind === "item").map((n) => n.attrs.id),
    ["terminal", "new-space", "new-worktree", "open-worktree"]);
});

for (const machine of [null, "devbox"]) {
  test(`picks run the exact commands (${machine ? "remote" : "local"} space)`, () => {
    const space = tabSpace(3, { machine, id: machine ? "devbox/s1" : "s1" });
    const id = space.id;
    const items = Object.fromEntries(findAll(plusMenu(KNOWN), (n) => n.kind === "item").map((n) => [n.attrs.id, n]));
    const r = recorder();
    for (const k of ["terminal", "agent-claude", "new-space", "new-worktree", "open-worktree"]) pickPlus(items[k], space, r);
    assert.deepEqual(r.calls.map(({ fn, name, args }) => ({ fn, name, args })), [
      { fn: "run", name: "tab.new", args: { space: id } },
      { fn: "run", name: "tab.new", args: { space: id, argv: ["claude"] } },
      { fn: "run", name: "space.new", args: undefined },
      { fn: "openOverlay", name: "worktree", args: { mod: "worktree", kind: "dialog", props: { space: id, action: "new" } } },
      { fn: "openOverlay", name: "worktree", args: { mod: "worktree", kind: "dialog", props: { space: id, action: "open" } } },
    ]);
  });
}
