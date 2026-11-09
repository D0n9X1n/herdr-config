import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptPlusMenu } from "../scripts/shot-accept.mjs";

// P5: `herdr-app status .overlays` is an array of bare strings, each the overlay's mod name.
const base = { overlays: ["apollo-tabs"], field: "self", png: { mtimeMs: 2000, sha: "new" }, promptMs: 1000, earlierShas: ["old"] };

test("a fresh capture with the apollo-tabs overlay is accepted", () => {
  assert.deepEqual(acceptPlusMenu(base), { ok: true, reason: "ok" });
});
test("an unrelated overlay ({mod: menu}) is rejected: overlay", () => {
  assert.deepEqual(acceptPlusMenu({ ...base, overlays: ["menu"] }), { ok: false, reason: "overlay" });
  assert.deepEqual(acceptPlusMenu({ ...base, overlays: [{ mod: "menu" }], field: "mod" }), { ok: false, reason: "overlay" });
  assert.deepEqual(acceptPlusMenu({ ...base, overlays: [] }), { ok: false, reason: "overlay" });
});
test("a file older than the prompt is rejected: stale", () => {
  assert.deepEqual(acceptPlusMenu({ ...base, png: { mtimeMs: 999, sha: "new" } }), { ok: false, reason: "stale" });
});
test("an earlier sha is rejected: stale", () => {
  assert.deepEqual(acceptPlusMenu({ ...base, png: { mtimeMs: 2000, sha: "old" } }), { ok: false, reason: "stale" });
});
test("with no identifying field, (b) alone decides", () => {
  assert.deepEqual(acceptPlusMenu({ ...base, overlays: ["menu"], field: null }), { ok: true, reason: "ok" });
  assert.deepEqual(acceptPlusMenu({ ...base, overlays: ["menu"], field: null, png: { mtimeMs: 1, sha: "new" } }), { ok: false, reason: "stale" });
});
test("an object field names the mod", () => {
  assert.equal(acceptPlusMenu({ ...base, overlays: [{ mod: "apollo-tabs" }], field: "mod" }).ok, true);
});
