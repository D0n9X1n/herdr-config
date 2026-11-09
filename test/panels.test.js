import { test } from "node:test";
import assert from "node:assert/strict";
import { recorder } from "./helpers/stubs.js";
import { panelState, loadPanelState, panelClick, PANEL_DEFAULT } from "../mods/apollo-tabs/lib.js";

const tree = (panel) => ({ id: "root", type: "row", children: [{ id: "main", type: "column", children: [
  { id: "work", type: "row", children: [{ id: "tab", type: "block" }, { id: "panel", type: "stack", size: { px: 360 }, ...panel }] }] }] });
const runs = (r) => r.calls.map(({ name, args }) => ({ name, args }));

test("panelState reads the panel node from layout() (P4: clicks are reflected there)", () => {
  assert.deepEqual(panelState({ layout: tree({ hidden: true, active: "changes" }) }), { shown: false, active: "changes" });
  assert.deepEqual(panelState({ layout: tree({ active: "specs" }) }), { shown: true, active: "specs" });
});

test("without a layout() node it reads .state nodes.panel over the layout file's defaults", () => {
  assert.deepEqual(PANEL_DEFAULT, { hidden: true, active: "changes" });
  assert.deepEqual(panelState({ layout: null, state: { nodes: { panel: { hidden: false } } } }), { shown: true, active: "changes" });
  assert.deepEqual(panelState({ layout: {}, state: { nodes: { panel: { hidden: false, active: "files" } } } }), { shown: true, active: "files" });
  assert.deepEqual(panelState({ layout: null, state: { nodes: {} } }), { shown: false, active: "changes" });
  assert.deepEqual(panelState({}), { shown: false, active: "changes" });
});

test("loadPanelState reads .state only when layout() lacks the node, and on every call", async () => {
  const reads = [];
  const readTextFile = async (p) => { reads.push(p); return JSON.stringify({ nodes: { panel: { hidden: false, active: "specs" } } }); };
  const appHome = () => "/h";
  assert.deepEqual(await loadPanelState({ layout: () => tree({ active: "files" }), readTextFile, appHome }), { shown: true, active: "files" });
  assert.deepEqual(reads, []);
  assert.deepEqual(await loadPanelState({ layout: () => null, readTextFile, appHome }), { shown: true, active: "specs" });
  await loadPanelState({ layout: () => null, readTextFile, appHome });
  assert.deepEqual(reads, ["/h/layouts/.state/apollo.json", "/h/layouts/.state/apollo.json"]);
  const bad = await loadPanelState({ layout: () => null, readTextFile: async () => "{not json", appHome });
  assert.deepEqual(bad, { shown: false, active: "changes" });
});

for (const child of ["files", "changes", "specs"]) {
  test(`${child}: hidden → select then show; shown with another → select only; shown with this → hide`, () => {
    const other = child === "files" ? "changes" : "files";
    const r1 = recorder();
    panelClick(child, { shown: false, active: other }, r1);
    assert.deepEqual(runs(r1), [
      { name: "layout.select", args: { stack: "panel", child } },
      { name: "layout.show", args: { id: "panel" } },
    ]);
    const r2 = recorder();
    panelClick(child, { shown: true, active: other }, r2);
    assert.deepEqual(runs(r2), [{ name: "layout.select", args: { stack: "panel", child } }]);
    const r3 = recorder();
    panelClick(child, { shown: true, active: child }, r3);
    assert.deepEqual(runs(r3), [{ name: "layout.hide", args: { id: "panel" } }]);
  });
}

test("visible at load: from {hidden:false, active:specs}, specs hides and files only selects", () => {
  const st = panelState({ layout: tree({ hidden: false, active: "specs" }) });
  const r = recorder();
  panelClick("specs", st, r);
  panelClick("files", st, r);
  assert.deepEqual(runs(r), [
    { name: "layout.hide", args: { id: "panel" } },
    { name: "layout.select", args: { stack: "panel", child: "files" } },
  ]);
});
