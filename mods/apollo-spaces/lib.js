// apollo-spaces: pure logic. No herdr or gpui-kit imports; handlers take injected run/openOverlay.

export const TILE_COLORS = ["ansi4", "ansi5", "ansi6"];
export const foldKeys = { spaces: "apollo.folded", machines: "apollo.machinesFolded" };
const URGENCY = ["blocked", "done", "working"];

// FNV-1a over the id: the same id always picks the same tile color.
export function spaceColor(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return TILE_COLORS[h % TILE_COLORS.length];
}

const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
// WCAG contrast ratio between two #rrggbb colors.
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The space tile's glyph: a remote machine's server, home's house, a git space's repo, else a folder.
export function tileGlyph(s, probed = null) {
  if (s.machine != null) return "server";
  if (s.name === "~") return "home";
  if (s.branch || probed?.repo) return "repo";
  return "folder";
}


// Groups in order: this computer (machine null) first, then remote machines by name.
export function groupByMachine(spaces) {
  const by = new Map();
  for (const s of spaces) {
    const m = s.machine ?? null;
    if (!by.has(m)) by.set(m, []);
    by.get(m).push(s);
  }
  const remote = [...by.keys()].filter((m) => m !== null).sort((a, b) => a.localeCompare(b));
  return [...(by.has(null) ? [null] : []), ...remote].map((machine) => ({
    machine, key: machine ?? "local", label: machine ?? "This computer", spaces: by.get(machine),
  }));
}

export const showHeaders = (groups) => groups.length >= 2;

// The most urgent status: blocked > done > working; idle (or nothing) gives null.
export function urgency(statuses) {
  for (const s of URGENCY) if (statuses.includes(s)) return s;
  return null;
}

export const clickSpace = (space, { run }) => run("space.select", { id: space.id });
export const clickAgent = (agent, { run }) => run("agent.focus", { terminal: agent.address });

export function agentsBySpace(agents) {
  const by = new Map();
  for (const a of agents) {
    if (!by.has(a.space)) by.set(a.space, []);
    by.get(a.space).push(a);
  }
  return by;
}

// The expanded order: spaces in order, then each space's agents. Fold, collapse and search never change it.
export function agentOrder(spaces, agents, _viewState = {}) {
  const by = agentsBySpace(agents);
  return spaces.flatMap((s) => (by.get(s.id) ?? []).map((a) => a.address));
}

// New spaces are unnamed, so the row shows the folder they are in (see spaceLabel).
// The New space button: Herdr's default machine (the focused space's).
export const newSpace = ({ run }) => run("space.new", {});

// "" targets this computer explicitly, which matters while a remote space is active.
export const newSpaceHere = (group, { run }) => run("space.new", { machine: group.machine ?? "" });

// Copies of apollo-tabs' folderName and spaceLabel (mods don't share files): change them together.
// The last folder of a path ("/" or "\\"), "~" at home (any case on Windows); null for none or the root.
export function folderName(cwd, home = "") {
  const trim = (s) => String(s ?? "").replace(/[\\/]+$/, "");
  const path = trim(cwd);
  if (!path) return null;
  const win = /^[a-z]:|\\/i.test(path);
  const h = trim(home);
  if (h && (win ? path.toLowerCase() === h.toLowerCase() : path === h)) return "~";
  return path.split(/[\\/]/).pop() || null;
}

// A space's shown name: the name someone gave it; else the folder it is in now: its active tab's focused
// terminal, else that tab's first terminal with a folder, else any of its terminals; with no terminal
// folder known, Herdr's name. It follows each `cd`.
export function spaceLabel(space, panes, home = "") {
  if (!space) return "";
  if (space.named) return space.name;
  const tabs = space.tabs ?? [];
  const ids = new Set(tabs.map((t) => t.id));
  const own = (panes ?? []).filter((p) => ids.has(p.tab) && p.cwd);
  const activeTab = (tabs.find((t) => t.active) ?? tabs[0])?.id;
  const here = own.filter((p) => p.tab === activeTab);
  const pane = here.find((p) => p.focused) ?? here[0] ?? own[0] ?? null;
  return folderName(pane?.cwd, home) || space.name;
}

// ---- The space menu: this mod's own popup (props.menu "space"), opened by right-clicking a space ----

export const SPACE_MENU_W = 220;
// MENU_FRAME: room for the popup frame around the content, as the machine popup leaves (48 for a 32 px row + 2 × 4).
const MENU_PAD = 4, MENU_TITLE_H = 24, MENU_ROW_H = 30, MENU_GAP = 2, MENU_SEP_H = 1 + 4 + 4, MENU_FRAME = 8;

// A git space: Herdr reports its branch, or the sidebar's probe found a repo (unborn ones too).
const isGitSpace = (space, git = {}, repo = false) => !!(space?.branch || git[space?.id]?.repo || repo);

// The menu's entries, top to bottom: a title, then items and separators. Shortcuts show only on the
// active space (the keys act on it). Move up/down stay inside the space's machine block (Herdr's order);
// the target is the neighbour's index (space.move: 1 = first), else its 1-based place in spaces().
export function spaceMenuItems({ space, spaces = [], git = {}, repo = false, platform = null, panes = null, home = "" }) {
  const id = space.id;
  const keys = !!space.active;
  const item = (key, label, action, extra = {}) => ({ kind: "item", id: key, label, action, enabled: true, ...extra });
  const sep = { kind: "sep" };
  const all = spaces.length ? spaces : [space];
  const block = all.filter((s) => (s.machine ?? null) === (space.machine ?? null));
  const at = block.findIndex((s) => s.id === id);
  const indexOf = (s) => s.index ?? all.indexOf(s) + 1;
  const move = (key, label, to) => (to
    ? item(key, label, { run: "space.move", args: { id, index: indexOf(to) } })
    : item(key, label, null, { enabled: false }));
  return [
    { kind: "title", text: spaceLabel(space, panes ?? [], home) },
    item("rename", "Rename…", { run: "space.rename", args: { id } }, keys ? { shortcut: "Shift+F2" } : {}),
    ...(space.named ? [item("folder-name", "Use folder name", { run: "space.rename", args: { id, name: "" } })] : []),
    sep,
    item("new-tab", "New tab", { run: "tab.new", args: { space: id } }, keys ? { shortcut: platform === "windows" ? "Alt+T" : "⌘T" } : {}),
    ...(isGitSpace(space, git, repo) ? [
      item("new-worktree", "New worktree…", { open: { mod: "worktree", kind: "dialog", props: { space: id, action: "new" } } }),
      item("open-worktree", "Open worktree…", { open: { mod: "worktree", kind: "dialog", props: { space: id, action: "open" } } }),
    ] : []),
    sep,
    move("move-up", "Move up", at > 0 ? block[at - 1] : null),
    move("move-down", "Move down", at >= 0 && at < block.length - 1 ? block[at + 1] : null),
    sep,
    item("close", "Close space…", { run: "space.close", args: { id } }, { danger: true }),
  ];
}

// Padding top and bottom, the title and 30 px rows with a 2 px gap between neighbours, separators
// 1 px with 4 px above and below (no gap next to them). main.js draws exactly this.
export function spaceMenuHeight(entries) {
  let h = MENU_PAD * 2;
  entries.forEach((e, i) => {
    if (e.kind === "sep") { h += MENU_SEP_H; return; }
    h += e.kind === "title" ? MENU_TITLE_H : MENU_ROW_H;
    if (i > 0 && entries[i - 1].kind !== "sep") h += MENU_GAP;
  });
  return h;
}
export const SPACE_MENU = { pad: MENU_PAD, titleH: MENU_TITLE_H, rowH: MENU_ROW_H, gap: MENU_GAP };

// The one selection (an index into the items) after a key: ↓/↑ wrap and skip disabled rows (from none,
// ↓ is the first enabled and ↑ the last); home/end. Null when nothing is enabled.
export function nextSel(rows, sel, key) {
  const on = rows.map((r, i) => (r.enabled ? i : -1)).filter((i) => i >= 0);
  if (!on.length) return null;
  if (key === "home") return on[0];
  if (key === "end") return on.at(-1);
  if (key === "down") return sel === null || sel === undefined ? on[0] : (on.find((i) => i > sel) ?? on[0]);
  if (key === "up") return sel === null || sel === undefined ? on.at(-1) : (on.findLast((i) => i < sel) ?? on.at(-1));
  return sel ?? null;
}

// A letter jumps to the next enabled row whose label starts with it, after the selection, cycling.
export function letterSel(rows, sel, ch) {
  const c = String(ch ?? "").toLowerCase();
  if (!c) return sel ?? null;
  const from = sel === null || sel === undefined ? -1 : sel;
  for (let k = 1; k <= rows.length; k++) {
    const i = (from + k) % rows.length;
    if (rows[i].enabled && rows[i].label.toLowerCase().startsWith(c)) return i;
  }
  return sel ?? null;
}

// Closes the menu first, then acts; a disabled item does nothing.
export function runSpaceItem(item, overlay, { run, openOverlay, closeOverlay }) {
  if (!item?.enabled || !item.action) return;
  closeOverlay(overlay);
  if (item.action.run) run(item.action.run, item.action.args);
  else if (item.action.open) openOverlay(item.action.open);
}

// Opens this mod's space menu at the pointer, sized to its items. `repo` carries the sidebar's probe.
export function spaceMenu(space, { openOverlay }, { spaces = [], git = {}, platform = null, panes = null, home = "" } = {}) {
  const entries = spaceMenuItems({ space, spaces, git, platform, panes, home });
  return openOverlay({ mod: "apollo-spaces", kind: "popup", width: SPACE_MENU_W, height: spaceMenuHeight(entries) + MENU_FRAME,
    props: { menu: "space", space: space.id, repo: isGitSpace(space, git) } });
}

export const machineMenu = (group, { openOverlay }) =>
  openOverlay({ mod: "apollo-spaces", kind: "popup", width: 200, height: 48, props: { menu: "machine", machine: group.machine ?? null } });

// ---- A08: search, width guard, view model ----

export const MIN_PX = 184, MAX_PX = 480, COLLAPSE_BELOW = 220;
// P1 (wiki/Herdr-Notes.md): at zoom 1 the root on_size_change width equals the layout px; whether
// it is design px or design×zoom at other zooms is unresolved, so this stays one constant.
export const SIZE_IS_ZOOMED = false;

export function designWidth(observed, zoom = 1, zoomed = SIZE_IS_ZOOMED) {
  if (observed === undefined || observed === null) return undefined;
  return zoomed ? observed / (zoom || 1) : observed;
}

export const isCollapsed = (width) => width !== undefined && width !== null && width < COLLAPSE_BELOW;
export const clamp = (px) => Math.min(MAX_PX, Math.max(MIN_PX, Math.round(px)));

// Case-insensitive name filter; machine groups left empty disappear. "" keeps every row.
export function filterSpaces(groups, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({ ...g, spaces: g.spaces.filter((s) => s.name.toLowerCase().includes(q)) }))
    .filter((g) => g.spaces.length > 0);
}

function findLayoutNode(n, id) {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) { const r = findLayoutNode(c, id); if (r) return r; }
  return null;
}

// The width the guard checks. layout.resize stores any px (100 stays 100 in .state and layout()) while
// Herdr renders the node at its layout min, so the observed width alone can look in range. An
// out-of-range observed width wins; else an out-of-range stored px; else the observed width.
export function guardTarget(observed, layout) {
  const stored = findLayoutNode(layout, "sidebar")?.size?.px;
  const out = (w) => typeof w === "number" && (w < MIN_PX || w > MAX_PX);
  if (out(observed)) return observed;
  if (out(stored)) return stored;
  return observed ?? (typeof stored === "number" ? stored : undefined);
}

// Runs layout.resize once per out-of-range observed width (a drag, another tool, an old state file).
export function guardWidth(width, st, { run }) {
  if (width === undefined || width === null) return;
  const w = width; // the raw value: 183.6 is out of range and resizes to 184
  if (w >= MIN_PX && w <= MAX_PX) { st.last = undefined; return; }
  if (st.last === w) return;
  st.last = w;
  run("layout.resize", { id: "sidebar", px: clamp(w) });
}

const MARKS = { working: "arc", blocked: "diamond", done: "check" };
const node = (kind, attrs = {}, children = []) => ({ kind, attrs, children });

function mark(status, active) {
  const kind = MARKS[status];
  if (!kind) return null;
  return node(kind, { color: active ? "solid_foreground" : status, ...(status === "working" ? { spin: 900 } : {}) });
}

function agentRow(a) {
  const m = mark(a.status, false);
  return node("agent", {
    id: `agent-${a.address}`, address: a.address, title: a.title, focused: a.focused,
    fill: a.focused ? "raised" : null, color: a.focused ? "foreground" : "muted",
    ...(({ icon, tint, color }) => ({ icon, tint, iconColor: color }))(agentIcon(a.program)),
  }, [...(a.pinned ? [node("pin", { color: "dim" })] : []), ...(m ? [m] : [])]);
}

function spaceNode(s, agents, { collapsed, folded, git = {} }) {
  const active = !!s.active;
  const fg = active ? "solid_foreground" : "foreground";
  const m = mark(urgency([s.status, ...agents.map((a) => a.status)]), active);
  const row = node("row", {
    id: `space-${s.id}`, spaceId: s.id, active, fill: active ? "accent" : null, hover: "raised", height: collapsed ? 32 : 44,
  }, [
    // A fold chevron only when there is something to fold (agents).
    ...(collapsed || !agents.length ? [] : [node("chevron", { id: `fold-${s.id}`, folded: !!folded[s.id], color: active ? "solid_foreground" : "dim" })]),
    node("tile", { color: spaceColor(s.id), glyph: tileGlyph(s, git[s.id]), ring: active ? 1.5 : 0, textColor: "solid_foreground" }),
    node("name", { text: s.name, color: fg }),
    // Git spaces show their branch (Herdr's, else the probed one: unborn repos too); other folders show the name alone.
    ...(collapsed || !branchOf(s, git) ? [] : [node("branch", { text: branchOf(s, git), color: active ? "solid_foreground" : "dim" })]),
    ...(m ? [m] : []),
  ]);
  const showAgents = !collapsed && !folded[s.id];
  return node("space", { spaceId: s.id }, [row, ...(showAgents ? agents.map(agentRow) : [])]);
}

const branchOf = (s, git) => s.branch || (git[s.id]?.repo ? git[s.id].branch : null) || null;

// git --no-optional-locks symbolic-ref --short HEAD (works on an unborn branch), else a short sha (detached
// HEAD), else not a repo. Runs where the space lives ({on}).
export async function probeGit(cwd, on, exec) {
  if (!cwd) return { repo: false, branch: null };
  const git = (...a) => exec("git", ["--no-optional-locks", ...a], { cwd, on: on ?? null }).catch(() => ({ code: 1, stdout: "" }));
  const ref = await git("symbolic-ref", "--short", "HEAD");
  if (ref.code === 0 && ref.stdout.trim()) return { repo: true, branch: ref.stdout.trim() };
  const sha = await git("rev-parse", "--short", "HEAD");
  if (sha.code === 0 && sha.stdout.trim()) return { repo: true, branch: sha.stdout.trim() };
  return { repo: false, branch: null };
}

// Where a space's git branch is read: its first pane's live folder, else the space folder.
export function spaceCwd(space, panes) {
  const tabs = new Set((space.tabs ?? []).map((t) => t.id));
  const p = (panes ?? []).find((x) => tabs.has(x.tab) && x.cwd);
  return p?.cwd || space.folder || null;
}

// The spaces block as a view-model tree. main.js maps each node kind to gpui-kit elements.
export function spacesView({ spaces, agents = [], collapsed = false, folded = {}, machinesFolded = {}, query = "", searchOpen = false, git = {}, panes = null, home = "" }) {
  // Rows, search and the home tile use each space's shown name (the folder it is in now, see spaceLabel).
  if (panes) spaces = spaces.map((s) => ({ ...s, name: spaceLabel(s, panes, home) }));
  const searching = searchOpen && !collapsed;
  // While a query is active, folds are ignored so every match shows.
  const filtering = searching && String(query ?? "").trim() !== "";
  const groups = filterSpaces(groupByMachine(spaces), searching ? query : "");
  const headers = showHeaders(groups);
  const by = agentsBySpace(agents);
  const children = [];
  if (searching) children.push(node("search-field", { id: "search-field", query }));
  children.push(node("new-space", { id: "new-space", label: "New space" }, [node("plus", { size: 16 })]));
  for (const g of groups) {
    const gk = [];
    // A machine fold applies only while its header (and so its unfold chevron) is rendered.
    const mFolded = !collapsed && headers && !filtering && !!machinesFolded[g.key];
    if (headers) {
      gk.push(node("machine", { id: `machine-${g.key}`, machine: g.machine, label: g.label, height: collapsed ? 20 : 24 },
        collapsed ? [node("machine-name", { text: g.label })] : [
          node("chevron", { id: `fold-machine-${g.key}`, folded: mFolded, color: "dim" }),
          node("machine-name", { text: g.label }),
          node("machine-count", { text: String(g.spaces.length) }),
        ]));
    }
    if (!mFolded) for (const s of g.spaces) gk.push(spaceNode(s, by.get(s.id) ?? [], { collapsed, folded: filtering ? {} : folded, git }));
    children.push(node("group", { key: g.key }, gk));
  }
  return node("spaces", { collapsed }, children);
}

// Claude Code shows Apollo's own star in Claude orange; other programs keep Herdr's icon. Copies of this
// live in apollo-spaces, apollo-tabs and apollo-pane (mods don't share files): change them together.
export const CLAUDE_ORANGE = "#d97757";
export function agentIcon(prog) {
  if (prog?.key === "claude") return { icon: "mods/apollo-spaces/star.svg", tint: true, color: CLAUDE_ORANGE };
  return { icon: prog?.icon ?? null, tint: !!prog?.tint, color: null };
}
