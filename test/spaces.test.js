import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recorder } from "./helpers/stubs.js";
import { sidebarSpaces, sidebarAgents } from "./fixtures/sidebar.js";
import {
  spaceColor, contrast, tileGlyph, groupByMachine, showHeaders, urgency, foldKeys,
  clickSpace, clickAgent, agentOrder, newSpaceHere, spaceMenu, machineMenu,
} from "../mods/apollo-spaces/lib.js";

const theme = JSON.parse(readFileSync(new URL("../themes/apollo.json", import.meta.url), "utf8"));
const hex = { ansi4: theme.ansi[4], ansi5: theme.ansi[5], ansi6: theme.ansi[6] };

test("spaceColor is stable and always ansi4, ansi5 or ansi6", () => {
  assert.equal(spaceColor("s1"), spaceColor("s1"));
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const id = `sp${Math.random().toString(16).slice(2)}${i}`;
    const c = spaceColor(id);
    assert.ok(["ansi4", "ansi5", "ansi6"].includes(c), c);
    assert.equal(spaceColor(id), c);
    seen.add(c);
  }
  assert.equal(seen.size, 3);
});

test("contrast against #141617 is at least 4.5:1 (spec: 6.6:1) for every tile color", () => {
  assert.equal(Math.round(contrast("#ffffff", "#000000")), 21);
  for (const [name, c] of Object.entries(hex)) assert.ok(contrast(c, "#141617") >= 6.6, `${name} ${contrast(c, "#141617")}`);
});

test("groupByMachine puts this computer first, then remote machines by name", () => {
  const spaces = [...sidebarSpaces(), { ...sidebarSpaces()[2], id: "alpha/s9", machine: "alpha", name: "zed" }];
  const groups = groupByMachine(spaces);
  assert.deepEqual(groups.map((g) => g.machine), [null, "alpha", "devbox"]);
  assert.deepEqual(groups[0].spaces.map((s) => s.id), ["s1", "s2"]);
  assert.deepEqual(groups.map((g) => g.key), ["local", "alpha", "devbox"]);
  assert.equal(groups[0].label, "This computer");
});

test("showHeaders is true only with two or more machine groups", () => {
  assert.equal(showHeaders(groupByMachine(sidebarSpaces())), true);
  assert.equal(showHeaders(groupByMachine(sidebarSpaces().filter((s) => !s.machine))), false);
  assert.equal(showHeaders([]), false);
});

test("urgency: blocked > done > working; idle shows nothing", () => {
  assert.equal(urgency(["working", "done", "blocked"]), "blocked");
  assert.equal(urgency(["working", "done"]), "done");
  assert.equal(urgency(["idle", "working", null]), "working");
  assert.equal(urgency(["idle"]), null);
  assert.equal(urgency([]), null);
});

test("fold keys", () => {
  assert.deepEqual(foldKeys, { spaces: "apollo.folded", machines: "apollo.machinesFolded" });
});

test("clicks: space.select {id} and agent.focus {terminal}", () => {
  const r = recorder();
  clickSpace(sidebarSpaces()[1], r);
  clickAgent(sidebarAgents()[0], r);
  assert.deepEqual(r.calls, [
    { fn: "run", name: "space.select", args: { id: "s2" } },
    { fn: "run", name: "agent.focus", args: { terminal: "t7" } },
  ]);
});

test("agentOrder is the expanded order, whatever is collapsed or folded", () => {
  const want = ["t1", "t2", "t7"];
  assert.deepEqual(agentOrder(sidebarSpaces(), sidebarAgents()), want);
  assert.deepEqual(agentOrder(sidebarSpaces(), sidebarAgents(), { collapsed: true }), want);
  assert.deepEqual(agentOrder(sidebarSpaces(), sidebarAgents(), { folded: { s1: true }, query: "api" }), want);
});

test("New space here targets this computer with machine \"\" and a remote by name, while a remote space is active", () => {
  const groups = groupByMachine(sidebarSpaces({ active: "devbox/s3" }));
  const r = recorder();
  newSpaceHere(groups[0], r);
  newSpaceHere(groups[1], r);
  assert.deepEqual(r.calls, [
    { fn: "run", name: "space.new", args: { machine: "" } },
    { fn: "run", name: "space.new", args: { machine: "devbox" } },
  ]);
});

test("spaceMenu opens the shipped menu as a space popup (P7)", () => {
  const r = recorder();
  spaceMenu(sidebarSpaces()[1], r);
  assert.deepEqual(r.calls, [{ fn: "openOverlay", name: "menu", args: { mod: "menu", kind: "popup", props: { tab: "space", target: { space: "s2" } } } }]);
});

test("machineMenu opens this mod as a popup carrying the machine", () => {
  const r = recorder();
  const groups = groupByMachine(sidebarSpaces());
  machineMenu(groups[1], r);
  machineMenu(groups[0], r);
  assert.equal(r.calls[0].args.mod, "apollo-spaces");
  assert.equal(r.calls[0].args.kind, "popup");
  assert.deepEqual(r.calls[0].args.props, { menu: "machine", machine: "devbox" });
  assert.deepEqual(r.calls[1].args.props, { menu: "machine", machine: null });
});

test("tileGlyph: a remote machine is a server, home is a house, a git space a repo, else a folder", () => {
  assert.equal(tileGlyph({ machine: "devbox", branch: "main", name: "api" }), "server");
  assert.equal(tileGlyph({ machine: null, branch: null, name: "~" }), "home");
  assert.equal(tileGlyph({ machine: null, branch: "main", name: "api" }), "repo");
  assert.equal(tileGlyph({ machine: null, branch: null, name: "notes" }, { repo: true }), "repo", "probed repo, no Herdr branch");
  assert.equal(tileGlyph({ machine: null, branch: null, name: "notes" }), "folder");
});
