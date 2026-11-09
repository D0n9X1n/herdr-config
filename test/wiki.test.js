// wiki/ is the only documentation folder: every page has an English and a Chinese file with the same
// headings, code and facts, reciprocal language links and bare-name page links; _Sidebar.md links them all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const W = join(root, "wiki");
export const PAGES = ["Home", "Install", "Keys", "Sidebar", "Panels", "Agent-Context", "Development", "Clean-Room", "Herdr-Notes"];
const read = (p) => readFileSync(join(W, `${p}.md`), "utf8");
const zh = (p) => `${p}-zh-CN`;
const fences = (md) => [...md.matchAll(/^```[^\n]*\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
const noFences = (md) => md.replace(/^```[^\n]*\n[\s\S]*?^```$/gm, "");
const codeSpans = (md) => [...new Set([...noFences(md).matchAll(/`([^`\n]+)`/g)].map((m) => m[1]))].sort();
const levels = (md) => [...noFences(md).matchAll(/^(#{1,6}) /gm)].map((m) => m[1].length);
const links = (md) => [...noFences(md).matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
const section = (md, name) => {
  const start = md.search(new RegExp(`^## ${name}\\b.*$`, "m"));
  if (start < 0) return "";
  const rest = md.slice(start + 1);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
};

test("wiki/ holds exactly the pages, each with its -zh-CN pair, and _Sidebar.md", () => {
  const want = [...PAGES.flatMap((p) => [`${p}.md`, `${zh(p)}.md`]), "_Sidebar.md"].sort();
  assert.deepEqual(readdirSync(W).sort(), want);
});

for (const p of PAGES) {
  test(`${p}: the two languages match (headings, code, reciprocal links)`, () => {
    const en = read(p), cn = read(zh(p));
    assert.match(en, /^# \S.*\n\n\[简体中文\]\(([^)]+)\)\n/);
    assert.equal(/^# .*\n\n\[简体中文\]\(([^)]+)\)/.exec(en)[1], zh(p));
    assert.match(cn, /^# \S.*\n\n\[English\]\(([^)]+)\)\n/);
    assert.equal(/^# .*\n\n\[English\]\(([^)]+)\)/.exec(cn)[1], p);
    assert.deepEqual(levels(cn), levels(en), "same heading structure");
    assert.deepEqual(codeSpans(cn), codeSpans(en), "same inline code (facts)");
    assert.deepEqual(fences(cn), fences(en), "same code blocks");
  });

  test(`${p}: links use bare page names and stay in the page's language`, () => {
    for (const [file, own] of [[p, "en"], [zh(p), "zh"]]) {
      for (const l of links(read(file))) {
        if (/^https?:/.test(l)) continue;
        assert.doesNotMatch(l, /\.md$|\//, `${file}: link ${l} is a bare page name`);
        const base = l.replace(/-zh-CN$/, "");
        assert.ok(PAGES.includes(base), `${file}: link ${l} names a page`);
        const isLang = (own === "en" && l === zh(p)) || (own === "zh" && l === p);
        if (!isLang) assert.equal(l.endsWith("-zh-CN"), own === "zh", `${file}: ${l} stays in the page's language`);
      }
    }
  });
}

test("_Sidebar.md: an open English section and a folded Chinese section that link every page", () => {
  const s = readFileSync(join(W, "_Sidebar.md"), "utf8");
  const open = s.indexOf("<details open>"), folded = s.indexOf("<details>\n");
  assert.ok(open >= 0 && folded > open, "English open first, then Chinese folded");
  const en = s.slice(open, folded), cn = s.slice(folded);
  for (const p of PAGES) {
    assert.ok(en.includes(`](${p})`), `English links ${p}`);
    assert.ok(cn.includes(`](${zh(p)})`), `Chinese links ${zh(p)}`);
  }
});

test("Install: copies, not links, and why", () => {
  const md = read("Install");
  assert.match(md, /cp -R mods\/apollo-\* "\$H\/mods\/"/);
  assert.doesNotMatch(md, /\bln -s\b/);
  assert.match(md, /herdr-app check/);
  assert.match(md, /layout\.switch/);
  assert.match(section(md, "Copies, not links"), /symlink/);
  assert.match(section(md, "Copies, not links"), /`svg\(\)`/);
});

test("Install: an App icon section: the script, --remove, rerun after a Herdr update, the codesign note", () => {
  const md = read("Install"), icon = section(md, "App icon");
  for (const c of ["scripts/set-app-icon.sh", "--remove", "--check", "--restart-dock", "Contents/", "codesign --verify --strict", "spctl"]) {
    assert.ok(icon.includes(`\`${c}\``), c);
  }
  assert.match(icon, /update/);
  assert.match(icon, /again/);
});

test("Keys: every override, cmd-9, the bindable commands and the unbound SonicTerm actions", () => {
  const md = read("Keys");
  const over = JSON.parse(readFileSync(join(root, "user/keys.overrides.json"), "utf8"));
  for (const k of Object.keys(over.global)) assert.ok(md.includes(`\`${k}\``), `keys table has ${k}`);
  for (const c of ["apollo-tabs.last", "apollo-changes.next", "herdr-app do apollo-changes.next", "keys.json"]) assert.ok(md.includes(`\`${c}\``), c);
  const unbound = section(md, "Unbound SonicTerm actions");
  for (const a of ["broadcast", "pane resize", "copy mode", "fullscreen", "reload", "quick select"]) assert.match(unbound, new RegExp(a), a);
});

test("Sidebar: states, collapse at 184, width bounds, search, folds, the zoom caveat and glyph copies", () => {
  const md = read("Sidebar");
  for (const s of ["184", "256", "220", "480", "`SIZE_IS_ZOOMED`", "zoom 1", "`layout.resize`", "`branch.svg`", "`⌄`", "`›`", "Escape"]) {
    assert.ok(md.includes(s), s);
  }
});

test("Panels: Files, Changes (staged/unstaged, limits), Specs (Work on it) and the + menu", () => {
  const md = read("Panels");
  for (const h of ["Panel buttons", "Changes", "Specs", "The + menu"]) assert.ok(section(md, h.replace("+", "\\+")), h);
  for (const s of ["`staged`", "`unstaged`", "`#3d3f1b`", "`#4e231e`", "1500", "240 px", "220 px", "Work on it", "pointer"]) assert.ok(md.includes(s), s);
});

test("Agent-Context: the hook script, both CLIs and when it is silent", () => {
  const md = read("Agent-Context");
  for (const s of ["`agent/herdr-context.sh <claude|copilot>`", "`HC_TERMINAL_ID`", "`CLAUDE_CODE_ENTRYPOINT`", "`herdr-app --skill`", "9,000"]) {
    assert.ok(md.includes(s), s);
  }
  assert.match(section(md, "When it is silent"), /nothing/);
  assert.match(md, /"SessionStart"/);
});

test("Development: tests, live safety, CI and release", () => {
  const md = read("Development");
  for (const h of ["Tests", "Live safety", "CI", "Release"]) assert.ok(section(md, h), h);
  for (const s of ["npm test", "scripts/check.sh all", "scripts/in-clone.sh bash test/live.test.sh", "`live_begin rollback`", "`safe_rm`",
    "`/private/tmp/apollo-test.*`", "`scripts/smoke.sh all`", "`ubuntu-latest`"]) assert.ok(md.includes(s), s);
});

test("Clean-Room: the allowlist, what is not allowed, the data/ hashes and the check", () => {
  const md = read("Clean-Room");
  for (const s of ["AGENTS.md", "herdr.d.ts", "gpui-kit.d.ts", "`herdr-app commands`", "`herdr-app --skill`", "`hc --skill`",
    "`data/apollo-palette.json`", "`data/herdr-default-keys.json`", "`data/owner-settings.json`", "`layouts/.state/<name>.json`",
    "`~/.config/herdr-app/mods/`", "`~/.config/herdr-app/layouts/`", "`scripts/check.sh cleanroom`",
    "550f8c36cf4ef6ac99551541d1fe9554f77d563fa1e7c129a6a82583321d61ef", "0660aaf35e31a8f168619ff463189421aeba95e95f2ec6ad2bc8a368ff1af94e"]) {
    assert.ok(md.includes(s), s);
  }
});

test("Herdr-Notes: P1-P10 as general facts, with no paths or ids from a real machine", () => {
  const md = read("Herdr-Notes");
  for (let i = 1; i <= 10; i++) assert.match(md, new RegExp(`^\\| P${i} \\|`, "m"), `P${i}`);
  for (const f of [read("Herdr-Notes"), read(zh("Herdr-Notes"))]) {
    assert.doesNotMatch(f, /\/private\/tmp|apollo-test\.|apollo-live-|\b[tp]\d{2,}\b|\bt1[67]\b/);
    assert.doesNotMatch(f, /\b(sp|tb|p)[0-9a-f]{32}\b/);
    assert.doesNotMatch(f, /\b1674\b|\b3348\b|\b262\b/, "no owner window or sidebar sizes");
  }
});

test("wiki pages have no images", () => {
  for (const f of readdirSync(W)) assert.doesNotMatch(readFileSync(join(W, f), "utf8"), /!\[[^\]]*\]\(|<img\b/, f);
});
