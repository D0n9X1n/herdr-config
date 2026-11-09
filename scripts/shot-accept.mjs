#!/usr/bin/env node
// A24: decides whether a + menu capture is acceptable.
//   (a) some `herdr-app status .overlays` entry names apollo-tabs in the field P5 recorded
//       (P5: entries are bare strings, field "self"); with no identifying field (null), (a) is skipped;
//   (b) the PNG's mtime is after the prompt time and its sha256 differs from every earlier one.
// CLI: shot-accept.mjs <png> --overlays '<json>' --field self|<key>|null --prompt-ms N [--earlier sha,…]
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const nameOf = (entry, field) => (field === "self" ? entry : entry?.[field]);

export function acceptPlusMenu({ overlays, field, png, promptMs, earlierShas = [] }) {
  if (field !== null && field !== undefined) {
    const names = (overlays ?? []).map((e) => nameOf(e, field));
    if (!names.includes("apollo-tabs")) return { ok: false, reason: "overlay" };
  }
  if (!(png.mtimeMs > promptMs) || earlierShas.includes(png.sha)) return { ok: false, reason: "stale" };
  return { ok: true, reason: "ok" };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const file = args[0];
  if (!file || file.startsWith("--")) { console.error("usage: shot-accept.mjs <png> --overlays <json> --field <f> --prompt-ms N [--earlier a,b]"); process.exit(2); }
  const f = opt("--field");
  const r = acceptPlusMenu({
    overlays: JSON.parse(opt("--overlays") ?? "[]"),
    field: f === "null" ? null : (f ?? "self"),
    png: { mtimeMs: statSync(file).mtimeMs, sha: createHash("sha256").update(readFileSync(file)).digest("hex") },
    promptMs: Number(opt("--prompt-ms") ?? 0),
    earlierShas: (opt("--earlier") ?? "").split(",").filter(Boolean),
  });
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
