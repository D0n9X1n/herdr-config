import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const svgs = () => readdirSync(join(root, "mods"), { recursive: true }).filter((p) => p.endsWith(".svg")).map((p) => join("mods", p));
const A3 = ["plus", "gear", "search", "panel-close", "panel-open", "chevron", "branch", "pin"];
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
  for (const g of ["search", "panel-close", "panel-open", "gear"]) assert.ok(has("apollo-chrome", g), g);
  assert.ok(!has("apollo-chrome", "plug"), "Add machine's plug glyph is gone");
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

// One line weight per kind: UI glyphs 2, status marks 3 (see above), Windows caption buttons 2.4 (1 px at 10 px).
const WIN = ["win-min", "win-max", "win-restore", "win-close"];
const glyphSrc = () => svgs().map((p) => ({ p, name: p.split("/").pop().replace(/\.svg$/, ""), src: readFileSync(join(root, p), "utf8") }));
const strokeOf = (src) => Number(/<svg\b[^>]*stroke-width="([\d.]+)"/.exec(src)?.[1]);

test("one stroke weight: UI glyphs 2, status marks 3, Windows buttons 2.4", () => {
  for (const { p, name, src } of glyphSrc()) {
    const want = MARKS.includes(name) ? 3 : WIN.includes(name) ? 2.4 : 2;
    assert.equal(strokeOf(src), want, p);
  }
});

test("UI glyphs use round caps and joins; Windows buttons are sharp like Windows' own", () => {
  for (const { p, name, src } of glyphSrc()) {
    const head = /<svg\b[^>]*>/.exec(src)[0];
    if (WIN.includes(name)) assert.match(head, /stroke-linecap="butt"[^>]*stroke-linejoin="miter"/, p);
    else assert.match(head, /stroke-linecap="round"[^>]*stroke-linejoin="round"/, p);
  }
});

test("frame glyphs share one frame: x 3, y 5, 18 by 14, corner 2.5", () => {
  const FRAME = '<rect x="3" y="5" width="18" height="14" rx="2.5"/>';
  for (const [mod, g] of [["apollo-chrome", "panel-open"], ["apollo-chrome", "panel-close"], ["apollo-pane", "split-right"], ["apollo-pane", "split-down"]]) {
    assert.ok(readFileSync(join(root, "mods", mod, `${g}.svg`), "utf8").includes(FRAME), `${mod}/${g}`);
  }
});

test("settings is sliders, not a sun; blocked is a solid diamond", () => {
  const gear = readFileSync(join(root, "mods/apollo-chrome/gear.svg"), "utf8");
  assert.equal((gear.match(/<circle\b/g) ?? []).length, 2, "two slider knobs");
  assert.doesNotMatch(gear, /r="3"/, "no sun core");
  for (const mod of ["apollo-spaces", "apollo-tabs", "apollo-pane"]) {
    assert.match(readFileSync(join(root, "mods", mod, "diamond.svg"), "utf8"), /<path[^>]*fill="currentColor"/, mod);
  }
});

test("copies of a glyph are byte-identical across mods", () => {
  const by = new Map();
  for (const { p, name, src } of glyphSrc()) (by.get(name) ?? by.set(name, []).get(name)).push([p, src]);
  for (const [name, list] of by) for (const [p, src] of list) assert.equal(src, list[0][1], `${p} differs from ${list[0][0]} (${name})`);
});

// Ink bounds of an M/L/l path (absolute and relative), widened by half the stroke.
function inkBox(svg) {
  const half = strokeOf(svg) / 2;
  let x = 0, y = 0;
  const xs = [], ys = [];
  for (const [, cmd, args] of svg.matchAll(/([MLml])\s*([-\d.\s,]+)/g)) {
    const n = args.trim().split(/[\s,]+/).map(Number);
    for (let i = 0; i < n.length; i += 2) {
      if (cmd === cmd.toLowerCase()) { x += n[i]; y += n[i + 1]; } else { x = n[i]; y = n[i + 1]; }
      xs.push(x); ys.push(y);
    }
  }
  for (const [, rx, ry, rw, rh] of svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    xs.push(+rx, +rx + +rw); ys.push(+ry, +ry + +rh);
  }
  return { x0: Math.min(...xs) - half, y0: Math.min(...ys) - half, x1: Math.max(...xs) + half, y1: Math.max(...ys) + half };
}

test("inkBox reads relative steps: an oversized close would be caught", () => {
  const big = '<svg viewBox="0 0 24 24" stroke-width="2.4"><path d="M4.8 4.8l19.2 19.2"/></svg>';
  assert.equal(inkBox(big).x1, 24 + 1.2);
});

test("Windows close is no larger than maximize, and every Windows button stays inside the 24 grid", () => {
  const read = (g) => readFileSync(join(root, "mods/apollo-tabs", `${g}.svg`), "utf8");
  const close = inkBox(read("win-close")), max = inkBox(read("win-max"));
  assert.ok(close.x1 - close.x0 <= max.x1 - max.x0 && close.y1 - close.y0 <= max.y1 - max.y0, JSON.stringify({ close, max }));
  for (const g of WIN) {
    const b = inkBox(read(g));
    assert.ok(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= 24 && b.y1 <= 24, `${g} ${JSON.stringify(b)}`);
  }
});
