// A26: the CI workflow runs the offline gates on ubuntu-latest, with pinned actions and no secrets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const CI = ".github/workflows/ci.yml";
const read = () => readFileSync(join(root, CI), "utf8");

test("CI runs on ubuntu-latest with read-only permissions and no secrets", () => {
  assert.ok(existsSync(join(root, CI)), `${CI} exists`);
  const y = read();
  assert.match(y, /^\s*runs-on: ubuntu-latest\s*$/m);
  assert.match(y, /^permissions:\n\s+contents: read\s*$/m);
  assert.doesNotMatch(y, /secrets\./);
});

test("every action is pinned to an exact version tag", () => {
  const uses = [...read().matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 2);
  for (const u of uses) assert.match(u, /^actions\/[a-z-]+@v\d+\.\d+\.\d+$/, u);
});

test("CI runs the offline gates", () => {
  const y = read();
  for (const s of [
    "scripts/check.sh json",
    "npm test",
    "scripts/check.sh theme settings user keys ctx refresh shared gallery cleanroom gitignore files shots docs wiki privacy logo",
    "librsvg2-bin",
    "scripts/in-clone.sh bash test/safe-rm.test.sh",
    "scripts/in-clone.sh bash test/live.test.sh",
    "scripts/in-clone.sh bash test/in-clone.test.sh",
    "scripts/in-clone.sh bash test/set-app-icon.test.sh",
    "shellcheck -x -P SCRIPTDIR -S warning",
  ]) assert.ok(y.includes(s), s);
  assert.doesNotMatch(y, /smoke\.sh (all|theme-keys|mods|sidebar)/, "no live smoke in CI");
  assert.doesNotMatch(y, /shots\.sh/, "no live captures in CI");
});
