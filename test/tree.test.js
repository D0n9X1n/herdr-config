// The public tree: design, specs and plans stay local (docs/ is not tracked); images live in assets/screenshots/.
// Reads git only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url).pathname;
const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
const tracked = () => git("ls-files", "-z").stdout.split("\0").filter(Boolean);

test("no tracked file is under docs/, and git ignores docs/", () => {
  assert.deepEqual(tracked().filter((f) => f.startsWith("docs/")), []);
  assert.equal(git("check-ignore", "-q", "docs/specs/any.md").status, 0, "docs/ is ignored");
});

test("the only tracked screenshot is assets/screenshots/preview.png", () => {
  const t = tracked();
  assert.deepEqual(t.filter((f) => f.startsWith("assets/")), ["assets/screenshots/preview.png"]);
  assert.ok(!t.includes("preview.png"), "no root preview.png");
  assert.ok(!t.some((f) => /png-crop/.test(f)), "the sidebar crop script is gone");
});
