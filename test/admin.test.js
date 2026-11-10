// Windows admin mark (#6): when herdr-core, which starts every terminal, runs elevated, every local
// tab pill starts with a red shield. Paths go through fileURLToPath, so this file also runs on Windows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMod } from "./helpers/host.js";
import { flush } from "./helpers/fakes.js";
import { tabSpace, tabPanes } from "./fixtures/tabs.js";
import { elevation, checkElevation, showAdmin, ADMIN_CHECK, ADMIN_EVERY } from "../mods/apollo-tabs/lib.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const settle = async (m) => { for (let i = 0; i < 5; i++) await flush(); m.render(); };

// `whoami /groups` output, trimmed: the label text is localized, the SID is not.
const groups = (sid, label = "Mandatory Label\\High Mandatory Level") =>
  `GROUP INFORMATION\r\n-----------------\r\n\r\nEveryone   Well-known group S-1-1-0   Mandatory group\r\n${label}   Label   ${sid}\r\n`;
const HIGH = groups("S-1-16-12288");
const MEDIUM = groups("S-1-16-8192", "Mandatory Label\\Medium Mandatory Level");
const WINDOWS = { platform: "windows", titlebar: "none", buttons: true, maximized: false, fullscreen: false, active: true };
const MACOS = { platform: "macos", titlebar: "none", buttons: false, maximized: false, fullscreen: false, active: true };

// An hc stub: each `hc exec whoami /groups` call returns the next answer (the last one repeats).
function core(...answers) {
  const calls = [];
  const ex = async (cmd, args = []) => {
    calls.push([cmd, ...args].join(" "));
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    return typeof a === "string" ? { code: 0, stdout: a, stderr: "" } : a;
  };
  ex.calls = calls;
  return ex;
}
const data = (win, space = {}) => ({ spaces: [tabSpace(3, space)], panes: tabPanes(), window: win });
const pills = (m) => m.ids().filter((id) => /^tab-b\d+$/.test(id));
// The first child of a pill element, as recorded by the test host.
const firstChild = (m, id) => {
  let found = null;
  (function go(n) {
    const el = n?.__el;
    if (!el || found) return;
    if (el.id === id) { found = el.children[0]?.__el ?? null; return; }
    for (const c of el.children) go(c);
    for (const call of el.calls) for (const a of call.args) if (a?.__el) go(a);
  })(m.tree());
  return found;
};
const isShield = (el) => el?.kind === "svg" && el.args[0] === "mods/apollo-tabs/admin.svg";

test("elevation: High or System integrity is elevated, Medium or Low is normal, anything else unknown", () => {
  assert.equal(elevation(HIGH), "elevated");
  assert.equal(elevation(groups("S-1-16-16384")), "elevated");
  assert.equal(elevation(MEDIUM), "normal");
  assert.equal(elevation(groups("S-1-16-4096")), "normal");
  // Localized label text: only the SID counts.
  assert.equal(elevation(groups("S-1-16-12288", "Mandatory Label\\Hohe Verbindlichkeitsstufe")), "elevated");
  for (const s of ["", "garbage", null, undefined, "S-1-16-122880", "S-1-16-81920"]) assert.equal(elevation(s), "unknown", String(s));
});

test("checkElevation asks herdr-core with a timeout and never throws", async () => {
  assert.deepEqual(ADMIN_CHECK, ["exec", "--timeout", "5", "whoami", "/groups"]);
  const seen = [];
  assert.equal(await checkElevation(async (args) => { seen.push(args); return { code: 0, stdout: HIGH, stderr: "" }; }), "elevated");
  assert.deepEqual(seen, [ADMIN_CHECK]);
  assert.equal(await checkElevation(async () => ({ code: 1, stdout: HIGH, stderr: "" })), "unknown");
  assert.equal(await checkElevation(async () => { throw new Error("no core"); }), "unknown");
  assert.equal(ADMIN_EVERY, 30000);
});

test("showAdmin: only an elevated core and a tab on this computer", () => {
  assert.equal(showAdmin("elevated", { machine: null }), true);
  for (const [state, space] of [["elevated", { machine: "vps" }], ["normal", { machine: null }], ["unknown", { machine: null }], ["elevated", null]]) {
    assert.equal(showAdmin(state, space), false, `${state} ${JSON.stringify(space)}`);
  }
});

test("tabs: on Windows with an elevated core every local pill starts with the red shield", async () => {
  const ex = core(HIGH);
  const m = await loadMod("mods/apollo-tabs", { data: data(WINDOWS), exec: ex });
  await settle(m);
  assert.deepEqual(ex.calls, ["hc exec --timeout 5 whoami /groups"]);
  assert.equal(pills(m).length, 3);
  for (const id of pills(m)) {
    const first = firstChild(m, id);
    assert.ok(isShield(first), `${id} starts with the shield`);
    const color = first.calls.find((c) => c.name === "text_color")?.args[0];
    assert.equal(color, "#fb4934", "the shield is red (blocked)");
  }
});

test("tabs: no shield for a normal or unknown core, a remote space, or macOS (which never asks)", async () => {
  for (const [name, d, ex] of [
    ["medium", data(WINDOWS), core(MEDIUM)],
    ["core rejects", data(WINDOWS), core(new Error("no core"))],
    ["nonzero exit with a High SID", data(WINDOWS), core({ code: 1, stdout: HIGH, stderr: "failure" })],
    ["remote space", data(WINDOWS, { machine: "vps" }), core(HIGH)],
    ["macos", data(MACOS), core(HIGH)],
  ]) {
    const m = await loadMod("mods/apollo-tabs", { data: d, exec: ex });
    await settle(m);
    for (const id of pills(m)) assert.ok(!isShield(firstChild(m, id)), `${name}: ${id}`);
    if (name === "macos") assert.deepEqual(ex.calls, [], "no hc call off Windows");
  }
});

test("tabs: the check repeats, so a restarted core moves the mark both ways; the + popup never asks", async () => {
  const ex = core(MEDIUM, HIGH, MEDIUM);
  const m = await loadMod("mods/apollo-tabs", { data: data(WINDOWS), exec: ex });
  await settle(m);
  assert.deepEqual(m.ctx.timer.intervals(), [ADMIN_EVERY]);
  assert.ok(!isShield(firstChild(m, "tab-b1")));
  m.ctx.timer.tick();
  await settle(m);
  assert.ok(isShield(firstChild(m, "tab-b1")), "elevated after the core restarted as admin");
  m.ctx.timer.tick();
  await settle(m);
  assert.ok(!isShield(firstChild(m, "tab-b1")), "gone again after a normal restart");
  assert.equal(ex.calls.length, 3);

  const popup = core(HIGH);
  await loadMod("mods/apollo-tabs", { data: data(WINDOWS), exec: popup, props: { menu: "plus", space: "s1" } });
  assert.deepEqual(popup.calls.filter((c) => c.startsWith("hc ")), []);
});

test("admin glyph: an original 24-grid shield, stroke only, no image or link", () => {
  const s = readFileSync(join(root, "mods/apollo-tabs/admin.svg"), "utf8");
  assert.match(s, /<svg\b[^>]*viewBox="0 0 24 24"/);
  assert.match(s, /fill="none"/);
  assert.match(s, /stroke="currentColor"/);
  assert.doesNotMatch(s, /<image|href=/);
  const w = Number(/stroke-width="([\d.]+)"/.exec(s)?.[1]);
  assert.ok(w >= 2 && w <= 4, `stroke-width ${w}`);
});
