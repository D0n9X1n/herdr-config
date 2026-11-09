import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, symlinkSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { tempDir, stubBin } from "./helpers/fixtures.js";

const root = new URL("../", import.meta.url).pathname;
const SCRIPT = join(root, "agent/herdr-context.sh");
const AWK = execFileSync("/bin/sh", ["-c", "command -v awk"], { encoding: "utf8" }).trim();
const SHELLS = ["/bin/sh", ...(existsSync("/bin/dash") ? ["/bin/dash"] : [])];
const NASTY = "\x01\x1b\t\r\"\\é";

let t;
const bins = {};
// bin(name, {xs, herdr, hc}): a PATH dir holding only awk plus the requested stubs (never jq).
function bin(name, { xs = 8600, herdr = true, hc = true } = {}) {
  const dir = join(t.dir, name);
  mkdirSync(dir);
  symlinkSync(AWK, join(dir, "awk"));
  const payload = join(t.dir, `${name}.skill`);
  writeFileSync(payload, `${NASTY}${"x".repeat(xs)}${"中".repeat(200)}${"😀".repeat(50)}\n`);
  if (herdr) stubBin(dir, "herdr-app", `[ "$1" = --skill ] && exec /bin/cat '${payload}'\nexit 0`);
  if (hc) stubBin(dir, "hc", "exit 0");
  return dir;
}

before(() => {
  t = tempDir();
  bins.full = bin("full");
  bins.emoji = bin("emoji", { xs: 8000 });
  bins.noHerdr = bin("no-herdr", { herdr: false });
  bins.noHc = bin("no-hc", { hc: false });
});
after(() => t.cleanup());

function run(cli, env = {}, { shell = "/bin/sh", path = bins.full } = {}) {
  const r = spawnSync(shell, [SCRIPT, cli], { env: { PATH: path, HC_TERMINAL_ID: "t42", ...env }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, bytes: Buffer.byteLength(r.stdout) };
}

function assertContext(text, { probe } = {}) {
  for (const s of ["t42", "`herdr-app --skill`", "`hc --skill`", "\u0001", "\u001b", "\t", "\r", '"', "\\", "é"]) {
    assert.ok(text.includes(s), `missing ${JSON.stringify(s)}`);
  }
  assert.ok(!text.includes("�"), "has a replacement character");
  if (probe) assert.ok(text.includes(probe));
}

test("script is executable and never uses jq", () => {
  assert.ok(statSync(SCRIPT).mode & 0o111);
  assert.equal((readFileSync(SCRIPT, "utf8").match(/jq/g) ?? []).length, 0);
});

for (const shell of SHELLS) {
  test(`${shell}: silent outside Herdr`, () => {
    const cases = [
      ["no HC_TERMINAL_ID", run("claude", { HC_TERMINAL_ID: "" }, { shell })],
      ["herdr-app missing", run("claude", {}, { shell, path: bins.noHerdr })],
      ["hc missing", run("copilot", {}, { shell, path: bins.noHc })],
      ["claude-desktop", run("claude", { CLAUDE_CODE_ENTRYPOINT: "claude-desktop" }, { shell })],
      ["unknown cli", run("other", {}, { shell })],
    ];
    for (const [name, r] of cases) {
      assert.equal(r.code, 0, name);
      assert.equal(r.out, "", name);
    }
  });

  test(`${shell}: claude shape (entrypoint unset and cli)`, () => {
    for (const env of [{}, { CLAUDE_CODE_ENTRYPOINT: "cli" }]) {
      const r = run("claude", env, { shell });
      assert.equal(r.code, 0, r.err);
      const j = JSON.parse(r.out);
      assert.deepEqual(Object.keys(j), ["hookSpecificOutput"]);
      assert.equal(j.hookSpecificOutput.hookEventName, "SessionStart");
      assertContext(j.hookSpecificOutput.additionalContext);
      assert.ok(r.bytes <= 9001 && r.bytes >= 8990, `bytes ${r.bytes}`);
      assert.ok(r.out.endsWith("\n"));
    }
  });

  test(`${shell}: copilot shape`, () => {
    const r = run("copilot", {}, { shell });
    const j = JSON.parse(r.out);
    assert.deepEqual(Object.keys(j), ["additionalContext"]);
    assertContext(j.additionalContext);
    const claude = JSON.parse(run("claude", {}, { shell }).out).hookSpecificOutput.additionalContext;
    assert.ok(j.additionalContext.startsWith(claude.slice(0, 200)));
    assert.ok(r.bytes <= 9001 && r.bytes >= 8990, `bytes ${r.bytes}`);
  });

  test(`${shell}: the cut lands on a whole multibyte character`, () => {
    const three = JSON.parse(run("claude", {}, { shell }).out).hookSpecificOutput.additionalContext;
    assert.ok(three.endsWith("中") && !three.includes("😀"), "cut inside the 3-byte run");
    const r4 = run("claude", {}, { shell, path: bins.emoji });
    const four = JSON.parse(r4.out).hookSpecificOutput.additionalContext;
    assert.ok(four.endsWith("😀"), "cut inside the 4-byte run");
    assert.ok(!four.includes("�") && r4.bytes <= 9001);
  });

  test(`${shell}: probe value appears when set`, () => {
    for (const cli of ["claude", "copilot"]) {
      const r = run(cli, { HERDR_CONTEXT_PROBE: "tok-123" }, { shell });
      assert.ok(r.out.includes("tok-123"));
      assert.ok(r.bytes <= 9001);
      JSON.parse(r.out);
    }
  });
}
