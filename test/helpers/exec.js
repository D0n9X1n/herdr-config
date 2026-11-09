// H4: a real synchronous exec and a table-driven fake with herdr's exec shape.
import { spawnSync } from "node:child_process";

export function realExec(cmd, args = [], { cwd, env } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8" });
  if (r.error) return { code: 127, stdout: "", stderr: String(r.error.message) };
  return { code: r.status ?? 128, stdout: r.stdout, stderr: r.stderr };
}

export function fakeExec(table) {
  const calls = [];
  const ex = async (cmd, args = [], opts) => {
    const key = [cmd, ...args].join(" ");
    calls.push({ key, opts });
    if (!(key in table)) throw new Error(`no fake for: ${key}`);
    const v = table[key];
    return typeof v === "function" ? v(opts) : v;
  };
  ex.calls = calls;
  return ex;
}
