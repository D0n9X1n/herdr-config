import { test } from "node:test";
import assert from "node:assert/strict";
import { recorder } from "./helpers/stubs.js";
import { tabSpace, tabPanes } from "./fixtures/tabs.js";
import { tabPills, selectTab, closeTab, onWheel, handleCommand, activeSpace } from "../mods/apollo-tabs/lib.js";

const runs = (r) => r.calls.map(({ name, args }) => ({ name, args }));

test("pills take the icon from the tab's agent pane, else its first pane", () => {
  const pills = tabPills(tabSpace(), tabPanes());
  assert.deepEqual(pills.map((p) => [p.id, p.icon]), [["b1", "mods/apollo-tabs/star.svg"], ["b2", "icons/nvim.svg"], ["b3", "icons/zsh.svg"]]);
  assert.equal(pills[0].iconColor, "#d97757", "Claude Code is the orange star");
  assert.equal(pills[0].tint, true);
});

test("a numbered tab shows its program name, a shell its folder; a named tab keeps its name", () => {
  const pills = tabPills(tabSpace(), tabPanes());
  assert.deepEqual(pills.map((p) => p.label), ["Claude Code", "fix login", "w"]);
});

test("pills carry active and status; a tab with no panes falls back to its own name", () => {
  const pills = tabPills(tabSpace(4), tabPanes());
  assert.deepEqual(pills.map((p) => p.active), [true, false, false, false]);
  assert.equal(pills[0].status, "working");
  assert.deepEqual([pills[3].label, pills[3].icon], ["4", null]);
  assert.deepEqual(tabPills(null, tabPanes()), []);
});

test("select, close and wheel", () => {
  const r = recorder();
  selectTab({ id: "b2" }, r);
  closeTab({ id: "b1" }, r);
  onWheel(1, r);
  onWheel(-1, r);
  onWheel(0, r);
  assert.deepEqual(runs(r), [
    { name: "tab.select", args: { id: "b2" } },
    { name: "tab.close", args: { id: "b1" } },
    { name: "tab.next", args: undefined },
    { name: "tab.prev", args: undefined },
  ]);
});

for (const n of [3, 10]) {
  test(`last with ${n} tabs selects the active space's last tab by id`, () => {
    const other = { ...tabSpace(2, { id: "s0" }), active: false };
    const r = recorder();
    assert.equal(handleCommand("last", [other, tabSpace(n)], r), true);
    assert.deepEqual(runs(r), [{ name: "tab.select", args: { id: `b${n}` } }]);
  });
}

test("unknown commands and no active space run nothing", () => {
  const r = recorder();
  assert.equal(handleCommand("other", [tabSpace()], r), false);
  assert.equal(handleCommand("last", [{ ...tabSpace(), active: false }], r), false);
  assert.deepEqual(r.calls, []);
  assert.equal(activeSpace([{ ...tabSpace(), active: false }]), null);
});
