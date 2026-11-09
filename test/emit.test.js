import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { realExec } from "./helpers/exec.js";
import { tempDir } from "./helpers/fixtures.js";

const root = new URL("../", import.meta.url).pathname;
const EMIT = join(root, "scripts/smoke/emit.mjs");
const emit = (...args) => realExec("node", [EMIT, ...args]);
const lines = (r) => r.stdout.split("\n").filter(Boolean);

function withState(panel, fn) {
  const t = tempDir();
  try {
    const p = join(t.dir, "apollo.json");
    if (panel !== undefined) writeFileSync(p, JSON.stringify({ nodes: panel === null ? {} : { panel } }));
    return fn(p);
  } finally {
    t.cleanup();
  }
}

test("panelClick reads .state (P4 paths over the layout defaults) and prints herdr-app do lines", () => {
  withState(null, (p) => {
    assert.deepEqual(lines(emit("panelClick", "changes", "--from-state", p)), [
      `herdr-app do layout.select '{"stack":"panel","child":"changes"}'`,
      `herdr-app do layout.show '{"id":"panel"}'`,
    ]);
  });
  withState({ hidden: false }, (p) => {
    assert.deepEqual(lines(emit("panelClick", "specs", "--from-state", p)), [`herdr-app do layout.select '{"stack":"panel","child":"specs"}'`]);
  });
  withState({ hidden: false, active: "specs" }, (p) => {
    assert.deepEqual(lines(emit("panelClick", "specs", "--from-state", p)), [`herdr-app do layout.hide '{"id":"panel"}'`]);
  });
  withState(undefined, (p) => {
    assert.deepEqual(lines(emit("panelClick", "files", "--from-state", p)), [
      `herdr-app do layout.select '{"stack":"panel","child":"files"}'`,
      `herdr-app do layout.show '{"id":"panel"}'`,
    ]);
  });
});

test("collapse saves the width (as a comment) and resizes to 184; expand restores the saved width", () => {
  const c = emit("collapse", "300", "1");
  assert.equal(c.code, 0, c.stderr);
  assert.deepEqual(lines(c), [`# setShared apollo.sidebar.width 300`, `herdr-app do layout.resize '{"id":"sidebar","px":184}'`]);
  assert.deepEqual(lines(emit("expand", "300")), [`herdr-app do layout.resize '{"id":"sidebar","px":300}'`]);
  assert.deepEqual(lines(emit("expand", "100")), [`herdr-app do layout.resize '{"id":"sidebar","px":256}'`]);
});

test("openSpec prints the viewer split", () => {
  assert.deepEqual(lines(emit("openSpec", "/private/tmp/apollo-test.x/docs/specs/pending/x.md")), [
    `herdr-app do pane.split '{"direction":"right","mod":"apollo-specs","props":{"file":"/private/tmp/apollo-test.x/docs/specs/pending/x.md","on":null}}'`,
  ]);
});

test("fails closed: an overlay or notify is not a command (exit 2); unknown handlers exit 2", () => {
  const n = emit("workOnIt", "docs/specs/pending/x.md");
  assert.equal(n.code, 2);
  assert.match(n.stderr, /not a command: notify/);
  const o = emit("spaceMenu", "s1");
  assert.equal(o.code, 2);
  assert.match(o.stderr, /not a command: openOverlay/);
  assert.equal(emit("nope").code, 2);
});
