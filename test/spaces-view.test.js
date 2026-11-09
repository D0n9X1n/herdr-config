import { test } from "node:test";
import assert from "node:assert/strict";
import { recorder } from "./helpers/stubs.js";
import { fakeExec } from "./helpers/exec.js";
import { count, findAll } from "./helpers/tree.js";
import { sidebarSpaces, sidebarAgents } from "./fixtures/sidebar.js";
import {
  groupByMachine, filterSpaces, designWidth, SIZE_IS_ZOOMED, isCollapsed, guardWidth, guardTarget, spacesView,
  probeGit, spaceCwd,
} from "../mods/apollo-spaces/lib.js";

const names = (groups) => groups.flatMap((g) => g.spaces.map((s) => s.name));

test("search: \"DOT\" keeps only dot-configs and drops the empty devbox group; \"\" restores every row", () => {
  const groups = groupByMachine(sidebarSpaces());
  const hit = filterSpaces(groups, "DOT");
  assert.deepEqual(names(hit), ["dot-configs"]);
  assert.deepEqual(hit.map((g) => g.machine), [null]);
  assert.deepEqual(names(filterSpaces(groups, "")), ["dot-configs", "herdr-config", "api"]);
  assert.deepEqual(filterSpaces(groups, "").map((g) => g.machine), [null, "devbox"]);
  assert.deepEqual(names(filterSpaces(groups, "zzz")), []);
});

test("designWidth follows SIZE_IS_ZOOMED (P1 left it open, so both readings are tested)", () => {
  assert.equal(typeof SIZE_IS_ZOOMED, "boolean");
  assert.equal(designWidth(300, 1), 300);
  assert.equal(designWidth(450, 1.5, true), 300);
  assert.equal(designWidth(300, 1.5, false), 300);
  assert.equal(designWidth(SIZE_IS_ZOOMED ? 450 : 300, 1.5), 300);
  assert.equal(designWidth(undefined, 1), undefined);
});

test("collapsed means narrower than 220", () => {
  assert.equal(isCollapsed(219), true);
  assert.equal(isCollapsed(184), true);
  assert.equal(isCollapsed(220), false);
  assert.equal(isCollapsed(undefined), false);
});

test("width guard: 120 seen twice resizes to 184 once; in range runs nothing; 900 clamps to 480", () => {
  const r = recorder(), st = {};
  guardWidth(120, st, r);
  guardWidth(120, st, r);
  assert.deepEqual(r.calls, [{ fn: "run", name: "layout.resize", args: { id: "sidebar", px: 184 } }]);
  const quiet = recorder(), st2 = {};
  for (const w of [184, 300, 480, undefined]) guardWidth(w, st2, quiet);
  assert.deepEqual(quiet.calls, []);
  const big = recorder();
  guardWidth(900, {}, big);
  assert.deepEqual(big.calls, [{ fn: "run", name: "layout.resize", args: { id: "sidebar", px: 480 } }]);
});

test("width guard fires again for a new out-of-range value after the width came back", () => {
  const r = recorder(), st = {};
  guardWidth(120, st, r);
  guardWidth(184, st, r);
  guardWidth(120, st, r);
  assert.equal(r.calls.length, 2);
});

const view = (over = {}) => spacesView({ spaces: sidebarSpaces(), agents: sidebarAgents(), collapsed: false,
  folded: {}, machinesFolded: {}, query: "", searchOpen: false, ...over });
const spaceNodes = (v) => findAll(v, (n) => n.kind === "space");
const byKind = (v, k) => findAll(v, (n) => n.kind === k);

test("expanded view: one plus; every space has name and branch; agent rows under their space", () => {
  const v = view();
  assert.equal(count(v, "plus"), 1);
  const spaces = spaceNodes(v);
  assert.equal(spaces.length, 3);
  for (const s of spaces) {
    assert.equal(count(s, "name"), 1, s.attrs.spaceId);
    const branch = findAll(s, (n) => n.kind === "branch");
    assert.equal(branch.length, 1, `every git space has a branch node: ${s.attrs.spaceId}`);
    assert.ok(branch[0].attrs.text.length > 0, "with non-empty text");
    const hasAgents = count(s, "agent") > 0;
    assert.equal(count(s, "chevron"), hasAgents ? 1 : 0, `chevron only with agents: ${s.attrs.spaceId}`);
  }
  const agentsOf = (id) => byKind(spaces.find((s) => s.attrs.spaceId === id), "agent").map((a) => a.attrs.address);
  assert.deepEqual(agentsOf("s1"), ["t1", "t2"]);
  assert.deepEqual(agentsOf("s2"), ["t7"]);
  assert.deepEqual(agentsOf("devbox/s3"), []);
  assert.equal(count(v, "machine"), 2);
  assert.equal(count(v, "machine-count"), 2);
  assert.equal(count(v, "pin"), 1);
});

test("collapsed view: one plus; names kept; no branch, agent, chevron or machine-count; active row accent", () => {
  const v = view({ collapsed: true });
  assert.equal(count(v, "plus"), 1);
  for (const s of spaceNodes(v)) assert.equal(count(s, "name"), 1);
  for (const k of ["branch", "agent", "chevron", "machine-count", "search-field"]) assert.equal(count(v, k), 0, k);
  const rows = byKind(v, "row");
  const active = rows.filter((r) => r.attrs.fill === "accent");
  assert.equal(active.length, 1);
  assert.equal(active[0].attrs.id, "space-s1");
  assert.equal(findAll(active[0], (n) => n.kind === "tile")[0].attrs.ring, 1.5);
  assert.ok(rows.filter((r) => r !== active[0]).every((r) => r.attrs.fill === null));
});

test("active row: text, branch and marks use solid_foreground; tile shows color and monogram", () => {
  const v = view();
  const row = byKind(v, "row").find((r) => r.attrs.active);
  assert.equal(byKind(row, "name")[0].attrs.color, "solid_foreground");
  assert.equal(byKind(row, "branch")[0].attrs.color, "solid_foreground");
  assert.equal(byKind(row, "diamond")[0].attrs.color, "solid_foreground");
  const tile = byKind(row, "tile")[0];
  assert.equal(tile.attrs.text, "DO");
  assert.ok(["ansi4", "ansi5", "ansi6"].includes(tile.attrs.color));
  const other = byKind(v, "row").find((r) => r.attrs.id === "space-s2");
  assert.equal(byKind(other, "name")[0].attrs.color, "foreground");
  assert.equal(byKind(other, "tile")[0].attrs.ring, 0);
});

test("marks: working is a spinning arc, blocked a diamond, done a check, idle nothing", () => {
  const v = view();
  const mark = (id) => findAll(byKind(v, "row").find((r) => r.attrs.id === id), (n) => ["arc", "diamond", "check"].includes(n.kind))[0];
  assert.equal(mark("space-s1").kind, "diamond");
  assert.equal(mark("space-s1").attrs.color, "solid_foreground");
  assert.equal(mark("space-s2").kind, "check");
  assert.equal(mark("space-s2").attrs.color, "done");
  assert.equal(mark("space-devbox/s3").kind, "arc");
  assert.equal(mark("space-devbox/s3").attrs.spin, 900);
  assert.equal(mark("space-devbox/s3").attrs.color, "working");
  const idle = spacesView({ spaces: [{ ...sidebarSpaces()[1], status: "idle" }], agents: [], collapsed: false });
  assert.equal(findAll(idle, (n) => ["arc", "diamond", "check"].includes(n.kind)).length, 0);
});

test("folding a space hides its agents only while expanded; collapsed ignores machine folds", () => {
  const v = view({ folded: { s1: true } });
  assert.deepEqual(byKind(v, "agent").map((a) => a.attrs.address), ["t7"]);
  assert.equal(byKind(v, "chevron").find((c) => c.attrs.id === "fold-s1").attrs.folded, true);
  const m = view({ machinesFolded: { devbox: true } });
  assert.equal(spaceNodes(m).length, 2);
  assert.equal(spaceNodes(view({ collapsed: true, machinesFolded: { devbox: true } })).length, 3);
});

test("search field shows only expanded and open; it filters rows", () => {
  const v = view({ searchOpen: true, query: "DOT" });
  assert.equal(count(v, "search-field"), 1);
  assert.deepEqual(spaceNodes(v).map((s) => s.attrs.spaceId), ["s1"]);
  assert.equal(count(v, "machine"), 0);
  assert.equal(spaceNodes(view({ searchOpen: false, query: "DOT" })).length, 3);
});

test("one machine: no headers", () => {
  const v = spacesView({ spaces: sidebarSpaces().filter((s) => !s.machine), agents: sidebarAgents(), collapsed: false });
  assert.equal(count(v, "machine"), 0);
  assert.equal(spaceNodes(v).length, 2);
});

// ---- QA 6: search and folds ----
test("an active search ignores machine and space folds, so matches always show", () => {
  const v = view({ machinesFolded: { local: true }, folded: { s1: true }, searchOpen: true, query: "DOT" });
  assert.deepEqual(spaceNodes(v).map((s) => s.attrs.spaceId), ["s1"]);
  assert.deepEqual(byKind(v, "agent").map((a) => a.attrs.address), ["t1", "t2"]);
});

test("an open search with an empty query still honours folds", () => {
  const v = view({ machinesFolded: { devbox: true }, folded: { s1: true }, searchOpen: true, query: "" });
  assert.deepEqual(spaceNodes(v).map((s) => s.attrs.spaceId), ["s1", "s2"]);
  assert.deepEqual(byKind(v, "agent").map((a) => a.attrs.address), ["t7"]);
});

test("a machine fold applies only while its header shows: one machine left → its spaces show", () => {
  const onlyDevbox = sidebarSpaces().filter((s) => s.machine === "devbox");
  const v = spacesView({ spaces: onlyDevbox, agents: [], collapsed: false, machinesFolded: { devbox: true } });
  assert.equal(count(v, "machine"), 0);
  assert.deepEqual(spaceNodes(v).map((s) => s.attrs.spaceId), ["devbox/s3"]);
  const onlyLocal = spacesView({ spaces: sidebarSpaces().filter((s) => !s.machine), agents: [], collapsed: false, machinesFolded: { local: true } });
  assert.equal(spaceNodes(onlyLocal).length, 2);
});

test("no group ever renders empty without its header", () => {
  const cases = [
    { machinesFolded: { local: true }, searchOpen: true, query: "DOT" },
    { machinesFolded: { local: true, devbox: true } },
    { machinesFolded: { devbox: true }, searchOpen: true, query: "api" },
  ];
  for (const c of cases) {
    const v = view(c);
    for (const g of byKind(v, "group")) assert.ok(g.children.length > 0, JSON.stringify(c));
    for (const g of byKind(v, "group")) {
      if (count(g, "space") === 0) assert.equal(count(g, "machine"), 1, `empty group without header: ${JSON.stringify(c)}`);
    }
  }
});

// ---- QA 9: the guard clamps the raw width ----
test("width guard clamps the raw value: 183.6 → 184, 480.4 → 480, 184.0 and 480.0 run nothing", () => {
  const r = recorder();
  guardWidth(183.6, {}, r);
  guardWidth(480.4, {}, r);
  assert.deepEqual(r.calls.map((c) => c.args), [{ id: "sidebar", px: 184 }, { id: "sidebar", px: 480 }]);
  const q = recorder();
  guardWidth(184, {}, q);
  guardWidth(480, {}, q);
  assert.deepEqual(q.calls, []);
});

test("re-QA: two folded machines, each with a match: the search shows both", () => {
  const sp = sidebarSpaces().map((s) => (s.id === "devbox/s3" ? { ...s, name: "config-api" } : s));
  const v = spacesView({ spaces: sp, agents: [], collapsed: false, machinesFolded: { local: true, devbox: true },
    searchOpen: true, query: "config" });
  assert.equal(count(v, "machine"), 2, "both headers show");
  assert.deepEqual(spaceNodes(v).map((s) => s.attrs.spaceId), ["s1", "s2", "devbox/s3"]);
});

// ---- Guard on the stored width (live diagnostic: layout.resize 100 stores 100 but Herdr renders the
// layout min 184, so the observed width alone never trips the guard) ----
const layoutWith = (px) => ({ id: "root", children: [{ id: "sidebar", type: "column", size: { px }, min: 184, max: 480 }] });
test("guardTarget: an out-of-range stored px wins over an in-range observed width", () => {
  assert.equal(guardTarget(184, layoutWith(100)), 100);
  assert.equal(guardTarget(480, layoutWith(900)), 900);
  assert.equal(guardTarget(300, layoutWith(300)), 300);
  assert.equal(guardTarget(120, layoutWith(256)), 120, "an out-of-range observed width still counts");
  assert.equal(guardTarget(256, null), 256);
  assert.equal(guardTarget(undefined, layoutWith(100)), 100);
  const r = recorder(), st = {};
  guardWidth(guardTarget(184, layoutWith(100)), st, r);
  guardWidth(guardTarget(184, layoutWith(100)), st, r);
  assert.deepEqual(r.calls.map((c) => c.args), [{ id: "sidebar", px: 184 }]);
});

// ---- Designer MUST 1: branch line for git spaces only ----
test("branch: API branch shown; unborn repo shows the probed branch; a non-repo folder shows the name alone", () => {
  const sp = [
    { ...sidebarSpaces()[0], id: "g", name: "repo", branch: "feat/x" },
    { ...sidebarSpaces()[1], id: "u", name: "unborn", branch: null },
    { ...sidebarSpaces()[1], id: "n", name: "plain", branch: null, active: false },
  ];
  const v = spacesView({ spaces: sp, agents: [], collapsed: false, git: { u: { repo: true, branch: "main" }, n: { repo: false, branch: null } } });
  const br = (id) => findAll(spaceNodes(v).find((x) => x.attrs.spaceId === id), (n) => n.kind === "branch").map((n) => n.attrs.text);
  assert.deepEqual(br("g"), ["feat/x"]);
  assert.deepEqual(br("u"), ["main"]);
  assert.deepEqual(br("n"), []);
  const pending = spacesView({ spaces: sp, agents: [], collapsed: false });
  assert.deepEqual(findAll(spaceNodes(pending).find((x) => x.attrs.spaceId === "u"), (n) => n.kind === "branch"), [], "unknown yet: no empty branch line");
});

test("probeGit: symbolic-ref (unborn too), else a short sha (detached), else not a repo", async () => {
  const G = "git --no-optional-locks";
  const ex = fakeExec({
    [`${G} symbolic-ref --short HEAD`]: (o) => (o.cwd === "/n" || o.cwd === "/d" ? { code: 128, stdout: "", stderr: "x" } : { code: 0, stdout: "main\n", stderr: "" }),
    [`${G} rev-parse --short HEAD`]: (o) => (o.cwd === "/d" ? { code: 0, stdout: "abc1234\n", stderr: "" } : { code: 128, stdout: "", stderr: "x" }),
  });
  assert.deepEqual(await probeGit("/u", null, ex), { repo: true, branch: "main" });
  assert.deepEqual(await probeGit("/d", null, ex), { repo: true, branch: "abc1234" });
  assert.deepEqual(await probeGit("/n", "devbox", ex), { repo: false, branch: null });
  assert.deepEqual(ex.calls.filter((c) => c.opts.cwd === "/n").map((c) => c.opts.on), ["devbox", "devbox"]);
  assert.deepEqual(await probeGit(null, null, ex), { repo: false, branch: null });
});

test("spaceCwd: the space's first pane folder, else the space folder", () => {
  const s = { id: "s", folder: "/f", tabs: [{ id: "t1" }, { id: "t2" }] };
  assert.equal(spaceCwd(s, [{ tab: "x", cwd: "/no" }, { tab: "t2", cwd: "/p" }]), "/p");
  assert.equal(spaceCwd(s, []), "/f");
  assert.equal(spaceCwd({ ...s, folder: "" }, []), null);
});

// ---- Designer MUST 2: chevrons ----
test("chevrons: only on spaces with agents; folded state carried for the glyph", () => {
  const v = view({ folded: { s1: true } });
  const ch = (id) => findAll(v, (n) => n.kind === "chevron" && n.attrs.id === `fold-${id}`);
  assert.equal(ch("s1")[0].attrs.folded, true);
  assert.equal(ch("s2")[0].attrs.folded, false);
  assert.deepEqual(ch("devbox/s3"), [], "no agents → no chevron");
});
