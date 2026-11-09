// H5: temp git and specs fixtures, and executable stubs.
// Temp dirs live under realpath(/tmp) as apollo-test.*; cleanup goes through safe_rm only.
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SAFE_RM = join(dirname(fileURLToPath(import.meta.url)), "safe-rm.sh");
const BASE = realpathSync("/tmp");

export function tempDir() {
  const dir = mkdtempSync(join(BASE, "apollo-test."));
  if (!dir || !dir.startsWith(`${BASE}/apollo-test.`)) throw new Error(`mktemp failed: ${dir}`);
  const cleanup = () => {
    const r = spawnSync("bash", ["-c", '. "$1" && safe_rm "$2"', "_", SAFE_RM, dir], {
      cwd: "/", encoding: "utf8", env: { ...process.env, SAFE_RM_BASE: BASE },
    });
    if (r.status !== 0) throw new Error(`safe_rm failed: ${r.stderr}`);
  };
  return { dir, cleanup };
}

function write(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid",
};

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

export function gitFixture({ unborn = false } = {}) {
  const t = tempDir();
  try {
    git(t.dir, "init", "-q", "-b", "main");
    write(t.dir, "a.txt", "one\ntwo\nthree\n");
    git(t.dir, "add", "a.txt");
    if (!unborn) git(t.dir, "commit", "-q", "--no-verify", "--no-gpg-sign", "-m", "init");
    write(t.dir, "a.txt", "one\nTWO\nthree\nfour\n");
    write(t.dir, "b.txt", "new\n");
    git(t.dir, "add", "b.txt");
    write(t.dir, "deep/x/y.txt", "untracked\n");
  } catch (e) {
    t.cleanup();
    throw e;
  }
  return { ...t, env: GIT_ENV };
}

export function specsFixture() {
  const t = tempDir();
  for (const s of ["pending", "paused", "finished", "canceled"]) mkdirSync(join(t.dir, "docs/specs", s), { recursive: true });
  write(t.dir, "docs/specs/pending/login.md", "---\npriority: high\n---\n# Fix login\n\nBody.\n");
  write(t.dir, "docs/specs/pending/no-heading.md", "---\npriority: low\n---\nJust text.\n");
  write(t.dir, "docs/specs/paused/cache.md", "---\npriority: medium\n---\n# Cache layer\n");
  write(t.dir, "docs/specs/finished/done.md", "# Done thing\n");
  return t;
}

export function stubBin(dir, name, body) {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, `#!/bin/sh\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}
