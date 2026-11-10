// apollo-specs: the Specs panel, and the spec viewer pane when props.file is set. Logic in lib.js.
import { View, div } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import {
  spaces, focused, exec, readTextFile, watchFolder, knownAgents, run, notify, theme, props as herdrProps,
} from "herdr";
import { specsRepo, listSpecs, specCounts, filterSpecs, openSpec, workOnIt, workTarget, viewerModel, STATUSES } from "./lib.js";
import { startRefresh, refreshFollower, SPECS_EVERY } from "./refresh.js";

const FALLBACK = { foreground: "#cfbc97", muted: "#d5c4a1", dim: "#928374", raised: "#1c1f20", selected: "#3c3836",
  border: "#3c3836", input: "#504945", accent: "#fabd2f", solid_foreground: "#141617" };
const col = (name) => theme()?.[name] ?? FALLBACK[name] ?? name;
const rowId = (s) => `spec-${s.path.split("/").slice(2).join("/")}`;

export default class Specs extends View {
  // Props are read live: Herdr's props() merged with whatever init received (it may be nothing or {}).
  get p() { return { ...(herdrProps() ?? {}), ...(this.ip ?? {}) }; }

  init(props, cx) {
    this.ip = props;
    if (this.p.file) {
      this.body = "";
      cx.spawn(async (cx) => { this.body = (await viewerModel({ file: this.p.file, on: this.p.on ?? null }, { readTextFile })).body; cx.notify(); });
      return;
    }
    this.list = [];
    this.agents = [];
    this.status = "pending";
    this.query = "";
    this.sel = null; // the selected spec's path
    this.space = null;
    this.repo = null;
    this.on = null;
    this.gen = 0; // refresh generation: bumped on every retarget and every reload start
    this.dirty = true; // retarget on the first pass
    this.focus = cx.focus_handle();
    // One long-lived task owns the refresh loop; render() only records the shown space and folder and
    // wakes it. A new space or repo restarts the loop at once (old watch and timer disposed).
    cx.spawn(async (cx) => {
      let wake = null, redraw = false;
      const kick = () => { if (wake) { const w = wake; wake = null; w(); } };
      this.kick = () => { this.dirty = true; kick(); };
      const follower = refreshFollower({
        start: (t) => startRefresh({
          folder: t.repo, on: t.on, every: SPECS_EVERY, watchFolder,
          timer: { every: (ms, fn) => cx.timer.every(ms, () => fn()) },
          reload: async () => {
            const g = ++this.gen;
            let list = [];
            try { list = await listSpecs(t.repo, { exec, readTextFile, on: t.on }); } catch { list = []; }
            if (g === this.gen && follower.key === t.key) this.list = list;
            redraw = true;
            kick();
          },
        }),
      });
      this.follower = follower;
      const retarget = async () => {
        const space = (spaces() ?? []).find((s) => s.active) ?? null;
        const on = space?.machine ?? null;
        const repo = space ? await specsRepo(focused(), space, { exec }) : null;
        const key = space ? `${space.id}|${repo ?? ""}` : null;
        this.space = space;
        if (key === follower.key) return;
        this.repo = repo;
        this.on = on;
        this.list = [];
        this.sel = null;
        this.agents = [];
        this.gen += 1; // any list still in flight belongs to the old target
        if (space) {
          knownAgents({ on }).then((a) => {
            if (follower.key === key) { this.agents = a ?? []; redraw = true; kick(); }
          }).catch(() => {});
        }
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

  onKey(e) {
    if (e.key === "escape") this.query = "";
    else if (e.key === "backspace") this.query = [...this.query].slice(0, -1).join("");
    else if (e.key_char && !e.modifiers?.platform && !e.modifiers?.control) this.query += e.key_char;
  }

  viewer() {
    return v_flex().id("root").size_full().p(12)
      .child(TextView.markdown("spec-body", this.body).selectable(true).scrollable(true).size_full());
  }

  render() {
    if (this.p.file) return this.viewer();
    this.follow();
    const counts = specCounts(this.list);
    const shown = filterSpecs(this.list.filter((s) => s.status === this.status), this.query);
    const tab = (s) => {
      let el = h_flex().id(`status-${s}`).h(24).px(8).gap(4).items_center().rounded(6)
        .on_click((_e, cx) => { this.status = s; cx.notify(); })
        .child(div().text_size(12).text_color(col(s === this.status ? "foreground" : "muted")).child(`${s} ${counts[s]}`));
      return s === this.status ? el.bg(col("selected")) : el.hover((x) => x.bg(col("raised")));
    };
    const row = (s) => {
      let el = h_flex().id(rowId(s)).h(28).px(8).gap(8).items_center().rounded(6)
        .on_click(() => { this.sel = s.path; openSpec(s, this.on, { run }); })
        .child(div().flex_1().min_w(0).text_size(12).text_color(col("foreground")).truncate().child(s.title))
        .child(div().text_size(11).text_color(col("dim")).child(s.priority ?? ""));
      return this.sel === s.path ? el.bg(col("selected")) : el.hover((x) => x.bg(col("raised")));
    };
    return v_flex().id("root").size_full().p(8).gap(6)
      .child(h_flex().gap(2).children(STATUSES.map(tab)))
      .child(h_flex().id("filter").h(26).px(8).items_center().rounded(6).border(1).border_color(col("input"))
        .track_focus(this.focus)
        .on_click(() => this.focus.focus())
        .on_key_down((e, cx) => { this.onKey(e); cx.notify(); })
        .child(div().text_size(12).text_color(col(this.query ? "foreground" : "dim")).truncate().child(this.query || "Filter specs")))
      .child(v_flex().id("specs").flex_1().gap(1).overflow_y_scrollbar().children(shown.map(row)))
      .child(h_flex().id("work-on-it").h(30).px(10).items_center().justify_center().rounded(6).bg(col("accent"))
        .on_click(() => {
          const spec = workTarget(this.sel, shown);
          // The live space, not this.space: its tabs change without a re-follow (a second Work on it is "… 2").
          const space = this.space && ((spaces() ?? []).find((s) => s.id === this.space.id) ?? this.space);
          if (spec && space) workOnIt(spec, { space, repo: this.repo, agents: this.agents }, { run, notify });
        })
        .child(div().text_size(12).font_semibold().text_color(col("solid_foreground")).child("Work on it")));
  }
}
