import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { recorder } from "./helpers/stubs.js";
import { fakeTimer, fakeWatch, flush } from "./helpers/fakes.js";
import { count, findAll, walk } from "./helpers/tree.js";
import { realExec, fakeExec } from "./helpers/exec.js";
import { gitFixture, specsFixture, stubBin } from "./helpers/fixtures.js";
import { encodePng } from "./helpers/png.js";
import { loadMod } from "./helpers/host.js";

test("recorder keeps call order", () => {
  const r = recorder();
  r.run("tab.new", { space: "s1" });
  r.notify({ title: "hi" });
  r.openOverlay({ mod: "menu" });
  r.setShared("apollo.x", 1);
  r.run("tab.select", { id: "t2" });
  assert.deepEqual(r.calls.map((c) => c.fn), ["run", "notify", "openOverlay", "setShared", "run"]);
  assert.deepEqual(r.calls[0], { fn: "run", name: "tab.new", args: { space: "s1" } });
  assert.deepEqual(r.calls[2], { fn: "openOverlay", name: "menu", args: { mod: "menu" } });
  assert.deepEqual(r.calls[3], { fn: "setShared", name: "apollo.x", args: 1 });
});

test("fakeTimer().tick() fires every fn", () => {
  const t = fakeTimer();
  const hits = [];
  t.every(10_000, () => hits.push("a"));
  t.every(60_000, () => hits.push("b"));
  t.tick();
  t.tick();
  assert.deepEqual(hits, ["a", "b", "a", "b"]);
});

test("fakeWatch resolves watchFolder with fired paths", async () => {
  const w = fakeWatch();
  const p = w.watchFolder("/repo");
  w.fire(["/repo/a.txt"]);
  assert.deepEqual(await p, ["/repo/a.txt"]);
  await flush();
});

test("fakeWatch works when destructured", async () => {
  const { watchFolder, fire, watched } = fakeWatch();
  const p = watchFolder("/repo");
  fire(["/repo/b.txt"]);
  assert.deepEqual(await p, ["/repo/b.txt"]);
  assert.deepEqual(watched, ["/repo"]);
});

test("fakeTimer works when destructured", () => {
  const { every, tick } = fakeTimer();
  let n = 0;
  every(10, () => { n += 1; });
  tick();
  assert.equal(n, 1);
});

test("count() counts nested kinds; walk and findAll visit every node", () => {
  const n = (kind, attrs = {}, children = []) => ({ kind, attrs, children });
  const tree = n("col", {}, [n("plus"), n("row", {}, [n("plus"), n("text", { t: "x" })]), n("row")]);
  assert.equal(count(tree, "plus"), 2);
  assert.equal(count(tree, "row"), 2);
  assert.equal(count(tree, "none"), 0);
  assert.equal([...walk(tree)].length, 6);
  assert.deepEqual(findAll(tree, (x) => x.attrs.t === "x").map((x) => x.kind), ["text"]);
});

test("realExec runs a process; fakeExec answers by table", async () => {
  assert.deepEqual(realExec("sh", ["-c", "printf hi; exit 3"]), { code: 3, stdout: "hi", stderr: "" });
  const ex = fakeExec({ "git status": { code: 0, stdout: "ok", stderr: "" } });
  assert.equal((await ex("git", ["status"])).stdout, "ok");
  await assert.rejects(ex("git", ["log"]), /no fake for: git log/);
});

test("gitFixture({unborn:true}) has no HEAD", () => {
  const f = gitFixture({ unborn: true });
  try {
    assert.notEqual(realExec("git", ["rev-parse", "--verify", "-q", "HEAD"], { cwd: f.dir }).code, 0);
    const st = realExec("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: f.dir }).stdout;
    assert.match(st, /^AM a\.txt$/m);
    assert.match(st, /^A  b\.txt$/m);
    assert.match(st, /^\?\? deep\/x\/y\.txt$/m);
  } finally {
    f.cleanup();
  }
  assert.equal(existsSync(f.dir), false);
});

test("gitFixture() commits a.txt, then modifies it", () => {
  const f = gitFixture();
  try {
    assert.equal(realExec("git", ["rev-parse", "--verify", "-q", "HEAD"], { cwd: f.dir }).code, 0);
    const st = realExec("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: f.dir }).stdout;
    assert.match(st, /^ M a\.txt$/m);
    assert.match(st, /^A  b\.txt$/m);
    assert.match(st, /^\?\? deep\/x\/y\.txt$/m);
  } finally {
    f.cleanup();
  }
});

test("specsFixture builds the four status folders; stubBin is executable", () => {
  const f = specsFixture();
  try {
    for (const s of ["pending", "paused", "finished", "canceled"]) assert.ok(existsSync(join(f.dir, "docs/specs", s)));
    const bin = stubBin(f.dir, "herdr-app", 'echo "stub $*"');
    assert.equal(realExec(bin, ["x"]).stdout, "stub x\n");
  } finally {
    f.cleanup();
  }
});

test("encodePng starts with the PNG signature and inflates back", () => {
  const png = encodePng(3, 2, (x, y) => [x * 10, y * 20, 255]);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = png.indexOf("IHDR");
  assert.equal(png.readUInt32BE(ihdr + 4), 3);
  assert.equal(png.readUInt32BE(ihdr + 8), 2);
  const idat = png.indexOf("IDAT");
  const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
  assert.equal(raw.length, 2 * (1 + 3 * 3));
  assert.deepEqual([...raw.subarray(1 + 3 * 2, 1 + 3 * 3)], [20, 0, 255]);
  assert.deepEqual([...raw.subarray(10 + 1, 10 + 4)], [0, 20, 255]);
});

test("H7 loadMod lists id b and click(b) records run(app.help)", async () => {
  const m = await loadMod("test/fixtures/mod-click");
  assert.ok(m.ids().includes("b"));
  m.click("b");
  assert.deepEqual(m.rec.calls.filter((c) => c.fn === "run"), [{ fn: "run", name: "app.help", args: undefined }]);
});
