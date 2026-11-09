// Sidebar fixture data shaped like herdr.d.ts SpaceInfo / AgentInfo (A07, A08, A10).
const tab = (id, active = true) => ({ id, index: 1, name: "1", named: false, active, status: null, panes: 1,
  zoomed: false, settled: false, settled_at: null, changed_at: null, working_since: null });
const program = (key) => ({ key, name: key, icon: `icons/${key}.svg`, tint: true, tile: null, color: null, shell: false, agent: true });

export function sidebarSpaces({ active = "s1" } = {}) {
  const sp = (id, name, machine, branch, status) => ({ id, index: 0, name, named: false, folder: "", machine, branch,
    active: id === active, status, tabs: [tab(`${id}-b1`)] });
  return [
    sp("s1", "dot-configs", null, "main", "blocked"),
    sp("s2", "herdr-config", null, "feat/v0.0.1", "done"),
    sp("devbox/s3", "api", "devbox", "dev", "working"),
  ].map((s, i) => ({ ...s, index: i + 1 }));
}

export function sidebarAgents() {
  const ag = (address, space, status, extra = {}) => ({ address, pane: `p-${address}`, space, space_name: space,
    tab: `${space}-b1`, tab_index: 1, tab_name: "1", status, app: "claude-code", program: program("claude"),
    title: `agent ${address}`, seq: 1, pinned: false, focused: false, ...extra });
  // Deliberately not in space order.
  return [ag("t7", "s2", "done"), ag("t1", "s1", "working", { focused: true }), ag("t2", "s1", "blocked", { pinned: true })];
}
