import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { realExec } from "./helpers/exec.js";
import { fakeWatch, fakeTimer, flush } from "./helpers/fakes.js";
import { gitFixture, specsFixture } from "./helpers/fixtures.js";
import { loadChanges } from "../mods/apollo-changes/lib.js";
import { startRefresh, refreshFollower, CHANGES_EVERY, SPECS_EVERY } from "../mods/apollo-changes/refresh.js";
import * as specsRefresh from "../mods/apollo-specs/refresh.js";

const root = new URL("../", import.meta.url).pathname;
const execFor = (env) => async (cmd, args, opts = {}) => realExec(cmd, args, { cwd: opts.cwd, env });
const listSpecs = (dir) => realExec("find", ["docs/specs", "-name", "*.md"], { cwd: dir }).stdout.split("\n").filter(Boolean).sort();

test("the changes and specs copies are identical (mods never import each other)", () => {
  assert.equal(readFileSync(join(root, "mods/apollo-changes/refresh.js"), "utf8"), readFileSync(join(root, "mods/apollo-specs/refresh.js"), "utf8"));
  assert.equal(specsRefresh.startRefresh.toString(), startRefresh.toString());
});

test("intervals: 10 s for changes, 60 s for specs", () => {
  assert.equal(CHANGES_EVERY, 10000);
  assert.equal(SPECS_EVERY, 60000);
});

test("local changes: one watch event reflects an edit, with no tick", async () => {
  const f = gitFixture();
  try {
    const w = fakeWatch(), t = fakeTimer();
    let state = null;
    const reload = async () => { state = await loadChanges(f.dir, { exec: execFor(f.env) }); };
    const r = startRefresh({ folder: f.dir, on: null, every: CHANGES_EVERY, watchFolder: w.watchFolder, timer: t, reload });
    await r.ready;
    assert.deepEqual(state.files.find((x) => x.path === "a.txt").added, 2);
    assert.deepEqual(w.watched, [f.dir]);
    assert.deepEqual(t.intervals(), [CHANGES_EVERY]);
    writeFileSync(join(f.dir, "a.txt"), "one\nTWO\nthree\nfour\nfive\nsix\n");
    w.fire([join(f.dir, "a.txt")]);
    await flush();
    assert.equal(state.files.find((x) => x.path === "a.txt").added, 4);
    r.stop();
  } finally {
    f.cleanup();
  }
});

test("local specs: one watch event reflects an added spec, with no tick", async () => {
  const f = specsFixture();
  try {
    const w = fakeWatch(), t = fakeTimer();
    let list = [];
    const r = startRefresh({ folder: f.dir, on: null, every: SPECS_EVERY, watchFolder: w.watchFolder, timer: t, reload: async () => { list = listSpecs(f.dir); } });
    await r.ready;
    assert.equal(list.length, 4);
    writeFileSync(join(f.dir, "docs/specs/pending/new.md"), "# New\n");
    w.fire([join(f.dir, "docs/specs/pending/new.md")]);
    await flush();
    assert.ok(list.includes("docs/specs/pending/new.md"));
    assert.deepEqual(t.intervals(), [SPECS_EVERY]);
    r.stop();
  } finally {
    f.cleanup();
  }
});

test("remote (on: devbox): never watches; one tick reloads", async () => {
  let watched = 0, loads = 0;
  const t = fakeTimer();
  const r = startRefresh({ folder: "/srv/app", on: "devbox", every: CHANGES_EVERY,
    watchFolder: () => { watched += 1; return new Promise(() => {}); }, timer: t, reload: async () => { loads += 1; } });
  await r.ready;
  assert.equal(loads, 1);
  t.tick();
  await flush();
  assert.equal(loads, 2);
  assert.equal(watched, 0);
  r.stop();
  t.tick();
  await flush();
  assert.equal(loads, 2, "stopped");
});

test("a failing reload does not stop the watch loop", async () => {
  const w = fakeWatch(), t = fakeTimer();
  let n = 0;
  const r = startRefresh({ folder: "/r", on: null, every: 1, watchFolder: w.watchFolder, timer: t,
    reload: async () => { n += 1; if (n === 2) throw new Error("boom"); } });
  await r.ready;
  w.fire(["/r/a"]); await flush();
  w.fire(["/r/b"]); await flush();
  assert.equal(n, 3);
  r.stop();
});

test("refreshFollower keeps one loop per target key: same key keeps it, a new key stops the old and starts the new", () => {
  const log = [];
  const f = refreshFollower({ start: (t) => { log.push(`start ${t.repo}`); return { stop: () => log.push(`stop ${t.repo}`) }; } });
  assert.equal(f.follow("s1|/r1", { repo: "/r1" }), true);
  assert.equal(f.follow("s1|/r1", { repo: "/r1" }), false);
  assert.equal(f.follow("s2|/r2", { repo: "/r2" }), true);
  assert.equal(f.key, "s2|/r2");
  assert.equal(f.follow(null, null), true);
  f.stop();
  assert.deepEqual(log, ["start /r1", "stop /r1", "start /r2", "stop /r2"]);
});

test("coalescing: ticks during a held reload collapse into exactly one more reload", async () => {
  const t = fakeTimer();
  let n = 0, release = null;
  const r = startRefresh({ folder: "/srv", on: "devbox", every: 1, watchFolder: () => new Promise(() => {}), timer: t,
    reload: async () => { n += 1; if (n === 2) await new Promise((res) => { release = res; }); } });
  await r.ready;
  assert.equal(n, 1);
  t.tick();
  await flush();
  assert.equal(n, 2, "the held reload started");
  for (let i = 0; i < 100; i++) t.tick();
  for (let i = 0; i < 3; i++) await flush();
  assert.equal(n, 2, "nothing runs while held");
  release();
  for (let i = 0; i < 10; i++) await flush();
  assert.equal(n, 3, "exactly one more after the held one (2 reloads from the hold)");
  r.stop();
});

test("coalescing: watch events during a held reload also collapse", async () => {
  const w = fakeWatch(), t = fakeTimer();
  let n = 0, release = null;
  const r = startRefresh({ folder: "/r", on: null, every: 1, watchFolder: w.watchFolder, timer: t,
    reload: async () => { n += 1; if (n === 2) await new Promise((res) => { release = res; }); } });
  await r.ready;
  w.fire(["/r/a"]);
  await flush();
  assert.equal(n, 2);
  for (let i = 0; i < 50; i++) t.tick();
  release();
  for (let i = 0; i < 10; i++) await flush();
  assert.equal(n, 3);
  r.stop();
});
