import { test } from "node:test";
import assert from "node:assert/strict";
import { statusModel } from "../mods/apollo-status/lib.js";

const sp = (id, machine, branch, active) => ({ id, machine, branch, active, name: id, tabs: [] });
const ag = (address, status) => ({ address, status });

test("local active space: This computer, its branch, agent and blocked counts across all spaces", () => {
  const m = statusModel([sp("s1", null, "main", true), sp("devbox/s2", "devbox", "dev", false)],
    [ag("t1", "working"), ag("t2", "blocked"), ag("devbox/t3", "blocked"), ag("t4", "idle")]);
  assert.deepEqual(m, {
    machine: "This computer", branch: "main", agents: 4, blocked: 2,
    blockedColor: "blocked", hint: "⌘⇧P commands", text: { agents: "4 agents", blocked: "2 blocked" },
  });
});

test("remote active space shows the machine name; no branch, no agents", () => {
  const m = statusModel([sp("s1", null, "main", false), sp("devbox/s2", "devbox", null, true)], []);
  assert.equal(m.machine, "devbox");
  assert.equal(m.branch, null);
  assert.deepEqual([m.agents, m.blocked, m.text.agents, m.text.blocked], [0, 0, "0 agents", "0 blocked"]);
  assert.equal(m.blockedColor, "dim");
  assert.equal(statusModel([], []).machine, "This computer");
  assert.equal(statusModel([sp("s", null, null, true)], [ag("t", "done")]).text.agents, "1 agent");
});
