import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod } from "./helpers/host.js";
import { flush } from "./helpers/fakes.js";
import { fakeExec } from "./helpers/exec.js";
import { tabSpace, tabPanes } from "./fixtures/tabs.js";

const runs = (m) => m.rec.calls.filter((c) => c.fn === "run").map(({ name, args }) => ({ name, args }));
const overlays = (m) => m.rec.calls.filter((c) => c.fn === "openOverlay").map((c) => c.args);
const settle = async (m) => { for (let i = 0; i < 5; i++) await flush(); m.render(); };
const agent = (key, name, installed) => ({ key, name, icon: `icons/${key}.svg`, tint: true, agent: true, shell: false, run: [key], installed });
const tabsData = (over = {}) => ({ spaces: [tabSpace(3)], panes: tabPanes(), focused: { space: "s1", tab: "b1", pane: "p1", cwd: "/r" },
  knownAgents: [agent("codex", "Codex", false), agent("claude", "Claude Code", true)], ...over });
const panelTree = (panel) => ({ id: "root", children: [{ id: "panel", type: "stack", ...panel }] });

test("tabs: select, close on the active pill, wheel", async () => {
  const m = await loadMod("mods/apollo-tabs", { data: tabsData() });
  m.click("tab-b2");
  assert.ok(m.ids().includes("close-b1"));
  assert.ok(!m.ids().includes("close-b2"), "only the active pill has a close button");
  m.click("close-b1");
  m.wheel("tabs", 1);
  m.wheel("tabs", -1);
  assert.deepEqual(runs(m), [
    { name: "tab.select", args: { id: "b2" } }, { name: "tab.close", args: { id: "b1" } },
    { name: "tab.next", args: undefined }, { name: "tab.prev", args: undefined },
  ]);
});

test("tabs: + button and the `menu` command open the + popup; `last` selects the last tab", async () => {
  const m = await loadMod("mods/apollo-tabs", { data: tabsData({ spaces: [tabSpace(10)] }) });
  m.click("plus");
  m.command("menu");
  await settle(m);
  // Not measured yet: no anchor, so Herdr's default (the pointer) applies.
  const want = { mod: "apollo-tabs", kind: "popup", width: 220, props: { menu: "plus", space: "s1" } };
  assert.deepEqual(overlays(m), [want, want]);
  m.command("last");
  await settle(m);
  assert.deepEqual(runs(m), [{ name: "tab.select", args: { id: "b10" } }]);
});

test("+ popup: hides uninstalled agents; every pick runs its command and closes the popup", async () => {
  const props = { menu: "plus", space: "s1", overlay: "o7" };
  const m = await loadMod("mods/apollo-tabs", { data: tabsData(), props });
  await settle(m);
  assert.ok(m.ids().includes("agent-claude"));
  assert.ok(!m.ids().includes("agent-codex"));
  assert.ok(!JSON.stringify(m.ids()).includes("Codex"));
  assert.deepEqual(m.rec.calls.filter((c) => c.fn === "knownAgents").map((c) => c.args), [{ on: null }]);
  for (const id of ["terminal", "agent-claude", "new-space", "new-worktree", "open-worktree"]) m.click(id);
  assert.deepEqual(runs(m), [
    { name: "tab.new", args: { space: "s1", name: "w" } }, { name: "tab.new", args: { space: "s1", name: "Claude Code", argv: ["claude"] } },
    { name: "space.new", args: { tab: "r" } },
  ]);
  assert.deepEqual(overlays(m), [
    { mod: "worktree", kind: "dialog", props: { space: "s1", action: "new" } },
    { mod: "worktree", kind: "dialog", props: { space: "s1", action: "open" } },
  ]);
  assert.equal(m.rec.calls.filter((c) => c.fn === "closeOverlay" && c.name === "o7").length, 5);
});

test("panel buttons read persisted state on every click: layout() showing files", async () => {
  const m = await loadMod("mods/apollo-tabs", { data: tabsData({ layout: panelTree({ active: "files" }) }) });
  m.click("panel-files");
  await settle(m);
  m.click("panel-specs");
  await settle(m);
  assert.deepEqual(runs(m), [{ name: "layout.hide", args: { id: "panel" } }, { name: "layout.select", args: { stack: "panel", child: "specs" } }]);
});

test("panel buttons fall back to .state when layout() lacks the node", async () => {
  const path = "/home/test/.config/herdr-app/layouts/.state/apollo.json";
  const m = await loadMod("mods/apollo-tabs", { data: tabsData({ layout: null }),
    files: { [path]: JSON.stringify({ nodes: { panel: { hidden: false, active: "files" } } }) } });
  m.click("panel-files");
  await settle(m);
  m.click("panel-changes");
  await settle(m);
  assert.deepEqual(runs(m), [{ name: "layout.hide", args: { id: "panel" } }, { name: "layout.select", args: { stack: "panel", child: "changes" } }]);
  assert.equal(m.rec.calls.filter((c) => c.fn === "readTextFile" && c.name === path).length, 2);
});

test("pane header: after hover, every button targets its own pane, not the focused one", async () => {
  const panes = tabPanes().map((p) => ({ ...p, focused: p.pane === "p1" }));
  const m = await loadMod("mods/apollo-pane", { data: { panes, focused: { pane: "p1" } }, props: { pane: "p2" } });
  assert.ok(!m.ids().includes("split-right"), "buttons hidden until hover");
  m.hover("header");
  for (const id of ["split-right", "split-down", "zoom", "close"]) m.click(id);
  assert.deepEqual(runs(m), [
    { name: "pane.split", args: { pane: "p2", direction: "right" } }, { name: "pane.split", args: { pane: "p2", direction: "down" } },
    { name: "pane.zoom", args: { pane: "p2" } }, { name: "pane.close", args: { pane: "p2" } },
  ]);
  m.hover("header", false);
  assert.ok(!m.ids().includes("zoom"));
});

const specsExec = () => fakeExec({
  "git --no-optional-locks rev-parse --show-toplevel": { code: 0, stdout: "/r\n", stderr: "" },
  "find docs/specs -type f -name *.md": { code: 0, stdout: "docs/specs/pending/x.md\n", stderr: "" },
});

test("specs: a second Work on it sees the first tab (live tabs, not the followed snapshot)", async () => {
  const d = tabsData();
  const m = await loadMod("mods/apollo-specs", { data: d, exec: specsExec(), files: { "/r/docs/specs/pending/x.md": "# X spec\n" } });
  await settle(m);
  m.click("work-on-it");
  // Herdr adds the tab; the space and folder stay, so the mod does not re-follow.
  d.spaces = [{ ...d.spaces[0], tabs: [...d.spaces[0].tabs, { id: "b9", name: "Claude Code", named: true }] }];
  m.click("work-on-it");
  assert.deepEqual(runs(m).filter((r) => r.name === "tab.new").map((r) => r.args.name), ["Claude Code", "Claude Code 2"]);
});

test("specs: a row opens the viewer pane; Work on it starts the agent", async () => {
  const m = await loadMod("mods/apollo-specs", { data: tabsData(), exec: specsExec(), files: { "/r/docs/specs/pending/x.md": "# X spec\n" } });
  await settle(m);
  m.click("spec-pending/x.md");
  await settle(m);
  m.click("work-on-it");
  assert.deepEqual(runs(m), [
    { name: "pane.split", args: { direction: "right", mod: "apollo-specs", props: { file: "/r/docs/specs/pending/x.md", on: null } } },
    { name: "tab.new", args: { space: "s1", name: "Claude Code", folder: "/r", argv: ["claude"], task: "Work on the spec docs/specs/pending/x.md. Read it first." } },
  ]);
});

test("specs viewer: reads exactly props.file with props.on and renders its markdown", async () => {
  const file = "/r/docs/specs/pending/x.md";
  const m = await loadMod("mods/apollo-specs", { data: tabsData(), props: { file, on: "devbox" }, files: { [file]: "---\npriority: high\n---\n# X spec\nBody\n" } });
  await settle(m);
  assert.deepEqual(m.rec.calls.filter((c) => c.fn === "readTextFile").map((c) => [c.name, c.args]), [[file, { on: "devbox" }]]);
  const md = [];
  const walk = (n) => { const el = n?.__el; if (!el) return; if (el.kind === "TextView.markdown") md.push(el.args[1]); el.children.forEach(walk); };
  walk(m.tree());
  assert.deepEqual(md, ["# X spec\nBody\n"]);
});

test("changes: clicking a file runs git diff HEAD for it with {cwd, on}", async () => {
  const ex = fakeExec({
    "git --no-optional-locks rev-parse --show-toplevel": { code: 0, stdout: "/r\n", stderr: "" },
    "git --no-optional-locks rev-parse --verify -q HEAD": { code: 0, stdout: "abc\n", stderr: "" },
    "git --no-optional-locks status --porcelain=v1 -z --untracked-files=all": { code: 0, stdout: " M a.txt\0", stderr: "" },
    "git --no-optional-locks diff --numstat -z HEAD": { code: 0, stdout: "1\t1\ta.txt\0", stderr: "" },
    "git --no-optional-locks diff HEAD -- a.txt": { code: 0, stdout: "@@ -1 +1 @@\n-a\n+b\n", stderr: "" },
  });
  const m = await loadMod("mods/apollo-changes", { data: tabsData(), exec: ex });
  await settle(m);
  m.click("file-a.txt");
  await settle(m);
  const diffs = m.rec.calls.filter((c) => c.fn === "exec" && c.args.args[1] === "diff" && c.args.args[2] === "HEAD" && c.args.args[3] === "--");
  assert.deepEqual(diffs.map((c) => [c.name, c.args]), [["git", { args: ["--no-optional-locks", "diff", "HEAD", "--", "a.txt"], opts: { cwd: "/r", on: null } }]]);
  assert.ok(m.ids().includes("diff-row-1"));
});

test("status: renders the model and no element has a handler", async () => {
  const m = await loadMod("mods/apollo-status", { data: { spaces: [tabSpace(1)], agents: [{ address: "t1", status: "blocked" }] } });
  const texts = [], handlers = [];
  const walk = (n) => {
    const el = n?.__el;
    if (!el) { if (typeof n === "string") texts.push(n); return; }
    if (Object.keys(el.handlers).length) handlers.push(el.id ?? el.kind);
    el.children.forEach(walk);
  };
  walk(m.tree());
  assert.deepEqual(handlers, []);
  for (const t of ["This computer", "main", "1 agent", "1 blocked", "⌘⇧P commands"]) assert.ok(texts.includes(t), t);
});

// Deviation 10: Changes and Specs follow a space switch right away (no poll), disposing the old loop.
function twoSpaces() {
  const a = { ...tabSpace(1, { id: "s1" }), folder: "/r1", active: true };
  const b = { ...tabSpace(1, { id: "s2" }), folder: "/r2", active: false };
  return { spaces: [a, b], panes: [], focused: { space: "s1", tab: "b1", pane: "p1", cwd: "/r1" },
    knownAgents: [agent("claude", "Claude Code", true)] };
}
function switchTo(data, id, cwd) {
  data.spaces = data.spaces.map((s) => ({ ...s, active: s.id === id }));
  data.focused = { space: id, tab: "b1", pane: "p1", cwd };
}
const execAt = (m, sub, cwd) => m.rec.calls.filter((c) => c.fn === "exec" && c.args.args.filter((x) => x !== "--no-optional-locks")[0] === sub && c.args.opts?.cwd === cwd).length;

test("changes follows a space switch at once: reload for the new repo, old watch and timer disposed", async () => {
  const repoOf = (cwd) => (String(cwd).startsWith("/r2") ? "/r2" : "/r1");
  const ex = fakeExec({
    "git --no-optional-locks rev-parse --show-toplevel": (o) => ({ code: 0, stdout: `${repoOf(o.cwd)}\n`, stderr: "" }),
    "git --no-optional-locks rev-parse --verify -q HEAD": { code: 0, stdout: "h\n", stderr: "" },
    "git --no-optional-locks status --porcelain=v1 -z --untracked-files=all": (o) => ({ code: 0, stdout: o.cwd === "/r2" ? " M two.txt\0" : " M one.txt\0", stderr: "" }),
    "git --no-optional-locks diff --numstat -z HEAD": { code: 0, stdout: "", stderr: "" },
  });
  const data = twoSpaces();
  const m = await loadMod("mods/apollo-changes", { data, exec: ex });
  await settle(m);
  assert.ok(m.ids().includes("file-one.txt"));
  assert.equal(m.ctx.timer.count, 1);
  switchTo(data, "s2", "/r2");
  m.render();
  await settle(m);
  assert.ok(m.ids().includes("file-two.txt"), "new repo loaded without a poll tick");
  assert.ok(!m.ids().includes("file-one.txt"));
  assert.equal(m.ctx.timer.count, 1, "old timer cancelled");
  assert.deepEqual(m.ctx.watch.watched, ["/r1", "/r2"]);
  const before = execAt(m, "status", "/r1");
  m.ctx.watch.fire(["/r1/one.txt"]);
  await settle(m);
  assert.equal(execAt(m, "status", "/r1"), before, "old watcher disposed");
  assert.ok(execAt(m, "status", "/r2") >= 2, "new watcher live");
});

test("specs follows a space switch at once: reload for the new repo, old watch and timer disposed", async () => {
  const repoOf = (cwd) => (String(cwd).startsWith("/r2") ? "/r2" : "/r1");
  const ex = fakeExec({
    "git --no-optional-locks rev-parse --show-toplevel": (o) => ({ code: 0, stdout: `${repoOf(o.cwd)}\n`, stderr: "" }),
    "find docs/specs -type f -name *.md": (o) => ({ code: 0, stdout: o.cwd === "/r2" ? "docs/specs/pending/two.md\n" : "docs/specs/pending/one.md\n", stderr: "" }),
  });
  const files = { "/r1/docs/specs/pending/one.md": "# One\n", "/r2/docs/specs/pending/two.md": "# Two\n" };
  const data = twoSpaces();
  const m = await loadMod("mods/apollo-specs", { data, exec: ex, files });
  await settle(m);
  assert.ok(m.ids().includes("spec-pending/one.md"));
  assert.equal(m.ctx.timer.count, 1);
  switchTo(data, "s2", "/r2");
  m.render();
  await settle(m);
  assert.ok(m.ids().includes("spec-pending/two.md"), "new repo loaded without a poll tick");
  assert.ok(!m.ids().includes("spec-pending/one.md"));
  assert.equal(m.ctx.timer.count, 1, "old timer cancelled");
  assert.deepEqual(m.ctx.watch.watched, ["/r1", "/r2"]);
  const before = execAt(m, "find", "/r1");
  m.ctx.watch.fire(["/r1/docs/specs/pending/one.md"]);
  await settle(m);
  assert.equal(execAt(m, "find", "/r1"), before, "old watcher disposed");
});

test("same space, cd within the same repo: no restart", async () => {
  const ex = fakeExec({
    "git --no-optional-locks rev-parse --show-toplevel": { code: 0, stdout: "/r1\n", stderr: "" },
    "git --no-optional-locks rev-parse --verify -q HEAD": { code: 0, stdout: "h\n", stderr: "" },
    "git --no-optional-locks status --porcelain=v1 -z --untracked-files=all": { code: 0, stdout: " M one.txt\0", stderr: "" },
    "git --no-optional-locks diff --numstat -z HEAD": { code: 0, stdout: "", stderr: "" },
  });
  const data = twoSpaces();
  const m = await loadMod("mods/apollo-changes", { data, exec: ex });
  await settle(m);
  data.focused = { ...data.focused, cwd: "/r1/src" };
  m.render();
  await settle(m);
  assert.deepEqual(m.ctx.watch.watched, ["/r1"]);
  assert.equal(execAt(m, "status", "/r1"), 1);
});

// ---- QA (Changes): stale diffs, refresh keeps the diff current, exact row colors, git flag ----
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const texts = (m) => { const out = []; const walk = (n) => { const el = n?.__el; if (!el) { if (typeof n === "string") out.push(n); return; } el.children.forEach(walk); }; walk(m.tree()); return out; };
const els = (m) => { const out = new Map(); const walk = (n) => { const el = n?.__el; if (!el) return; if (el.id !== undefined) out.set(el.id, el); el.children.forEach(walk); }; walk(m.tree()); return out; };
const bgOf = (el) => el?.calls.find((c) => c.name === "bg")?.args[0] ?? null;
const G = "git --no-optional-locks";
const changesBase = (status, extra = {}) => ({
  [`${G} rev-parse --show-toplevel`]: { code: 0, stdout: "/r\n", stderr: "" },
  [`${G} rev-parse --verify -q HEAD`]: { code: 0, stdout: "h\n", stderr: "" },
  [`${G} status --porcelain=v1 -z --untracked-files=all`]: typeof status === "function" ? status : { code: 0, stdout: status, stderr: "" },
  [`${G} diff --numstat -z HEAD`]: { code: 0, stdout: "", stderr: "" },
  ...extra,
});
const diffOut = (word) => ({ code: 0, stdout: `@@ -1 +1 @@\n-old\n+${word}\n`, stderr: "" });

test("changes: a slower earlier diff never replaces a newer one (click A, click B, B resolves first)", async () => {
  const dA = deferred(), dB = deferred();
  const ex = fakeExec(changesBase(" M a.txt\0 M b.txt\0", {
    [`${G} diff HEAD -- a.txt`]: () => dA.promise, [`${G} diff HEAD -- b.txt`]: () => dB.promise,
  }));
  const m = await loadMod("mods/apollo-changes", { data: tabsData(), exec: ex });
  await settle(m);
  m.click("file-a.txt");
  m.click("file-b.txt");
  dB.resolve(diffOut("fromB"));
  await settle(m);
  dA.resolve(diffOut("fromA"));
  await settle(m);
  assert.ok(texts(m).includes("fromB"), "B's diff shows");
  assert.ok(!texts(m).includes("fromA"), "A's late diff is dropped");
});

test("changes: a diff pending across a space switch is dropped", async () => {
  const dA = deferred();
  const repoOf = (cwd) => (String(cwd).startsWith("/r2") ? "/r2" : "/r1");
  const ex = fakeExec({
    [`${G} rev-parse --show-toplevel`]: (o) => ({ code: 0, stdout: `${repoOf(o.cwd)}\n`, stderr: "" }),
    [`${G} rev-parse --verify -q HEAD`]: { code: 0, stdout: "h\n", stderr: "" },
    [`${G} status --porcelain=v1 -z --untracked-files=all`]: (o) => ({ code: 0, stdout: o.cwd === "/r2" ? " M two.txt\0" : " M one.txt\0", stderr: "" }),
    [`${G} diff --numstat -z HEAD`]: { code: 0, stdout: "", stderr: "" },
    [`${G} diff HEAD -- one.txt`]: () => dA.promise,
  });
  const data = twoSpaces();
  const m = await loadMod("mods/apollo-changes", { data, exec: ex });
  await settle(m);
  m.click("file-one.txt");
  switchTo(data, "s2", "/r2");
  m.render();
  await settle(m);
  dA.resolve(diffOut("fromOne"));
  await settle(m);
  assert.ok(!texts(m).includes("fromOne"), "the old space's diff is dropped");
  assert.ok(![...els(m).keys()].some((id) => String(id).startsWith("diff-row-")), "no diff rows for the new space yet");
  assert.ok(m.ids().includes("file-two.txt"));
});

test("changes: each watch or poll reload refreshes the selected file's diff, and clears it when the file is gone", async () => {
  let content = "v1", status = " M a.txt\0";
  const ex = fakeExec(changesBase(() => ({ code: 0, stdout: status, stderr: "" }), {
    [`${G} diff HEAD -- a.txt`]: () => diffOut(content),
  }));
  const m = await loadMod("mods/apollo-changes", { data: tabsData(), exec: ex });
  await settle(m);
  m.click("file-a.txt");
  await settle(m);
  assert.ok(texts(m).includes("v1"));
  content = "v2";
  m.ctx.watch.fire(["/r/a.txt"]);
  await settle(m);
  assert.ok(texts(m).includes("v2"), "watch event reloads the selected diff");
  assert.ok(!texts(m).includes("v1"));
  content = "v3";
  m.ctx.timer.tick();
  await settle(m);
  assert.ok(texts(m).includes("v3"), "poll tick reloads the selected diff");
  status = "";
  m.ctx.watch.fire(["/r/a.txt"]);
  await settle(m);
  assert.ok(!m.ids().includes("file-a.txt"));
  assert.ok(![...els(m).keys()].some((id) => String(id).startsWith("diff-row-")), "selection cleared with the file");
});

test("changes: diff rows render with the exact backgrounds (#3d3f1b added, #4e231e removed, raised hunk, none for context)", async () => {
  const ex = fakeExec(changesBase(" M a.txt\0", {
    [`${G} diff HEAD -- a.txt`]: { code: 0, stdout: "@@ -1,2 +1,2 @@\n ctx\n-gone\n+new\n", stderr: "" },
  }));
  const m = await loadMod("mods/apollo-changes", { data: { ...tabsData(), theme: { raised: "#1c1f20" } }, exec: ex });
  await settle(m);
  m.click("file-a.txt");
  await settle(m);
  const e = els(m);
  assert.deepEqual([1, 2, 3, 4].map((i) => bgOf(e.get(`diff-row-${i}`))), ["#1c1f20", null, "#4e231e", "#3d3f1b"]);
});

test("every git exec from the Changes and Specs mods carries --no-optional-locks", async () => {
  const ex = fakeExec(changesBase(" M a.txt\0", {
    [`${G} diff HEAD -- a.txt`]: diffOut("x"),
    "find docs/specs -type f -name *.md": { code: 0, stdout: "docs/specs/pending/x.md\n", stderr: "" },
  }));
  const c = await loadMod("mods/apollo-changes", { data: tabsData(), exec: ex });
  await settle(c);
  c.click("file-a.txt");
  await settle(c);
  const s = await loadMod("mods/apollo-specs", { data: tabsData(), exec: ex, files: { "/r/docs/specs/pending/x.md": "# X\n" } });
  await settle(s);
  const git = [...c.rec.calls, ...s.rec.calls].filter((x) => x.fn === "exec" && x.name === "git");
  assert.ok(git.length >= 5, `saw ${git.length} git calls`);
  for (const x of git) assert.equal(x.args.args[0], "--no-optional-locks", x.args.args.join(" "));
});

// ---- QA 11: the + popup renders in the exact order ----
test("+ popup renders exactly: Terminal ⌘T, Start an agent, the installed agents, New space ⌘N, New worktree…, Open worktree…", async () => {
  const m = await loadMod("mods/apollo-tabs", { data: tabsData({ knownAgents: [
    agent("codex", "Codex", false), agent("claude", "Claude Code", true), agent("pi", "Pi Agent", true)] }),
    props: { menu: "plus", space: "s1", overlay: "o1" } });
  await settle(m);
  assert.deepEqual(texts(m), ["Terminal", "⌘T", "Start an agent", "Claude Code", "Pi Agent", "New space", "⌘N", "New worktree…", "Open worktree…"]);
  const order = [...els(m).keys()].filter((id) => ["terminal", "agent-claude", "agent-pi", "new-space", "new-worktree", "open-worktree"].includes(id));
  assert.deepEqual(order, ["terminal", "agent-claude", "agent-pi", "new-space", "new-worktree", "open-worktree"]);
});

// ---- QA 12: the Specs poll timer really reloads ----
test("specs: one poll tick reloads the list (the timer callback is wired, not a no-op)", async () => {
  let listing = "docs/specs/pending/x.md\n";
  const ex = fakeExec({
    "git --no-optional-locks rev-parse --show-toplevel": { code: 0, stdout: "/r\n", stderr: "" },
    "find docs/specs -type f -name *.md": () => ({ code: 0, stdout: listing, stderr: "" }),
  });
  const files = { "/r/docs/specs/pending/x.md": "# X\n", "/r/docs/specs/pending/y.md": "# Y\n" };
  const m = await loadMod("mods/apollo-specs", { data: tabsData(), exec: ex, files });
  await settle(m);
  assert.ok(m.ids().includes("spec-pending/x.md"));
  assert.ok(!m.ids().includes("spec-pending/y.md"));
  assert.deepEqual(m.ctx.timer.intervals(), [60000]);
  const finds = () => m.rec.calls.filter((c) => c.fn === "exec" && c.name === "find").length;
  const before = finds();
  listing = "docs/specs/pending/x.md\ndocs/specs/pending/y.md\n";
  m.ctx.timer.tick();
  await settle(m);
  assert.equal(finds(), before + 1, "the tick ran find again");
  assert.ok(m.ids().includes("spec-pending/y.md"), "the new spec shows after one tick");
});

// ---- re-QA: refresh generations, repeated diff requests ----
test("changes: a stale refresh from before an A → B → A switch is dropped (selection and diff stay)", async () => {
  const held = deferred();
  let r1Calls = 0;
  const repoOf = (cwd) => (String(cwd).startsWith("/r2") ? "/r2" : "/r1");
  const ex = fakeExec({
    [`${G} rev-parse --show-toplevel`]: (o) => ({ code: 0, stdout: `${repoOf(o.cwd)}\n`, stderr: "" }),
    [`${G} rev-parse --verify -q HEAD`]: { code: 0, stdout: "h\n", stderr: "" },
    [`${G} status --porcelain=v1 -z --untracked-files=all`]: (o) => {
      if (o.cwd === "/r2") return { code: 0, stdout: " M two.txt\0", stderr: "" };
      r1Calls += 1;
      return r1Calls === 1 ? held.promise : { code: 0, stdout: " M one.txt\0", stderr: "" };
    },
    [`${G} diff --numstat -z HEAD`]: { code: 0, stdout: "", stderr: "" },
    [`${G} diff HEAD -- one.txt`]: diffOut("v1"),
  });
  const data = twoSpaces();
  const m = await loadMod("mods/apollo-changes", { data, exec: ex });
  await settle(m);
  switchTo(data, "s2", "/r2"); m.render(); await settle(m);
  switchTo(data, "s1", "/r1"); m.render(); await settle(m);
  assert.ok(m.ids().includes("file-one.txt"), "the new A refresh finished");
  m.click("file-one.txt");
  await settle(m);
  assert.ok(texts(m).includes("v1"));
  held.resolve({ code: 0, stdout: "", stderr: "" }); // the first A refresh: no changes
  await settle(m);
  assert.ok(m.ids().includes("file-one.txt"), "the stale empty refresh did not clear the list");
  assert.ok(texts(m).includes("v1"), "the selection and its diff stay");
});

test("specs: a stale list from before an A → B → A switch is dropped", async () => {
  const held = deferred();
  let r1Calls = 0;
  const repoOf = (cwd) => (String(cwd).startsWith("/r2") ? "/r2" : "/r1");
  const ex = fakeExec({
    [`${G} rev-parse --show-toplevel`]: (o) => ({ code: 0, stdout: `${repoOf(o.cwd)}\n`, stderr: "" }),
    "find docs/specs -type f -name *.md": (o) => {
      if (o.cwd === "/r2") return { code: 0, stdout: "docs/specs/pending/two.md\n", stderr: "" };
      r1Calls += 1;
      return r1Calls === 1 ? held.promise : { code: 0, stdout: "docs/specs/pending/one.md\n", stderr: "" };
    },
  });
  const files = { "/r1/docs/specs/pending/one.md": "# One\n", "/r2/docs/specs/pending/two.md": "# Two\n" };
  const data = twoSpaces();
  const m = await loadMod("mods/apollo-specs", { data, exec: ex, files });
  await settle(m);
  switchTo(data, "s2", "/r2"); m.render(); await settle(m);
  switchTo(data, "s1", "/r1"); m.render(); await settle(m);
  assert.ok(m.ids().includes("spec-pending/one.md"));
  held.resolve({ code: 0, stdout: "", stderr: "" });
  await settle(m);
  assert.ok(m.ids().includes("spec-pending/one.md"), "the stale empty list was dropped");
});

test("changes: the same file requested twice, newer resolving first: the newer diff wins", async () => {
  const q = [deferred(), deferred()];
  let n = 0;
  const ex = fakeExec(changesBase(" M a.txt\0", { [`${G} diff HEAD -- a.txt`]: () => q[n++].promise }));
  const m = await loadMod("mods/apollo-changes", { data: tabsData(), exec: ex });
  await settle(m);
  m.click("file-a.txt");
  m.click("file-a.txt");
  q[1].resolve(diffOut("newer"));
  await settle(m);
  q[0].resolve(diffOut("older"));
  await settle(m);
  assert.ok(texts(m).includes("newer"));
  assert.ok(!texts(m).includes("older"), "the older request is dropped");
});

test("changes: the `next` command (apollo-changes.next) selects the next file and shows its diff, wrapping", async () => {
  const ex = fakeExec(changesBase(" M a.txt\0 M b.txt\0", {
    [`${G} diff HEAD -- a.txt`]: diffOut("diffA"), [`${G} diff HEAD -- b.txt`]: diffOut("diffB"),
  }));
  const m = await loadMod("mods/apollo-changes", { data: tabsData(), exec: ex });
  await settle(m);
  assert.ok(!texts(m).includes("diffA"));
  m.command("next");
  await settle(m);
  assert.ok(texts(m).includes("diffA"), "first file selected");
  m.command("next");
  await settle(m);
  assert.ok(texts(m).includes("diffB") && !texts(m).includes("diffA"), "next file");
  m.command("next");
  await settle(m);
  assert.ok(texts(m).includes("diffA"), "wraps to the first");
});

// ---- Defect 1: mods read props() (Herdr may pass nothing, or {}, to init) ----
for (const ip of [undefined, {}]) {
  const tag = ip === undefined ? "init(undefined)" : "init({})";
  test(`chrome footer from props() alone (${tag}): Settings and the account render`, async () => {
    const m = await loadMod("mods/apollo-chrome", { data: { settings: { zoom: 1 }, home: "/home/ann", agents: [] }, props: { footer: true }, initProps: ip, size: { width: 256, height: 96 } });
    for (const id of ["settings", "account"]) assert.ok(m.ids().includes(id), id);
    assert.ok(!m.ids().includes("add-machine"));
    assert.ok(!m.ids().includes("panel-close"), "not the brand");
  });
  test(`pane header from props() alone (${tag}) targets its own pane`, async () => {
    const m = await loadMod("mods/apollo-pane", { data: { panes: tabPanes() }, props: { pane: "p2" }, initProps: ip });
    m.hover("header");
    m.click("split-right");
    assert.deepEqual(runs(m), [{ name: "pane.split", args: { pane: "p2", direction: "right" } }]);
  });
  test(`tabs + popup from props() alone (${tag})`, async () => {
    const m = await loadMod("mods/apollo-tabs", { data: tabsData(), props: { menu: "plus", space: "s1", overlay: "o1" }, initProps: ip });
    await settle(m);
    assert.ok(m.ids().includes("terminal") && m.ids().includes("agent-claude"));
  });
  test(`specs viewer from props() alone (${tag})`, async () => {
    const file = "/r/docs/specs/pending/x.md";
    const m = await loadMod("mods/apollo-specs", { data: tabsData(), props: { file, on: null }, initProps: ip, files: { [file]: "# X\n" } });
    await settle(m);
    assert.deepEqual(m.rec.calls.filter((c) => c.fn === "readTextFile").map((c) => c.name), [file]);
  });
  test(`spaces machine popup from props() alone (${tag})`, async () => {
    const m = await loadMod("mods/apollo-spaces", { data: tabsData(), props: { menu: "machine", machine: "devbox", overlay: "o1" }, initProps: ip });
    m.click("new-space-here");
    assert.deepEqual(runs(m), [{ name: "space.new", args: { machine: "devbox", tab: "devbox" } }]);
  });
}

// ---- Defect 3: the diff area gets space; the file list is capped ----
test("changes: with a file selected, diff rows render in a growing container below a capped file list", async () => {
  const ex = fakeExec(changesBase(" M a.txt\0 M b.txt\0 M c.txt\0", { [`${G} diff HEAD -- a.txt`]: diffOut("rowA") }));
  const m = await loadMod("mods/apollo-changes", { data: tabsData(), exec: ex });
  await settle(m);
  m.command("next");
  await settle(m);
  const e = els(m);
  const calls = (id) => (e.get(id)?.calls ?? []).map((c) => c.name);
  assert.ok([...e.keys()].some((id) => String(id).startsWith("diff-row-")), "diff rows present");
  assert.ok(calls("diff").includes("flex_1") && calls("diff").includes("min_h"), `diff container grows: ${calls("diff")}`);
  const fl = e.get("files")?.calls ?? [];
  assert.ok(fl.some((c) => c.name === "h" && c.args[0] === 80) && fl.some((c) => c.name === "flex_none"), `file list sized to its 3 rows (80): ${JSON.stringify(fl.map((c) => [c.name, c.args[0]]))}`);
});

// ---- Designer MUST 4 through main.js ----
test("changes: a header above the diff names the selected file", async () => {
  const ex = fakeExec(changesBase(" M a.txt\0 M b.txt\0", { [`${G} diff HEAD -- a.txt`]: diffOut("x"), [`${G} diff HEAD -- b.txt`]: diffOut("y") }));
  const m = await loadMod("mods/apollo-changes", { data: tabsData(), exec: ex });
  await settle(m);
  assert.ok(!m.ids().includes("diff-header"), "no header before a selection");
  m.command("next");
  await settle(m);
  const header = (() => { const out = []; const walk = (n) => { const el = n?.__el; if (!el) { if (typeof n === "string") out.push(n); return; } el.children.forEach(walk); }; const e = els(m).get("diff-header"); if (e) e.children.forEach(walk); return out; })();
  assert.deepEqual(header, ["a.txt"]);
  m.command("next");
  await settle(m);
  assert.ok(texts(m).includes("b.txt") && els(m).get("diff-header"));
});

test("changes: a file with staged and unstaged parts shows two labeled hunk groups", async () => {
  const ex = fakeExec(changesBase("MM a.txt\0", {
    [`${G} diff --cached -- a.txt`]: diffOut("fromIndex"), [`${G} diff -- a.txt`]: diffOut("fromWorktree"),
  }));
  const m = await loadMod("mods/apollo-changes", { data: tabsData(), exec: ex });
  await settle(m);
  m.command("next");
  await settle(m);
  const t = texts(m);
  assert.ok(t.includes("staged") && t.includes("unstaged"), `labels: ${t.join("|")}`);
  assert.ok(t.indexOf("fromIndex") < t.indexOf("unstaged") && t.indexOf("unstaged") < t.indexOf("fromWorktree"));
});

// ---- Designer MUST 5: the + popup is anchored under ⊕, right-aligned ----
test("tabs: once measured, + and `menu` open the popup under ⊕, right-aligned to it", async () => {
  const { readFileSync } = await import("node:fs");
  const layout = JSON.parse(readFileSync(new URL("../layouts/apollo.json", import.meta.url), "utf8"));
  const m = await loadMod("mods/apollo-tabs", { data: tabsData({ spaces: [tabSpace(3)], layout }) });
  m.resize("root", { width: 1400, height: 40 });
  m.resize("panels", { width: 270, height: 28 });
  m.click("plus");
  m.command("menu");
  await settle(m);
  const want = { mod: "apollo-tabs", kind: "popup", width: 220, at: { x: 1161, y: 45 }, props: { menu: "plus", space: "s1" } };
  assert.deepEqual(overlays(m), [want, want]);
  assert.ok(m.ids().includes("panels"), "the panel buttons sit in a measured `panels` group");
});

// ---- Designer SHOULD: one branch glyph at 14 px wherever a branch shows ----
const branchGlyphs = (m) => {
  const out = [];
  const walk = (n) => {
    const el = n?.__el;
    if (!el) return;
    if (el.kind === "svg" && /\/branch\.svg$/.test(el.args[0])) out.push(el);
    el.children.forEach(walk);
  };
  walk(m.tree());
  return out.map((el) => ({ path: el.args[0], size: el.calls.find((c) => c.name === "size")?.args[0] }));
};

test("pane header and status bar draw the 14 px branch glyph next to the branch", async () => {
  const pane = await loadMod("mods/apollo-pane", { data: { panes: tabPanes() }, props: { pane: "p2" } });
  assert.deepEqual(branchGlyphs(pane), [{ path: "mods/apollo-pane/branch.svg", size: 14 }]);
  const status = await loadMod("mods/apollo-status", { data: { spaces: [tabSpace(1)], agents: [] } });
  assert.deepEqual(branchGlyphs(status), [{ path: "mods/apollo-status/branch.svg", size: 14 }]);
});

// ---- Review item 1: "Work on it" acts only on a spec that is shown ----
const twoSpecs = (paths) => fakeExec({
  "git --no-optional-locks rev-parse --show-toplevel": { code: 0, stdout: "/r\n", stderr: "" },
  "find docs/specs -type f -name *.md": { code: 0, stdout: paths.map((p) => `docs/specs/${p}\n`).join(""), stderr: "" },
});
const tasks = (m) => runs(m).filter((r) => r.name === "tab.new").map((r) => r.args.task);

test("specs: select pending A, switch to paused (shows B), Work on it targets B, not A", async () => {
  const m = await loadMod("mods/apollo-specs", { data: tabsData(), exec: twoSpecs(["pending/a.md", "paused/b.md"]),
    files: { "/r/docs/specs/pending/a.md": "# A\n", "/r/docs/specs/paused/b.md": "# B\n" } });
  await settle(m);
  m.click("spec-pending/a.md");
  m.click("status-paused");
  m.click("work-on-it");
  assert.deepEqual(tasks(m), ["Work on the spec docs/specs/paused/b.md. Read it first."]);
});

test("specs: a filter that hides the selected spec makes Work on it use the first shown one", async () => {
  const m = await loadMod("mods/apollo-specs", { data: tabsData(), exec: twoSpecs(["pending/a.md", "pending/c.md"]),
    files: { "/r/docs/specs/pending/a.md": "# Alpha\n", "/r/docs/specs/pending/c.md": "# Cobalt\n" } });
  await settle(m);
  m.click("spec-pending/a.md");
  m.key("filter", "C", { key_char: "c" });
  m.key("filter", "o", { key_char: "o" });
  m.click("work-on-it");
  assert.deepEqual(tasks(m), ["Work on the spec docs/specs/pending/c.md. Read it first."]);
});

test("specs: a selection survives a refreshed list when its spec is still shown", async () => {
  const m = await loadMod("mods/apollo-specs", { data: tabsData(), exec: twoSpecs(["pending/a.md", "pending/c.md"]),
    files: { "/r/docs/specs/pending/a.md": "# Alpha\n", "/r/docs/specs/pending/c.md": "# Cobalt\n" } });
  await settle(m);
  m.click("spec-pending/c.md");
  m.view.list = m.view.list.map((s) => ({ ...s })); // a reload gives new objects for the same specs
  m.render();
  m.click("work-on-it");
  assert.deepEqual(tasks(m), ["Work on the spec docs/specs/pending/c.md. Read it first."]);
});

test("+ menu: a hovered row is clearly selected (selected fill and an input border)", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../mods/apollo-tabs/main.js", import.meta.url), "utf8");
  const item = src.slice(src.indexOf("const item = (n) =>"), src.indexOf("const kids = []"));
  assert.match(item, /\.hover\(\(s\) => s\.bg\(col\("selected"\)\)\.border_color\(col\("input"\)\)\)/);
  assert.match(item, /\.border\(1\)\.border_color\(col\("popover"\)\)/, "rows keep a 1 px border in the popover color so hover does not shift them");
});
