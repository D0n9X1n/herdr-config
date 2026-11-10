import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recorder } from "./helpers/stubs.js";
import { realExec, fakeExec } from "./helpers/exec.js";
import { specsFixture } from "./helpers/fixtures.js";
import {
  specsRepo, listSpecs, specCounts, filterSpecs, openSpec, workOnIt, viewerModel, STATUSES,
} from "../mods/apollo-specs/lib.js";

function io() {
  const calls = [];
  const exec = async (cmd, args, opts) => { calls.push({ fn: "exec", cmd, args, opts }); return realExec(cmd, args, { cwd: opts?.cwd }); };
  const readTextFile = async (path, opts) => { calls.push({ fn: "read", path, opts }); try { return readFileSync(path, "utf8"); } catch { return null; } };
  return { calls, exec, readTextFile };
}
const agent = (key, installed = true) => ({ key, name: key, run: [key], installed });
const space = (machine = null) => ({ id: machine ? `${machine}/s1` : "s1", machine, folder: "/w/space" });

test("specsRepo: the focused pane's git toplevel, else the space folder", async () => {
  const ok = fakeExec({ "git --no-optional-locks rev-parse --show-toplevel": { code: 0, stdout: "/w/repo\n", stderr: "" } });
  assert.equal(await specsRepo({ cwd: "/w/repo/docs" }, space("devbox"), { exec: ok }), "/w/repo");
  assert.deepEqual(ok.calls[0].opts, { cwd: "/w/repo/docs", on: "devbox" });
  const no = fakeExec({ "git --no-optional-locks rev-parse --show-toplevel": { code: 128, stdout: "", stderr: "no" } });
  assert.equal(await specsRepo({ cwd: "/tmp" }, space(), { exec: no }), "/w/space");
  assert.equal(await specsRepo(null, space(), { exec: no }), "/w/space");
});

test("listSpecs passes {on} to find and every read; title, priority, status", async () => {
  const f = specsFixture();
  try {
    const x = io();
    const list = await listSpecs(f.dir, { ...x, on: "devbox" });
    assert.deepEqual(list.map((s) => [s.status, s.path, s.title, s.priority]), [
      ["pending", "docs/specs/pending/login.md", "Fix login", "high"],
      ["pending", "docs/specs/pending/no-heading.md", "no-heading.md", "low"],
      ["paused", "docs/specs/paused/cache.md", "Cache layer", "medium"],
      ["finished", "docs/specs/finished/done.md", "Done thing", null],
    ]);
    assert.equal(list[0].file, join(f.dir, "docs/specs/pending/login.md"));
    const finds = x.calls.filter((c) => c.fn === "exec");
    assert.equal(finds.length, 1);
    assert.equal(finds[0].cmd, "find");
    assert.deepEqual(finds[0].opts, { cwd: f.dir, on: "devbox" });
    const reads = x.calls.filter((c) => c.fn === "read");
    assert.equal(reads.length, 4);
    for (const r of reads) assert.deepEqual(r.opts, { on: "devbox" });
  } finally {
    f.cleanup();
  }
});

test("listSpecs: no docs/specs gives an empty list", async () => {
  const ex = fakeExec({ "find docs/specs -type f -name *.md": { code: 1, stdout: "", stderr: "No such file" } });
  assert.deepEqual(await listSpecs("/r", { exec: ex, readTextFile: async () => null }), []);
});

test("specCounts covers all four statuses; filter matches title or path, case-insensitively", async () => {
  const f = specsFixture();
  try {
    const list = await listSpecs(f.dir, io());
    assert.deepEqual(STATUSES, ["pending", "paused", "finished", "canceled"]);
    assert.deepEqual(specCounts(list), { pending: 2, paused: 1, finished: 1, canceled: 0 });
    assert.deepEqual(filterSpecs(list, "LOGIN").map((s) => s.title), ["Fix login"]);
    assert.deepEqual(filterSpecs(list, "PAUSED/").map((s) => s.title), ["Cache layer"]);
    assert.equal(filterSpecs(list, "").length, 4);
  } finally {
    f.cleanup();
  }
});

test("openSpec splits right with the viewer and {file, on}", () => {
  const r = recorder();
  openSpec({ file: "/r/docs/specs/pending/x.md" }, "devbox", r);
  assert.deepEqual(r.calls, [{ fn: "run", name: "pane.split",
    args: { direction: "right", mod: "apollo-specs", props: { file: "/r/docs/specs/pending/x.md", on: "devbox" } } }]);
});

for (const machine of [null, "devbox"]) {
  test(`workOnIt prefers claude over an earlier agent and runs tab.new (${machine ? "remote" : "local"})`, () => {
    const r = recorder();
    const spec = { path: "docs/specs/pending/x.md" };
    workOnIt(spec, { space: space(machine), repo: "/w/repo", agents: [agent("codex"), agent("claude")] }, r);
    assert.deepEqual(r.calls, [{ fn: "run", name: "tab.new", args: {
      space: space(machine).id, name: "claude", folder: "/w/repo", argv: ["claude"], task: "Work on the spec docs/specs/pending/x.md. Read it first.",
    } }]);
  });
}

test("workOnIt: without claude, the first installed agent; with none, a warning and no command", () => {
  const r = recorder();
  workOnIt({ path: "docs/specs/pending/x.md" }, { space: space(), repo: "/r", agents: [agent("claude", false), agent("pi"), agent("codex")] }, r);
  assert.deepEqual(r.calls[0].args.argv, ["pi"]);
  const n = recorder();
  workOnIt({ path: "docs/specs/pending/x.md" }, { space: space(), repo: "/r", agents: [agent("claude", false)] }, n);
  assert.equal(n.calls.length, 1);
  assert.equal(n.calls[0].fn, "notify");
  assert.equal(n.calls[0].args.level, "warning");
});

test("viewerModel reads exactly that path with that {on} and holds the markdown body", async () => {
  const f = specsFixture();
  try {
    const x = io();
    const file = join(f.dir, "docs/specs/pending/login.md");
    const vm = await viewerModel({ file, on: "devbox" }, x);
    assert.deepEqual(x.calls, [{ fn: "read", path: file, opts: { on: "devbox" } }]);
    assert.equal(vm.file, file);
    assert.match(vm.body, /^# Fix login\n/);
    assert.doesNotMatch(vm.body, /priority:/);
    assert.equal((await viewerModel({ file: "/nope.md", on: null }, x)).body, "");
  } finally {
    f.cleanup();
  }
});

test("specsRepo's git call carries --no-optional-locks", async () => {
  const seen = [];
  await specsRepo({ cwd: "/w/r" }, { id: "s1", machine: null, folder: "/w" }, { exec: async (cmd, args) => { seen.push([cmd, ...args]); return { code: 0, stdout: "/w/r\n", stderr: "" }; } });
  assert.deepEqual(seen, [["git", "--no-optional-locks", "rev-parse", "--show-toplevel"]]);
});

test("workTarget: the selected spec only while shown (by path), else the first shown, else null", async () => {
  const { workTarget } = await import("../mods/apollo-specs/lib.js");
  const a = { path: "docs/specs/pending/a.md" }, b = { path: "docs/specs/paused/b.md" };
  assert.equal(workTarget(a.path, [a, b]), a);
  assert.equal(workTarget(a.path, [b]), b);
  assert.equal(workTarget(a.path, [{ ...a }]).path, a.path);
  assert.equal(workTarget(null, [b]), b);
  assert.equal(workTarget(a.path, []), null);
});
