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

export function monogram(name) {
  const letters = [...String(name ?? "")].filter((c) => /[\p{L}\p{N}]/u.test(c));
  return (letters.length ? letters.slice(0, 2).join("") : String(name ?? "").slice(0, 2)).toUpperCase();
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

// "" targets this computer explicitly, which matters while a remote space is active.
export const newSpaceHere = (group, { run }) => run("space.new", { machine: group.machine ?? "" });

export const spaceMenu = (space, { openOverlay }) =>
  openOverlay({ mod: "menu", kind: "popup", props: { tab: "space", target: { space: space.id } } });

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
    icon: a.program?.icon ?? null, tint: !!a.program?.tint,
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
    node("tile", { color: spaceColor(s.id), text: monogram(s.name), ring: active ? 1.5 : 0, textColor: "solid_foreground" }),
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
export function spacesView({ spaces, agents = [], collapsed = false, folded = {}, machinesFolded = {}, query = "", searchOpen = false, git = {} }) {
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
