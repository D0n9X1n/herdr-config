// apollo-specs: pure logic for the Specs panel and viewer. No herdr or gpui-kit imports; exec,
// readTextFile, run and notify are injected (herdr shapes).

export const STATUSES = ["pending", "paused", "finished", "canceled"];
// Every git call: never take index.lock or rewrite the index of the person's repo.
export const GIT_FLAGS = ["--no-optional-locks"];

// The focused pane's git toplevel on the space's machine, else the space folder.
export async function specsRepo(focused, space, { exec }) {
  const cwd = focused?.cwd;
  if (cwd) {
    try {
      const r = await exec("git", [...GIT_FLAGS, "rev-parse", "--show-toplevel"], { cwd, on: space?.machine ?? null });
      if (r.code === 0 && r.stdout.trim()) return r.stdout.trim();
    } catch { /* fall back */ }
  }
  return space?.folder ?? "";
}

// Splits "---\nkey: value\n---\n" frontmatter from the body.
export function splitFrontmatter(text) {
  const t = String(text ?? "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(t);
  if (!m) return { meta: {}, body: t };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: t.slice(m[0].length) };
}

const titleOf = (body, path) => {
  const h = /^# +(.+?)\s*$/m.exec(body);
  return h ? h[1] : path.split("/").pop();
};

// docs/specs/<status>/*.md, read with {on}. Sorted by status, then path.
export async function listSpecs(repo, { exec, readTextFile, on = null }) {
  const r = await exec("find", ["docs/specs", "-type", "f", "-name", "*.md"], { cwd: repo, on });
  if (r.code !== 0 && !r.stdout) return [];
  const paths = String(r.stdout).split("\n").map((p) => p.replace(/^\.\//, "")).filter((p) => {
    const parts = p.split("/");
    return parts.length === 4 && parts[0] === "docs" && parts[1] === "specs" && STATUSES.includes(parts[2]);
  });
  paths.sort((a, b) => STATUSES.indexOf(a.split("/")[2]) - STATUSES.indexOf(b.split("/")[2]) || a.localeCompare(b));
  const out = [];
  for (const path of paths) {
    const file = `${repo.replace(/\/+$/, "")}/${path}`;
    const { meta, body } = splitFrontmatter(await readTextFile(file, { on }));
    out.push({ path, file, status: path.split("/")[2], title: titleOf(body, path), priority: meta.priority ?? null });
  }
  return out;
}

export function specCounts(list) {
  const c = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const s of list) if (s.status in c) c[s.status] += 1;
  return c;
}

export function filterSpecs(list, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((s) => s.title.toLowerCase().includes(q) || s.path.toLowerCase().includes(q));
}

export const openSpec = (spec, on, { run }) =>
  run("pane.split", { direction: "right", mod: "apollo-specs", props: { file: spec.file, on: on ?? null } });

// Claude first, else the first installed agent. With none installed: a warning, no command.
export function pickAgent(agents) {
  const ok = (agents ?? []).filter((a) => a.installed === true);
  return ok.find((a) => a.key === "claude") ?? ok[0] ?? null;
}

// The spec "Work on it" acts on: the selected one if it is shown now (matched by path, so a reload keeps
// it), else the first shown one; null when nothing is shown. A hidden selection is never used.
export function workTarget(selPath, shown) {
  return (selPath && shown.find((s) => s.path === selPath)) || shown[0] || null;
}

export function workOnIt(spec, { space, repo, agents }, { run, notify }) {
  const a = pickAgent(agents);
  if (!a) {
    return notify({ title: "No agent installed", body: "Install Claude Code or another agent to work on a spec.", level: "warning" });
  }
  const name = uniqueName(a.name, (space.tabs ?? []).map((t) => t.name));
  return run("tab.new", { space: space.id, name, folder: repo, argv: a.run, task: `Work on the spec ${spec.path}. Read it first.` });
}

// base, else "base 2", "base 3", ... : the first not taken.
export function uniqueName(base, taken) {
  const used = new Set(taken ?? []);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

// The viewer pane: reads exactly props.file with props.on; the body is the markdown without frontmatter.
export async function viewerModel({ file, on = null }, { readTextFile }) {
  const text = await readTextFile(file, { on });
  return { file, body: text == null ? "" : splitFrontmatter(text).body };
}
