#!/usr/bin/env node
// A23: runs one mod lib handler with recording stubs and prints each `run` call as
//   herdr-app do <name> '<json>'
// so scripts/smoke.sh drives the live app with exactly what the mod would do. setShared calls are
// printed as `# setShared <key> <json>` comments. Any openOverlay or notify call is not a command:
// it exits 2 (fail closed).
//   emit.mjs panelClick <files|changes|specs> [--from-state <apollo.json>]
//   emit.mjs collapse <observed px> <zoom> | expand <saved px> | openSpec <file> [on]
//   emit.mjs workOnIt <spec path> | spaceMenu <space id>
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as tabs from "../../mods/apollo-tabs/lib.js";
import * as chrome from "../../mods/apollo-chrome/lib.js";
import * as specs from "../../mods/apollo-specs/lib.js";
import * as spaces from "../../mods/apollo-spaces/lib.js";

const calls = [];
const rec = {
  run: (name, args) => { calls.push({ fn: "run", name, args }); return null; },
  setShared: (key, value) => { calls.push({ fn: "setShared", name: key, args: value }); return null; },
  openOverlay: (spec) => { calls.push({ fn: "openOverlay", args: spec }); return "o"; },
  notify: (n) => { calls.push({ fn: "notify", args: n }); return null; },
};
const die = (msg) => { console.error(`emit: ${msg}`); process.exit(2); };
const [, , handler, ...a] = process.argv;
const home = process.env.HERDR_APP_HOME || join(homedir(), ".config/herdr-app");

function readState(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

switch (handler) {
  case "panelClick": {
    const child = a[0];
    if (!["files", "changes", "specs"].includes(child)) die(`panelClick needs files|changes|specs, got ${child}`);
    const i = a.indexOf("--from-state");
    const path = i >= 0 ? a[i + 1] : join(home, "layouts/.state/apollo.json");
    tabs.panelClick(child, tabs.panelState({ layout: null, state: readState(path) }), rec);
    break;
  }
  case "collapse": chrome.collapse({ observed: Number(a[0]), zoom: Number(a[1] ?? 1) }, rec); break;
  case "expand": chrome.expand({ saved: a[0] === undefined ? undefined : Number(a[0]) }, rec); break;
  case "openSpec": specs.openSpec({ file: a[0] }, a[1] ?? null, rec); break;
  case "workOnIt": specs.workOnIt({ path: a[0] }, { space: { id: "s" }, repo: "/r", agents: [] }, rec); break;
  case "spaceMenu": spaces.spaceMenu({ id: a[0] }, rec); break;
  default: die(`unknown handler: ${handler}`);
}

for (const c of calls) if (c.fn === "openOverlay" || c.fn === "notify") die(`not a command: ${c.fn}`);
for (const c of calls) {
  const json = JSON.stringify(c.args ?? {});
  if (json.includes("'")) die(`cannot quote ${json}`);
  if (c.fn === "setShared") console.log(`# setShared ${c.name} ${json}`);
  else console.log(`herdr-app do ${c.name} '${json}'`);
}
