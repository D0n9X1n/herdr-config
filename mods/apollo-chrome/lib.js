// apollo-chrome: pure logic for the brand block and footer. No herdr or gpui-kit imports.
// clamp() and the width constants duplicate apollo-spaces on purpose: mods are self-contained.

export const MIN_PX = 184, MAX_PX = 480, DEFAULT_PX = 256, COLLAPSED_PX = 184, COLLAPSE_BELOW = 220;
export const WIDTH_KEY = "apollo.sidebar.width";
export const SEARCH_KEY = "apollo.sidebar.search";
// P1 (wiki/Herdr-Notes.md): unresolved above zoom 1, so one constant (same as apollo-spaces).
export const SIZE_IS_ZOOMED = false;

export const clamp = (px) => Math.min(MAX_PX, Math.max(MIN_PX, Math.round(px)));
export const isCollapsed = (width) => width !== undefined && width !== null && width < COLLAPSE_BELOW;

export function designWidth(observed, zoom = 1, zoomed = SIZE_IS_ZOOMED) {
  if (observed === undefined || observed === null) return undefined;
  return zoomed ? observed / (zoom || 1) : observed;
}

// Saves the current design width, then narrows the sidebar to 184. Zoom never changes.
export function collapse({ observed, zoom = 1, zoomed = SIZE_IS_ZOOMED }, { run, setShared }) {
  const w = designWidth(observed, zoom, zoomed);
  setShared("apollo.sidebar.width", w === undefined ? DEFAULT_PX : clamp(w));
  run("layout.resize", { id: "sidebar", px: COLLAPSED_PX });
}

// Restores the saved width, or 256 when none is saved or it would still be collapsed.
export function expand({ saved }, { run }) {
  const px = typeof saved === "number" && saved >= COLLAPSE_BELOW ? clamp(saved) : DEFAULT_PX;
  run("layout.resize", { id: "sidebar", px });
  return px;
}

export const settings = ({ run }) => run("app.settings");
export const addMachine = ({ run }) => run("mod.open", { name: "machine-add" });

export function account(home) {
  const name = String(home ?? "").replace(/\/+$/, "").split("/").pop() ?? "";
  return { initial: name ? [...name][0].toUpperCase() : "?", name };
}

const node = (kind, attrs = {}, children = []) => ({ kind, attrs, children });

// Brand row (48 px, window_drag). Both states show only the Apollo logo (assets/logo/apollo.svg at 64 px),
// no app name. Expanded adds search and panel-close; collapsed adds panel-open.
export function brandView({ collapsed, platform = "macos", fullscreen = false }) {
  const x = platform === "macos" && !fullscreen ? 84 : 12;
  const icon = node("app-icon", { src: "mods/apollo-chrome/logo.png", x, size: 20, radius: 5 });
  if (collapsed) return node("brand", { height: 48, collapsed: true }, [icon, node("panel-open", { id: "panel-open", size: 28 })]);
  return node("brand", { height: 48, collapsed: false }, [
    icon,
    node("search", { id: "search", size: 28 }),
    node("panel-close", { id: "panel-close", size: 28 }),
  ]);
}

// Footer: Settings, Add machine, then the account row ("N agents" only when expanded).
export function footerView({ collapsed, home, agentCount = 0 }) {
  const acct = account(home);
  return node("footer", { collapsed }, [
    node("footer-row", { id: "settings", label: "Settings" }, [node("gear", { color: "dim" })]),
    node("footer-row", { id: "add-machine", label: "Add machine" }, [node("plug", { color: "dim" })]),
    node("account", { id: "account" }, [
      node("avatar", { text: acct.initial }),
      node("account-name", { text: acct.name, color: "foreground" }),
      ...(collapsed ? [] : [node("agent-count", { text: `${agentCount} agent${agentCount === 1 ? "" : "s"}`, color: "dim" })]),
    ]),
  ]);
}
