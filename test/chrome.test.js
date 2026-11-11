import { test } from "node:test";
import assert from "node:assert/strict";
import { recorder } from "./helpers/stubs.js";
import {
  clamp, collapse, expand, settings, SIZE_IS_ZOOMED, DEFAULT_PX,
} from "../mods/apollo-chrome/lib.js";
import * as chrome from "../mods/apollo-chrome/lib.js";

const zoomCalls = (r) => r.calls.filter((c) => /^app\.zoom/.test(c.name ?? ""));

test("clamp keeps every width within 184-480", () => {
  assert.deepEqual([100, 184, 300, 480, 900, 300.4].map(clamp), [184, 184, 300, 480, 480, 300]);
});

for (const zoom of [1, 1.5]) {
  test(`collapse from 300 at zoom ${zoom}: saves 300, resizes to 184, never zooms`, () => {
    const observed = SIZE_IS_ZOOMED ? 300 * zoom : 300;
    const r = recorder();
    collapse({ observed, zoom }, r);
    assert.deepEqual(r.calls, [
      { fn: "setShared", name: "apollo.sidebar.width", args: 300 },
      { fn: "run", name: "layout.resize", args: { id: "sidebar", px: 184 } },
    ]);
    assert.deepEqual(zoomCalls(r), []);
  });

  test(`collapse at zoom ${zoom} with the other P1 reading`, () => {
    const r = recorder();
    collapse({ observed: 300 * zoom, zoom, zoomed: true }, r);
    assert.equal(r.calls[0].args, 300);
  });

  test(`expand at zoom ${zoom} restores the saved width and never zooms`, () => {
    const r = recorder();
    assert.equal(expand({ saved: 300 }, r), 300);
    assert.deepEqual(r.calls, [{ fn: "run", name: "layout.resize", args: { id: "sidebar", px: 300 } }]);
    assert.deepEqual(zoomCalls(r), []);
  });
}

test("expand: 100 gives 256, 900 gives 480, nothing saved gives 256, 219 gives 256", () => {
  assert.equal(DEFAULT_PX, 256);
  const px = (saved) => { const r = recorder(); const v = expand({ saved }, r); assert.equal(r.calls[0].args.px, v); return v; };
  assert.deepEqual([100, 900, undefined, null, 219, 220].map(px), [256, 480, 256, 256, 256, 220]);
});

test("footer action: Settings; Add machine is gone", () => {
  const r = recorder();
  settings(r);
  assert.deepEqual(r.calls, [{ fn: "run", name: "app.settings", args: undefined }]);
  assert.equal(chrome.addMachine, undefined);
});

// footerEl: 1 px top line + pt 8 + Settings 32 + pb 7 = the footer block.
test("the footer block fits its rows exactly", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../mods/apollo-chrome/main.js", import.meta.url), "utf8");
  const px = (re) => Number(src.match(re)?.[1]);
  const box = src.match(/footerEl\(vm\)[\s\S]*?v_flex\(\)\.size_full\(\)\.border_t\((\d+)\)[^\n]*\.pt\((\d+)\)[^\n]*\.pb\((\d+)\)\.gap\((\d+)\)/);
  assert.ok(box, "footer container");
  const [, border, pt, pb, gap] = box.map(Number);
  const row = px(/footerRow\(row, action\) \{\s*return h_flex\(\)\.id\(row\.attrs\.id\)\.h\((\d+)\)/);
  assert.ok(!src.includes('id("account")'), "no account row");
  const layout = JSON.parse(readFileSync(new URL("../layouts/apollo.json", import.meta.url), "utf8"));
  const find = (n) => n.id === "footer" ? n : (n.children ?? []).map(find).find(Boolean);
  assert.equal(border + pt + row + pb, find(layout).size.px);
});
