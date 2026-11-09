// H7: a recording stand-in for gpui-kit, gpui-base and herdr, used only by tests.
// Elements are Proxies that record every chained call; `.id(x)` names the element and
// the event methods store their callbacks so loadMod() can replay exactly what main.js attached.
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { recorder } from "./stubs.js";
import { fakeTimer, fakeWatch } from "./fakes.js";

const HANDLERS = {
  on_click: "click", on_mouse_down: "mouse_down", on_scroll_wheel: "wheel",
  on_hover: "hover", on_key_down: "key_down", on_size_change: "size",
};

function element(kind, ...args) {
  const el = { kind, args, id: undefined, calls: [], children: [], handlers: {} };
  const proxy = new Proxy(el, {
    get(target, prop) {
      if (prop === "__el") return target;
      if (prop === "then" || typeof prop === "symbol") return undefined;
      return (...a) => {
        target.calls.push({ name: prop, args: a });
        if (prop === "id") target.id = a[0];
        else if (prop === "child") target.children.push(a[0]);
        else if (prop === "children") target.children.push(...(a[0] ?? []));
        else if (prop === "when") return a[0] ? a[1](proxy) ?? proxy : proxy;
        else if (prop === "on_mouse_down") (target.handlers.mouse_down ??= {})[a[0]] = a[1];
        else if (HANDLERS[prop]) target.handlers[HANDLERS[prop]] = a[a.length - 1];
        return proxy;
      };
    },
  });
  return proxy;
}

const factory = (kind) => (...a) => element(kind, ...a);
const statics = (kind) => new Proxy(factory(kind), {
  get: (f, prop) => (prop in f ? f[prop] : (...a) => element(`${kind}.${String(prop)}`, ...a)),
});

// gpui-kit / gpui-base surface (gpui-kit.d.ts export names).
export class View { constructor(props) { this.props = props; } }
export const div = factory("div"), h_flex = factory("h_flex"), v_flex = factory("v_flex");
export const svg = factory("svg"), image = factory("image"), img = factory("img");
export const list = factory("list"), uniform_list = factory("uniform_list");
export const h_virtual_list = factory("h_virtual_list"), v_virtual_list = factory("v_virtual_list");
export const h_resizable = factory("h_resizable"), v_resizable = factory("v_resizable");
export const resizable_panel = factory("resizable_panel"), dock_area = factory("dock_area");
export const dock_content = factory("dock_content"), pagination_items = factory("pagination_items");
export const set_theme = () => null;
export const [Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger, Avatar,
  AvatarFallback, AvatarImage, Background, Button, CalendarState, Checkbox, Collapsible, Combobox,
  DatePicker, DockArea, Editor, EditorState, HoverCard, Input, InputState, Link, NumberInput,
  OtpInput, OtpState, Pagination, PathBuilder, Popover, Popup, Progress, ProgressIndicator,
  ProgressTrack, Radio, RadioGroup, Scrollbar, Select, Slider, SliderIndicator, SliderState,
  SliderThumb, SliderTrack, Switch, Tab, Table, TableBody, TableCaption, TableCell, TableHead,
  TableHeader, TableRow, Tabs, Textarea, TextareaState, TextView, Toggle, ToggleGroup,
  VirtualListScrollHandle] = ["Accordion", "AccordionHeader", "AccordionItem", "AccordionPanel",
  "AccordionTrigger", "Avatar", "AvatarFallback", "AvatarImage", "Background", "Button",
  "CalendarState", "Checkbox", "Collapsible", "Combobox", "DatePicker", "DockArea", "Editor",
  "EditorState", "HoverCard", "Input", "InputState", "Link", "NumberInput", "OtpInput", "OtpState",
  "Pagination", "PathBuilder", "Popover", "Popup", "Progress", "ProgressIndicator", "ProgressTrack",
  "Radio", "RadioGroup", "Scrollbar", "Select", "Slider", "SliderIndicator", "SliderState",
  "SliderThumb", "SliderTrack", "Switch", "Tab", "Table", "TableBody", "TableCaption", "TableCell",
  "TableHead", "TableHeader", "TableRow", "Tabs", "Textarea", "TextareaState", "TextView", "Toggle",
  "ToggleGroup", "VirtualListScrollHandle"].map(statics);

// herdr surface, backed by the context of the most recent loadMod().
let ctx = null;
const data = (k, d) => () => ctx?.data?.[k] ?? d;
const rec = (fn) => (...a) => { ctx?.rec.record(fn, ...a); return ctx?.returns?.[fn]?.(...a) ?? null; };

export const spaces = data("spaces", []), machines = data("machines", []), agents = data("agents", []);
export const terminals = data("terminals", []), panes = data("panes", []), focused = data("focused", null);
export const layout = data("layout", null), theme = data("theme", {}), settings = data("settings", {});
export const keys = data("keys", {}), commands = data("commands", []), layouts = data("layouts", []);
export const themes = data("themes", []), fonts = data("fonts", []), window = data("window", {});
export const placement = data("placement", null), updates = data("updates", null), telemetry = data("telemetry", null);
export const home = () => ctx?.data?.home ?? "/home/test";
export const appHome = () => ctx?.data?.appHome ?? "/home/test/.config/herdr-app";
export const props = () => ctx?.props ?? {};
export const shared = (key) => ctx?.shared.get(key);
export function setShared(key, value) { ctx?.shared.set(key, value); ctx?.rec.setShared(key, value); return null; }
export function run(name, args) { return ctx?.rec.run(name, args) ?? null; }
export function openOverlay(spec) { return ctx?.rec.openOverlay(spec) ?? null; }
export function notify(n) { return ctx?.rec.notify(n) ?? null; }
export const closeOverlay = rec("closeOverlay"), setAgentOrder = rec("setAgentOrder");
export const playSound = rec("playSound"), pickFolder = rec("pickFolder");
export const writeTextFile = (...a) => { ctx?.rec.record("writeTextFile", ...a); return Promise.resolve(null); };
export const exec = (cmd, args, opts) => { ctx?.rec.record("exec", cmd, { args, opts }); return (ctx?.exec ?? (async () => ({ code: 0, stdout: "", stderr: "" })))(cmd, args, opts); };
export const hc = (args) => exec("hc", args);
export const readTextFile = (path, opts) => { ctx?.rec.record("readTextFile", path, opts); return Promise.resolve(ctx?.files?.[path] ?? null); };
export const watchFolder = (dir) => { ctx?.rec.record("watchFolder", dir); return ctx.watch.watchFolder(dir); };
export const knownAgents = (opts) => { ctx?.rec.record("knownAgents", opts); return Promise.resolve(ctx?.data?.knownAgents ?? []); };
export function nextCommand() {
  const q = ctx.commands;
  if (q.pending.length) return Promise.resolve(q.pending.shift());
  return new Promise((resolve) => q.waiters.push(resolve));
}
export const [presentUpdateNotes, sendFeedback, feedbackAttachImages, feedbackClearImages,
  feedbackPasteImage, feedbackPickImages, feedbackPreview] = ["presentUpdateNotes", "sendFeedback",
  "feedbackAttachImages", "feedbackClearImages", "feedbackPasteImage", "feedbackPickImages",
  "feedbackPreview"].map(rec);

function makeCx(c) {
  return {
    notify: () => { c.notifies += 1; },
    spawn: (fn) => { const p = Promise.resolve().then(() => fn(makeCx(c))); p.catch(() => {}); c.tasks.push(p); return { cancel() {} }; },
    timer: { every: (ms, fn) => c.timer.every(ms, () => fn(makeCx(c))) },
    focus_handle: () => ({ focus() { c.focused = true; }, is_focused: () => !!c.focused }),
    stop_propagation: () => { c.stopped += 1; },
  };
}

function collect(node, out = new Map()) {
  const el = node?.__el;
  if (!el) return out;
  if (el.id !== undefined) out.set(el.id, el);
  for (const ch of el.children) collect(ch, out);
  for (const call of el.calls) for (const a of call.args) if (a?.__el && !el.children.includes(a)) collect(a, out);
  return out;
}

let loads = 0;
export async function loadMod(dir, opts = {}) {
  const { data: d = {}, props: p = {}, size, exec: ex, files, shared: seed = {} } = opts;
  // initProps: what init(props) receives (default: the same props); props() always returns `props`.
  const ip = "initProps" in opts ? opts.initProps : p;
  const r = recorder();
  const c = {
    data: d, props: p, rec: r, exec: ex, files, shared: new Map(Object.entries(seed)), notifies: 0, stopped: 0, tasks: [],
    commands: { pending: [], waiters: [] }, timer: fakeTimer(), watch: fakeWatch(),
  };
  ctx = c;
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const url = `${pathToFileURL(resolvePath(dir, "main.js")).href}?load=${++loads}`;
  const Mod = (await import(url)).default;
  const view = new Mod(ip);
  if (typeof view.init === "function") view.init(ip, makeCx(c));
  let tree = null, byId = new Map();
  const render = () => { ctx = c; tree = view.render(makeCx(c)); byId = collect(tree); return tree; };
  render();
  if (size) {
    const root = [...byId.values()].find((e) => e.handlers.size);
    if (root) { root.handlers.size(size, makeCx(c)); render(); }
  }
  const handler = (id, kind) => {
    const el = byId.get(id);
    if (!el) throw new Error(`no element with id ${id}`);
    const h = kind === "right" || kind === "left" ? el.handlers.mouse_down?.[kind] : el.handlers[kind];
    if (!h) throw new Error(`element ${id} has no ${kind} handler`);
    ctx = c;
    return h;
  };
  const after = (v) => { render(); return v; };
  return {
    view, rec: r, ctx: c,
    render,
    tree: () => tree,
    ids: () => [...byId.keys()],
    click: (id) => after(handler(id, "click")({ button: "left" }, makeCx(c))),
    rightClick: (id) => after(handler(id, "right")({ button: "right" }, makeCx(c))),
    press: (id) => after(handler(id, "left")({ button: "left" }, makeCx(c))),
    key: (id, key, extra = {}) => after(handler(id, "key_down")({
      key, keystroke: key, key_char: key.length === 1 ? key : undefined, modifiers: {}, ...extra,
    }, makeCx(c))),
    wheel: (id, dy) => after(handler(id, "wheel")({ delta: { x: 0, y: dy } }, makeCx(c))),
    resize: (id, sz) => after(handler(id, "size")(sz, makeCx(c))),
    hover: (id, on = true) => after(handler(id, "hover")(on, makeCx(c))),
    command(name) {
      const q = c.commands;
      if (q.waiters.length) q.waiters.shift()(name); else q.pending.push(name);
    },
  };
}
