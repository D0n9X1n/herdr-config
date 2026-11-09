#!/usr/bin/env bash
# shellcheck disable=SC1010 # `herdr-app do` is a subcommand, not a loop keyword
# A01 runtime probe (LIVE). Answers P1-P10 against the running Herdr, then rolls everything back.
# Usage: bash scripts/probe-runtime.sh [--hold]
#   --hold: after the probe layout shows, print HOLDING and wait (for the live kill test).
# Claims layouts/apollo-runtime-probe.json, mods/apollo-runtime-probe (a link to a temp dir it owns),
# layouts/.state/apollo-runtime-probe.json and data/apollo-runtime-probe, and refuses if any exists. Never changes zoom or
# settings, never automates keys, never writes into a link it did not create.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd -P)
# shellcheck source=lib/live.sh
. "$REPO/scripts/lib/live.sh"

HOLD=0; [ "${1:-}" = --hold ] && HOLD=1
NAME=apollo-runtime-probe
H=$HERDR_HOME
for tool in herdr-app hc jq node; do command -v "$tool" >/dev/null || { echo "missing $tool" >&2; exit 1; }; done
for rel in "layouts/$NAME.json" "mods/$NAME" "layouts/.state/$NAME.json" "data/$NAME"; do
  if [ -e "$H/$rel" ] || [ -L "$H/$rel" ]; then echo "refusing: $rel exists and is not ours" >&2; exit 3; fi
done

# Only names containing the probe's name are ever listed.
probe_names() {
  local d
  for d in "$H" "$H/mods" "$H/layouts" "$H/layouts/.state" "$H/data"; do
    if [ -d "$d" ]; then find "$d" -mindepth 1 -maxdepth 1 -name "*$NAME*" -print; fi
  done | LC_ALL=C sort || true
}

live_begin rollback
live_claim "layouts/.state/$NAME.json"
live_claim "data/$NAME"   # Herdr creates data/<mod>/ for a loaded mod (P10)
live_claim "layouts/$NAME.error"
live_claim "mods/$NAME"
live_claim "layouts/$NAME.json"
probe_names > "$LIVE_DIR/names.before"

F="$LIVE_DIR/findings"; SRC="$LIVE_DIR/mod"; OUTD="$LIVE_DIR/out"
mkdir -p "$F" "$SRC" "$OUTD"
rec() { printf '%s\n' "$2" > "$F/$1"; echo "  $1: $2" >&2; }
out() { cat "$OUTD/$1.json" 2>/dev/null || cat "$SRC/.out-$1.json" 2>/dev/null || true; }
outq() { local o; o=$(out "$1"); [ -n "$o" ] && jq -r "$2" <<<"$o" 2>/dev/null; }
has_out() { [ -n "$(out "$1")" ]; }
side_w() { outq sidebar '.sizes[-1].w // empty'; }
side_w_is() { [ "$(side_w)" = "$1" ]; }
px_is() { [ "$(state_sidebar_px "$NAME")" = "$1" ]; }
cmd_seen() { [ "$(outq "$1" "[.commands[] | select(. == \"$2\")] | length")" -gt 0 ] 2>/dev/null; }
key_set() { [ -n "$(outq sidebar ".$1 // empty")" ]; }
NCMD=0
send() { # send <command>: via herdr-app do <mod>.<command> when P5 works, else via the command file.
  if [ "${VIA_DO:-0}" = 1 ]; then herdr-app do "$NAME.$1" >/dev/null 2>&1 || true
  else NCMD=$((NCMD + 1)); printf '%s %s\n' "$NCMD" "$1" >> "$SRC/.cmd"; fi
}

printf '{"place":"none"}\n' > "$SRC/mod.json"
: > "$SRC/.cmd"
cat > "$SRC/main.js" <<'JS'
import { View, div } from "gpui-kit";
import { props, layout, window as herdrWindow, writeTextFile, readTextFile, nextCommand,
  openOverlay, focused, appHome } from "herdr";

const find = (n, id) => {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) { const r = find(c, id); if (r) return r; }
  return null;
};
const bare = (n) => { if (!n) return null; const { children, ...rest } = n; return rest; };

export default class Probe extends View {
  init(_p, cx) {
    const pr = props() ?? {};
    this.role = pr.role ?? "none";
    this.dir = pr.dir;
    this.cmd = pr.cmd;
    this.seen = 0;
    this.f = { role: this.role, props: pr, sizes: [], commands: [], errors: [] };
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); this.handle(c); cx.notify(); } });
    cx.timer.every(400, () => { this.tick().catch((e) => this.err("tick", e)); });
    this.tick().catch((e) => this.err("tick", e));
  }
  err(where, e) { if (this.f.errors.length < 20) this.f.errors.push(`${where}: ${e}`); this.save(); }
  handle(c) {
    this.f.commands.push(c);
    if (this.role === "sidebar" && c === "popup") {
      try { this.f.popupId = openOverlay({ mod: "apollo-runtime-probe", kind: "popup", width: 240, height: 80,
        props: { role: "popup", dir: this.dir } }); } catch (e) { this.err("popup", e); }
    }
    if (this.role === "sidebar" && c === "menu") {
      try {
        const space = focused()?.space ?? null;
        this.f.menuSpace = space;
        this.f.menuId = openOverlay({ mod: "menu", kind: "popup", props: { tab: "space", target: { space } } });
      } catch (e) { this.err("menu", e); }
    }
    this.save();
  }
  async tick() {
    let dirty = false;
    const L = layout();
    const snap = JSON.stringify({ topKeys: L && typeof L === "object" ? Object.keys(L) : typeof L,
      panel: bare(find(L, "panel")), sidebar: bare(find(L, "sidebar")) });
    if (snap !== this.snap) { this.snap = snap; this.f.layout = JSON.parse(snap); dirty = true; }
    if (!this.f.window) { try { this.f.window = herdrWindow() ?? "null"; dirty = true; } catch (e) { this.f.window = `error: ${e}`; } }
    if (this.role === "sidebar" && this.cmd) {
      const t = await readTextFile(this.cmd);
      for (const line of (t ?? "").split("\n")) {
        const m = /^(\d+) (\S+)$/.exec(line);
        if (m && Number(m[1]) > this.seen) { this.seen = Number(m[1]); this.handle(`file:${m[2]}`); this.handle(m[2]); }
      }
    }
    if (dirty) this.save();
  }
  save() {
    if (!this.dir) return;
    if (this.saving) { this.again = true; return; }
    this.saving = true; this.again = false;
    const text = JSON.stringify(this.f);
    const paths = this.via ? [this.via] : [`${this.dir}/${this.role}.json`, `${appHome()}/mods/apollo-runtime-probe/.out-${this.role}.json`];
    (async () => {
      for (const p of paths) {
        try { const prev = await readTextFile(p); await writeTextFile(p, text, prev); this.via = p; this.f.writeVia = p; return; }
        catch (e) { this.f.writeErrors = [...(this.f.writeErrors ?? []), `${p}: ${e}`].slice(-5); }
      }
    })().finally(() => { this.saving = false; if (this.again) this.save(); });
  }
  render() {
    const last = this.f.sizes[this.f.sizes.length - 1];
    return div().id("root").size_full()
      .on_size_change((size, cx) => {
        this.f.sizes.push({ w: size.width, h: size.height });
        if (this.f.sizes.length > 20) this.f.sizes.shift();
        this.save();
        cx.notify();
      })
      .child(div().text_size(11).child(`probe ${this.role} ${last ? last.w : "?"}`));
  }
}
JS

# P10 part 1: what `herdr-app check` writes into a mod dir (on a private copy).
cp -R "$SRC" "$LIVE_DIR/check-copy"
if herdr-app check "$LIVE_DIR/check-copy" > "$LIVE_DIR/check.out" 2>&1; then rec check "pass"; else rec check "FAIL $(tr '\n' ' ' < "$LIVE_DIR/check.out")"; exit 1; fi
rec p10_check_files "$(cd "$LIVE_DIR/check-copy" && find . -mindepth 1 -print | LC_ALL=C sort | tr '\n' ' ')"

PROPS() { jq -cn --arg role "$1" --arg dir "$OUTD" --arg cmd "$SRC/.cmd" '{role: $role, dir: $dir, cmd: $cmd}'; }
jq -n --argjson s "$(PROPS sidebar)" --argjson b "$(PROPS body)" --argjson a "$(PROPS pa)" --argjson c "$(PROPS pb)" '{
  id: "root", type: "row", divider: {width: 1, color: "border"},
  children: [
    {id: "sidebar", type: "column", size: {px: 240}, min: 40, max: 480,
     children: [{id: "probe-side", type: "block", content: {mod: "apollo-runtime-probe", props: $s}}]},
    {id: "work", type: "column", children: [
      {id: "probe-body", type: "block", size: {px: 60}, content: {mod: "apollo-runtime-probe", props: $b}},
      {id: "main", type: "block", content: {tab: "active"}}]},
    {id: "panel", type: "stack", active: "pa", size: {px: 220}, children: [
      {id: "pa", type: "block", content: {mod: "apollo-runtime-probe", props: $a}},
      {id: "pb", type: "block", content: {mod: "apollo-runtime-probe", props: $c}}]}]}' > "$LIVE_DIR/layout.json"

ln -s "$SRC" "$H/mods/$NAME"
cp "$LIVE_DIR/layout.json" "$H/layouts/$NAME.json"
herdr-app do layout.switch "{\"name\":\"$NAME\"}" > "$LIVE_DIR/switch.out" 2>&1 || { cat "$LIVE_DIR/switch.out" >&2; exit 1; }
wait_for 15 has_out sidebar || { echo "probe mod never reported" >&2; herdr-app status | jq -c .errors >&2; exit 1; }
wait_for 5 side_w_is 240 || true
rec status_after_switch "$(herdr-app status | jq -c '{layout, zoom, errors}')"

if [ "$HOLD" = 1 ]; then
  echo HOLDING
  sleep 600 &
  wait $!
fi

ZOOM=$(herdr-app status | jq '.zoom')
rec zoom "$ZOOM"
rec write_via "$(outq sidebar '.writeVia // "none"') errors=$(outq sidebar '.writeErrors // [] | length')"

# P1/P2: on_size_change width vs the layout px at the current zoom; the .state px.
rec p1_sidebar_w_at_px240 "$(side_w)"
rec p1_body_w "$(outq body '.sizes[-1].w // empty')"
rec p2_state_px_before_resize "$(state_sidebar_px "$NAME" || true)"
rec p2_state_sidebar_node "$(jq -c '.nodes.sidebar // null' "$H/layouts/.state/$NAME.json" 2>/dev/null || echo absent)"

# P3: layout.resize --px 300.
r=0; o=$(herdr-app do layout.resize '{"id":"sidebar","px":300}' 2>&1) || r=$?
rec p8_do_json_form "$(printf '%s' "$o" | tr -d '\n') exit=$r"
wait_for 5 px_is 300 || true
wait_for 5 side_w_is 300 || true
rec p3_state_px_after_resize_300 "$(state_sidebar_px "$NAME" || echo none)"
rec p3_sidebar_w_after_resize_300 "$(side_w)"
rec p3_layout_sidebar_node "$(outq sidebar '.layout.sidebar | tostring')"

# P4: layout() and .state after hide / show / select.
p4() { sleep 1.2; rec "p4_$1" "layout()=$(outq sidebar '.layout.panel | tostring') state=$(jq -c '.nodes.panel // null' "$H/layouts/.state/$NAME.json" 2>/dev/null || echo absent)"; }
p4 initial
herdr-app do layout.hide '{"id":"panel"}' >/dev/null; p4 after_hide
herdr-app do layout.show '{"id":"panel"}' >/dev/null; p4 after_show
herdr-app do layout.select '{"stack":"panel","child":"pb"}' >/dev/null; p4 after_select_pb
rec p4_layout_top_keys "$(outq sidebar '.layout.topKeys | tostring')"

# P5: <mod>.<command> through herdr-app do.
r=0; o=$(herdr-app do "$NAME.ping" 2>&1) || r=$?
rec p5_do_ping_reply "$(printf '%s' "$o" | tr -d '\n') exit=$r"
sleep 1.5
VIA_DO=0; got=""
for r in sidebar body pa pb; do if cmd_seen "$r" ping; then got="$got $r"; VIA_DO=1; fi; done
rec p5_ping_reached "${got:-none}"
send popup
wait_for 5 key_set popupId || true
sleep 1
rec p5_popup_route "$([ "$VIA_DO" = 1 ] && echo "herdr-app do" || echo "command file") popupId=$(outq sidebar '.popupId // "none"')"
rec p5_status_overlays_popup "$(herdr-app status | jq -c '.overlays')"
rec p5_popup_copy_props "$(outq popup '.props | tostring')"
herdr-app do overlay.close >/dev/null 2>&1 || true
sleep 0.5

# P7: the shipped menu as a space popup.
send menu
wait_for 5 key_set menuId || true
sleep 1.5
rec p7_menu_id "$(outq sidebar '.menuId // "none"') space=$(outq sidebar '.menuSpace // "none"') errors=$(outq sidebar '.errors | tostring')"
rec p7_status_overlays_menu "$(herdr-app status | jq -c '.overlays')"
if herdr-app shot "$LIVE_DIR/menu.png" >/dev/null 2>&1; then rec p7_shot "$LIVE_DIR/menu.png"; else rec p7_shot failed; fi
herdr-app do overlay.close >/dev/null 2>&1 || true
sleep 0.5
rec p7_overlays_after_close "$(herdr-app status | jq -c '.overlays')"

# P6: window.json and the shot's physical width.
rec p6_window_json "$(jq -c . "$H/window.json")"
rec p6_window_api "$(outq sidebar '.window | tostring')"
if [ -f "$LIVE_DIR/menu.png" ]; then
  rec p6_shot_px "$(node -e 'const b=require("fs").readFileSync(process.argv[1]);console.log(b.readUInt32BE(16)+"x"+b.readUInt32BE(20))' "$LIVE_DIR/menu.png")"
fi

# P8: id formats.
rec p8_ids "$(herdr-app ls | jq -c '[.spaces[0] | {space: .id, tab: .tabs[0].id, pane: .tabs[0].terminals[0].pane, terminal: .tabs[0].terminals[0].terminal}]')"

# P9: HC_TERMINAL_ID in a new tab.
SP=$(jq -r '.space' "$LIVE_DIR/status.json")
TAB=$(live_new_tab "$(jq -cn --arg s "$SP" '{space: $s, name: "apollo-probe-p9", argv: ["/bin/sh", "-c", "echo HCID=$HC_TERMINAL_ID; sleep 30"]}')") || TAB=""
TERM_ID=""
if [ -n "$TAB" ]; then TERM_ID=$(herdr-app ls | jq -r --arg t "$TAB" '[.spaces[].tabs[] | select(.id == $t) | .terminals[0].terminal] | first // empty'); fi
NEW="tab=$TAB terminal=$TERM_ID (owned via live_new_tab)"
hcid() { hc read "$TERM_ID" 2>/dev/null | grep -o 'HCID=[^[:space:]]*' | head -1; }
hcid_set() { [ -n "$(hcid)" ]; }
if [ -n "$TERM_ID" ]; then wait_for 5 hcid_set || true; fi
rec p9_new_tab "$NEW"
rec p9_hc_read "$(if [ -n "$TERM_ID" ]; then hcid; else echo none; fi) (terminal=$TERM_ID)"
if [ -n "$TAB" ]; then herdr-app do tab.close "$(jq -cn --arg id "$TAB" '{id: $id, confirmed: true}')" >/dev/null 2>&1 || true; fi
_live_reselect

# P10 part 2: what Herdr generated inside the linked mod dir.
rec p10_linked_dir_files "$(cd "$SRC" && find . -mindepth 1 -print | LC_ALL=C sort | tr '\n' ' ')"
rec status_errors_end "$(herdr-app status | jq -c '.errors')"

rb=0; live_rollback || rb=1
sleep 2
leftover=$(probe_names | grep -vxF -f "$LIVE_DIR/names.before" || true)
if [ -n "$leftover" ]; then rb=0; live_rollback || rb=1; sleep 1; leftover=$(probe_names | grep -vxF -f "$LIVE_DIR/names.before" || true); fi
rec leftover_names "${leftover:-none}"
vr=0; live_verify || vr=$?
live_finalize >/dev/null
echo "findings: $F"
[ -z "$leftover" ] && [ "$rb" -eq 0 ] && [ "$vr" -eq 0 ] || { echo "FAIL: leftovers, restore failure or live_verify mismatch" >&2; exit 1; }
echo "probe: ok"
