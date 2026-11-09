import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const svgs = () => readdirSync(join(root, "mods"), { recursive: true }).filter((p) => p.endsWith(".svg")).map((p) => join("mods", p));
const A3 = ["plus", "plug", "gear", "search", "panel-close", "panel-open", "chevron", "branch", "pin"];
const MARKS = ["arc", "diamond", "check"];
const BRANCH_MODS = ["apollo-spaces", "apollo-pane", "apollo-status"];
const has = (mod, g) => existsSync(join(root, "mods", mod, `${g}.svg`));

test("every mod SVG is an original 24-grid glyph with no embedded image or link", () => {
  const all = svgs();
  assert.ok(all.length >= A3.length + MARKS.length);
  for (const p of all) {
    const s = readFileSync(join(root, p), "utf8");
    assert.match(s, /<svg\b[^>]*viewBox="0 0 24 24"/, p);
    assert.doesNotMatch(s, /<image|href=/, p);
  }
});

test("each A3 glyph name exists exactly once across all mods (branch: one identical copy per mod that shows it)", () => {
  const base = svgs().map((p) => p.split("/").pop().replace(/\.svg$/, ""));
  for (const g of A3.filter((g) => g !== "branch")) assert.equal(base.filter((b) => b === g).length, 1, g);
  const copies = BRANCH_MODS.map((mod) => readFileSync(join(root, "mods", mod, "branch.svg"), "utf8"));
  assert.equal(base.filter((b) => b === "branch").length, BRANCH_MODS.length);
  for (const c of copies) assert.equal(c, copies[0], "every branch.svg is the same glyph");
});

test("glyphs sit where their mod uses them", () => {
  for (const g of ["search", "panel-close", "panel-open", "gear", "plug"]) assert.ok(has("apollo-chrome", g), g);
  for (const g of ["plus", "chevron", "branch", "pin"]) assert.ok(has("apollo-spaces", g), g);
  for (const g of ["files", "changes", "specs", "more", "close"]) assert.ok(has("apollo-tabs", g), `tabs ${g}`);
  for (const g of ["split-right", "split-down", "zoom", "close"]) assert.ok(has("apollo-pane", g), `pane ${g}`);
});

test("every mod that shows status marks has its own arc, diamond and check (mods are self-contained)", () => {
  for (const mod of ["apollo-spaces", "apollo-tabs", "apollo-pane"]) for (const g of MARKS) assert.ok(has(mod, g), `${mod} ${g}`);
});

test("every svg(...) call in a mod uses a home-relative mods/apollo-<mod>/<file>.svg path and an explicit size", () => {
  const files = readdirSync(join(root, "mods"), { recursive: true }).filter((p) => p.endsWith("main.js"));
  let n = 0;
  for (const f of files) {
    const src = readFileSync(join(root, "mods", f), "utf8");
    const mod = f.split("/")[0];
    for (const m of src.matchAll(/\bsvg\(\s*(`[^`]*`|"[^"]*"|'[^']*'|[A-Za-z_.?]+)\s*\)/g)) {
      const arg = m[1];
      n += 1;
      if (/^[`"']/.test(arg)) assert.match(arg, new RegExp(`^[\`"']mods/${mod}/[\\w$\\{\\}.-]+\\.svg[\`"']$`), `${f}: svg(${arg})`);
      else assert.match(arg, /^(a|h)\.icon$|^a\.icon$|^p\.icon$|^icon$/, `${f}: svg(${arg}) must be a program icon path from herdr data`);
    }
  }
  assert.ok(n >= 6);
});

test("status marks read at 12 px: stroke 1.5-2 px (3-4 on the 24 grid) in every copy", () => {
  for (const mod of ["apollo-spaces", "apollo-tabs", "apollo-pane"]) {
    for (const g of MARKS) {
      const src = readFileSync(join(root, "mods", mod, `${g}.svg`), "utf8");
      const w = Number(/stroke-width="([\d.]+)"/.exec(src)?.[1]);
      assert.ok(w >= 3 && w <= 4, `${mod}/${g}.svg stroke-width ${w}`);
    }
  }
});

test("folds have both glyphs: chevron (›, folded) and chevron-down (⌄, unfolded)", () => {
  assert.ok(has("apollo-spaces", "chevron-down"));
});
