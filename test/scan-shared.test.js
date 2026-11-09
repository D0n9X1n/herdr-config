import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { realExec } from "./helpers/exec.js";
import { scanSource, scanDir } from "../scripts/scan-shared.js";

const root = new URL("../", import.meta.url).pathname;
const fx = (d) => join(root, "test/fixtures", d);

test("scanSource: string literal keys under apollo.*, layout or workspace.panels pass", () => {
  assert.deepEqual(scanSource('setShared( "apollo.x" , 2); shared("layout"); shared(\'workspace.panels\'); shared(`apollo.y`)', "f.js"), []);
});

test("scanSource: foreign keys, variables, templates with ${} and empty calls fail with file:line", () => {
  const src = 'x\nsetShared("foreign", 1);\nshared(key);\nshared(`apollo.${k}`);\nshared();\nshared("apollo." + k);\nshared("apollo.")';
  assert.deepEqual(scanSource(src, "f.js").map((v) => v.split(": ")[0]), ["f.js:2", "f.js:3", "f.js:4", "f.js:5", "f.js:6", "f.js:7"]);
  assert.deepEqual(scanSource("myshared(x); unshared ( y )", "g.js"), []);
});

test("bad fixtures fail with file:line; good fixtures pass", () => {
  const bad = scanDir(fx("shared-bad"));
  assert.deepEqual(bad.map((v) => v.split(": ")[0].replace(`${fx("shared-bad")}/`, "")), ["a.js:3", "b.js:2"]);
  assert.match(bad[0], /"foreign"/);
  assert.deepEqual(scanDir(fx("shared-good")), []);
});

test("CLI exits 1 with file:line on violations, 0 when clean", () => {
  const bad = realExec("node", [join(root, "scripts/scan-shared.js"), fx("shared-bad")]);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /shared-bad\/a\.js:3/);
  assert.match(bad.stderr, /shared-bad\/b\.js:2/);
  assert.equal(realExec("node", [join(root, "scripts/scan-shared.js"), fx("shared-good")]).code, 0);
  assert.equal(realExec("node", [join(root, "scripts/scan-shared.js"), join(root, "mods")]).code, 0);
});
