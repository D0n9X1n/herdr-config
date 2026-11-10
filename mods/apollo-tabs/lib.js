// apollo-tabs: pure logic. No herdr or gpui-kit imports; handlers take injected run/openOverlay.

export const activeSpace = (spaces) => (spaces ?? []).find((s) => s.active) ?? null;

// One pill per tab of the space: icon from the tab's agent pane, else its first pane.
// A tab nobody named is called by its program's name; a shell by its folder, never its number.
export function tabPills(space, panes, { home = "" } = {}) {
  if (!space) return [];
  return space.tabs.map((t) => {
    const own = (panes ?? []).filter((p) => p.tab === t.id);
    const shown = own.find((p) => p.program?.agent || p.status) ?? own[0] ?? null;
    const prog = shown?.program ?? null;
    const auto = prog && !prog.shell ? prog.name : (folderName(shown?.cwd, home) ?? prog?.name);
    return {
      id: t.id, active: !!t.active, status: t.status ?? null,
      label: t.named ? t.name : (auto ?? t.name),
      icon: prog?.icon ?? null, tint: !!prog?.tint,
    };
  });
}

// ---- Names for new tabs and spaces ----
// Herdr calls a tab nobody named by its number; Apollo names each tab it makes. apollo-spaces and
// apollo-specs keep copies of folderName / uniqueName (mods don't share files): change them together.

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

// base, else "base 2", "base 3", ... : the first not taken.
export function uniqueName(base, taken) {
  const used = new Set(taken ?? []);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

// A new tab's name in space: the agent's name, else the folder of the space's focused pane (else its
// first pane, else the space folder), else "Terminal"; unique among the space's tab names.
export function newTabName(space, panes, { home = "", agent = null } = {}) {
  const ids = new Set((space?.tabs ?? []).map((t) => t.id));
  const own = (panes ?? []).filter((p) => ids.has(p.tab));
  const pane = own.find((p) => p.focused) ?? own[0] ?? null;
  const base = agent ?? folderName(pane?.cwd, home) ?? folderName(space?.folder, home) ?? "Terminal";
  return uniqueName(base, (space?.tabs ?? []).map((t) => t.name));
}

export const selectTab = (tab, { run }) => run("tab.select", { id: tab.id });
export const closeTab = (tab, { run }) => run("tab.close", { id: tab.id });

export function onWheel(dy, { run }) {
  if (dy > 0) run("tab.next");
  else if (dy < 0) run("tab.prev");
}

// nextCommand() handler. Returns whether it handled c.
// `last` selects the active space's last tab by id. `terminal` and `space` (the Apollo layout's new-tab and
// new-space keys) make a named tab, or a space whose first tab is named.
export function handleCommand(c, spaces, { run }, { panes = [], home = "", cwd = null } = {}) {
  const sp = activeSpace(spaces);
  if (c === "terminal") {
    const name = newTabName(sp, panes, { home });
    run("tab.new", sp ? { space: sp.id, name } : { name });
    return true;
  }
  if (c === "space") {
    // The new space starts in the focused terminal's folder (focused().cwd), so its first tab is called after it.
    const here = cwd ?? (panes ?? []).find((p) => p.focused)?.cwd;
    run("space.new", { tab: folderName(here, home) ?? "Terminal" });
    return true;
  }
  if (c !== "last") return false;
  const last = sp?.tabs?.[sp.tabs.length - 1];
  if (!last) return false;
  run("tab.select", { id: last.id });
  return true;
}

// ---- A12: + menu ----

const node = (kind, attrs = {}, children = []) => ({ kind, attrs, children });

// The agents people can start on the space's machine; uninstalled ones are dropped here.
export async function loadAgents(space, knownAgents) {
  try {
    const list = await knownAgents({ on: space?.machine ?? null });
    return (list ?? []).filter((a) => a.installed === true);
  } catch {
    return [];
  }
}

// Terminal ⌘T, "Start an agent" (installed only; omitted when none), New space ⌘N, New worktree…, Open worktree….
export function plusMenu(agents) {
  const installed = (agents ?? []).filter((a) => a.installed === true);
  const item = (id, label, extra = {}) => node("item", { id, label, ...extra });
  return node("plus-menu", {}, [
    item("terminal", "Terminal", { shortcut: "⌘T", action: "terminal" }),
    ...(installed.length ? [node("agent-section", { label: "Start an agent" }, installed.map((a) =>
      item(`agent-${a.key}`, a.name, { action: "agent", run: a.run, icon: a.icon ?? null, tint: !!a.tint })))] : []),
    item("new-space", "New space", { shortcut: "⌘N", action: "space" }),
    item("new-worktree", "New worktree…", { action: "worktree", worktree: "new" }),
    item("open-worktree", "Open worktree…", { action: "worktree", worktree: "open" }),
  ]);
}

// Tabs and spaces made here are named (see newTabName); ctx is { panes, home, cwd: focused().cwd }.
export function pickPlus(item, space, { run, openOverlay }, { panes = [], home = "", cwd = null } = {}) {
  const a = item.attrs;
  switch (a.action) {
    case "terminal": return run("tab.new", { space: space.id, name: newTabName(space, panes, { home }) });
    case "agent": return run("tab.new", { space: space.id, name: newTabName(space, panes, { home, agent: a.label }), argv: a.run });
    case "space": return handleCommand("space", [], { run }, { panes, home, cwd });
    case "worktree": return openOverlay({ mod: "worktree", kind: "dialog", props: { space: space.id, action: a.worktree } });
    default: return null;
  }
}

// ---- A13: panel buttons ----
// S8: the persisted state is read on every click, never cached in shared state.

export const PANEL_DEFAULT = { hidden: true, active: "changes" }; // layouts/apollo.json
export const PANEL_STATE_PATH = "/layouts/.state/apollo.json";

function findNode(n, id) {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) { const r = findNode(c, id); if (r) return r; }
  return null;
}

// Where the + popup opens: under ⊕, right-aligned to it (OverlaySpec has no element anchor, only {x,y}).
// ⊕'s window position comes from the layout: the tabs block starts at sidebar px (clamped to its min/max,
// as Herdr renders it) + main padding + card border; inside it the root has 8 px side padding, ⊕ is
// 28 px, vertically centered, 4 px left of the measured `panels` group. Null until both are measured.
// With window buttons (buttonsW > 0) the root's right padding gives way to them and a 4 px gap.
export const PLUS_MENU_W = 220;
export function plusAnchor({ layout, rootW, panelsW, buttonsW = 0 }) {
  const side = findNode(layout, "sidebar"), main = findNode(layout, "main"), card = findNode(layout, "card");
  const tabs = findNode(layout, "tabs");
  if (!side || !main || !card || !tabs || !(rootW > 0) || !(panelsW > 0)) return null;
  const px = side.size?.px ?? 0;
  const sidebar = Math.min(side.max ?? px, Math.max(side.min ?? px, px));
  const pad = main.padding ?? 0, border = card.border?.width ?? 0, tabsH = tabs.size?.px ?? 40;
  const left = sidebar + pad + border, top = pad + border;
  const plusRight = left + rootW - (buttonsW > 0 ? buttonsW + 4 : 8) - panelsW - 4;
  const plusBottom = top + (tabsH - 28) / 2 + 28;
  return { x: plusRight - PLUS_MENU_W, y: plusBottom + 4 };
}

// {shown, active} from layout() (P4: hide/select are reflected there), else from .state
// `nodes.panel.{hidden,active}` (stored only when they differ from the file) over the layout defaults.
export function panelState({ layout, state } = {}) {
  const node = findNode(layout, "panel");
  if (node) return { shown: !node.hidden, active: node.active ?? PANEL_DEFAULT.active };
  const p = { ...PANEL_DEFAULT, ...(state?.nodes?.panel ?? {}) };
  return { shown: !p.hidden, active: p.active };
}

export async function loadPanelState({ layout, readTextFile, appHome }) {
  const L = layout();
  if (findNode(L, "panel")) return panelState({ layout: L });
  let state = null;
  try { state = JSON.parse((await readTextFile(appHome() + PANEL_STATE_PATH)) ?? "null"); } catch { state = null; }
  return panelState({ layout: null, state });
}

export function panelClick(child, state, { run }) {
  if (!state.shown) {
    run("layout.select", { stack: "panel", child });
    run("layout.show", { id: "panel" });
  } else if (state.active !== child) {
    run("layout.select", { stack: "panel", child });
  } else {
    run("layout.hide", { id: "panel" });
  }
}

// ---- Windows and Linux: window buttons ----
// With "titlebar": "none", macOS keeps its traffic lights; where the system draws no buttons
// (window().buttons, Windows and Linux) the tab row draws minimize, maximize/restore and close.

export const WIN_BUTTON_W = 46;

export function windowButtons(win) {
  if (!win || win.buttons !== true) return [];
  return [
    { id: "minimize", icon: "win-min", command: "window.minimize", danger: false },
    { id: "maximize", icon: win.maximized ? "win-restore" : "win-max", command: "window.maximize", danger: false },
    { id: "close", icon: "win-close", command: "window.close", danger: true },
  ];
}

// ---- Windows: admin mark ----
// herdr-core starts every terminal, so its token is the one the tabs' shells get (an elevated window
// can attach to a core that is not). `hc exec` runs `whoami /groups` inside the core; the integrity
// label's SID is the same in every language. A failed check is "unknown" and draws nothing.

export const ADMIN_CHECK = ["exec", "--timeout", "5", "whoami", "/groups"];
export const ADMIN_EVERY = 30000; // re-check, so a restarted core moves the mark both ways

export function elevation(groups) {
  const sids = String(groups ?? "").match(/\bS-1-16-\d+\b/g) ?? [];
  if (sids.some((s) => s === "S-1-16-12288" || s === "S-1-16-16384")) return "elevated";
  if (sids.some((s) => s === "S-1-16-8192" || s === "S-1-16-4096")) return "normal";
  return "unknown";
}

export async function checkElevation(hc) {
  try {
    const r = await hc(ADMIN_CHECK);
    return r?.code === 0 ? elevation(r.stdout) : "unknown";
  } catch {
    return "unknown";
  }
}

// Remote spaces' terminals run on another machine, under another core.
export const showAdmin = (state, space) => state === "elevated" && !!space && space.machine == null;
