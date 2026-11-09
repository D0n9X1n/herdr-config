#!/usr/bin/env bash
# shellcheck disable=SC1010 # `herdr-app do` is a subcommand, not a loop keyword
# Live smoke tests against the owner's running Herdr. Every change is temporary (L1 rollback mode).
#   bash scripts/smoke.sh theme-keys [--hold]   A22: runtime theme and keys, last-pane close
#   bash scripts/smoke.sh check-theme-keys <probe-output.json>   the theme/keys assertions alone (offline)
# Never changes zoom or settings, never automates keys, never writes into a link target.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd -P)
# shellcheck source=lib/live.sh
. "$REPO/scripts/lib/live.sh"

fail() { echo "FAIL smoke: $*" >&2; exit 1; }

APOLLO_MODS="apollo-chrome apollo-spaces apollo-tabs apollo-pane apollo-changes apollo-specs apollo-status"
APOLLO_LINKS="layouts/apollo.json layouts/apollo.svg themes/apollo.json"
for _m in $APOLLO_MODS; do APOLLO_LINKS="$APOLLO_LINKS mods/$_m"; done
# Paths Herdr may create while apollo shows (P10: data/<mod>/ per loaded mod) and the probe itself.
APOLLO_CLAIMS="mods/apollo-probe data/apollo-probe layouts/.state/apollo.json layouts/apollo.error keys.error"
for _m in $APOLLO_MODS; do APOLLO_CLAIMS="$APOLLO_CLAIMS data/$_m"; done

# Every apollo* name in the folders Herdr writes (names only; nothing is read).
apollo_names() {
  local d
  for d in "$HERDR_HOME" "$HERDR_HOME/mods" "$HERDR_HOME/layouts" "$HERDR_HOME/layouts/.state" "$HERDR_HOME/data" "$HERDR_HOME/themes"; do
    if [ -d "$d" ]; then find "$d" -mindepth 1 -maxdepth 1 -name '*apollo*' -print; fi
  done | LC_ALL=C sort || true
}

# The A22 assertions on the probe's {theme, keys}: every A1 theme value; the effective keys equal
# user/keys.json (A04's table, plus Herdr's built-in ctrl-alt-shift-escape); terminal cmd-left is
# tab.prev; cmd-shift-l is not layout.switch; cmd-[ is unbound; cmd-9 runs apollo-tabs.last.
check_theme_keys() {
  local out=$1 problems
  jq -e 'type == "object"' "$out" >/dev/null 2>&1 || { echo "FAIL smoke: probe output is not JSON: $out" >&2; return 1; }
  problems=$(jq -r --slurpfile th "$REPO/themes/apollo.json" --slurpfile k "$REPO/user/keys.json" '
    def want_theme: $th[0].colors + {background: $th[0].background}
      + ([range(16)] | map({key: "ansi\(.)", value: $th[0].ansi[.]}) | from_entries);
    def want_keys: [$k[0] | to_entries[] | .key as $s | .value | to_entries[]
      | "\($s) \(.key) \(.value | if type == "string" then . else tojson end)"] | unique;
    . as $o
    | (if ($o.theme | type) != "object" then ["theme: missing"]
       else [want_theme | to_entries[] | select((($o.theme[.key] // "") | ascii_downcase) != (.value | ascii_downcase))
             | "theme \(.key): want \(.value), got \($o.theme[.key] // "none")"] end)
    + (if ($o.keys | type) != "array" then ["keys: missing"]
       else ([$o.keys[] | select(type == "object") | "\(.section) \(.keys) \(.action)"]
             | map(select(startswith("global ctrl-alt-shift-escape ") | not)) | unique) as $got
         | (want_keys - $got | map("keys missing: \(.)"))
         + ($got - want_keys | map("keys extra: \(.)"))
         + (if ($got | index("terminal cmd-left tab.prev")) then [] else ["terminal cmd-left: want tab.prev (terminal wins)"] end)
         + [$got[] | select(test("^[a-z:-]+ cmd-shift-l layout\\.switch$")) | "cmd-shift-l: still layout.switch"]
         + [$got[] | select(test("^[a-z:-]+ cmd-\\[ ")) | "cmd-[: still bound (\(.))"]
         + (if ($got | index("global cmd-9 apollo-tabs.last")) then [] else ["cmd-9: want apollo-tabs.last"] end)
       end)
    | .[]' "$out" 2>&1) || { echo "FAIL smoke: cannot check $out: $problems" >&2; return 1; }
  if [ -n "$problems" ]; then
    printf '%s\n' "$problems" | sed 's/^/FAIL smoke: /' >&2
    return 1
  fi
  return 0
}
check_quiet() { check_theme_keys "$1" 2>/dev/null; }

layout_is() { [ "$(herdr-app status | jq -r '.layout')" = "$1" ]; }
no_overlays() { [ "$(herdr-app status | jq -c '.overlays')" = "[]" ]; }

theme_keys() {
  local hold=0 before rel out tmpl sp tab pane_id rb vr leftover
  [ "${1:-}" = --hold ] && hold=1
  before=$(apollo_names)
  live_begin rollback
  printf '%s\n' "$before" > "$LIVE_DIR/names.before"
  for rel in $APOLLO_CLAIMS; do live_claim "$rel"; done
  # shellcheck disable=SC2086 # word splitting is intended
  live_link_apollo $APOLLO_LINKS
  out="$LIVE_DIR/probe-out.json"
  mkdir "$HERDR_HOME/mods/apollo-probe"
  printf '{"place":"none","overlay":{"width":240,"height":60}}\n' > "$HERDR_HOME/mods/apollo-probe/mod.json"
  tmpl=$(cat "$REPO/scripts/smoke/probe-main.js.tmpl")
  printf '%s\n' "${tmpl//__OUT__/$(jq -cn --arg p "$out" '$p')}" > "$HERDR_HOME/mods/apollo-probe/main.js"
  live_swap_keys "$REPO/user/keys.json"
  herdr-app do layout.switch '{"name":"apollo"}' >/dev/null || fail "layout.switch apollo failed"
  wait_for 5 layout_is apollo || fail "apollo did not show"
  if [ "$hold" = 1 ]; then
    echo HOLDING
    sleep 600 &
    echo $! > "$LIVE_DIR/sleeper"
    wait $!
  fi
  sleep 1
  [ "$(herdr-app status | jq -c '.errors')" = "$(jq -c '.errors' "$LIVE_DIR/status.json")" ] \
    || fail "errors after showing apollo: $(herdr-app status | jq -c '.errors')"
  herdr-app do mod.open '{"name":"apollo-probe"}' >/dev/null || fail "mod.open apollo-probe failed"
  wait_for 5 test -s "$out" || fail "probe output missing"
  wait_for 5 check_quiet "$out" || true
  check_theme_keys "$out" || fail "runtime theme or keys differ"
  herdr-app do mod.open '{"name":"apollo-probe"}' >/dev/null || true
  wait_for 5 no_overlays || fail "the probe overlay did not close"
  echo "theme: $(jq -c '{accent: .theme.accent, chrome: .theme.chrome, foreground: .theme.foreground, ansi8: .theme.ansi8}' "$out")"
  echo "keys: $(jq -c '[.keys[] | select(.keys | test("^cmd-(w|9|shift-l|alt-l|\\[|left|up)$")) | "\(.section) \(.keys) \(.action)"]' "$out")"

  # Last pane: cmd-w's action (pane.close) on a tab's only pane closes the tab.
  sp=$(jq -r '.space' "$LIVE_DIR/status.json")
  tab=$(live_new_tab "$(jq -cn --arg s "$sp" '{space: $s, name: "apollo-smoke-last-pane"}')") || fail "could not make the fixture tab"
  pane_id=""
  find_pane() { pane_id=$(herdr-app ls | jq -r --arg t "$tab" '[.spaces[].tabs[] | select(.id == $t) | .terminals[0].pane] | first // empty'); [ -n "$pane_id" ]; }
  tab_gone() { ! herdr-app ls | jq -e --arg t "$tab" 'any(.spaces[].tabs[]; .id == $t)' >/dev/null; }
  wait_for 5 find_pane || fail "fixture tab $tab has no pane"
  herdr-app do pane.close "$(jq -cn --arg p "$pane_id" '{pane: $p}')" >/dev/null || fail "pane.close failed"
  wait_for 5 tab_gone || fail "closing the last pane left tab $tab open"
  echo "last pane: pane.close $pane_id closed tab $tab"

  rb=0; live_rollback || rb=1
  sleep 2
  leftover=$(apollo_names | grep -vxF -f "$LIVE_DIR/names.before" || true)
  if [ -n "$leftover" ]; then rb=0; live_rollback || rb=1; sleep 1; leftover=$(apollo_names | grep -vxF -f "$LIVE_DIR/names.before" || true); fi
  vr=0; live_verify || vr=1
  live_finalize >/dev/null
  [ -z "$leftover" ] || fail "left behind: $(printf '%s' "$leftover" | tr '\n' ' ')"
  [ "$rb" -eq 0 ] || fail "a restore step failed"
  [ "$vr" -eq 0 ] || fail "live_verify mismatch"
  echo "smoke theme-keys: ok"
}

# ---- A23: mods and sidebar ----

fails=0
chk() { local what=$1; shift; if "$@"; then echo "ok   $what"; else echo "FAIL smoke: $what" >&2; fails=$((fails + 1)); fi; }
errors_ok() { [ "$(herdr-app status | jq -c '.errors')" = "$(jq -c '.errors' "$LIVE_DIR/status.json")" ]; }
STATE_FILE() { printf '%s\n' "$HERDR_HOME/layouts/.state/apollo.json"; }
# The panel as .state stores it (only fields that differ from layouts/apollo.json: hidden, active changes).
panel_is() {
  local f got; f=$(STATE_FILE)
  if [ -f "$f" ]; then got=$(jq -c '({hidden: true, active: "changes"} + (.nodes.panel // {})) | [.hidden, .active]' "$f") || return 1
  else got='[true,"changes"]'; fi
  [ "$got" = "[$1,\"$2\"]" ]
}
apollo_px() { local v; v=$(state_sidebar_px apollo); [ -n "$v" ] || v=256; printf '%s\n' "$v"; }
px_is() { [ "$(jq -n "$(apollo_px) == $1")" = true ]; }
zoom_is() { [ "$(herdr-app status | jq ".zoom == $1")" = true ]; }

# emit_do <handler> <args…>: runs exactly the herdr-app commands the mod's lib handler would run.
# EMIT_REPLY holds the reply of the last command.
EMIT_REPLY=""
emit_do() {
  local out line rest name json
  out=$(node "$REPO/scripts/smoke/emit.mjs" "$@") || { echo "FAIL smoke: emit $*" >&2; return 1; }
  while IFS= read -r line; do
    case $line in
      "herdr-app do "*)
        rest=${line#herdr-app do }; name=${rest%% *}; json=${rest#"$name '"}; json=${json%"'"}
        EMIT_REPLY=$(herdr-app do "$name" "$json") || { echo "FAIL smoke: herdr-app do $name $json" >&2; return 1; } ;;
      "#"* | "") ;;
      *) echo "FAIL smoke: unexpected emit line: $line" >&2; return 1 ;;
    esac
  done <<<"$out"
}

# Fixture: an unborn repo (a.txt staged then edited, b.txt staged, deep/x/y.txt untracked) with docs/specs.
make_fixture() {
  local d=$1
  mkdir -p "$d/docs/specs/pending" "$d/docs/specs/paused" "$d/deep/x"
  (
    cd "$d" && export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
    git init -q -b main
    printf 'one\ntwo\nthree\n' > a.txt && git add a.txt
    printf 'one\nTWO\nthree\nfour\n' > a.txt
    printf 'new\n' > b.txt && git add b.txt
    printf 'untracked\n' > deep/x/y.txt
    printf -- '---\npriority: high\n---\n# Fixture spec\n\nA spec used by the apollo smoke test.\n' > docs/specs/pending/fixture.md
    printf '# Paused fixture spec\n' > docs/specs/paused/later.md
  )
}

# A24 fixture repos with history (the shots): herdr-config has one commit on feat/apollo-sidebar, then
# a.txt staged and edited again (MM), b.txt staged (A), deep/x/y.txt untracked; notes has one commit on
# main and a clean tree. No user config is read; identity and dates are fixed.
make_demo_repos() {
  local d=$1
  mkdir -p "$d/herdr-config/docs/specs/pending" "$d/herdr-config/docs/specs/paused" "$d/herdr-config/deep/x" "$d/notes"
  (
    export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_AUTHOR_NAME=Apollo GIT_AUTHOR_EMAIL=apollo@example.invalid \
      GIT_COMMITTER_NAME=Apollo GIT_COMMITTER_EMAIL=apollo@example.invalid \
      GIT_AUTHOR_DATE=2026-11-08T10:00:00Z GIT_COMMITTER_DATE=2026-11-08T10:00:00Z
    cd "$d/herdr-config"
    git init -q -b feat/apollo-sidebar
    printf 'one\ntwo\nthree\n' > a.txt
    printf -- '---\npriority: high\n---\n# Fixture spec\n\nA spec used by the apollo smoke test.\n' > docs/specs/pending/fixture.md
    printf '# Paused fixture spec\n' > docs/specs/paused/later.md
    git add -A && git commit -q -m "Add the sidebar layout"
    printf 'one\nTWO\nthree\n' > a.txt && git add a.txt
    printf 'one\nTWO\nthree\nfour\n' > a.txt
    printf 'new\n' > b.txt && git add b.txt
    printf 'untracked\n' > deep/x/y.txt
    cd "$d/notes"
    git init -q -b main
    printf '# Ideas\n' > ideas.md && printf '# Todo\n' > todo.md
    git add -A && git commit -q -m "Start notes"
  )
}

apollo_up() {
  local before rel
  before=$(apollo_names)
  live_begin rollback
  printf '%s\n' "$before" > "$LIVE_DIR/names.before"
  for rel in $APOLLO_CLAIMS; do live_claim "$rel"; done
  # shellcheck disable=SC2086 # word splitting is intended
  if [ "${APOLLO_INSTALL:-link}" = copy ]; then live_copy_apollo $APOLLO_LINKS; else live_link_apollo $APOLLO_LINKS; fi
  herdr-app do layout.switch '{"name":"apollo"}' >/dev/null || fail "layout.switch apollo failed"
  wait_for 5 layout_is apollo || fail "apollo did not show"
  sleep 1
  errors_ok || fail "errors after showing apollo: $(herdr-app status | jq -c '.errors')"
}

apollo_down() {
  local rb vr leftover
  rb=0; live_rollback || rb=1
  sleep 2
  leftover=$(apollo_names | grep -vxF -f "$LIVE_DIR/names.before" || true)
  if [ -n "$leftover" ]; then rb=0; live_rollback || rb=1; sleep 1; leftover=$(apollo_names | grep -vxF -f "$LIVE_DIR/names.before" || true); fi
  vr=0; live_verify || vr=1
  live_finalize >/dev/null
  [ -z "$leftover" ] || fail "left behind: $(printf '%s' "$leftover" | tr '\n' ' ')"
  [ "$rb" -eq 0 ] || fail "a restore step failed"
  [ "$vr" -eq 0 ] || fail "live_verify mismatch"
}

tab_panes() { herdr-app ls | jq -r --arg s "$1" '.spaces[] | select(.id == $s) | .tabs[] | select(.active) | .terminals[].pane'; }
focused_pane() { herdr-app status | jq -r '.focused_pane // empty'; }
space_shown() { [ "$(herdr-app status | jq -r '.space')" = "$1" ]; }
pane_count_is() { [ "$(tab_panes "$1" | grep -c .)" -eq "$2" ]; }
pane_gone() { ! herdr-app ls | jq -e --arg p "$1" '[.. | objects | select(.pane? == $p)] | length > 0' >/dev/null; }
focused_is() { [ "$(focused_pane)" = "$1" ]; }
in_list() { printf '%s\n' "$2" | grep -qxF "$1"; }

mods_section() {
  local hold=0 tmp space focus other reply newp
  [ "${1:-}" = --hold ] && hold=1
  apollo_up
  tmp=$(live_tmpdir) || fail "could not make the fixture dir"
  make_fixture "$tmp/repo"
  space=$(live_new_space "$(jq -cn --arg f "$tmp/repo" '{name: "apollo-smoke", folder: $f}')") || fail "space.new failed"
  wait_for 5 space_shown "$space" || fail "the fixture space did not show"
  echo "fixture: $tmp/repo in space $space"

  emit_do panelClick changes || fail "panelClick changes"
  chk "changes: panel shown with changes" wait_for 3 panel_is false changes
  if [ "$hold" = 1 ]; then echo HOLDING; sleep 600 & echo $! > "$LIVE_DIR/sleeper"; wait $!; fi
  emit_do panelClick specs || fail "panelClick specs"
  chk "specs: switched to specs" wait_for 3 panel_is false specs
  emit_do panelClick specs || fail "panelClick specs again"
  chk "specs again: panel hidden" wait_for 3 panel_is true specs
  chk "no new errors after panel clicks" errors_ok
  herdr-app do layout.show '{"id":"panel"}' >/dev/null || fail "layout.show panel"
  chk "loaded visible: specs showing" wait_for 3 panel_is false specs
  emit_do panelClick specs --from-state "$(STATE_FILE)" || fail "panelClick specs --from-state"
  chk "loaded visible: a specs click (read from .state) hides it" wait_for 3 panel_is true specs

  herdr-app do pane.split '{"direction":"right"}' >/dev/null || fail "pane.split 1"
  herdr-app do pane.split '{"direction":"right"}' >/dev/null || fail "pane.split 2"
  chk "two splits give three panes" wait_for 3 pane_count_is "$space" 3
  focus=$(focused_pane)
  before=$(tab_panes "$space")
  other=$(printf '%s\n' "$before" | grep -vxF "$focus" | head -1)
  [ -n "$focus" ] && [ -n "$other" ] || fail "no focused/non-focused pane pair (focus=$focus)"
  # pane.split targets the given pane; Herdr then focuses the new pane (its behavior, not ours).
  reply=$(herdr-app do pane.split "$(jq -cn --arg p "$other" '{pane: $p, direction: "down"}')") || fail "pane.split on $other"
  newp=$(jq -r '.pane // empty' <<<"$reply")
  sleep 0.5
  after=$(tab_panes "$space")
  chk "the split of non-focused $other made a new pane" test -n "$newp"
  chk "the new pane is new and in the target's tab (a sibling of $other)" bash -c '! printf "%s\n" "$1" | grep -qxF "$3" && printf "%s\n" "$2" | grep -qxF "$3" && printf "%s\n" "$2" | grep -qxF "$4"' _ "$before" "$after" "$newp" "$other"
  chk "the previously focused pane $focus still exists" in_list "$focus" "$after"
  herdr-app do pane.focus "$(jq -cn --arg p "$focus" '{pane: $p}')" >/dev/null || fail "pane.focus $focus"
  chk "refocused $focus" wait_for 3 focused_is "$focus"
  herdr-app do pane.close "$(jq -cn --arg p "$newp" '{pane: $p}')" >/dev/null || fail "pane.close $newp"
  chk "pane.close of non-focused $newp: gone" wait_for 3 pane_gone "$newp"
  chk "focus unchanged on $focus" focused_is "$focus"
  chk "only the target is gone (panes as before the split)" test "$(tab_panes "$space" | LC_ALL=C sort)" = "$(printf '%s\n' "$before" | LC_ALL=C sort)"

  emit_do openSpec "$tmp/repo/docs/specs/pending/fixture.md" || fail "openSpec"
  specp=$(jq -r '.pane // empty' <<<"$EMIT_REPLY")
  chk "openSpec made a mod pane (pane id, no terminal)" bash -c '[ -n "$1" ] && [ -z "$(jq -r ".terminal // empty" <<<"$2")" ]' _ "$specp" "$EMIT_REPLY"
  chk "herdr-app status focuses the viewer pane $specp" wait_for 3 focused_is "$specp"
  chk "no new errors after the specs viewer" errors_ok
  apollo_down
  [ "$fails" -eq 0 ] || fail "$fails check(s) failed"
  echo "smoke mods: ok"
}

sidebar_section() {
  local zoom0 start i
  apollo_up
  zoom0=$(herdr-app status | jq '.zoom')
  start=$(apollo_px)
  echo "sidebar start px $start, zoom $zoom0"
  for i in 1 2; do
    emit_do collapse "$start" "$zoom0" || fail "collapse $i"
    chk "collapse $i: px 184" wait_for 3 px_is 184
    emit_do expand "$start" || fail "expand $i"
    chk "expand $i: px back to $start" wait_for 3 px_is "$start"
    chk "zoom unchanged after round $i" zoom_is "$zoom0"
  done
  herdr-app do layout.resize '{"id":"sidebar","px":100}' >/dev/null || fail "layout.resize 100"
  chk "guard: 100 back to 184 within 2 s" wait_for 2 px_is 184
  herdr-app do layout.resize "$(jq -cn --argjson px "$start" '{id: "sidebar", px: $px}')" >/dev/null || fail "restore px"
  chk "restored to $start" wait_for 3 px_is "$start"
  chk "zoom unchanged at the end" zoom_is "$zoom0"
  apollo_down
  [ "$fails" -eq 0 ] || fail "$fails check(s) failed"
  echo "smoke sidebar: ok"
}

# SMOKE_LIB=1 (scripts/shots.sh) sources the helpers without running a section.
[ "${SMOKE_LIB:-0}" = 1 ] && return 0

case "${1:-}" in
  theme-keys) shift; theme_keys "$@" ;;
  mods) shift; mods_section "$@" ;;
  sidebar) shift; sidebar_section "$@" ;;
  all)
    rc=0
    for sec in theme-keys mods sidebar; do bash "$0" "$sec" || { echo "FAIL smoke: section $sec" >&2; rc=1; }; done
    exit "$rc" ;;
  check-theme-keys) [ -n "${2:-}" ] || { echo "usage: $0 check-theme-keys <file>" >&2; exit 2; }; check_theme_keys "$2" ;;
  *) echo "unknown section: ${1:-}" >&2
     echo "usage: $0 theme-keys [--hold] | mods [--hold] | sidebar | all | check-theme-keys <file>" >&2; exit 2 ;;
esac
