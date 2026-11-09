#!/usr/bin/env node
// A1.3 gate: every shared-state key in mods/ (`shared(` / `setShared(`) is a single string literal that
// starts with `apollo.` or is a documented Herdr key (`layout`, `workspace.panels`).
// Usage: node scripts/scan-shared.js <dir>   (exit 1 and file:line on stderr for each violation)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CALL = /\b(setShared|shared)\s*\(\s*([^,)]*)/g;
const KEY = /^(apollo\..+|layout|workspace\.panels)$/;
const LITERAL = /^(["'`])((?:(?!\1)[^\\$]|\\.)*)\1$/;

export function scanSource(src, file) {
  const out = [];
  for (const m of src.matchAll(CALL)) {
    const arg = m[2].trim();
    const lit = LITERAL.exec(arg);
    if (!lit || !KEY.test(lit[2])) {
      const line = src.slice(0, m.index).split("\n").length;
      out.push(`${file}:${line}: ${m[1]}(${arg}) needs a literal key matching apollo.*, layout or workspace.panels`);
    }
  }
  return out;
}

export function scanDir(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(m?js)$/.test(name)) out.push(...scanSource(readFileSync(p, "utf8"), p));
    }
  };
  walk(dir);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: scan-shared.js <dir>"); process.exit(2); }
  const v = scanDir(dir);
  for (const line of v) console.error(line);
  process.exit(v.length ? 1 : 0);
}
