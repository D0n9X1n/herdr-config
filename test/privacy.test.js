// check.sh privacy: no tracked file holds an owner path or a real Herdr space/tab id. The planted
// strings are built at run time, so this file never contains them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, copyFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tempDir } from "./helpers/fixtures.js";

const root = new URL("../", import.meta.url).pathname;
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const run = (cwd, cmd, args) => spawnSync(cmd, args, { cwd, encoding: "utf8", env: ENV });
const USERS = ["", "Users", "someone", ""].join("/");
const FOLDERS = ["", "var", "folders", "ab", ""].join("/");
const SPACE_ID = "sp" + "0123456789abcdef".repeat(2);
const TAB_ID = "tb" + "fedcba9876543210".repeat(2);

// A repo with check.sh and one clean tracked file; `plant` adds a line to a tracked file.
function withRepo(fn) {
  const t = tempDir();
  try {
    mkdirSync(join(t.dir, "scripts"));
    copyFileSync(join(root, "scripts/check.sh"), join(t.dir, "scripts/check.sh"));
    writeFileSync(join(t.dir, "notes.md"), "Home is /home/ann.\n");
    run(t.dir, "git", ["init", "-q", "-b", "main"]);
    run(t.dir, "git", ["add", "-A"]);
    const check = () => run(t.dir, "bash", ["scripts/check.sh", "privacy"]);
    const plant = (file, line) => { appendFileSync(join(t.dir, file), `${line}\n`); run(t.dir, "git", ["add", "-A"]); };
    fn({ check, plant, dir: t.dir });
  } finally { t.cleanup(); }
}

test("privacy passes a clean tree, check.sh's own pattern line included", () => {
  withRepo(({ check }) => {
    const r = check();
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^ok privacy$/m);
  });
});

for (const [name, line] of [
  ["an owner home path", `cd ${USERS}repo`],
  ["a macOS temp path", `TMPDIR=${FOLDERS}T`],
  ["a space id", `space ${SPACE_ID} here`],
  ["a tab id", `"tab":"${TAB_ID}"`],
]) {
  test(`privacy fails on a planted line with ${name}`, () => {
    withRepo(({ check, plant }) => {
      plant("notes.md", line);
      const r = check();
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /FAIL privacy: .*notes\.md:2/);
    });
  });
}

test("only the pattern line of check.sh is exempt: another check.sh line fails", () => {
  withRepo(({ check, plant }) => {
    plant("scripts/check.sh", `# ${USERS}`);
    const r = check();
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /FAIL privacy: .*scripts\/check\.sh:\d+/);
  });
});

test("an id-like run of 33 hex digits after sp is not an id", () => {
  withRepo(({ check, plant }) => {
    plant("notes.md", `x${SPACE_ID}0`);
    assert.equal(check().status, 0);
  });
});

test("the real tree passes privacy", () => {
  const r = run(root, "bash", ["scripts/check.sh", "privacy"]);
  assert.equal(r.status, 0, r.stderr);
});
