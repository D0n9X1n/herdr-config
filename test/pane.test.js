import { test } from "node:test";
import assert from "node:assert/strict";
import { recorder } from "./helpers/stubs.js";
import { paneActions, paneHeader, hoverButtons } from "../mods/apollo-pane/lib.js";

const prog = (key, name, agent) => ({ key, name, icon: `icons/${key}.svg`, tint: true, tile: null, color: null, shell: !agent, agent });
const PANES = [
  { pane: "p1", terminal: "t1", tab: "b1", title: "zsh", cwd: "/w/dot-configs", branch: "main", status: null, app: null,
    program: prog("zsh", "zsh", false), focused: true, zoomed: false, movable: true },
  { pane: "p2", terminal: "t2", tab: "b1", title: "Claude Code: fix login", cwd: "/w/herdr-config/docs", branch: "feat/v0.0.1",
    status: "blocked", app: "claude-code", program: prog("claude", "Claude Code", true), focused: false, zoomed: false, movable: true },
  { pane: "p3", terminal: null, mod: "apollo-specs", tab: "b1", title: "apollo-specs", focused: false, zoomed: false, movable: true },
];

test("paneActions target the header's own pane, never the focused one", () => {
  const r = recorder();
  const acts = paneActions("p2", r);
  assert.deepEqual(acts.map((a) => a.id), ["split-right", "split-down", "zoom", "close"]);
  for (const a of acts) a.fire();
  assert.deepEqual(r.calls.map(({ name, args }) => ({ name, args })), [
    { name: "pane.split", args: { pane: "p2", direction: "right" } },
    { name: "pane.split", args: { pane: "p2", direction: "down" } },
    { name: "pane.zoom", args: { pane: "p2" } },
    { name: "pane.close", args: { pane: "p2" } },
  ]);
  assert.ok(!JSON.stringify(r.calls).includes('"p1"'));
});

test("paneHeader: icon, title, folder badge, branch badge and mark", () => {
  assert.deepEqual(paneHeader("p2", PANES), {
    pane: "p2", icon: "mods/apollo-pane/star.svg", tint: true, iconColor: "#d97757", title: "Claude Code: fix login",
    folder: "docs", branch: "feat/v0.0.1", mark: { kind: "diamond", color: "blocked" }, focused: false,
  });
  const p1 = paneHeader("p1", PANES);
  assert.equal(p1.mark, null);
  assert.equal(p1.focused, true);
  assert.equal(p1.folder, "dot-configs");
});

test("paneHeader: a mod pane has no folder or branch; an unknown pane gives null", () => {
  const p3 = paneHeader("p3", PANES);
  assert.deepEqual([p3.title, p3.folder, p3.branch, p3.icon, p3.mark], ["apollo-specs", null, null, null, null]);
  assert.equal(paneHeader("nope", PANES), null);
  assert.equal(paneHeader("p2", [{ ...PANES[1], status: "working" }]).mark.kind, "arc");
  assert.equal(paneHeader("p2", [{ ...PANES[1], status: "done" }]).mark.kind, "check");
});

test("hoverButtons: four entries only while hovered", () => {
  assert.deepEqual(hoverButtons(true), ["split-right", "split-down", "zoom", "close"]);
  assert.deepEqual(hoverButtons(false), []);
});
