import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { realExec } from "./helpers/exec.js";

const root = new URL("../", import.meta.url).pathname;
const read = (p) => JSON.parse(readFileSync(`${root}${p}`, "utf8"));

// diffKeys(defaults, keys): {set: {section: {key: value}}, removed: {section: [key]}} across all sections.
function diffKeys(defaults, keys) {
  const set = {}, removed = {};
  for (const section of new Set([...Object.keys(defaults), ...Object.keys(keys)])) {
    const d = defaults[section] ?? {}, k = keys[section] ?? {};
    for (const [key, value] of Object.entries(k)) {
      if (!(key in d) || !isDeepStrictEqual(d[key], value)) (set[section] ??= {})[key] = value;
    }
    const gone = Object.keys(d).filter((key) => !(key in k)).sort();
    if (gone.length) removed[section] = gone;
  }
  return { set, removed };
}

const scroll = (args) => ({ command: "terminal.scroll", args });
// A1 keys table. cmd-shift-l is rebound to pane.go:right (its default layout.switch moves to
// cmd-alt-l), so it is a changed key, not a removed one; only cmd-[ is removed.
const EXPECTED = {
  set: {
    global: {
      "cmd-shift-t": "tab.new",
      "cmd-w": "pane.close",
      "cmd-left": "tab.prev",
      "cmd-right": "tab.next",
      "cmd-shift-z": "pane.zoom",
      "cmd-shift-h": "pane.go:left",
      "cmd-shift-j": "pane.go:down",
      "cmd-shift-k": "pane.go:up",
      "cmd-shift-l": "pane.go:right",
      "cmd-alt-l": "layout.switch",
      "cmd-up": scroll({ lines: -1 }),
      "cmd-down": scroll({ lines: 1 }),
      "cmd-pageup": scroll({ pages: -1 }),
      "cmd-pagedown": scroll({ pages: 1 }),
      "cmd-home": scroll({ to: "top" }),
      "cmd-end": scroll({ to: "bottom" }),
      "cmd-shift-=": "app.zoom_in",
      "cmd-9": "apollo-tabs.last",
    },
    terminal: { "cmd-left": "tab.prev", "cmd-right": "tab.next" },
    // In the Apollo layout, new tabs and spaces go through apollo-tabs, which names them.
    "layout:apollo": { "cmd-t": "apollo-tabs.terminal", "cmd-shift-t": "apollo-tabs.terminal", "cmd-n": "apollo-tabs.space" },
  },
  removed: { global: ["cmd-["] },
};

test("outside the Apollo layout, the global new-tab and new-space keys stay Herdr's", () => {
  const keys = read("user/keys.json");
  assert.equal(keys.global["cmd-t"], "tab.new");
  assert.equal(keys.global["cmd-n"], "space.new");
});

test("diffKeys reports changed, added and removed keys per section", () => {
  const d = { global: { a: "x", b: "y" }, terminal: { c: "z" } };
  const k = { global: { a: "x", b: "Y", n: { command: "c", args: { p: 1 } } }, terminal: {} };
  assert.deepEqual(diffKeys(d, k), {
    set: { global: { b: "Y", n: { command: "c", args: { p: 1 } } } },
    removed: { terminal: ["c"] },
  });
});

test("user/keys.json differs from the Herdr defaults by exactly the A1 table", () => {
  assert.deepEqual(diffKeys(read("data/herdr-default-keys.json"), read("user/keys.json")), EXPECTED);
});

test("layout.switch moved from cmd-shift-l to cmd-alt-l; cmd-[ is unbound", () => {
  const keys = read("user/keys.json");
  assert.equal(read("data/herdr-default-keys.json").global["cmd-shift-l"], "layout.switch");
  assert.notEqual(keys.global["cmd-shift-l"], "layout.switch");
  assert.equal(keys.global["cmd-alt-l"], "layout.switch");
  assert.equal("cmd-[" in keys.global, false);
});

test("terminal cmd-left/right replace the ^A/^E sends", () => {
  const keys = read("user/keys.json");
  assert.equal(keys.terminal["cmd-left"], "tab.prev");
  assert.equal(keys.terminal["cmd-right"], "tab.next");
});

test("every other default is unchanged", () => {
  const defaults = read("data/herdr-default-keys.json"), keys = read("user/keys.json");
  let checked = 0;
  for (const [section, entries] of Object.entries(defaults)) {
    for (const [key, value] of Object.entries(entries)) {
      if (key in (EXPECTED.set[section] ?? {}) || (EXPECTED.removed[section] ?? []).includes(key)) continue;
      assert.deepEqual(keys[section][key], value, `${section} ${key}`);
      checked += 1;
    }
  }
  assert.ok(checked > 50);
});

test("user/keys.json equals the output of scripts/gen-keys.sh", () => {
  const r = realExec("bash", [`${root}scripts/gen-keys.sh`], { cwd: root });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(readFileSync(`${root}user/keys.json`, "utf8"), r.stdout);
});
