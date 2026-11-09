import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { walk } from "./helpers/tree.js";

const root = new URL("../", import.meta.url).pathname;
const layout = () => JSON.parse(readFileSync(`${root}layouts/apollo.json`, "utf8"));
const nodes = (n, parent = null, out = []) => {
  out.push({ node: n, parent });
  for (const c of n.children ?? []) nodes(c, n, out);
  return out;
};
const find = (L, id) => nodes(L).find((x) => x.node.id === id) ?? { node: {}, parent: {} };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Every A06 composition requirement (plan A06, A2 Mods, A3 widths). Returns the failures.
export function requirements(L) {
  const bad = [];
  const want = (what, ok) => { if (!ok) bad.push(what); };
  const n = (id) => find(L, id).node;
  want("root id", L.id === "root");
  want("root is a row", L.type === "row");
  want("root background canvas", L.background === "canvas");
  want("titlebar none", L.titlebar === "none");
  want("traffic_lights [12,16]", same(L.traffic_lights, [12, 16]));
  want("theme paper/apollo", same(L.theme, { light: "paper", dark: "apollo" }));
  want("preview svg", L.preview === "layouts/apollo.svg");
  want("root children sidebar, main", same((L.children ?? []).map((c) => c.id), ["sidebar", "main"]));
  const sb = n("sidebar");
  want("sidebar is a column", sb.type === "column");
  want("sidebar background chrome", sb.background === "chrome");
  want("sidebar 256 px", same(sb.size, { px: 256 }));
  want("sidebar min 184", sb.min === 184);
  want("sidebar max 480", sb.max === 480);
  want("sidebar children brand, spaces, footer", same((sb.children ?? []).map((c) => c.id), ["brand", "spaces", "footer"]));
  const brand = n("brand");
  want("brand 48 px", same(brand.size, { px: 48 }));
  want("brand window_drag", brand.window_drag === true);
  want("brand mod apollo-chrome", brand.content?.mod === "apollo-chrome");
  const spaces = n("spaces");
  want("spaces weight 1", same(spaces.size, { weight: 1 }));
  want("spaces mod", spaces.content?.mod === "apollo-spaces");
  const footer = n("footer");
  want("footer 130 px", same(footer.size, { px: 130 }));
  want("footer apollo-chrome props.footer", footer.content?.mod === "apollo-chrome" && footer.content?.props?.footer === true);
  const main = n("main");
  want("main is a column", main.type === "column");
  want("main padding 6", main.padding === 6);
  want("main gap 6", main.gap === 6);
  want("main children card, status", same((main.children ?? []).map((c) => c.id), ["card", "status"]));
  const card = n("card");
  want("card is a column", card.type === "column");
  want("card weight 1", same(card.size, { weight: 1 }));
  want("card radius 12", card.radius === 12);
  want("card border", same(card.border, { width: 1, color: "border" }));
  want("card background", card.background === "background");
  want("card children tabs, work", same((card.children ?? []).map((c) => c.id), ["tabs", "work"]));
  const tabs = n("tabs");
  want("tabs 40 px", same(tabs.size, { px: 40 }));
  want("tabs window_drag", tabs.window_drag === true);
  want("tabs mod", tabs.content?.mod === "apollo-tabs");
  const work = n("work");
  want("work is a row", work.type === "row");
  want("work children tab, panel", same((work.children ?? []).map((c) => c.id), ["tab", "panel"]));
  const tab = n("tab");
  want("tab block weight 1", same(tab.size, { weight: 1 }));
  want("tab block shows the active tab", tab.content?.tab === "active");
  want("pane header apollo-pane 34", same(tab.content?.pane?.header, { content: { mod: "apollo-pane" }, height: 34 }));
  want("pane header on a tab's only pane too (lone)", tab.content?.pane?.lone === true);
  const panel = n("panel");
  want("panel is a stack", panel.type === "stack");
  want("panel 360 px", same(panel.size, { px: 360 }));
  want("panel hidden", panel.hidden === true);
  want("panel default changes", panel.active === "changes");
  want("panel children", same((panel.children ?? []).map((c) => [c.id, c.content?.mod]),
    [["files", "files"], ["changes", "apollo-changes"], ["specs", "apollo-specs"]]));
  const status = n("status");
  want("status 24 px", same(status.size, { px: 24 }));
  want("status mod", status.content?.mod === "apollo-status");
  return bad;
}

test("layouts/apollo.json meets every A06 composition requirement", () => {
  assert.deepEqual(requirements(layout()), []);
});

const set = (id, f) => (L) => f(id === "root" ? L : find(L, id).node);
const MUTATIONS = {
  "root orientation": set("root", (n) => { n.type = "column"; }),
  "root background": set("root", (n) => { n.background = "chrome"; }),
  "traffic lights": set("root", (n) => { n.traffic_lights = [12, 17]; }),
  "titlebar": set("root", (n) => { n.titlebar = "system"; }),
  "theme": set("root", (n) => { n.theme.dark = "graphite"; }),
  "preview": set("root", (n) => { n.preview = "layouts/other.svg"; }),
  "sidebar background": set("sidebar", (n) => { n.background = "canvas"; }),
  "sidebar width": set("sidebar", (n) => { n.size.px = 255; }),
  "sidebar min": set("sidebar", (n) => { n.min = 183; }),
  "sidebar max": set("sidebar", (n) => { n.max = 481; }),
  "brand height": set("brand", (n) => { n.size.px = 47; }),
  "brand drag": set("brand", (n) => { n.window_drag = false; }),
  "spaces weight": set("spaces", (n) => { n.size = { weight: 2 }; }),
  "footer height": set("footer", (n) => { n.size.px = 120; }),
  "footer props": set("footer", (n) => { n.content.props.footer = false; }),
  "main orientation": set("main", (n) => { n.type = "row"; }),
  "main padding": set("main", (n) => { n.padding = 5; }),
  "main gap": set("main", (n) => { n.gap = 5; }),
  "card radius": set("card", (n) => { n.radius = 11; }),
  "card border": set("card", (n) => { n.border.width = 2; }),
  "tabs height": set("tabs", (n) => { n.size.px = 41; }),
  "tabs drag": set("tabs", (n) => { n.window_drag = false; }),
  "work orientation": set("work", (n) => { n.type = "column"; }),
  "pane header height": set("tab", (n) => { n.content.pane.header.height = 33; }),
  "pane lone": set("tab", (n) => { n.content.pane.lone = false; }),
  "panel width": set("panel", (n) => { n.size.px = 359; }),
  "panel hidden": set("panel", (n) => { n.hidden = false; }),
  "panel default": set("panel", (n) => { n.active = "files"; }),
  "status height": set("status", (n) => { n.size.px = 23; }),
};

test("mutation check: changing any required value in memory fails the requirements", () => {
  const missed = [];
  for (const [name, mutate] of Object.entries(MUTATIONS)) {
    const L = layout();
    mutate(L);
    if (requirements(L).length === 0) missed.push(name);
  }
  assert.deepEqual(missed, []);
});

test("every mod is the shipped files mod or an existing mods/<name>/", () => {
  const mods = [];
  for (const n of walk(layout())) {
    if (n.content?.mod) mods.push(n.content.mod);
    if (n.content?.pane?.header?.content?.mod) mods.push(n.content.pane.header.content.mod);
  }
  assert.ok(mods.length >= 9);
  for (const m of mods) assert.ok(m === "files" || existsSync(`${root}mods/${m}/mod.json`), m);
});

test("ids are unique", () => {
  const ids = nodes(layout()).map((x) => x.node.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("preview SVG has an <svg root with a viewBox", () => {
  const svg = readFileSync(`${root}layouts/apollo.svg`, "utf8");
  assert.match(svg, /^\s*(<\?xml[^>]*>\s*)?<svg\b[^>]*\bviewBox="[^"]+"/);
  assert.doesNotMatch(svg, /<image|href=/);
});
