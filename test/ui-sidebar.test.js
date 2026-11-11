import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod } from "./helpers/host.js";
import { sidebarSpaces, sidebarAgents } from "./fixtures/sidebar.js";

const CHROME = "mods/apollo-chrome", SPACES = "mods/apollo-spaces";
const runs = (m) => m.rec.calls.filter((c) => c.fn === "run").map(({ name, args }) => ({ name, args }));
const data = (over = {}) => ({ spaces: sidebarSpaces(over), agents: sidebarAgents(), settings: { zoom: 1 },
  window: { platform: "macos", fullscreen: false }, home: "/home/ann", ...over.data });

test("chrome at width 300: panel-close saves the width, then resizes to 184", async () => {
  const m = await loadMod(CHROME, { data: data(), size: { width: 300, height: 48 } });
  m.click("panel-close");
  assert.deepEqual(m.rec.calls.filter((c) => c.fn !== "record").map(({ fn, name, args }) => ({ fn, name, args })), [
    { fn: "setShared", name: "apollo.sidebar.width", args: 300 },
    { fn: "run", name: "layout.resize", args: { id: "sidebar", px: 184 } },
  ]);
});

test("chrome at width 184 with 300 saved: panel-open resizes to 300", async () => {
  const m = await loadMod(CHROME, { data: data(), size: { width: 184, height: 48 }, shared: { "apollo.sidebar.width": 300 } });
  assert.ok(m.ids().includes("panel-open"));
  assert.ok(!m.ids().includes("search"));
  m.click("panel-open");
  assert.deepEqual(runs(m), [{ name: "layout.resize", args: { id: "sidebar", px: 300 } }]);
});

test("chrome brand controls stop the press so window_drag does not start", async () => {
  const m = await loadMod(CHROME, { data: data(), size: { width: 300, height: 48 } });
  const before = m.ctx.stopped;
  m.press("search");
  m.press("panel-close");
  assert.equal(m.ctx.stopped, before + 2);
});

test("chrome: search toggles apollo.sidebar.search; footer Settings, no Add machine", async () => {
  const brand = await loadMod(CHROME, { data: data(), size: { width: 300, height: 48 } });
  brand.click("search");
  assert.deepEqual(brand.rec.calls.filter((c) => c.fn === "setShared").map((c) => [c.name, c.args]), [["apollo.sidebar.search", true]]);
  const footer = await loadMod(CHROME, { data: data(), props: { footer: true }, size: { width: 300, height: 48 } });
  assert.ok(!footer.ids().includes("add-machine"));
  footer.click("settings");
  assert.deepEqual(runs(footer), [{ name: "app.settings", args: undefined }]);
});

test("spaces: clicks select a space, focus an agent, and start an unnamed new space", async () => {
  const m = await loadMod(SPACES, { data: data(), size: { width: 256, height: 600 } });
  m.click("space-s2");
  m.click("agent-t7");
  m.click("new-space");
  assert.deepEqual(runs(m), [
    { name: "space.select", args: { id: "s2" } },
    { name: "agent.focus", args: { terminal: "t7" } },
    { name: "space.new", args: {} },
  ]);
});

test("spaces: right-click a space opens this mod's space menu for it, at the pointer", async () => {
  const m = await loadMod(SPACES, { data: data(), size: { width: 256, height: 600 } });
  m.rightClick("space-s2");
  const specs = m.rec.calls.filter((c) => c.fn === "openOverlay").map((c) => c.args);
  assert.equal(specs.length, 1);
  assert.deepEqual([specs[0].mod, specs[0].kind, specs[0].width, specs[0].at], ["apollo-spaces", "popup", 220, undefined]);
  assert.deepEqual(specs[0].props, { menu: "space", space: "s2", repo: true });
  assert.equal(typeof specs[0].height, "number");
});

// ---- The space menu popup: one selection shared by pointer and keys ----
const MENU_THEME = { popover: "#1d2021", selected: "#3c3836", input: "#504945", blocked: "#fb4934", chrome: "#141617",
  foreground: "#cfbc97", muted: "#d5c4a1", dim: "#928374" };
const spaceMenuMod = (over = {}) => loadMod(SPACES, { data: { ...data(), theme: MENU_THEME, ...over.data },
  props: { menu: "space", space: "s1", overlay: "o1", repo: true, ...over.props } });
const elById = (m, id) => findEl(m, id)?.__el;
const lit = (m) => m.ids().filter((id) => id.startsWith("menu-") && elById(m, id).calls.some((c) => c.name === "bg"));
const acts = (m) => m.rec.calls.filter((c) => ["run", "openOverlay", "closeOverlay"].includes(c.fn)).map(({ fn, name, args }) => [fn, name, args]);

test("space menu: opens with nothing highlighted and its own handle focused; rows use no .hover()", async () => {
  const m = await spaceMenuMod();
  assert.deepEqual(lit(m), []);
  assert.equal(m.ctx.focused, true, "the popup takes the keyboard when it opens");
  for (const id of m.ids().filter((x) => x.startsWith("menu-"))) {
    assert.ok(!elById(m, id).calls.some((c) => c.name === "hover"), `${id} has no .hover()`);
  }
});

test("space menu: hovering Rename, then Close space…, leaves exactly one highlighted row: Close", async () => {
  const m = await spaceMenuMod();
  m.hover("menu-rename");
  assert.deepEqual(lit(m), ["menu-rename"]);
  m.hover("menu-close");
  assert.deepEqual(lit(m), ["menu-close"]);
  const close = elById(m, "menu-close").calls;
  assert.ok(close.some((c) => c.name === "bg" && c.args[0] === MENU_THEME.blocked), "Close highlights in blocked");
  m.hover("space-menu", false);
  assert.deepEqual(lit(m), [], "leaving the menu clears the highlight");
});

test("space menu: a highlighted row has the selected fill and an input border; every row keeps a 1 px popover border", async () => {
  const m = await spaceMenuMod();
  m.hover("menu-new-tab");
  const calls = elById(m, "menu-new-tab").calls;
  assert.ok(calls.some((c) => c.name === "bg" && c.args[0] === MENU_THEME.selected));
  assert.ok(calls.some((c) => c.name === "border_color" && c.args[0] === MENU_THEME.input));
  const other = elById(m, "menu-rename").calls;
  assert.ok(other.some((c) => c.name === "border" && c.args[0] === 1));
  assert.ok(other.some((c) => c.name === "border_color" && c.args[0] === MENU_THEME.popover));
});

test("space menu: ↓ from none is Rename, ↑ from none Close; both wrap; disabled Move up is skipped", async () => {
  const m = await spaceMenuMod();
  m.key("space-menu", "down");
  assert.deepEqual(lit(m), ["menu-rename"]);
  m.key("space-menu", "up");
  assert.deepEqual(lit(m), ["menu-close"], "↑ wraps from the first row to the last");
  m.key("space-menu", "down");
  assert.deepEqual(lit(m), ["menu-rename"], "↓ wraps from the last row to the first");
  const n = await spaceMenuMod();
  n.key("space-menu", "up");
  n.key("space-menu", "up");
  n.key("space-menu", "up");
  assert.deepEqual(lit(n), ["menu-open-worktree"], "s1 is first: Move up is disabled and skipped");
  n.hover("menu-move-up");
  assert.deepEqual(lit(n), [], "a disabled row never highlights");
});

test("space menu: pointer and keys share one selection", async () => {
  const m = await spaceMenuMod();
  m.hover("menu-new-tab");
  m.key("space-menu", "down");
  assert.deepEqual(lit(m), ["menu-new-worktree"], "↓ moves on from the hovered row");
  m.hover("menu-rename");
  assert.deepEqual(lit(m), ["menu-rename"], "the pointer moves the same selection");
});

test("space menu: Enter on Rename and a click on Close space… close the menu first, then run", async () => {
  const m = await spaceMenuMod();
  m.key("space-menu", "down");
  m.key("space-menu", "enter");
  assert.deepEqual(acts(m), [["closeOverlay", "o1", undefined], ["run", "space.rename", { id: "s1" }]]);
  const c = await spaceMenuMod();
  c.click("menu-close");
  assert.deepEqual(acts(c), [["closeOverlay", "o1", undefined], ["run", "space.close", { id: "s1" }]]);
  const d = await spaceMenuMod();
  assert.throws(() => d.click("menu-move-up"), /no click handler/, "disabled rows are not clickable");
});

test("space menu keys: Escape closes without running; Space runs the selected row after closing", async () => {
  const m = await spaceMenuMod();
  m.key("space-menu", "escape");
  assert.deepEqual(acts(m), [["closeOverlay", "o1", undefined]], "Escape only closes");
  const n = await spaceMenuMod();
  n.key("space-menu", "space");
  assert.deepEqual(acts(n), [], "Space with nothing selected does nothing");
  n.key("space-menu", "down");
  n.key("space-menu", "space");
  assert.deepEqual(acts(n), [["closeOverlay", "o1", undefined], ["run", "space.rename", { id: "s1" }]]);
});

test("space menu keys: Home and End go to the first and last enabled rows", async () => {
  const m = await spaceMenuMod();
  m.key("space-menu", "end");
  assert.deepEqual(lit(m), ["menu-close"]);
  m.key("space-menu", "home");
  assert.deepEqual(lit(m), ["menu-rename"]);
});

test("space menu keys: a first letter jumps to the next enabled row starting with it, cycling; Ctrl+letter is ignored", async () => {
  const m = await spaceMenuMod();
  m.key("space-menu", "n");
  assert.deepEqual(lit(m), ["menu-new-tab"]);
  m.key("space-menu", "n");
  assert.deepEqual(lit(m), ["menu-new-worktree"]);
  m.key("space-menu", "n");
  assert.deepEqual(lit(m), ["menu-new-tab"], "cycles among the rows starting with N");
  m.key("space-menu", "m");
  assert.deepEqual(lit(m), ["menu-move-down"], "Move up is disabled (s1 is first) and skipped");
  m.key("space-menu", "c", { modifiers: { control: true } });
  assert.deepEqual(lit(m), ["menu-move-down"], "Ctrl+C does not move the selection");
  m.key("space-menu", "c");
  assert.deepEqual(lit(m), ["menu-close"]);
  m.key("space-menu", "enter");
  assert.deepEqual(acts(m), [["closeOverlay", "o1", undefined], ["run", "space.close", { id: "s1" }]], "close first, then run");
});

test("space menu: a space that no longer exists closes the menu", async () => {
  const m = await spaceMenuMod({ props: { space: "gone" } });
  assert.deepEqual(acts(m).filter(([fn]) => fn === "closeOverlay"), [["closeOverlay", "o1", undefined]]);
});

test("New space here, with a remote space active: devbox gets machine devbox, this computer gets \"\"", async () => {
  const d = data({ active: "devbox/s3" });
  const m = await loadMod(SPACES, { data: d, size: { width: 256, height: 600 } });
  m.rightClick("machine-devbox");
  m.rightClick("machine-local");
  const specs = m.rec.calls.filter((c) => c.fn === "openOverlay").map((c) => c.args);
  assert.deepEqual(specs.map((s) => [s.mod, s.kind, s.props]), [
    ["apollo-spaces", "popup", { menu: "machine", machine: "devbox" }],
    ["apollo-spaces", "popup", { menu: "machine", machine: null }],
  ]);
  const want = [{ machine: "devbox" }, { machine: "" }];
  for (const [i, spec] of specs.entries()) {
    const pop = await loadMod(SPACES, { data: d, props: { ...spec.props, overlay: `o${i}` } });
    pop.click("new-space-here");
    assert.deepEqual(runs(pop), [{ name: "space.new", args: want[i] }]);
    assert.deepEqual(pop.rec.calls.filter((c) => c.fn === "closeOverlay").map((c) => c.name), [`o${i}`]);
  }
});

test("setAgentOrder gets the expanded order expanded, collapsed and with s1 folded", async () => {
  const orders = [];
  const last = (m) => m.rec.calls.filter((c) => c.fn === "setAgentOrder").at(-1).args;
  const exp = await loadMod(SPACES, { data: data(), size: { width: 256, height: 600 } });
  orders.push(last(exp));
  exp.click("fold-s1");
  assert.ok(!exp.ids().includes("agent-t1"), "s1 folded hides its agents");
  orders.push(last(exp));
  const col = await loadMod(SPACES, { data: data(), size: { width: 184, height: 600 } });
  assert.ok(!col.ids().includes("agent-t7"));
  orders.push(last(col));
  for (const o of orders) assert.deepEqual(o, ["t1", "t2", "t7"]);
});

test("rendering at width 120 twice resizes to 184 exactly once", async () => {
  const m = await loadMod(SPACES, { data: data(), size: { width: 120, height: 600 } });
  m.render();
  m.render();
  assert.deepEqual(runs(m).filter((r) => r.name === "layout.resize"), [{ name: "layout.resize", args: { id: "sidebar", px: 184 } }]);
  const ok = await loadMod(SPACES, { data: data(), size: { width: 300, height: 600 } });
  ok.render();
  assert.deepEqual(runs(ok), []);
});

test("spaces init resets the search flag only when it is set (no shared.json write on a plain load)", async () => {
  const plain = await loadMod(SPACES, { data: data(), size: { width: 256, height: 600 } });
  assert.deepEqual(plain.rec.calls.filter((c) => c.fn === "setShared"), []);
  const open = await loadMod(SPACES, { data: data(), size: { width: 256, height: 600 }, shared: { "apollo.sidebar.search": true } });
  assert.deepEqual(open.rec.calls.filter((c) => c.fn === "setShared").map((c) => [c.name, c.args]), [["apollo.sidebar.search", false]]);
});

// ---- QA 7: search typing and Escape through the real main.js handlers ----
test("spaces search: typing filters the rows; Escape clears the query and closes the field", async () => {
  const m = await loadMod(SPACES, { data: data(), size: { width: 256, height: 600 } });
  m.ctx.shared.set("apollo.sidebar.search", true);
  m.render();
  assert.ok(m.ids().includes("search-field"));
  for (const k of ["D", "O", "T"]) m.key("search-field", k);
  assert.ok(m.ids().includes("space-s1"));
  assert.ok(!m.ids().includes("space-s2") && !m.ids().includes("space-devbox/s3"), "filtered to dot-configs");
  m.key("search-field", "backspace");
  m.key("search-field", "backspace");
  m.key("search-field", "backspace");
  assert.ok(m.ids().includes("space-s2"), "backspace widens the filter");
  m.key("search-field", "Z");
  assert.ok(!m.ids().includes("space-s1"));
  m.key("search-field", "escape");
  assert.equal(m.ctx.shared.get("apollo.sidebar.search"), false, "Escape closes the field");
  assert.ok(!m.ids().includes("search-field"));
  for (const id of ["space-s1", "space-s2", "space-devbox/s3"]) assert.ok(m.ids().includes(id), `${id} back after Escape`);
  m.ctx.shared.set("apollo.sidebar.search", true);
  m.render();
  assert.ok(m.ids().includes("space-s2"), "reopened with an empty query");
});

// ---- QA 8: collapsed rows render their names and the active row's accent fill ----
const rowTexts = (m, id) => {
  const out = [];
  const find = (n) => { const el = n?.__el; if (!el) return null; if (el.id === id) return el; for (const c of el.children) { const r = find(c); if (r) return r; } return null; };
  const el = find(m.tree());
  const walk = (n) => { const e = n?.__el; if (!e) { if (typeof n === "string") out.push(n); return; } e.children.forEach(walk); };
  if (el) el.children.forEach(walk);
  return { el, texts: out };
};
for (const width of [184, 256]) {
  test(`spaces at width ${width}: every row shows its exact name; only the active row has the accent fill`, async () => {
    const theme = { accent: "#fabd2f", raised: "#1c1f20" };
    const m = await loadMod(SPACES, { data: { ...data(), theme }, size: { width, height: 600 } });
    for (const s of sidebarSpaces()) {
      const { el, texts } = rowTexts(m, `space-${s.id}`);
      assert.ok(el, `row ${s.id}`);
      assert.ok(texts.includes(s.name), `${s.id} shows "${s.name}", got ${JSON.stringify(texts)}`);
      const bg = el.calls.filter((c) => c.name === "bg").map((c) => c.args[0]);
      if (s.active) assert.deepEqual(bg, ["#fabd2f"], "active row accent");
      else assert.ok(!bg.includes("#fabd2f"), `${s.id} must not have the accent`);
    }
  });
}

test("spaces: a stored sidebar px of 100 rendered at 184 (Herdr's min) still resizes to 184 exactly once", async () => {
  const layout = { id: "root", children: [{ id: "sidebar", type: "column", size: { px: 100 }, min: 184, max: 480 }] };
  const m = await loadMod(SPACES, { data: { ...data(), layout }, size: { width: 184, height: 600 } });
  m.render();
  assert.deepEqual(m.rec.calls.filter((c) => c.fn === "run" && c.name === "layout.resize").map((c) => c.args), [{ id: "sidebar", px: 184 }]);
});

// ---- Designer MUSTs 1-3 through main.js ----
const svgPaths = (el) => { const out = []; const walk = (n) => { const e = n?.__el; if (!e) return; if (e.kind === "svg") out.push({ path: e.args[0], calls: e.calls }); e.children.forEach(walk); }; walk(el); return out; };
const findEl = (m, id) => { let hit = null; const walk = (n) => { const e = n?.__el; if (!e || hit) return; if (e.id === id) { hit = n; return; } e.children.forEach(walk); }; walk(m.tree()); return hit; };

test("spaces: an unborn repo shows its branch (probed); a non-repo folder shows only its name", async () => {
  const { fakeExec } = await import("./helpers/exec.js");
  const G = "git --no-optional-locks";
  const ex = fakeExec({
    [`${G} symbolic-ref --short HEAD`]: (o) => (o.cwd === "/u" ? { code: 0, stdout: "main\n", stderr: "" } : { code: 128, stdout: "", stderr: "" }),
    [`${G} rev-parse --short HEAD`]: { code: 128, stdout: "", stderr: "" },
  });
  const base = sidebarSpaces();
  const spaces = [{ ...base[0], branch: null, folder: "/u" }, { ...base[1], branch: null, folder: "/n" }, base[2]];
  const m = await loadMod(SPACES, { data: { ...data(), spaces, panes: [] }, exec: ex, size: { width: 256, height: 600 } });
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  m.render();
  assert.ok(rowTexts(m, "space-s1").texts.includes("main"), `unborn: ${rowTexts(m, "space-s1").texts}`);
  assert.deepEqual(rowTexts(m, "space-s2").texts, ["herdr-config"], "non-repo: a folder tile and the name only");
  assert.ok(svgPaths(m.tree()).some((x) => x.path === "mods/apollo-spaces/folder.svg"), "the non-repo tile is a folder");
  assert.ok(svgPaths(m.tree()).some((x) => x.path === "mods/apollo-spaces/server.svg"), "the remote space's tile is a server");
  assert.ok(rowTexts(m, "space-devbox/s3").texts.includes("dev"));
});

test("spaces: chevron ⌄ when unfolded, › when folded, none without agents", async () => {
  const m = await loadMod(SPACES, { data: data(), size: { width: 256, height: 600 } });
  const glyphOf = (id) => svgPaths(findEl(m, id)).map((x) => x.path);
  assert.deepEqual(glyphOf("fold-s1"), ["mods/apollo-spaces/chevron-down.svg"]);
  m.click("fold-s1");
  assert.deepEqual(glyphOf("fold-s1"), ["mods/apollo-spaces/chevron.svg"]);
  assert.ok(!m.ids().includes("fold-devbox/s3"), "no agents → no chevron");
});

test("spaces: every status mark is an svg at an explicit 14 px", async () => {
  const m = await loadMod(SPACES, { data: data(), size: { width: 256, height: 600 } });
  const marks = svgPaths(m.tree()).filter((x) => /\/(arc|diamond|check)\.svg$/.test(x.path));
  assert.ok(marks.length >= 5, `marks: ${marks.length}`);
  for (const x of marks) assert.ok(x.calls.some((c) => c.name === "size" && c.args[0] === 14), x.path);
});

// ---- The Apollo logo: the brand row shows only mods/apollo-chrome/logo.png (20 px, radius 5), in both states ----
const images = (m) => {
  const out = [];
  const walk = (n) => { const el = n?.__el; if (!el) return; if (el.kind === "image") out.push(el); el.children.forEach(walk); };
  walk(m.tree());
  return out.map((el) => ({ src: el.args[0], calls: Object.fromEntries(el.calls.map((c) => [c.name, c.args[0]])) }));
};
const texts = (m) => { const out = []; const walk = (n) => { const el = n?.__el; if (!el) { if (typeof n === "string") out.push(n); return; } el.children.forEach(walk); }; walk(m.tree()); return out; };

test("chrome expanded: the brand row shows the Apollo logo at 20 px, radius 5, and no app name", async () => {
  const m = await loadMod(CHROME, { data: data(), size: { width: 300, height: 48 } });
  const imgs = images(m);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].src, "mods/apollo-chrome/logo.png");
  assert.equal(imgs[0].calls.size, 20);
  assert.equal(imgs[0].calls.rounded, 5);
  assert.ok(!texts(m).includes("Apollo"));
  assert.ok(!texts(m).includes("Herdr"));
});

test("chrome collapsed: the same logo, and no app name", async () => {
  const m = await loadMod(CHROME, { data: data(), size: { width: 184, height: 48 } });
  const imgs = images(m);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].src, "mods/apollo-chrome/logo.png");
  assert.equal(imgs[0].calls.size, 20);
  assert.equal(imgs[0].calls.rounded, 5);
  assert.ok(!texts(m).includes("Apollo"));
  assert.ok(!texts(m).includes("Herdr"));
});

test("Windows: chrome footer and the spaces' New space work the same as on macOS", async () => {
  const d = data({ data: { window: { platform: "windows", fullscreen: false, buttons: true } } });
  const footer = await loadMod(CHROME, { data: d, props: { footer: true }, size: { width: 256, height: 48 } });
  assert.deepEqual(footer.ids().filter((id) => ["settings", "add-machine", "account"].includes(id)), ["settings"]);
  const m = await loadMod(SPACES, { data: { ...d, focused: { space: "s1", tab: "b1", pane: "p1", cwd: "C:\\Users\\ann\\api" }, home: "C:\\Users\\ann" }, size: { width: 256, height: 600 } });
  m.click("new-space");
  assert.deepEqual(runs(m), [{ name: "space.new", args: {} }]);
});
