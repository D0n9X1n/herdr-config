#!/usr/bin/env bash
# Offline tests for scripts/smoke.sh (A22): the theme/keys checker on fixtures, and `theme-keys`
# against a fake Herdr home with a stub herdr-app (no app: the probe never writes, so it must fail
# with `probe output missing` and roll everything back). Run only from a disposable clone.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd -P)
SMOKE="$REPO/scripts/smoke.sh"
# shellcheck source=helpers/safe-rm.sh
. "$REPO/test/helpers/safe-rm.sh"
[ -f "$SMOKE" ] || { echo "FAIL: missing $SMOKE"; exit 1; }

T=$(mktemp -d /private/tmp/apollo-test.XXXXXX) || exit 1
[ -n "$T" ] && [ -d "$T" ] || exit 1
T=$(realpath "$T")
trap 'cd /; SAFE_RM_BASE=/private/tmp safe_rm "$T" >/dev/null 2>&1 || echo "leftover: $T"' EXIT

pass=0 fail=0
check() { local what=$1; shift; if "$@"; then pass=$((pass + 1)); echo "ok   $what"; else fail=$((fail + 1)); echo "FAIL $what"; fi; }
_sha() { if command -v shasum >/dev/null 2>&1; then shasum -a 256; else sha256sum; fi | cut -c1-64; }
_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }
treesum() {
  (cd "$1" && find . -print | LC_ALL=C sort | while IFS= read -r p; do
    if [ -L "$p" ]; then echo "L $p -> $(readlink "$p")"
    elif [ -d "$p" ]; then echo "D $p $(_mode "$p")"
    else echo "F $p $(_mode "$p") $(_sha < "$p")"; fi
  done)
}

# ---- checker on fixtures ----
GOOD="$T/good.json"
jq -n --slurpfile th "$REPO/themes/apollo.json" --slurpfile k "$REPO/user/keys.json" '{
  theme: ($th[0].colors + {background: $th[0].background} + ([range(16)] | map({key: "ansi\(.)", value: $th[0].ansi[.]}) | from_entries)),
  keys: ([$k[0] | to_entries[] | .key as $s | .value | to_entries[] | {section: $s, keys: .key, action: (.value | if type == "string" then . else tojson end)}]
         + [{section: "global", keys: "ctrl-alt-shift-escape", action: "app.reset"}])
}' > "$GOOD"
mutate() { jq "$1" "$GOOD" > "$T/m.json"; }
run_check() { CRC=0; bash "$SMOKE" check-theme-keys "$1" > "$T/c.out" 2>&1 || CRC=$?; }

run_check "$GOOD"
check "checker passes the expected theme and keys" test "$CRC" -eq 0
for spec in \
  'accent wrong|.theme.accent = "#96b2d7"|theme accent' \
  'ansi8 wrong|.theme.ansi8 = "#000000"|theme ansi8' \
  'cmd-shift-l back on layout.switch|(.keys[] | select(.section == "global" and .keys == "cmd-shift-l") | .action) = "layout.switch"|cmd-shift-l' \
  'cmd-[ still bound|.keys += [{section: "global", keys: "cmd-[", action: "agent.prev"}]|cmd-\[' \
  'terminal cmd-left still sends ^A|(.keys[] | select(.section == "terminal" and .keys == "cmd-left") | .action) = "send:\u0001"|terminal cmd-left' \
  'cmd-9 missing|.keys |= map(select(.keys != "cmd-9"))|cmd-9' \
  'scroll args wrong|(.keys[] | select(.keys == "cmd-up") | .action) = "{\"args\":{\"lines\":1},\"command\":\"terminal.scroll\"}"|cmd-up' \
  'extra key|.keys += [{section: "global", keys: "cmd-ctrl-alt-y", action: "app.quit"}]|cmd-ctrl-alt-y' \
  'no theme|del(.theme)|theme'; do
  name=${spec%%|*}; rest=${spec#*|}; expr=${rest%|*}; want=${rest##*|}
  mutate "$expr"; run_check "$T/m.json"
  check "checker fails: $name" test "$CRC" -ne 0
  check "checker names it: $name" grep -q -- "$want" "$T/c.out"
done
printf 'not json' > "$T/bad.json"; run_check "$T/bad.json"
check "checker fails on unreadable output" test "$CRC" -ne 0

# ---- theme-keys against a fake home: no app, so no probe output ----
C="$T/fake"
mkdir -p "$C/home/layouts/.state" "$C/home/mods/other" "$C/home/themes" "$C/home/data" "$C/tmp" "$C/bin" "$C/stub"
printf '{"zoom": 1, "sounds": {"enabled": true}}\n' > "$C/home/settings.json"
cp "$REPO/data/herdr-default-keys.json" "$C/home/keys.json"
printf 'x\n' > "$C/home/mods/other/x"
jq -n '{file: "custom", nodes: {sidebar: {size: {px: 262}}}}' > "$C/home/layouts/.state/custom.json"
jq -n '{layout: "custom", space: "s1", tab: "t1", overlays: [], errors: []}' > "$C/stub/status.json"
jq -n '{spaces: [{id: "s1", active: true, tabs: [{id: "t1", active: true}]}]}' > "$C/stub/ls.json"
: > "$C/stub/log"
printf '#!/usr/bin/env bash\nS=%q; H=%q\n' "$C/stub" "$C/home" > "$C/bin/herdr-app"
cat >> "$C/bin/herdr-app" <<'STUB'
upd() { jq "${@:2}" "$S/$1" > "$S/$1.t" && mv "$S/$1.t" "$S/$1"; }
case "${1:-}" in
  status) z=$(jq '.zoom // 1' "$H/settings.json" 2>/dev/null || echo 1); jq --argjson z "$z" '. + {zoom: $z}' "$S/status.json" ;;
  ls) cat "$S/ls.json" ;;
  do)
    cmd=$2; a=${3:-}; [ -n "$a" ] || a='{}'; a=$(printf '%s' "$a" | jq -c .)
    echo "$cmd $a" >> "$S/log"
    case $cmd in
      layout.switch) upd status.json --arg n "$(jq -r .name <<<"$a")" '.layout = $n' ;;
      layout.resize) f="$H/layouts/.state/$(jq -r .layout "$S/status.json").json"
        if [ -f "$f" ]; then jq --argjson px "$(jq .px <<<"$a")" '.nodes.sidebar.size.px = $px' "$f" > "$f.t" && mv "$f.t" "$f"; fi ;;
    esac
    echo '{"ok": true}' ;;
  *) echo "stub: unsupported $*" >&2; exit 2 ;;
esac
STUB
chmod +x "$C/bin/herdr-app"
treesum "$C/home" > "$C/before"
SRC=0
(cd "$REPO" && env HERDR_APP_HOME="$C/home" TMPDIR="$C/tmp" PATH="$C/bin:$PATH" bash "$SMOKE" theme-keys > "$C/out" 2> "$C/err") || SRC=$?
check "theme-keys exits nonzero without probe output" test "$SRC" -ne 0
check "theme-keys says FAIL smoke: probe output missing" grep -q 'FAIL smoke: probe output missing' "$C/err"
check "it switched to apollo and opened the probe" grep -qxF 'mod.open {"name":"apollo-probe"}' "$C/stub/log"
check "it showed apollo first" grep -qxF 'layout.switch {"name":"apollo"}' "$C/stub/log"
check "home tree identical after rollback" cmp -s "$C/before" <(treesum "$C/home")
check "rollback switched back to custom last" test "$(tail -n 1 "$C/stub/log")" = 'layout.switch {"name":"custom"}'
check "live_verify ok" grep -q 'live_verify: ok' "$C/err"

USRC=0; bash "$SMOKE" nope > "$T/u.out" 2>&1 || USRC=$?
check "an unknown section exits 2" test "$USRC" -eq 2
check "an unknown section says so" grep -q 'unknown section: nope' "$T/u.out"
for sec in mods sidebar all; do
  grep -qE "^  $sec\)" "$SMOKE" && r=0 || r=1
  check "section $sec exists" test "$r" -eq 0
done

# ---- A24 fixture repos (offline) ----
DEMO="$T/demo"
# shellcheck source=../scripts/smoke.sh
( HERDR_HOME="$T/demo-home" SMOKE_LIB=1 . "$SMOKE" && make_demo_repos "$DEMO" ) > "$T/demo.out" 2>&1 || cat "$T/demo.out"
g() { GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git -C "$1" --no-optional-locks "${@:2}"; }
check "herdr-config is on feat/apollo-sidebar" test "$(g "$DEMO/herdr-config" symbolic-ref --short HEAD 2>/dev/null)" = feat/apollo-sidebar
check "herdr-config has one commit" test "$(g "$DEMO/herdr-config" rev-list --count HEAD 2>/dev/null)" = 1
check "herdr-config: a.txt staged and unstaged, b.txt staged, one untracked file" \
  test "$(g "$DEMO/herdr-config" status --porcelain -uall 2>/dev/null | tr '\n' '|')" = "MM a.txt|A  b.txt|?? deep/x/y.txt|"
check "herdr-config: the pending spec is committed" test -n "$(g "$DEMO/herdr-config" ls-files docs/specs/pending/fixture.md 2>/dev/null)"
check "notes is on main with one commit and a clean tree" \
  test "$(g "$DEMO/notes" symbolic-ref --short HEAD 2>/dev/null) $(g "$DEMO/notes" rev-list --count HEAD 2>/dev/null) $(g "$DEMO/notes" status --porcelain 2>/dev/null | wc -l | tr -d ' ')" = "main 1 0"
check "notes holds ideas.md and todo.md" test -f "$DEMO/notes/ideas.md" -a -f "$DEMO/notes/todo.md"

echo "smoke: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
