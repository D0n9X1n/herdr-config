// apollo-status: the status bar model. No herdr or gpui-kit imports; no handlers.

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Active space's machine ("This computer" for null) and branch; agents and blocked across all spaces.
export function statusModel(spaces, agents) {
  const active = (spaces ?? []).find((s) => s.active) ?? null;
  const all = agents ?? [];
  const blocked = all.filter((a) => a.status === "blocked").length;
  return {
    machine: active?.machine ?? "This computer",
    branch: active?.branch ?? null,
    agents: all.length,
    blocked,
    blockedColor: blocked > 0 ? "blocked" : "dim",
    hint: "⌘⇧P commands",
    text: { agents: plural(all.length, "agent"), blocked: `${blocked} blocked` },
  };
}
