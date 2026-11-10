// apollo-spaces: the spaces block (and its own "New space here" popup). Logic lives in lib.js.
import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  spaces, agents, panes, exec, run, openOverlay, closeOverlay, setAgentOrder, shared, setShared, settings, theme, layout,
  props as herdrProps, focused, home,
} from "herdr";
import {
  spacesView, agentOrder, guardWidth, guardTarget, designWidth, isCollapsed, clickSpace, clickAgent, spaceMenu, machineMenu,
  newSpaceHere, newSpace, foldKeys, probeGit, spaceCwd,
} from "./lib.js";

const FALLBACK = {
  foreground: "#cfbc97", muted: "#d5c4a1", dim: "#928374", raised: "#1c1f20", border: "#3c3836", input: "#504945",
  accent: "#fabd2f", solid_foreground: "#141617", working: "#fabd2f", blocked: "#fb4934", done: "#b8bb26",
  ansi4: "#83a598", ansi5: "#d3869b", ansi6: "#8ec07c",
};
const col = (name) => theme()?.[name] ?? FALLBACK[name] ?? name;
const glyph = (name, size, color) => svg(`mods/apollo-spaces/${name}.svg`).size(size).text_color(col(color));
const readFolds = (key) => { try { return JSON.parse(localStorage.getItem(key) ?? "{}") ?? {}; } catch { return {}; } };
const writeFolds = (key, v) => localStorage.setItem(key, JSON.stringify(v));

export default class Spaces extends View {
  // Props are read live: Herdr's props() merged with whatever init received (it may be nothing or {}).
  get p() { return { ...(herdrProps() ?? {}), ...(this.ip ?? {}) }; }

  init(props, cx) {
    this.ip = props;
    this.width = undefined;
    this.guard = {};
    this.query = "";
    if (this.p.menu) return;
    this.focus = cx.focus_handle();
    // S6: the search field starts closed. Write only when it is open, so a plain load leaves shared.json alone.
    if (shared("apollo.sidebar.search")) setShared("apollo.sidebar.search", false);
    // Branches Herdr does not report (unborn repos, folders that are not repos) are probed off the render path.
    this.git = {};
    this.gitTodo = [];
    cx.spawn(async (cx) => {
      for (;;) {
        if (!this.gitTodo.length) await new Promise((resolve) => { this.gitWake = resolve; });
        const todo = this.gitTodo.splice(0);
        for (const t of todo) this.git[t.id] = { ...(await probeGit(t.cwd, t.on, exec)), cwd: t.cwd };
        if (todo.length) cx.notify();
      }
    });
  }

  toggleFold(key, id) {
    const f = readFolds(key);
    f[id] = !f[id];
    writeFolds(key, f);
  }

  onKey(e) {
    if (e.key === "escape") { this.query = ""; setShared("apollo.sidebar.search", false); return; }
    if (e.key === "backspace") { this.query = [...this.query].slice(0, -1).join(""); return; }
    if (e.key_char && !e.modifiers?.platform && !e.modifiers?.control) this.query += e.key_char;
  }

  mark(n) {
    if (!n) return null;
    const el = glyph(n.kind, 14, n.attrs.color).flex_none();
    return n.attrs.spin ? el.spin(n.attrs.spin) : el;
  }

  searchField(n) {
    return h_flex().id("search-field").h(28).px(8).mb(8).gap(6).items_center().rounded(6)
      .border(1).border_color(col("input")).track_focus(this.focus)
      .on_click(() => this.focus.focus())
      .on_key_down((e, cx) => { this.onKey(e); cx.notify(); })
      .child(div().text_size(13).font_light().text_color(col(n.attrs.query ? "foreground" : "dim")).truncate()
        .child(n.attrs.query || "Filter spaces"));
  }

  newSpace() {
    return h_flex().id("new-space").h(32).px(10).gap(8).items_center().rounded(8).flex_none()
      .bg(col("raised")).border(1).border_color(col("border"))
      .hover((s) => s.border_color(col("input")))
      .on_click(() => newSpace({ run }, { cwd: focused()?.cwd, home: home() }))
      .child(glyph("plus", 18, "foreground"))
      .child(div().text_size(14).font_light().text_color(col("foreground")).child("New space"));
  }

  machine(n) {
    const [first, ...rest] = n.children;
    const header = h_flex().id(n.attrs.id).h(n.attrs.height).px(6).gap(6).items_center()
      .on_mouse_down("right", () => machineMenu({ machine: n.attrs.machine }, { openOverlay }));
    if (first.kind === "chevron") {
      const foldGlyph = first.attrs.folded ? "chevron" : "chevron-down";
      const [name, cnt] = rest;
      return header
        .child(h_flex().id(first.attrs.id).size(16).items_center().justify_center()
          .on_click((_e, cx) => { cx.stop_propagation(); this.toggleFold(foldKeys.machines, n.attrs.machine ?? "local"); cx.notify(); })
          .child(glyph(foldGlyph, 14, "dim")))
        .child(div().flex_1().text_size(13).font_normal().text_color(col("dim")).truncate().child(name.attrs.text))
        .child(div().text_size(12).font_light().text_color(col("dim")).child(cnt.attrs.text));
    }
    return header.child(div().text_size(12).font_normal().text_color(col("dim")).truncate().child(first.attrs.text));
  }

  row(r, space) {
    const a = r.attrs;
    const by = Object.fromEntries(r.children.map((c) => [c.kind, c]));
    const markNode = r.children.find((c) => ["arc", "diamond", "check"].includes(c.kind));
    const tile = by.tile.attrs;
    let el = h_flex().id(a.id).h(a.height).px(8).gap(8).items_center().rounded(8)
      .tooltip(by.name.attrs.text)
      .on_click(() => clickSpace(space, { run }))
      .on_mouse_down("right", () => spaceMenu(space, { openOverlay }));
    el = a.fill ? el.bg(col(a.fill)) : el.hover((s) => s.bg(col("raised")));
    if (by.chevron) {
      el = el.child(h_flex().id(by.chevron.attrs.id).size(16).flex_none().items_center().justify_center()
        .on_click((_e, cx) => { cx.stop_propagation(); this.toggleFold(foldKeys.spaces, space.id); cx.notify(); })
        .child(glyph(by.chevron.attrs.folded ? "chevron" : "chevron-down", 14, by.chevron.attrs.color)));
    } else if (a.height === 44) {
      el = el.child(div().w(16).flex_none()); // keeps tiles aligned when a space has no agents
    }
    let t = h_flex().size(22).rounded(6).flex_none().items_center().justify_center().bg(col(tile.color));
    if (tile.ring) t = t.border(tile.ring).border_color(col("solid_foreground"));
    el = el.child(t.child(glyph(tile.glyph, 14, tile.textColor)));
    const name = div().text_size(14).font_normal().text_color(col(by.name.attrs.color)).truncate().child(by.name.attrs.text);
    el = el.child(by.branch
      ? v_flex().flex_1().min_w(0).child(name)
        .child(h_flex().gap(4).items_center()
          .child(glyph("branch", 14, by.branch.attrs.color))
          .child(div().text_size(13).font_light().text_color(col(by.branch.attrs.color)).truncate().child(by.branch.attrs.text)))
      : v_flex().flex_1().min_w(0).child(name));
    const m = this.mark(markNode);
    return m ? el.child(m) : el;
  }

  agent(n, agent) {
    const a = n.attrs;
    let el = h_flex().id(a.id).h(28).pl(10).pr(8).gap(6).items_center().rounded(6)
      .on_click(() => clickAgent(agent, { run }));
    el = a.focused ? el.bg(col("raised")) : el.hover((s) => s.bg(col("raised")));
    if (a.icon) el = el.child((a.tint ? svg(a.icon).text_color(col(a.iconColor ?? a.color)) : image(a.icon)).size(14).flex_none());
    el = el.child(div().flex_1().text_size(13).font_light().text_color(col(a.color)).truncate().child(a.title));
    for (const c of n.children) el = el.child(c.kind === "pin" ? glyph("pin", 12, "dim").flex_none() : this.mark(c));
    return el;
  }

  space(n, byId, agentsByAddress) {
    const [row, ...agentNodes] = n.children;
    const space = byId.get(n.attrs.spaceId);
    let el = v_flex().gap(2).child(this.row(row, space));
    if (agentNodes.length) {
      el = el.child(v_flex().ml(20).border_l(1).border_color(col("border")).gap(2)
        .children(agentNodes.map((a) => this.agent(a, agentsByAddress.get(a.attrs.address)))));
    }
    return el;
  }

  popup() {
    const p = this.p;
    return v_flex().size_full().p(4).child(
      h_flex().id("new-space-here").h(32).px(8).gap(8).items_center().rounded(6)
        .hover((s) => s.bg(col("raised")))
        .on_click(() => { newSpaceHere({ machine: p.machine ?? null }, { run }, { cwd: focused()?.cwd, home: home() }); closeOverlay(p.overlay); })
        .child(glyph("plus", 18, "foreground"))
        .child(div().text_size(14).font_light().text_color(col("foreground")).child("New space here")));
  }

  // Queues a git probe for each space Herdr gives no branch for, when its folder changed (no cx use here).
  queueProbes(sp) {
    if (!this.gitTodo) return;
    const pn = panes() ?? [];
    let added = false;
    for (const s of sp) {
      if (s.branch) continue;
      const cwd = spaceCwd(s, pn);
      if (this.git[s.id]?.cwd === cwd || this.gitTodo.some((t) => t.id === s.id)) continue;
      this.gitTodo.push({ id: s.id, cwd, on: s.machine ?? null });
      added = true;
    }
    if (added && this.gitWake) { const w = this.gitWake; this.gitWake = null; w(); }
  }

  render() {
    if (this.p.menu === "machine") return this.popup();
    const zoom = Number(settings()?.zoom) || 1;
    const width = designWidth(this.width, zoom);
    guardWidth(guardTarget(width, layout()), this.guard, { run });
    const sp = spaces() ?? [], ag = agents() ?? [];
    this.queueProbes(sp);
    setAgentOrder(agentOrder(sp, ag));
    const searchOpen = !!shared("apollo.sidebar.search");
    if (!searchOpen) this.query = "";
    const vm = spacesView({
      spaces: sp, agents: ag, collapsed: isCollapsed(width), searchOpen, query: this.query,
      folded: readFolds(foldKeys.spaces), machinesFolded: readFolds(foldKeys.machines), git: this.git ?? {},
    });
    const byId = new Map(sp.map((s) => [s.id, s]));
    const agentsByAddress = new Map(ag.map((a) => [a.address, a]));
    const kids = [];
    for (const n of vm.children) {
      if (n.kind === "search-field") kids.push(this.searchField(n));
      else if (n.kind === "new-space") kids.push(this.newSpace(), div().h(12).flex_none());
      else if (n.kind === "group") {
        kids.push(v_flex().gap(2).mb(10).children(n.children.map((c) =>
          (c.kind === "machine" ? this.machine(c) : this.space(c, byId, agentsByAddress)))));
      }
    }
    return v_flex().id("root").size_full().px(8).overflow_y_scrollbar()
      .on_size_change((size, cx) => { if (size.width !== this.width) { this.width = size.width; cx.notify(); } })
      .children(kids);
  }
}
