// apollo-chrome: brand block (sidebar top) and footer (props.footer). Logic lives in lib.js.
import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, setShared, shared, settings as appSettings, window as herdrWindow, theme, props as herdrProps } from "herdr";
import {
  collapse, expand, settings, brandView, footerView, isCollapsed,
} from "./lib.js";

const FALLBACK = { foreground: "#cfbc97", muted: "#d5c4a1", dim: "#928374", raised: "#1c1f20", border: "#3c3836" };
const col = (name) => theme()?.[name] ?? FALLBACK[name] ?? name;
const glyph = (name, size, color) => svg(`mods/apollo-chrome/${name}.svg`).size(size).text_color(col(color));
const handlers = { run, setShared };

export default class Chrome extends View {
  // Props are read live at render: Herdr's props() merged with whatever init received (nothing, or {}).
  get footer() { return !!({ ...(herdrProps() ?? {}), ...(this.ip ?? {}) }).footer; }

  init(props) {
    this.ip = props;
    this.width = undefined;
  }

  // A brand control (28×28). It stops the press so the window_drag block does not start a drag.
  control(id, icon, onClick) {
    return h_flex().id(id).size(28).rounded(4).flex_none().items_center().justify_center()
      .hover((s) => s.bg(col("raised")))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => onClick())
      .child(glyph(icon, 18, "dim"));
  }

  brand(vm) {
    const icon = vm.children.find((n) => n.kind === "app-icon").attrs;
    const row = h_flex().size_full().items_center().pr(8).pl(icon.x)
      .child(image(icon.src).size(icon.size).rounded(icon.radius).flex_none())
      .child(div().flex_1());
    if (vm.attrs.collapsed) {
      return row.child(this.control("panel-open", "panel-open", () => expand({ saved: shared("apollo.sidebar.width") }, handlers)));
    }
    return row
      .child(this.control("search", "search", () => setShared("apollo.sidebar.search", !shared("apollo.sidebar.search"))))
      .child(div().w(4).flex_none())
      .child(this.control("panel-close", "panel-close",
        () => collapse({ observed: this.width, zoom: Number(appSettings()?.zoom) || 1 }, handlers)));
  }

  footerRow(row, action) {
    return h_flex().id(row.attrs.id).h(32).px(8).gap(8).items_center().rounded(6)
      .hover((s) => s.bg(col("raised")))
      .on_click(() => action(handlers))
      .child(glyph(row.children[0].kind, 18, "dim"))
      .child(div().text_size(14).font_light().text_color(col("muted")).truncate().child(row.attrs.label));
  }

  footerEl(vm) {
    const [settingsRow] = vm.children;
    return v_flex().size_full().border_t(1).border_color(col("border")).pt(8).px(8).pb(7).gap(2)
      .child(this.footerRow(settingsRow, settings));
  }

  render() {
    const collapsed = isCollapsed(this.width);
    const win = herdrWindow() ?? {};
    const body = this.footer
      ? this.footerEl(footerView({ collapsed }))
      : this.brand(brandView({ collapsed, platform: win.platform, fullscreen: !!win.fullscreen }));
    return div().id("root").size_full()
      .on_size_change((size, cx) => { if (size.width !== this.width) { this.width = size.width; cx.notify(); } })
      .child(body);
  }
}
