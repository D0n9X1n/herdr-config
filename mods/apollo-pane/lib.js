// apollo-pane: pure logic for the pane header. No herdr or gpui-kit imports.
// Every action targets the header's own pane (props().pane), never the focused one.

const BUTTONS = ["split-right", "split-down", "zoom", "close"];
const MARKS = { working: "arc", blocked: "diamond", done: "check" };

export function paneActions(pane, { run }) {
  return [
    { id: "split-right", label: "Split right", fire: () => run("pane.split", { pane, direction: "right" }) },
    { id: "split-down", label: "Split down", fire: () => run("pane.split", { pane, direction: "down" }) },
    { id: "zoom", label: "Zoom", fire: () => run("pane.zoom", { pane }) },
    { id: "close", label: "Close", fire: () => run("pane.close", { pane }) },
  ];
}

export const hoverButtons = (hovered) => (hovered ? [...BUTTONS] : []);

const base = (path) => {
  const parts = String(path ?? "").replace(/\/+$/, "").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : (path ? "/" : null);
};

export function paneHeader(paneId, panes) {
  const p = (panes ?? []).find((x) => x.pane === paneId);
  if (!p) return null;
  const isMod = p.terminal === null || p.terminal === undefined;
  const kind = isMod ? undefined : MARKS[p.status];
  return {
    pane: p.pane,
    ...(({ icon, tint, color }) => (isMod ? { icon: null, tint: false, iconColor: null } : { icon, tint, iconColor: color }))(agentIcon(p.program)),
    title: p.title ?? "",
    folder: isMod ? null : base(p.cwd),
    branch: isMod ? null : (p.branch ?? null),
    mark: kind ? { kind, color: p.status } : null,
    focused: !!p.focused,
  };
}

// Claude Code shows Apollo's own star in Claude orange; other programs keep Herdr's icon. Copies of this
// live in apollo-spaces, apollo-tabs and apollo-pane (mods don't share files): change them together.
export const CLAUDE_ORANGE = "#d97757";
export function agentIcon(prog) {
  if (prog?.key === "claude") return { icon: "mods/apollo-pane/star.svg", tint: true, color: CLAUDE_ORANGE };
  return { icon: prog?.icon ?? null, tint: !!prog?.tint, color: null };
}
