// README, RECIPE, LICENSE and CLAUDE.md say what the repo really does. Full docs live in wiki/ (test/wiki.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (f) => readFileSync(join(root, f), "utf8");
// Markdown images and HTML <img> tags, in order; badges (http) are left out.
const images = (md) => [...md.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)|<img\b[^>]*\bsrc="([^"]+)"/g)]
  .map((m) => ({ alt: m[1] ?? "", src: m[2] ?? m[3] }))
  .filter((i) => !/^https?:/.test(i.src));
const headings = (md, level) => [...md.matchAll(new RegExp(`^${"#".repeat(level)} (.+)$`, "gm"))].map((m) => m[1].trim());
const section = (md, name) => {
  const start = md.search(new RegExp(`^## ${name}\\b.*$`, "m"));
  if (start < 0) return "";
  const rest = md.slice(start + 1);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
};

test("README opens with a centered header: title, tagline, CI/version/MIT badges and the doc links", () => {
  const md = read("README.md");
  const head = md.slice(0, md.indexOf("</div>"));
  assert.match(md, /^<div align="center">\n/);
  assert.match(head, /^# Apollo$/m);
  assert.match(head, /^\*\*Yet, just another [^*]+\*\*$/m);
  assert.match(head, /actions\/workflows\/ci\.yml\/badge\.svg/);
  assert.match(head, /img\.shields\.io\/github\/v\/tag\/D0n9X1n\/herdr-config/);
  assert.match(head, /license-MIT/);
  assert.ok(head.includes("[Documentation](wiki/Home.md) · [简体中文文档](wiki/Home-zh-CN.md)"));
});

test("README has exactly one image, the hero preview, with a caption", () => {
  const md = read("README.md");
  const imgs = images(md);
  assert.deepEqual(imgs.map((i) => i.src), ["assets/screenshots/preview.png"]);
  assert.ok(md.indexOf("preview.png") < md.indexOf("\n## "), "the hero comes before the first section");
  assert.match(md, /<b>[^<]+<\/b>/, "the hero has a caption");
  assert.ok(existsSync(join(root, imgs[0].src)));
});

test("README is short: Highlights and Install, the rest linked to the wiki", () => {
  const md = read("README.md");
  assert.ok(md.split("\n").length <= 90, `${md.split("\n").length} lines`);
  const got = headings(md, 2);
  for (const h of ["Highlights", "Install"]) assert.ok(got.includes(h), h);
  assert.ok(!got.includes("Gallery"), "no gallery");
  assert.doesNotMatch(md, /^\| Key \|/m, "the keys table lives in the wiki");
  const install = section(md, "Install");
  assert.match(install, /cp -R mods\/apollo-\*/);
  assert.doesNotMatch(install, /\bln -s\b/);
  assert.match(install, /\(wiki\/Install\.md\)/);
  const links = [...md.matchAll(/\]\((wiki\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length >= 5);
  for (const l of links) assert.ok(existsSync(join(root, l)), `${l} exists`);
});

test("RECIPE has Herdr's six sections in order, from the real files", () => {
  const md = read("RECIPE.md");
  assert.match(md, /^# Apollo\n/);
  const first = md.split("\n## ")[0];
  assert.ok(images(first).some((i) => i.src === "assets/screenshots/preview.png"), "the opening has the preview");
  assert.deepEqual(headings(md, 2), ["What you see", "How it behaves", "Built from", "Watch out", "Done when"]);
  const built = section(md, "Built from");
  for (const m of ["apollo-chrome", "apollo-spaces", "apollo-tabs", "apollo-pane", "apollo-changes", "apollo-specs", "apollo-status", "files"]) {
    assert.ok(built.includes(`\`${m}\``), `Built from names ${m}`);
  }
  for (const hex of ["#141617", "#fabd2f", "#3d3f1b", "#4e231e"]) assert.ok(md.includes(hex), hex);
  for (const s of ["working", "blocked", "done", "idle"]) assert.match(section(md, "How it behaves"), new RegExp(`\\b${s}\\b`, "i"), s);
});

test("LICENSE is MIT with the owner's copyright", () => {
  const t = read("LICENSE");
  assert.match(t, /^MIT License\n/);
  assert.match(t, /^Copyright \(c\) 2026 D0n9X1n$/m);
  assert.match(t, /Permission is hereby granted, free of charge/);
  assert.match(t, /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND/);
});

test("CLAUDE.md: read the wiki first; the wiki is canonical; never track specs, plans or design", () => {
  const md = read("CLAUDE.md");
  assert.match(md, /^# CLAUDE\.md/);
  assert.match(md, /\(wiki\/Home\.md\)/);
  assert.match(md, /canonical/i);
  assert.match(md, /-zh-CN/);
  assert.match(md, /_Sidebar\.md/);
  assert.match(md, /[Nn]ever track design notes, specs or plans/);
  assert.match(md, /`docs\/`/);
  assert.match(md, /scripts\/check\.sh all/);
  assert.ok(!existsSync(join(root, "CLEANROOM.md")), "CLEANROOM.md moved to wiki/Clean-Room.md");
});
