import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const MODS = ["apollo-chrome", "apollo-spaces", "apollo-tabs", "apollo-pane", "apollo-changes", "apollo-specs", "apollo-status"];
const imports = (src) => [...src.matchAll(/\bimport\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2]);

test("all seven mods have main.js and mod.json", () => {
  for (const m of MODS) {
    assert.ok(existsSync(join(root, "mods", m, "main.js")), `${m}/main.js`);
    assert.ok(existsSync(join(root, "mods", m, "mod.json")), `${m}/mod.json`);
  }
});

test("every main.js imports only gpui-kit, gpui-base, herdr and ./ files; other mod files import only ./", () => {
  const files = readdirSync(join(root, "mods"), { recursive: true }).filter((p) => p.endsWith(".js"));
  assert.ok(files.length >= 14);
  for (const f of files) {
    const allowed = f.endsWith("/main.js") ? /^(gpui-kit|gpui-base|herdr|\.\/[^/].*)$/ : /^\.\/[^/].*$/;
    for (const spec of imports(readFileSync(join(root, "mods", f), "utf8"))) assert.match(spec, allowed, `${f}: ${spec}`);
  }
});

test("the import scanner sees what it should", () => {
  assert.deepEqual(imports('import { a } from "gpui-kit";\nimport x from "../y.js";\nimport "./z.js";\nconst m = import("herdr");'),
    ["gpui-kit", "../y.js", "./z.js", "herdr"]);
});
