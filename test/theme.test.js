import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { contrast } from "../mods/apollo-spaces/lib.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const palette = read("data/apollo-palette.json").terminal;

const PANEL = {
  chrome: "#141617", canvas: "#141617",
  surface: "#1d2021", popover: "#1d2021",
  raised: "#1c1f20", hover: "#32302f",
  selected: "#3c3836", border: "#3c3836",
  input: "#504945",
  foreground: "#cfbc97",
  muted: "#d5c4a1",
  dim: "#928374", idle: "#928374",
  accent: "#fabd2f", working: "#fabd2f", solid: "#fabd2f",
  solid_foreground: "#141617",
  blocked: "#fb4934",
  done: "#b8bb26",
};

test("terminal colors come from the palette's terminal block", () => {
  const t = read("themes/apollo.json");
  assert.equal(t.background, palette.background);
  assert.equal(t.foreground, palette.foreground);
  assert.equal(t.cursor, palette.cursor);
  assert.equal(t.selection, palette.selection.color); // S1: alpha dropped, themes take #rrggbb only
  assert.deepEqual(t.ansi, palette.ansi.concat(palette.bright));
  assert.equal(t.ansi.length, 16);
});

test("#665c54 appears only as ANSI bright black", () => {
  const t = read("themes/apollo.json");
  assert.equal(t.ansi[8], "#665c54");
  const hits = JSON.stringify(t).match(/#665c54/gi) ?? [];
  assert.equal(hits.length, 1);
});

test("panel colors equal the A1 table", () => {
  assert.deepEqual(read("themes/apollo.json").colors, PANEL);
});

test("hover stands out from the popover and chrome it sits on (raised does not)", () => {
  const c = read("themes/apollo.json").colors;
  for (const under of ["popover", "chrome"]) assert.ok(contrast(c.hover, c[under]) >= 1.2, `hover on ${under}: ${contrast(c.hover, c[under])}`);
  assert.ok(contrast(c.raised, c.popover) < 1.2, "raised is too close to popover to show a hover");
});

test("Apollo mods hover with col(\"hover\"), never col(\"raised\"), and each has a hover fallback", () => {
  const dir = new URL("../mods/", import.meta.url);
  const mods = readdirSync(dir).filter((d) => d.startsWith("apollo-"));
  assert.ok(mods.length >= 7);
  for (const m of mods) {
    const src = readFileSync(new URL(`${m}/main.js`, dir), "utf8");
    assert.doesNotMatch(src, /\.hover\(\((\w+)\) => \1\.bg\(col\("raised"\)\)/, `${m} hovers with raised`);
    if (src.includes('col("hover")')) assert.match(src.slice(0, src.indexOf("const col")), /\bhover: "#32302f"/, `${m} FALLBACK has hover`);
  }
});

test("every value is #rrggbb", () => {
  const t = read("themes/apollo.json");
  const all = [t.background, t.foreground, t.selection, t.cursor, ...t.ansi, ...Object.values(t.colors)];
  for (const c of all) assert.match(c, /^#[0-9a-f]{6}$/);
});
