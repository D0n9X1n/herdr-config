// scripts/shots.sh --accept OUT: after a person has passed the privacy gate on OUT/preview.png, copy it to
// assets/screenshots/preview.png and record its sha256 in assets/screenshots/preview.sha256. It refuses a
// preview whose measurement failed. Offline: it never touches Herdr.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { encodePng } from "./helpers/png.js";
import { tempDir } from "./helpers/fixtures.js";

const root = new URL("../", import.meta.url).pathname;
const GOOD = { scale: 2, borderX: 524, sidebarPx: 256, activeRowBg: "#fabd2f", trafficViolations: 0 };

function setup(t, measure, { preview = true } = {}) {
  const repo = join(t.dir, "repo"), out = join(t.dir, "out");
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(join(repo, "assets/screenshots"), { recursive: true });
  mkdirSync(out);
  copyFileSync(join(root, "scripts/shots.sh"), join(repo, "scripts/shots.sh"));
  const png = encodePng(8, 8, (x, y) => [x * 30, y * 30, 7]);
  if (preview) writeFileSync(join(out, "preview.png"), png);
  if (measure) writeFileSync(join(out, "preview.measure.json"), JSON.stringify(measure));
  const run = () => spawnSync("bash", [join(repo, "scripts/shots.sh"), "--accept", out], { encoding: "utf8", env: { ...process.env, PATH: process.env.PATH } });
  return { repo, out, png, run };
}

test("--accept copies the preview and records its sha256", () => {
  const t = tempDir();
  try {
    const { repo, png, run } = setup(t, GOOD);
    const r = run();
    assert.equal(r.status, 0, r.stderr);
    assert.ok(readFileSync(join(repo, "assets/screenshots/preview.png")).equals(png));
    const sha = createHash("sha256").update(png).digest("hex");
    assert.equal(readFileSync(join(repo, "assets/screenshots/preview.sha256"), "utf8"), `${sha}  preview.png\n`);
  } finally { t.cleanup(); }
});

for (const [name, m] of [
  ["a sidebar that is not 256", { ...GOOD, sidebarPx: 200 }],
  ["an active row that is not accent", { ...GOOD, activeRowBg: "#141617" }],
  ["a traffic-light violation", { ...GOOD, trafficViolations: 3 }],
]) {
  test(`--accept refuses ${name}, and writes nothing`, () => {
    const t = tempDir();
    try {
      const { repo, run } = setup(t, m);
      assert.equal(run().status, 1);
      assert.ok(!existsSync(join(repo, "assets/screenshots/preview.png")));
      assert.ok(!existsSync(join(repo, "assets/screenshots/preview.sha256")));
    } finally { t.cleanup(); }
  });
}

test("--accept refuses a folder with no preview or no measurement", () => {
  const t = tempDir();
  try {
    assert.equal(setup(t, GOOD, { preview: false }).run().status, 1);
  } finally { t.cleanup(); }
  const t2 = tempDir();
  try {
    assert.equal(setup(t2, null).run().status, 1);
  } finally { t2.cleanup(); }
});
