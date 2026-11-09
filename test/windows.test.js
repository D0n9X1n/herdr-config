// Windows support: the window buttons apollo-tabs draws where the system draws none, the Windows
// keymap (user/keys.windows.json) and the PowerShell hook (agent/herdr-context.ps1).
// Paths go through fileURLToPath, so this file also runs on Windows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { loadMod } from "./helpers/host.js";
import { tabSpace, tabPanes } from "./fixtures/tabs.js";
import { windowButtons, WIN_BUTTON_W, plusAnchor } from "../mods/apollo-tabs/lib.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const runs = (m) => m.rec.calls.filter((c) => c.fn === "run").map(({ name, args }) => ({ name, args }));
const tabsData = (win) => ({ spaces: [tabSpace(3)], panes: tabPanes(), focused: { space: "s1", tab: "b1", pane: "p1", cwd: "/r" }, window: win });
const WINDOWS = { platform: "windows", titlebar: "none", buttons: true, maximized: false, fullscreen: false, active: true };
const MACOS = { platform: "macos", titlebar: "none", buttons: false, maximized: false, fullscreen: false, active: true };
// Every svg(...) path in a rendered tree (the host records elements as {kind, args, children, calls}).
function svgPaths(node, out = []) {
  const el = node?.__el;
  if (!el) return out;
  if (el.kind === "svg") out.push(el.args[0]);
  for (const ch of el.children) svgPaths(ch, out);
  for (const call of el.calls) for (const a of call.args) if (a?.__el && !el.children.includes(a)) svgPaths(a, out);
  return out;
}

// ---- window buttons ----

test("windowButtons: none unless the system draws no buttons (macOS keeps its traffic lights)", () => {
  for (const w of [null, undefined, {}, MACOS, { ...WINDOWS, buttons: "yes" }]) assert.deepEqual(windowButtons(w), [], JSON.stringify(w));
  assert.deepEqual(windowButtons(WINDOWS).map((b) => [b.id, b.icon, b.command, b.danger]), [
    ["minimize", "win-min", "window.minimize", false],
    ["maximize", "win-max", "window.maximize", false],
    ["close", "win-close", "window.close", true],
  ]);
  assert.equal(windowButtons({ ...WINDOWS, maximized: true })[1].icon, "win-restore");
  assert.equal(WIN_BUTTON_W, 46);
});

test("tabs: on Windows the row ends with minimize, maximize and close; each runs only its command", async () => {
  const m = await loadMod("mods/apollo-tabs", { data: tabsData(WINDOWS) });
  for (const id of ["win-minimize", "win-maximize", "win-close"]) assert.ok(m.ids().includes(id), id);
  for (const [id, name] of [["win-minimize", "window.minimize"], ["win-maximize", "window.maximize"], ["win-close", "window.close"]]) {
    const before = m.ctx.stopped;
    m.press(id);
    m.click(id);
    assert.equal(m.ctx.stopped, before + 2, `${id}: the press and the click stop, so the drag row never takes them`);
    assert.deepEqual(runs(m).at(-1), { name, args: undefined });
  }
  assert.equal(runs(m).length, 3);
});

test("tabs: maximized shows the restore glyph; every glyph is the mod's own svg", async () => {
  const svgs = (m) => svgPaths(m.tree()).join(" ");
  const m = await loadMod("mods/apollo-tabs", { data: tabsData({ ...WINDOWS, maximized: true }) });
  assert.match(svgs(m), /mods\/apollo-tabs\/win-restore\.svg/);
  assert.doesNotMatch(svgs(m), /win-max\.svg/);
  const n = await loadMod("mods/apollo-tabs", { data: tabsData(WINDOWS) });
  for (const g of ["win-min", "win-max", "win-close"]) assert.match(svgs(n), new RegExp(`mods/apollo-tabs/${g}\\.svg`));
});

test("tabs: macOS and an unknown window draw no window buttons", async () => {
  for (const win of [MACOS, undefined]) {
    const m = await loadMod("mods/apollo-tabs", { data: tabsData(win) });
    assert.ok(!m.ids().some((id) => id.startsWith("win-")), JSON.stringify(win));
  }
});

test("plusAnchor: the window buttons push ⊕ left by their width; without them nothing moves", () => {
  const APOLLO = json("layouts/apollo.json");
  // Root right padding 8 gives way to the buttons group (3 × 46) and the 4 px gap before it.
  assert.deepEqual(plusAnchor({ layout: APOLLO, rootW: 1400, panelsW: 270 }), { x: 1381 - 220, y: 45 });
  assert.deepEqual(plusAnchor({ layout: APOLLO, rootW: 1400, panelsW: 270, buttonsW: 0 }), { x: 1381 - 220, y: 45 });
  assert.deepEqual(plusAnchor({ layout: APOLLO, rootW: 1400, panelsW: 270, buttonsW: 138 }), { x: 1381 + 8 - 138 - 4 - 220, y: 45 });
});

test("window glyphs: 24-grid, stroke only, no image or link", () => {
  for (const g of ["win-min", "win-max", "win-restore", "win-close"]) {
    const s = readFileSync(join(root, "mods/apollo-tabs", `${g}.svg`), "utf8");
    assert.match(s, /<svg\b[^>]*viewBox="0 0 24 24"/, g);
    assert.match(s, /fill="none"/, g);
    assert.match(s, /stroke="currentColor"/, g);
    assert.doesNotMatch(s, /<image|href=/, g);
  }
});

// ---- Windows keymap ----

// SonicTerm on Windows uses alt where macOS uses cmd. ctrl-alt is AltGr on Windows, so those chords move.
// A key mapped to null is dropped on purpose (macOS-only, or taken by Windows).
const EXCEPTIONS = {
  global: {
    "cmd-alt-[": "ctrl-shift-pageup", "cmd-alt-]": "ctrl-shift-pagedown", "cmd-alt-l": "ctrl-shift-l",
    "cmd-alt-left": null, "cmd-alt-right": null, "cmd-alt-up": null, "cmd-alt-down": null,
    "cmd-alt-h": null, "cmd-h": null, "cmd-q": null,
    "cmd-alt-shift-left": "alt-shift-left", "cmd-alt-shift-right": "alt-shift-right",
    "cmd-alt-shift-up": "alt-shift-up", "cmd-alt-shift-down": "alt-shift-down",
  },
  terminal: {
    "alt-backspace": "ctrl-backspace", "alt-left": "ctrl-left", "alt-right": "ctrl-right",
    "cmd-backspace": null, "cmd-v": "ctrl-shift-v",
  },
};
// Windows-only spellings and keys, each paired with the binding whose action it repeats.
const EXTRAS = {
  global: { "alt-{": "alt-shift-[", "alt-}": "alt-shift-]", "alt-?": "alt-shift-/", "alt-shift-?": "alt-shift-/" },
  terminal: { "ctrl-shift-c": "alt-c", "ctrl-insert": "alt-c", "shift-insert": "ctrl-shift-v", "ctrl-shift-f": "alt-f" },
};
const toWindows = (section, key) =>
  key in (EXCEPTIONS[section] ?? {}) ? EXCEPTIONS[section][key] : key.startsWith("cmd-") ? `alt-${key.slice(4)}` : key;

test("keys.windows.json: the same sections as keys.json, and no cmd or AltGr (ctrl-alt) keys", () => {
  const mac = json("user/keys.json"), win = json("user/keys.windows.json");
  assert.deepEqual(Object.keys(win).sort(), Object.keys(mac).sort());
  for (const [section, keys] of Object.entries(win)) {
    for (const k of Object.keys(keys)) {
      assert.doesNotMatch(k, /(^|-)cmd-/, `${section} ${k}`);
      assert.doesNotMatch(k, /^ctrl-alt-|^alt-ctrl-/, `${section} ${k}`);
    }
  }
});

test("keys.windows.json maps every keys.json binding to the same action, or drops it on purpose", () => {
  const mac = json("user/keys.json"), win = json("user/keys.windows.json");
  for (const [section, keys] of Object.entries(mac)) {
    const seen = new Set();
    for (const [k, action] of Object.entries(keys)) {
      const w = toWindows(section, k);
      if (w === null) continue;
      assert.ok(!seen.has(w), `${section}: ${w} maps twice`);
      seen.add(w);
      assert.ok(w in win[section], `keys.windows.json lacks ${w} for ${k} in ${section}`);
      assert.ok(isDeepStrictEqual(win[section][w], action), `${section} ${w}: ${JSON.stringify(win[section][w])} vs ${JSON.stringify(action)}`);
    }
  }
});

test("keys.windows.json adds only the listed Windows extras, each repeating its pair, and keeps them all", () => {
  const mac = json("user/keys.json"), win = json("user/keys.windows.json");
  for (const [section, keys] of Object.entries(win)) {
    const mapped = new Set(Object.keys(mac[section]).map((k) => toWindows(section, k)).filter((k) => k !== null));
    for (const [k, action] of Object.entries(keys)) {
      if (mapped.has(k)) continue;
      const pair = EXTRAS[section]?.[k];
      assert.ok(pair, `unexpected Windows binding ${k} in ${section}`);
      assert.ok(isDeepStrictEqual(action, keys[pair]), `${section} ${k} repeats ${pair}`);
    }
  }
  for (const [section, extras] of Object.entries(EXTRAS)) for (const k of Object.keys(extras)) assert.ok(k in win[section], `${section} ${k}`);
});

// ---- PowerShell hook ----

const PS1 = join(root, "agent/herdr-context.ps1");
// pwsh's absolute path: the hook runs with PATH set to the stub folder only.
const pwsh = (() => {
  const r = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::ProcessPath"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() || null : null;
})();
const WIN = process.platform === "win32";
const NASTY = "\x01\x1b\t\"\\é";

// A PATH dir holding only the requested stubs. On Windows they are .cmd files; elsewhere sh scripts.
function stubs(dir, { herdr = true, hc = true, xs = 8600 } = {}) {
  const payload = join(dir, "skill.txt");
  writeFileSync(payload, `${NASTY}${"x".repeat(xs)}${"中".repeat(200)}${"😀".repeat(50)}\n`);
  const stub = (name, body) => {
    const f = join(dir, WIN ? `${name}.cmd` : name);
    writeFileSync(f, WIN ? `@echo off\r\n${body}\r\n` : `#!/bin/sh\n${body}\n`);
    if (!WIN) chmodSync(f, 0o755);
  };
  if (herdr) stub("herdr-app", WIN ? `if "%1"=="--skill" type "${payload}"` : `[ "$1" = --skill ] && exec cat '${payload}'\nexit 0`);
  if (hc) stub("hc", WIN ? "exit /b 0" : "exit 0");
  return dir;
}

function hook(cli, env, opts) {
  const dir = mkdtempSync(join(tmpdir(), "apollo-test."));
  try {
    stubs(dir, opts);
    const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|HC_|HERDR_)/.test(k)));
    const r = spawnSync(pwsh, ["-NoProfile", "-NonInteractive", "-File", PS1, cli], {
      env: { ...base, PATH: dir, HC_TERMINAL_ID: "t42", ...env }, encoding: "utf8",
    });
    return { code: r.status, out: r.stdout, bytes: Buffer.byteLength(r.stdout ?? ""), err: r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("herdr-context.ps1 exists and mirrors the shell hook's rules", () => {
  const s = readFileSync(PS1, "utf8");
  for (const t of ["HC_TERMINAL_ID", "CLAUDE_CODE_ENTRYPOINT", "'sdk-cli'", "9000", "--skill", "hookSpecificOutput", "additionalContext"]) assert.ok(s.includes(t), t);
});

test("herdr-context.ps1: silent outside Herdr, for other Claude entrypoints and unknown CLIs", { skip: !pwsh && "pwsh is not installed" }, () => {
  const cases = [
    ["no HC_TERMINAL_ID", hook("claude", { HC_TERMINAL_ID: "" })],
    ["herdr-app missing", hook("claude", {}, { herdr: false })],
    ["hc missing", hook("copilot", {}, { hc: false })],
    ["claude-desktop", hook("claude", { CLAUDE_CODE_ENTRYPOINT: "claude-desktop" })],
    ["claude sdk-ts", hook("claude", { CLAUDE_CODE_ENTRYPOINT: "sdk-ts" })],
    ["unknown cli", hook("other", {})],
    ["Claude is case-sensitive", hook("Claude", {})],
  ];
  for (const [name, r] of cases) {
    assert.equal(r.code, 0, `${name}: ${r.err}`);
    assert.equal(r.out, "", name);
  }
});

test("herdr-context.ps1: claude (unset, cli, sdk-cli) and copilot shapes, capped at 9,000 bytes on a whole character", { skip: !pwsh && "pwsh is not installed" }, () => {
  for (const env of [{}, { CLAUDE_CODE_ENTRYPOINT: "cli" }, { CLAUDE_CODE_ENTRYPOINT: "sdk-cli" }]) {
    const r = hook("claude", env);
    assert.equal(r.code, 0, r.err);
    const j = JSON.parse(r.out);
    assert.deepEqual(Object.keys(j), ["hookSpecificOutput"]);
    assert.equal(j.hookSpecificOutput.hookEventName, "SessionStart");
    const text = j.hookSpecificOutput.additionalContext;
    for (const s of ["t42", "`herdr-app --skill`", "`hc --skill`", "\u0001", "\u001b", "\t", '"', "\\", "é"]) assert.ok(text.includes(s), JSON.stringify(s));
    assert.ok(!text.includes("\r") && !text.includes("�"));
    assert.ok(text.endsWith("中") && !text.includes("😀"), "cut inside the 3-byte run");
    assert.ok(r.bytes <= 9001 && r.bytes >= 8990, `bytes ${r.bytes}`);
    assert.ok(r.out.endsWith("\n"));
  }
  const four = JSON.parse(hook("claude", {}, { xs: 8000 }).out).hookSpecificOutput.additionalContext;
  assert.ok(four.endsWith("😀") && !four.includes("�"), "cut inside the 4-byte run");
  const c = hook("copilot", { HERDR_CONTEXT_PROBE: "tok-123" });
  const j = JSON.parse(c.out);
  assert.deepEqual(Object.keys(j), ["additionalContext"]);
  assert.ok(j.additionalContext.includes("tok-123"));
  assert.ok(c.bytes <= 9001);
});
