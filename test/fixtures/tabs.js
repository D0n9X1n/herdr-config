// Tabs fixture data shaped like herdr.d.ts SpaceInfo / TabInfo / PaneInfo (A11-A13, A19).
const program = (key, name, agent = false) => ({ key, name, icon: `icons/${key}.svg`, tint: true, tile: null, color: null, shell: !agent, agent });

export function tabSpace(n = 3, { machine = null, id = "s1", activeIndex = 0 } = {}) {
  const tabs = Array.from({ length: n }, (_, i) => ({
    id: `b${i + 1}`, index: i + 1, name: i === 1 ? "fix login" : String(i + 1), named: i === 1,
    active: i === activeIndex, status: i === 0 ? "working" : null, panes: 2, zoomed: false,
    settled: false, settled_at: null, changed_at: null, working_since: null,
  }));
  return { id, index: 1, name: "dot-configs", named: false, folder: "/w/dot-configs", machine, branch: "main", active: true, status: null, tabs };
}

export function tabPanes() {
  const pane = (pane, tab, prog, status = null) => ({ pane, terminal: `t-${pane}`, tab, title: prog.name, cwd: "/w", branch: "main",
    status, app: null, program: prog, focused: false, zoomed: false, movable: true });
  return [
    pane("p1", "b1", program("zsh", "zsh")),
    pane("p2", "b1", program("claude", "Claude Code", true), "working"),
    pane("p3", "b2", program("nvim", "Neovim")),
    pane("p4", "b3", program("zsh", "zsh")),
  ];
}
