// apollo-changes: the Changes panel (git status + diff of the active space's repo). Logic in lib.js.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, focused, exec, watchFolder, theme, nextCommand } from "herdr";
import { loadChanges, loadDiffGroups, diffRowsGrouped, findRepo, nextFile, fileListHeight } from "./lib.js";
import { startRefresh, refreshFollower, CHANGES_EVERY } from "./refresh.js";

const FALLBACK = { foreground: "#cfbc97", muted: "#d5c4a1", dim: "#928374", raised: "#1c1f20", hover: "#32302f", selected: "#3c3836",
  border: "#3c3836", done: "#b8bb26", blocked: "#fb4934" };
const col = (name) => theme()?.[name] ?? FALLBACK[name] ?? name;
const MARK_COLOR = { A: "done", U: "done", D: "blocked", M: "muted" };

export default class Changes extends View {
  init(_props, cx) {
    this.repo = null;
    this.on = null;
    this.state = null;
    this.error = null;
    this.sel = null;
    this.rows = [];
    this.diffSeq = 0;
    this.gen = 0; // refresh generation: bumped on every retarget and every reload start
    this.dirty = true; // retarget on the first pass
    // Key commands (`apollo-changes.<command>` in keys.json, or `herdr-app do apollo-changes.next`).
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "next") {
          const files = this.state?.files ?? [];
          const f = files.find((x) => x.path === nextFile(files, this.sel));
          if (f) this.select(f, cx);
        }
        cx.notify();
      }
    });
    // One long-lived task owns the refresh loop, so every redraw uses a live cx. render() only records
    // the space/folder it shows and wakes this task; a new space or repo restarts the loop at once.
    cx.spawn(async (cx) => {
      let wake = null, redraw = false;
      const kick = () => { if (wake) { const w = wake; wake = null; w(); } };
      this.kick = () => { this.dirty = true; kick(); };
      const follower = refreshFollower({
        start: (t) => startRefresh({
          folder: t.repo, on: t.on, every: CHANGES_EVERY, watchFolder,
          timer: { every: (ms, fn) => cx.timer.every(ms, () => fn()) },
          reload: async () => {
            const g = ++this.gen;
            const current = () => g === this.gen && follower.key === t.key;
            try {
              const st = await loadChanges(t.repo, { exec, on: t.on });
              if (current()) {
                this.state = st;
                this.error = null;
                // Keep the open diff current: reload it, or close it when its file is gone.
                if (this.sel) {
                  const f = st.files.find((x) => x.path === this.sel);
                  if (f) await this.fetchDiff(f);
                  else { this.sel = null; this.rows = []; this.diffSeq += 1; }
                }
              }
            } catch (e) {
              if (current()) this.error = String(e?.message ?? e);
            }
            redraw = true;
            kick();
          },
        }),
      });
      this.follower = follower;
      const retarget = async () => {
        const space = (spaces() ?? []).find((s) => s.active) ?? null;
        const on = space?.machine ?? null;
        const repo = space ? await findRepo({ cwd: focused()?.cwd ?? null, folder: space.folder, on }, { exec }) : null;
        const key = space ? `${space.id}|${repo ?? ""}` : null;
        if (key === follower.key) return;
        this.repo = repo;
        this.on = on;
        this.state = null;
        this.error = null;
        this.sel = null;
        this.rows = [];
        this.diffSeq += 1; // any diff still in flight belongs to the old space
        this.gen += 1; // and so does any refresh still in flight (even if we come back to the same key)
        follower.follow(key, repo ? { key, repo, on } : null);
      };
      for (;;) {
        if (this.dirty) { this.dirty = false; await retarget(); redraw = true; }
        if (redraw) { redraw = false; cx.notify(); }
        if (!this.dirty && !redraw) await new Promise((resolve) => { wake = resolve; });
      }
    });
  }

  close() { this.follower?.stop(); }

  // Called from render: notes the shown space and folder; a change wakes the task (no cx use here).
  follow() {
    const want = `${(spaces() ?? []).find((s) => s.active)?.id ?? ""}|${focused()?.cwd ?? ""}`;
    if (want !== this.want) { this.want = want; this.kick?.(); }
  }

  // Loads one file's diff. The result applies only if its (space+repo key, repo, file, request seq)
  // still match: a slower earlier request or one from another space is dropped. Returns whether it applied.
  async fetchDiff(f) {
    const tag = { seq: ++this.diffSeq, key: this.follower?.key ?? null, repo: this.repo, file: f.path };
    let rows;
    try {
      rows = diffRowsGrouped(await loadDiffGroups(tag.repo, f.path, {
        exec, on: this.on, unborn: !!this.state?.unborn, untracked: f.mark === "U", staged: !!f.staged, unstaged: !!f.unstaged,
      }));
    } catch (e) {
      rows = [{ kind: "limit", text: String(e?.message ?? e), old: null, new: null, bg: null, numColor: "dim" }];
    }
    if (tag.seq !== this.diffSeq || tag.key !== (this.follower?.key ?? null) || tag.repo !== this.repo || tag.file !== this.sel) return false;
    this.rows = rows;
    return true;
  }

  select(file, cx) {
    this.sel = file.path;
    this.rows = [];
    cx.spawn(async (cx) => { await this.fetchDiff(file); cx.notify(); });
  }

  fileRow(f) {
    const on = f.path === this.sel;
    let el = h_flex().id(`file-${f.path}`).h(26).px(8).gap(8).items_center().rounded(6)
      .on_click((_e, cx) => this.select(f, cx));
    el = on ? el.bg(col("selected")) : el.hover((s) => s.bg(col("hover")));
    return el
      .child(div().w(12).flex_none().text_size(12).font_normal().text_color(col(MARK_COLOR[f.mark])).child(f.mark))
      .child(div().flex_1().min_w(0).text_size(13).font_light().text_color(col("foreground")).truncate().child(f.path))
      .child(div().text_size(12).font_light().text_color(col("done")).child(`+${f.added}`))
      .child(div().text_size(12).font_light().text_color(col("blocked")).child(`-${f.removed}`));
  }

  diffRow(r, i) {
    let el = h_flex().id(`diff-row-${i}`).px(6).gap(6).items_center();
    if (r.bg) el = el.bg(col(r.bg));
    if (r.kind === "label") return el.pt(6).child(div().text_size(12).font_normal().text_color(col("muted")).child(r.text));
    if (r.kind === "hunk" || r.kind === "limit") return el.child(div().text_size(12).font_light().text_color(col("dim")).truncate().child(r.text));
    return el
      .child(div().w(28).flex_none().text_size(12).font_light().text_color(col(r.numColor)).child(r.old == null ? "" : String(r.old)))
      .child(div().w(28).flex_none().text_size(12).font_light().text_color(col(r.numColor)).child(r.new == null ? "" : String(r.new)))
      .child(div().flex_1().min_w(0).text_size(13).font_light().text_color(col("foreground")).truncate().child(r.text));
  }

  render() {
    this.follow();
    const files = this.state?.files ?? [];
    const head = this.repo ? `${files.length} changed${this.state?.truncated ? " (first 1000)" : ""}` : "No repository";
    return v_flex().id("root").size_full().p(8).gap(6)
      .child(div().text_size(13).font_normal().text_color(col("muted")).child(this.error ? `git: ${this.error}` : head))
      .child(v_flex().id("files").flex_none().h(fileListHeight(files.length)).gap(1).overflow_y_scrollbar().children(files.map((f) => this.fileRow(f))))
      .child(div().h(1).bg(col("border")).flex_none())
      .when(!!this.sel, (el) => el.child(h_flex().id("diff-header").h(24).flex_none().items_center()
        .child(div().text_size(13).font_normal().text_color(col("foreground")).truncate().child(this.sel ?? ""))))
      .child(v_flex().id("diff").flex_1().min_h(0).min_w(0).overflow_y_scrollbar()
        .children(this.rows.map((r, i) => this.diffRow(r, i + 1))));
  }
}
