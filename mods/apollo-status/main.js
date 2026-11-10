// apollo-status: the status bar under the work card. Read-only: no handlers. Logic in lib.js.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme } from "herdr";
import { statusModel } from "./lib.js";

const FALLBACK = { muted: "#d5c4a1", dim: "#928374", blocked: "#fb4934" };
const col = (name) => theme()?.[name] ?? FALLBACK[name] ?? name;
const glyph = (name, size, color) => svg(`mods/apollo-status/${name}.svg`).size(size).text_color(col(color));
const text = (t, color) => div().text_size(12.5).font_light().text_color(col(color)).truncate().child(t);

export default class Status extends View {
  render() {
    const m = statusModel(spaces(), agents());
    let row = h_flex().size_full().px(10).gap(12).items_center().child(text(m.machine, "muted"));
    if (m.branch) row = row.child(h_flex().gap(4).items_center().child(glyph("branch", 14, "dim")).child(text(m.branch, "dim")));
    return row
      .child(div().flex_1())
      .child(text(m.text.agents, "muted"))
      .child(text(m.text.blocked, m.blockedColor))
      .child(text(m.hint, "dim"));
  }
}
