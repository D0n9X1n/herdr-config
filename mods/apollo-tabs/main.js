// apollo-tabs: the tab pills, + button and panel buttons at the top of the work card, and the + popup
// (props.menu === "plus"). On Windows and Linux the row ends with the window buttons. Logic lives in lib.js.
import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  spaces, panes, run, openOverlay, closeOverlay, nextCommand, knownAgents, layout, readTextFile, appHome, theme,
  props as herdrProps, window as herdrWindow, hc,
} from "herdr";
import {
  activeSpace, tabPills, selectTab, closeTab, onWheel, handleCommand, loadAgents, plusMenu, pickPlus,
  panelState, loadPanelState, panelClick, plusAnchor, PLUS_MENU_W, windowButtons, WIN_BUTTON_W,
  checkElevation, showAdmin, ADMIN_EVERY,
} from "./lib.js";

const FALLBACK = {
  foreground: "#cfbc97", muted: "#d5c4a1", dim: "#928374", raised: "#1c1f20", selected: "#3c3836", border: "#3c3836",
  working: "#fabd2f", blocked: "#fb4934", done: "#b8bb26", accent: "#fabd2f",
};
const col = (name) => theme()?.[name] ?? FALLBACK[name] ?? name;
const glyph = (name, size, color) => svg(`mods/apollo-tabs/${name}.svg`).size(size).text_color(col(color));
const MARKS = { working: "arc", blocked: "diamond", done: "check" };
const PANELS = [["files", "Files"], ["changes", "Changes"], ["specs", "Specs"]];
const stop = (_e, cx) => cx.stop_propagation(); // the tab row is a window_drag block
const CLOSE_RED = "#c42b1c"; // the Windows close-button hover

export default class Tabs extends View {
  // Props are read live: Herdr's props() merged with whatever init received (it may be nothing or {}).
  get p() { return { ...(herdrProps() ?? {}), ...(this.ip ?? {}) }; }

  init(props, cx) {
    this.ip = props;
    this.agents = [];
    if (this.p.menu === "plus") {
      const space = (spaces() ?? []).find((s) => s.id === this.p.space) ?? { id: this.p.space, machine: null };
      cx.spawn(async (cx) => { this.agents = await loadAgents(space, knownAgents); cx.notify(); });
      return;
    }
    // Windows: is herdr-core (and so every local terminal) elevated? Never asked elsewhere.
    this.admin = "unknown";
    if (herdrWindow()?.platform === "windows") {
      const check = async (cx) => {
        const state = await checkElevation(hc);
        if (state !== this.admin) { this.admin = state; cx.notify(); }
      };
      cx.spawn(check);
      cx.timer.every(ADMIN_EVERY, check);
    }
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "menu") this.openPlus();
        else handleCommand(c, spaces(), { run });
        cx.notify();
      }
    });
  }

  openPlus() {
    const sp = activeSpace(spaces());
    if (!sp) return;
    const buttonsW = windowButtons(herdrWindow()).length * WIN_BUTTON_W;
    const at = plusAnchor({ layout: layout(), rootW: this.rootW, panelsW: this.panelsW, buttonsW });
    openOverlay({ mod: "apollo-tabs", kind: "popup", width: PLUS_MENU_W, ...(at ? { at } : {}), props: { menu: "plus", space: sp.id } });
  }

  pill(p, admin) {
    let el = h_flex().id(`tab-${p.id}`).h(28).px(10).gap(6).items_center().rounded(6).flex_none()
      .on_mouse_down("left", stop)
      .on_click(() => selectTab(p, { run }));
    el = p.active ? el.bg(col("selected")) : el.hover((s) => s.bg(col("raised")));
    // First, so it is never read as the trailing red "blocked" status mark.
    if (admin) el = el.child(glyph("admin", 12, "blocked").flex_none());
    if (p.icon) el = el.child((p.tint ? svg(p.icon).text_color(col("muted")) : image(p.icon)).size(14).flex_none());
    el = el.child(div().text_size(12).text_color(col(p.active ? "foreground" : "muted")).truncate().child(p.label));
    if (MARKS[p.status]) {
      const m = glyph(MARKS[p.status], 12, p.status).flex_none();
      el = el.child(p.status === "working" ? m.spin(900) : m);
    }
    if (p.active) {
      el = el.child(h_flex().id(`close-${p.id}`).size(16).rounded(4).items_center().justify_center()
        .hover((s) => s.bg(col("raised")))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); closeTab(p, { run }); })
        .child(glyph("close", 10, "dim")));
    }
    return el;
  }

  panelButton(child, label, st) {
    const on = st.shown && st.active === child;
    let el = h_flex().id(`panel-${child}`).h(28).px(8).gap(6).items_center().rounded(6).flex_none()
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => {
        cx.spawn(async () => panelClick(child, await loadPanelState({ layout, readTextFile, appHome }), { run }));
      })
      .child(glyph(child, 14, on ? "foreground" : "dim"))
      .child(div().text_size(12).text_color(col(on ? "foreground" : "muted")).child(label));
    el = on ? el.bg(col("selected")) : el.hover((s) => s.bg(col("raised")));
    return el;
  }

  // Minimize, maximize/restore and close: full height, flush with the card's top-right corner.
  windowButton(b) {
    let el = h_flex().id(`win-${b.id}`).w(WIN_BUTTON_W).h_full().flex_none().items_center().justify_center()
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); run(b.command); });
    el = b.danger
      ? el.rounded_tr(11).text_color(col("muted")).hover((s) => s.bg(CLOSE_RED).text_color("#ffffff"))
      : el.text_color(col("muted")).hover((s) => s.bg(col("raised")));
    return el.child(svg(`mods/apollo-tabs/${b.icon}.svg`).size(10));
  }

  popup() {
    const p = this.p;
    const space = (spaces() ?? []).find((s) => s.id === p.space) ?? { id: p.space, machine: null };
    const done = () => closeOverlay(p.overlay);
    const item = (n) => {
      const a = n.attrs;
      let el = h_flex().id(a.id).h(30).px(8).gap(8).items_center().rounded(6)
        .hover((s) => s.bg(col("raised")))
        .on_click(() => { pickPlus(n, space, { run, openOverlay }); done(); });
      if (a.icon) el = el.child((a.tint ? svg(a.icon).text_color(col("muted")) : image(a.icon)).size(14).flex_none());
      el = el.child(div().flex_1().text_size(13).text_color(col("foreground")).truncate().child(a.label));
      if (a.shortcut) el = el.child(div().text_size(12).text_color(col("dim")).child(a.shortcut));
      return el;
    };
    const kids = [];
    for (const n of plusMenu(this.agents).children) {
      if (n.kind === "item") kids.push(item(n));
      else if (n.kind === "agent-section") {
        kids.push(div().h(1).bg(col("border")).flex_none(),
          div().px(8).pt(6).pb(2).text_size(11).text_color(col("dim")).child(n.attrs.label),
          ...n.children.map(item),
          div().h(1).bg(col("border")).flex_none());
      }
    }
    return v_flex().size_full().p(4).gap(2).children(kids);
  }

  render() {
    if (this.p.menu === "plus") return this.popup();
    const sp = activeSpace(spaces());
    const st = panelState({ layout: layout() });
    const buttons = windowButtons(herdrWindow());
    let root = h_flex().id("root").size_full().pl(8).gap(4).items_center();
    if (!buttons.length) root = root.pr(8);
    root = root
      .on_size_change((sz) => { this.rootW = sz.width; })
      .child(h_flex().id("tabs").flex_1().min_w(0).gap(4).items_center().overflow_hidden()
        .on_scroll_wheel((e) => {
          const d = e.delta_lines?.y ?? e.delta?.y ?? 0;
          onWheel(Math.sign(d), { run });
        })
        .children(tabPills(sp, panes()).map((p) => this.pill(p, showAdmin(this.admin, sp)))))
      .child(h_flex().id("plus").size(28).rounded(6).flex_none().items_center().justify_center()
        .hover((s) => s.bg(col("raised")))
        .on_mouse_down("left", stop)
        .on_click(() => this.openPlus())
        .child(glyph("more", 16, "dim")))
      .child(h_flex().id("panels").flex_none().pl(12).gap(4).items_center()
        .on_size_change((sz) => { this.panelsW = sz.width; })
        .children(PANELS.map(([child, label]) => this.panelButton(child, label, st))));
    if (buttons.length) root = root.child(h_flex().id("window-buttons").h_full().flex_none()
      .children(buttons.map((b) => this.windowButton(b))));
    return root;
  }
}
