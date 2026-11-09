import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, renameSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { realExec, fakeExec } from "./helpers/exec.js";
import { gitFixture } from "./helpers/fixtures.js";
import {
  parsePorcelain, markOf, loadChanges, loadDiff, diffCommands, diffRows, limitFiles, findRepo, nextFile, MAX_FILES, MAX_LINES,
  fileListHeight, diffPlan, loadDiffGroups, diffRowsGrouped,
} from "../mods/apollo-changes/lib.js";

const execFor = (env) => async (cmd, args, opts = {}) => realExec(cmd, args, { cwd: opts.cwd, env });
const byPath = (files) => Object.fromEntries(files.map((f) => [f.path, [f.mark, f.added, f.removed]]));

test("parsePorcelain: nested untracked, renames, spaces", () => {
  const z = " M a.txt\0A  b c.txt\0?? deep/x/y.txt\0R  new.txt\0old.txt\0D  gone.txt\0UU both.txt\0";
  assert.deepEqual(parsePorcelain(z), [
    { x: " ", y: "M", path: "a.txt" },
    { x: "A", y: " ", path: "b c.txt" },
    { x: "?", y: "?", path: "deep/x/y.txt" },
    { x: "R", y: " ", path: "new.txt", orig: "old.txt" },
    { x: "D", y: " ", path: "gone.txt" },
    { x: "U", y: "U", path: "both.txt" },
  ]);
  assert.deepEqual(parsePorcelain(""), []);
});

test("marks: ?? is U (S9), unmerged is M, D, A, else M", () => {
  const m = (x, y) => markOf({ x, y });
  assert.deepEqual([m("?", "?"), m("U", "U"), m("A", "A"), m("D", "D"), m(" ", "D"), m("A", " "), m("A", "M"), m(" ", "M"), m("R", " ")],
    ["U", "M", "M", "M", "D", "A", "A", "M", "M"]);
});

test("loadChanges with HEAD: A, M, D and U with +/- counts", async () => {
  const f = gitFixture();
  try {
    mkdirSync(join(f.dir, "attic"));
    appendFileSync(join(f.dir, ".git/info/exclude"), "attic/\n");
    writeFileSync(join(f.dir, "c.txt"), "1\n2\n3\n");
    realExec("git", ["add", "c.txt"], { cwd: f.dir, env: f.env });
    realExec("git", ["commit", "-q", "--no-verify", "--no-gpg-sign", "-m", "c", "--", "c.txt"], { cwd: f.dir, env: f.env }); // only c.txt; b.txt stays staged
    renameSync(join(f.dir, "c.txt"), join(f.dir, "attic/c.txt")); // a worktree deletion without deleting anything
    const r = await loadChanges(f.dir, { exec: execFor(f.env), on: null });
    assert.equal(r.unborn, false);
    assert.equal(r.truncated, false);
    assert.deepEqual(byPath(r.files), {
      "a.txt": ["M", 2, 1], "b.txt": ["A", 1, 0], "c.txt": ["D", 0, 3], "deep/x/y.txt": ["U", 1, 0],
    });
  } finally {
    f.cleanup();
  }
});

test("loadChanges on an unborn branch: staged plus worktree counts, untracked as added", async () => {
  const f = gitFixture({ unborn: true });
  try {
    const r = await loadChanges(f.dir, { exec: execFor(f.env), on: null });
    assert.equal(r.unborn, true);
    assert.deepEqual(byPath(r.files), { "a.txt": ["A", 5, 1], "b.txt": ["A", 1, 0], "deep/x/y.txt": ["U", 1, 0] });
  } finally {
    f.cleanup();
  }
});

test("loadChanges passes {cwd, on} to every exec and counts untracked with one wc call", async () => {
  const st = "git --no-optional-locks status --porcelain=v1 -z --untracked-files=all";
  const ex = fakeExec({
    "git --no-optional-locks rev-parse --verify -q HEAD": { code: 0, stdout: "abc\n", stderr: "" },
    [st]: { code: 0, stdout: "?? u1.txt\0?? d/u2.txt\0 M m.txt\0", stderr: "" },
    "git --no-optional-locks diff --numstat -z HEAD": { code: 0, stdout: "4\t2\tm.txt\0", stderr: "" },
    "wc -l -- u1.txt d/u2.txt": { code: 0, stdout: "  3 u1.txt\n  7 d/u2.txt\n 10 total\n", stderr: "" },
  });
  const r = await loadChanges("/r", { exec: ex, on: "devbox" });
  assert.deepEqual(byPath(r.files), { "u1.txt": ["U", 3, 0], "d/u2.txt": ["U", 7, 0], "m.txt": ["M", 4, 2] });
  assert.equal(ex.calls.filter((c) => c.key.startsWith("wc ")).length, 1);
  for (const c of ex.calls) assert.deepEqual(c.opts, { cwd: "/r", on: "devbox" });
});

test("1001 entries give 1000 plus truncated", async () => {
  assert.equal(MAX_FILES, 1000);
  const list = Array.from({ length: 1001 }, (_, i) => ({ path: `f${i}` }));
  const l = limitFiles(list);
  assert.equal(l.files.length, 1000);
  assert.equal(l.truncated, true);
  assert.equal(limitFiles(list.slice(0, 1000)).truncated, false);
  const z = Array.from({ length: 1001 }, (_, i) => ` M f${i}.txt\0`).join("");
  const ex = fakeExec({
    "git --no-optional-locks rev-parse --verify -q HEAD": { code: 0, stdout: "", stderr: "" },
    "git --no-optional-locks status --porcelain=v1 -z --untracked-files=all": { code: 0, stdout: z, stderr: "" },
    "git --no-optional-locks diff --numstat -z HEAD": { code: 0, stdout: "", stderr: "" },
  });
  const r = await loadChanges("/r", { exec: ex });
  assert.equal(r.files.length, 1000);
  assert.equal(r.truncated, true);
});

test("diffCommands: normal, unborn, untracked", () => {
  assert.deepEqual(diffCommands("a.txt", {}), [["diff", "HEAD", "--", "a.txt"]]);
  assert.deepEqual(diffCommands("a.txt", { unborn: true }), [["diff", "--cached", "--", "a.txt"], ["diff", "--", "a.txt"]]);
  assert.deepEqual(diffCommands("u.txt", { untracked: true }), [["diff", "--no-index", "--", "/dev/null", "u.txt"]]);
  assert.deepEqual(diffCommands("u.txt", { untracked: true, unborn: true }), [["diff", "--no-index", "--", "/dev/null", "u.txt"]]);
});

test("diffRows: colors, line numbers, headers skipped", () => {
  const text = [
    "diff --git a/a.txt b/a.txt", "index 1..2 100644", "--- a/a.txt", "+++ b/a.txt",
    "@@ -1,3 +1,4 @@", " one", "-two", "+TWO", " three", "+four", "\\ No newline at end of file",
  ].join("\n");
  const rows = diffRows(text);
  assert.deepEqual(rows.map((r) => [r.kind, r.text, r.old, r.new, r.bg]), [
    ["hunk", "@@ -1,3 +1,4 @@", null, null, "raised"],
    ["ctx", "one", 1, 1, null],
    ["del", "two", 2, null, "#4e231e"],
    ["add", "TWO", null, 2, "#3d3f1b"],
    ["ctx", "three", 3, 3, null],
    ["add", "four", null, 4, "#3d3f1b"],
  ]);
  assert.ok(rows.every((r) => r.numColor === "dim"));
});

test("1501 diff rows give 1500 plus a limit row", () => {
  assert.equal(MAX_LINES, 1500);
  const text = ["@@ -1,1500 +1,1500 @@", ...Array.from({ length: 1500 }, (_, i) => ` l${i}`)].join("\n");
  const rows = diffRows(text);
  assert.equal(rows.length, 1501);
  assert.equal(rows[1500].kind, "limit");
  assert.equal(diffRows(["@@ -1,2 +1,2 @@", " a", " b"].join("\n")).at(-1).kind, "ctx");
});

test("findRepo: the focused pane's git toplevel, else the space folder", async () => {
  const ok = fakeExec({ "git --no-optional-locks rev-parse --show-toplevel": { code: 0, stdout: "/w/repo\n", stderr: "" } });
  assert.equal(await findRepo({ cwd: "/w/repo/src", folder: "/w", on: "devbox" }, { exec: ok }), "/w/repo");
  assert.deepEqual(ok.calls[0].opts, { cwd: "/w/repo/src", on: "devbox" });
  const no = fakeExec({ "git --no-optional-locks rev-parse --show-toplevel": { code: 128, stdout: "", stderr: "not a repo" } });
  assert.equal(await findRepo({ cwd: "/tmp/x", folder: "/w" }, { exec: no }), "/w");
  assert.equal(await findRepo({ cwd: null, folder: "/w" }, { exec: no }), "/w");
});

test("every git call in the changes lib carries --no-optional-locks (real repo, every diff mode)", async () => {
  const f = gitFixture();
  try {
    const seen = [];
    const ex = async (cmd, args, opts = {}) => { seen.push([cmd, ...args]); return realExec(cmd, args, { cwd: opts.cwd, env: f.env }); };
    await loadChanges(f.dir, { exec: ex });
    await loadDiff(f.dir, "a.txt", { exec: ex });
    await loadDiff(f.dir, "a.txt", { exec: ex, unborn: true });
    await loadDiff(f.dir, "deep/x/y.txt", { exec: ex, untracked: true });
    await findRepo({ cwd: f.dir, folder: "/x" }, { exec: ex });
    const git = seen.filter((c) => c[0] === "git");
    assert.ok(git.length >= 8);
    for (const c of git) assert.equal(c[1], "--no-optional-locks", c.join(" "));
  } finally {
    f.cleanup();
  }
});

test("nextFile: first when nothing is selected, then the next listed file, wrapping; null when empty", () => {
  const files = [{ path: "a.txt" }, { path: "b.txt" }, { path: "c.txt" }];
  assert.equal(nextFile(files, null), "a.txt");
  assert.equal(nextFile(files, "a.txt"), "b.txt");
  assert.equal(nextFile(files, "c.txt"), "a.txt");
  assert.equal(nextFile(files, "gone.txt"), "a.txt");
  assert.equal(nextFile([], null), null);
  assert.equal(nextFile(undefined, "a.txt"), null);
});

// ---- Designer MUST 4: list height, staged/unstaged groups ----
test("fileListHeight: rows (26) plus 1 px gaps, capped at 240; empty is 0", () => {
  assert.deepEqual([0, 1, 3, 9, 50].map(fileListHeight), [0, 26, 80, 240, 240]);
});

test("diffPlan: staged and unstaged parts get labeled groups when HEAD exists; unborn and untracked keep their fallback", () => {
  assert.deepEqual(diffPlan("a.txt", { staged: true, unstaged: true }), [
    { label: "staged", args: ["diff", "--cached", "--", "a.txt"] },
    { label: "unstaged", args: ["diff", "--", "a.txt"] },
  ]);
  assert.deepEqual(diffPlan("a.txt", { staged: false, unstaged: true }), [{ label: null, args: ["diff", "HEAD", "--", "a.txt"] }]);
  assert.deepEqual(diffPlan("a.txt", { staged: true, unstaged: false }), [{ label: null, args: ["diff", "HEAD", "--", "a.txt"] }]);
  assert.deepEqual(diffPlan("a.txt", { unborn: true, staged: true, unstaged: true }).map((g) => g.label), [null, null]);
  assert.deepEqual(diffPlan("u.txt", { untracked: true }), [{ label: null, args: ["diff", "--no-index", "--", "/dev/null", "u.txt"] }]);
});

test("a real file with staged and unstaged parts: flags from status, two labeled groups, label rows", async () => {
  const f = gitFixture();
  try {
    writeFileSync(join(f.dir, "a.txt"), "one\nSTAGED\nthree\n");
    realExec("git", ["add", "a.txt"], { cwd: f.dir, env: f.env });
    writeFileSync(join(f.dir, "a.txt"), "one\nSTAGED\nthree\nWORKTREE\n");
    const ex = execFor(f.env);
    const st = await loadChanges(f.dir, { exec: ex });
    const a = st.files.find((x) => x.path === "a.txt");
    assert.deepEqual([a.staged, a.unstaged], [true, true]);
    const b = st.files.find((x) => x.path === "b.txt");
    assert.deepEqual([b.staged, b.unstaged], [true, false]);
    const groups = await loadDiffGroups(f.dir, "a.txt", { exec: ex, staged: true, unstaged: true });
    assert.deepEqual(groups.map((g) => g.label), ["staged", "unstaged"]);
    assert.match(groups[0].text, /\+STAGED/);
    assert.match(groups[1].text, /\+WORKTREE/);
    const rows = diffRowsGrouped(groups);
    assert.deepEqual(rows.filter((r) => r.kind === "label").map((r) => r.text), ["staged", "unstaged"]);
    assert.ok(rows.findIndex((r) => r.text === "STAGED") < rows.findIndex((r) => r.text === "unstaged"));
  } finally {
    f.cleanup();
  }
});

test("diffRowsGrouped keeps the 1500-line cap across groups", () => {
  const big = ["@@ -1,900 +1,900 @@", ...Array.from({ length: 900 }, (_, i) => ` l${i}`)].join("\n");
  const rows = diffRowsGrouped([{ label: "staged", text: big }, { label: "unstaged", text: big }]);
  assert.equal(rows.length, 1501);
  assert.equal(rows.at(-1).kind, "limit");
});

// ---- Review item 2: the truncation marker survives grouping ----
const bigDiff = (n) => ["@@ -0,0 +1," + (n - 1) + " @@", ...Array.from({ length: n - 1 }, (_, i) => `+line ${i}`)].join("\n");

test("diffRowsGrouped: a 1,601-row single unlabeled diff gives 1,500 rows plus the marker", () => {
  assert.equal(diffRows(bigDiff(1601)).filter((r) => r.kind !== "limit").length, 1500, "fixture: 1,601 rows cut to 1,500");
  const rows = diffRowsGrouped([{ label: null, text: bigDiff(1601) }]);
  assert.equal(rows.length, 1501);
  assert.equal(rows[1500].kind, "limit");
  assert.ok(rows.slice(0, 1500).every((r) => r.kind !== "limit"));
});

test("diffRowsGrouped: a labeled group cut on its own keeps the marker, once, at the end", () => {
  const rows = diffRowsGrouped([{ label: "staged", text: bigDiff(1601) }, { label: "unstaged", text: bigDiff(3) }]);
  assert.equal(rows.at(-1).kind, "limit");
  assert.equal(rows.filter((r) => r.kind === "limit").length, 1);
  assert.equal(rows.length, MAX_LINES + 1);
});

test("diffRowsGrouped: a diff at exactly 1,500 rows has no marker", () => {
  const rows = diffRowsGrouped([{ label: null, text: bigDiff(1500) }]);
  assert.equal(rows.length, 1500);
  assert.ok(rows.every((r) => r.kind !== "limit"));
});
