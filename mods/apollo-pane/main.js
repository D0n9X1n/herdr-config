// apollo-pane: the pane header (one copy per pane, props().pane). Logic lives in lib.js.
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, run, theme, props as herdrProps } from "herdr";
import { paneActions, paneHeader, hoverButtons } from "./lib.js";

const FALLBACK = { foreground: "#cfbc97", muted: "#d5c4a1", dim: "#928374", raised: "#1c1f20", hover: "#32302f", border: "#3c3836",
  working: "#fabd2f", blocked: "#fb4934", done: "#b8bb26" };
const col = (name) => theme()?.[name] ?? FALLBACK[name] ?? name;
const glyph = (name, size, color) => svg(`mods/apollo-pane/${name}.svg`).size(size).text_color(col(color));
const badge = (text) => div().px(6).h(18).rounded(4).border(1).border_color(col("border")).flex_none()
  .text_size(12).font_light().text_color(col("dim")).child(text);

export default class Pane extends View {
  // Props are read live: Herdr's props() merged with whatever init received (it may be nothing or {}).
  get p() { return { ...(herdrProps() ?? {}), ...(this.ip ?? {}) }; }

  init(props) {
    this.ip = props;
    this.hovered = false;
  }

  render() {
    const pane = this.p.pane;
    const h = paneHeader(pane, panes());
    const acts = Object.fromEntries(paneActions(pane, { run }).map((a) => [a.id, a]));
    let row = h_flex().id("header").size_full().px(8).gap(6).items_center()
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); });
    if (h?.icon) row = row.child((h.tint ? svg(h.icon).text_color(col(h.iconColor ?? "muted")) : image(h.icon)).size(14).flex_none());
    row = row.child(div().flex_1().min_w(0).text_size(13).font_light().text_color(col(h?.focused ? "foreground" : "muted")).truncate()
      .child(h?.title ?? ""));
    if (h?.folder) row = row.child(badge(h.folder));
    if (h?.branch) {
      row = row.child(h_flex().gap(4).items_center().flex_none()
        .child(glyph("branch", 14, "dim")).child(badge(h.branch)));
    }
    if (h?.mark) {
      const m = glyph(h.mark.kind, 14, h.mark.color).flex_none();
      row = row.child(h.mark.kind === "arc" ? m.spin(900) : m);
    }
    for (const id of hoverButtons(this.hovered)) {
      row = row.child(h_flex().id(id).size(22).rounded(4).flex_none().items_center().justify_center()
        .hover((s) => s.bg(col("hover")))
        .on_click(() => acts[id].fire())
        .child(glyph(id, 16, "dim")));
    }
    return row;
  }
}
