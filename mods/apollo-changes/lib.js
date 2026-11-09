// apollo-changes: pure logic for the Changes panel. No herdr or gpui-kit imports; exec is injected
// with herdr's shape: exec(cmd, args, {cwd, on}) -> Promise<{code, stdout, stderr}>.

export const MAX_FILES = 1000, MAX_LINES = 1500;
// Every git call: polling must never take index.lock or rewrite the index of the person's repo.
export const GIT_FLAGS = ["--no-optional-locks"];
export const ADDED_BG = "#3d3f1b", REMOVED_BG = "#4e231e";
const UNMERGED = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

// `git status --porcelain=v1 -z`: "XY path\0", renames and copies add "orig\0".
export function parsePorcelain(z) {
  const t = String(z ?? "").split("\0");
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const e = t[i];
    if (e.length < 4) continue;
    const item = { x: e[0], y: e[1], path: e.slice(3) };
    if (item.x === "R" || item.x === "C") item.orig = t[++i];
    out.push(item);
  }
  return out;
}

// S9: untracked shows U (counted as all-added); unmerged shows M.
export function markOf({ x, y }) {
  if (x === "?" && y === "?") return "U";
  if (UNMERGED.has(x + y)) return "M";
  if (x === "D" || y === "D") return "D";
  if (x === "A") return "A";
  return "M";
}

export function limitFiles(list, max = MAX_FILES) {
  return { files: list.slice(0, max), truncated: list.length > max };
}

// `git diff --numstat -z`: "add\tdel\tpath\0", or for renames "add\tdel\t\0orig\0path\0". Binary: "-".
function parseNumstat(z, into) {
  const t = String(z ?? "").split("\0");
  for (let i = 0; i < t.length; i++) {
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(t[i]);
    if (!m) continue;
    let path = m[3];
    if (path === "") { i += 2; path = t[i]; }
    const c = into.get(path) ?? { added: 0, removed: 0 };
    c.added += m[1] === "-" ? 0 : Number(m[1]);
    c.removed += m[2] === "-" ? 0 : Number(m[2]);
    into.set(path, c);
  }
}

export async function loadChanges(repo, { exec, on = null }) {
  const opts = { cwd: repo, on };
  const git = (...args) => exec("git", [...GIT_FLAGS, ...args], opts);
  const unborn = (await git("rev-parse", "--verify", "-q", "HEAD")).code !== 0;
  const st = await git("status", "--porcelain=v1", "-z", "--untracked-files=all");
  if (st.code !== 0) throw new Error(st.stderr || "git status failed");
  const { files: entries, truncated } = limitFiles(parsePorcelain(st.stdout));
  const counts = new Map();
  if (unborn) {
    parseNumstat((await git("diff", "--numstat", "-z", "--cached")).stdout, counts);
    parseNumstat((await git("diff", "--numstat", "-z")).stdout, counts);
  } else {
    parseNumstat((await git("diff", "--numstat", "-z", "HEAD")).stdout, counts);
  }
  const untracked = entries.filter((e) => markOf(e) === "U").map((e) => e.path);
  if (untracked.length) {
    const wc = await exec("wc", ["-l", "--", ...untracked], opts);
    for (const line of String(wc.stdout ?? "").split("\n")) {
      const m = /^\s*(\d+)\s+(.*)$/.exec(line);
      if (m && untracked.includes(m[2])) counts.set(m[2], { added: Number(m[1]), removed: 0 });
    }
  }
  const files = entries.map((e) => {
    const c = counts.get(e.path) ?? { added: 0, removed: 0 };
    // staged: something in the index; unstaged: something in the worktree (untracked counts as neither).
    const staged = e.x !== " " && e.x !== "?", unstaged = e.y !== " " && e.y !== "?";
    return { path: e.path, orig: e.orig ?? null, mark: markOf(e), added: c.added, removed: c.removed, staged, unstaged };
  });
  return { files, truncated, unborn };
}

export function diffCommands(file, { unborn = false, untracked = false } = {}) {
  if (untracked) return [["diff", "--no-index", "--", "/dev/null", file]];
  if (unborn) return [["diff", "--cached", "--", file], ["diff", "--", file]];
  return [["diff", "HEAD", "--", file]];
}

// Runs the diff commands for one file (git diff --no-index exits 1 when there are differences).
export async function loadDiff(repo, file, { exec, on = null, unborn = false, untracked = false }) {
  let text = "";
  for (const args of diffCommands(file, { unborn, untracked })) {
    const r = await exec("git", [...GIT_FLAGS, ...args], { cwd: repo, on });
    if (r.code !== 0 && r.code !== 1) throw new Error(r.stderr || `git ${args.join(" ")} failed`);
    text += r.stdout;
  }
  return text;
}

// The file list is as tall as its rows (26 px, 1 px gaps), capped at 240; the diff starts right below it.
export const FILE_ROW_H = 26, FILE_LIST_MAX = 240;
export const fileListHeight = (n) => (n > 0 ? Math.min(FILE_LIST_MAX, n * FILE_ROW_H + (n - 1)) : 0);

// What to diff for one file. With HEAD, a file with both staged and unstaged parts gets two labeled groups
// (git diff --cached, git diff); otherwise one unlabeled group as before (unborn and untracked unchanged).
export function diffPlan(file, { unborn = false, untracked = false, staged = false, unstaged = false } = {}) {
  if (untracked || unborn) return diffCommands(file, { unborn, untracked }).map((args) => ({ label: null, args }));
  if (staged && unstaged) {
    return [{ label: "staged", args: ["diff", "--cached", "--", file] }, { label: "unstaged", args: ["diff", "--", file] }];
  }
  return [{ label: null, args: ["diff", "HEAD", "--", file] }];
}

export async function loadDiffGroups(repo, file, { exec, on = null, ...flags }) {
  const groups = [];
  for (const g of diffPlan(file, flags)) {
    const r = await exec("git", [...GIT_FLAGS, ...g.args], { cwd: repo, on });
    if (r.code !== 0 && r.code !== 1) throw new Error(r.stderr || `git ${g.args.join(" ")} failed`);
    groups.push({ label: g.label, text: r.stdout });
  }
  return groups;
}

const row = (kind, text, old, nw, bg) => ({ kind, text, old, new: nw, bg, numColor: "dim" });

// Rows for labeled groups: a `label` row before each labeled group; the 1500-line cap spans all groups.
// A group diffRows already cut counts as cut, so the marker survives even at exactly 1500 rows.
export function diffRowsGrouped(groups) {
  const rows = [];
  let cut = false;
  for (const g of groups) {
    if (g.label) rows.push(row("label", g.label, null, null, null));
    const part = diffRows(g.text);
    if (part.some((r) => r.kind === "limit")) cut = true;
    rows.push(...part.filter((r) => r.kind !== "limit"));
  }
  if (rows.length > MAX_LINES) cut = true;
  return cut ? [...rows.slice(0, MAX_LINES), row("limit", `Diff cut at ${MAX_LINES} lines`, null, null, null)] : rows;
}

// Unified diff → rows: hunk headers on `raised`, added on #3d3f1b, removed on #4e231e, context plain.
export function diffRows(text) {
  const rows = [];
  let inHunk = false, o = 0, n = 0;
  for (const line of String(text ?? "").split("\n")) {
    if (line.startsWith("diff --git ")) { inHunk = false; continue; }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    let r = null;
    if (h) { inHunk = true; o = Number(h[1]); n = Number(h[2]); r = row("hunk", line, null, null, "raised"); }
    else if (!inHunk || line === "" || line.startsWith("\\")) continue;
    else if (line[0] === "+") r = row("add", line.slice(1), null, n++, ADDED_BG);
    else if (line[0] === "-") r = row("del", line.slice(1), o++, null, REMOVED_BG);
    else if (line[0] === " ") r = row("ctx", line.slice(1), o++, n++, null);
    else continue;
    if (rows.length >= MAX_LINES) { rows.push(row("limit", `Diff cut at ${MAX_LINES} lines`, null, null, null)); break; }
    rows.push(r);
  }
  return rows;
}

// The `next` key command: the file after `selected` in the list, wrapping; the first when nothing (or a
// file no longer listed) is selected; null when the list is empty.
export function nextFile(files, selected) {
  const list = files ?? [];
  if (!list.length) return null;
  const i = list.findIndex((f) => f.path === selected);
  return list[(i + 1) % list.length].path;
}

// The focused pane's git toplevel, else the space folder.
export async function findRepo({ cwd, folder, on = null }, { exec }) {
  if (cwd) {
    try {
      const r = await exec("git", [...GIT_FLAGS, "rev-parse", "--show-toplevel"], { cwd, on });
      if (r.code === 0 && r.stdout.trim()) return r.stdout.trim();
    } catch { /* fall back */ }
  }
  return folder;
}
