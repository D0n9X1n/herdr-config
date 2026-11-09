import { test } from "node:test";
import assert from "node:assert/strict";
import { count, findAll } from "./helpers/tree.js";
import { sidebarSpaces, sidebarAgents } from "./fixtures/sidebar.js";
import { spacesView } from "../mods/apollo-spaces/lib.js";
import { brandView, footerView } from "../mods/apollo-chrome/lib.js";

function sidebar(collapsed, { platform = "macos", fullscreen = false } = {}) {
  const agents = sidebarAgents();
  return {
    kind: "sidebar", attrs: {}, children: [
      brandView({ collapsed, platform, fullscreen }),
      spacesView({ spaces: sidebarSpaces(), agents, collapsed }),
      footerView({ collapsed, home: "/home/ann", agentCount: agents.length }),
    ],
  };
}
const kinds = (n) => findAll(n, () => true).map((x) => x.kind);
const texts = (n) => findAll(n, (x) => typeof x.attrs?.text === "string").map((x) => x.attrs.text);

test("expanded: one plus; app icon at x 84 on macOS (20 px, radius 5); wordmark, search, panel-close", () => {
  const s = sidebar(false);
  assert.equal(count(s, "plus"), 1);
  const icon = findAll(s, (n) => n.kind === "app-icon");
  assert.equal(icon.length, 1);
  assert.deepEqual(icon[0].attrs, { src: "frame/welcome/herdr.png", x: 84, size: 20, radius: 5 });
  for (const k of ["wordmark", "search", "panel-close"]) assert.equal(count(s, k), 1, k);
  assert.equal(count(s, "panel-open"), 0);
  assert.equal(findAll(s, (n) => n.kind === "wordmark")[0].attrs.text, "Herdr");
  for (const sp of findAll(s, (n) => n.kind === "space")) {
    assert.equal(count(sp, "name"), 1);
    assert.equal(count(sp, "branch"), 1);
  }
  assert.ok(texts(s).includes("3 agents"));
  assert.ok(texts(s).includes("ann"));
});

test("app icon x is 12 in fullscreen and off macOS", () => {
  const x = (o) => findAll(sidebar(false, o), (n) => n.kind === "app-icon")[0].attrs.x;
  assert.equal(x({ fullscreen: true }), 12);
  assert.equal(x({ platform: "linux" }), 12);
});

test("collapsed: one plus; every space named; brand holds only panel-open; no icon, wordmark, search or N agents", () => {
  const s = sidebar(true);
  assert.equal(count(s, "plus"), 1);
  for (const sp of findAll(s, (n) => n.kind === "space")) assert.equal(count(sp, "name"), 1);
  const brand = s.children[0];
  assert.deepEqual(kinds(brand), ["brand", "panel-open"]);
  for (const k of ["app-icon", "wordmark", "search", "panel-close", "agent-count", "branch", "agent"]) assert.equal(count(s, k), 0, k);
  assert.ok(!texts(s).some((t) => /agents$/.test(t)));
  assert.ok(texts(s).includes("ann"));
});

test("footer: settings and add-machine rows with gear and plug glyphs, both states", () => {
  for (const collapsed of [false, true]) {
    const f = sidebar(collapsed).children[2];
    assert.deepEqual(findAll(f, (n) => n.attrs?.id).map((n) => n.attrs.id), ["settings", "add-machine", "account"]);
    assert.equal(count(f, "gear"), 1);
    assert.equal(count(f, "plug"), 1);
    assert.equal(findAll(f, (n) => n.kind === "avatar")[0].attrs.text, "A");
  }
});
