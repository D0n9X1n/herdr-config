#!/usr/bin/env bash
# Fault tests for L1 (scripts/lib/live.sh) in a fake Herdr home with a stub herdr-app.
#   bash test/live.test.sh               fake-home cases (no app). Run only from a disposable clone.
#   bash test/live.test.sh --live probe  live kill test against the running Herdr (A01 only).
# Never exports TMPDIR; every directory delete goes through safe_rm.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd -P)
LIB="$REPO/scripts/lib/live.sh"
# shellcheck source=helpers/safe-rm.sh
. "$REPO/test/helpers/safe-rm.sh"

if [ "${1:-}" = --live ]; then
  MODE=${2:-}
  case "$MODE" in
    probe) CMD=(bash "$REPO/scripts/probe-runtime.sh" --hold); MOD=mods/apollo-runtime-probe ;;
    smoke) CMD=(bash "$REPO/scripts/smoke.sh" theme-keys --hold); MOD=mods/apollo-probe ;;
    smoke-mods) CMD=(bash "$REPO/scripts/smoke.sh" mods --hold); MOD=layouts/apollo.json ;;
    *) echo "usage: $0 --live probe|smoke|smoke-mods" >&2; exit 2 ;;
  esac
  H=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
  names() { for d in "$H" "$H/mods" "$H/layouts" "$H/layouts/.state" "$H/data" "$H/themes"; do
    if [ -d "$d" ]; then find "$d" -mindepth 1 -maxdepth 1 -name '*apollo*' -print; fi; done | LC_ALL=C sort || true; }
  # Ready when the ledger lists the probe mod and, for smoke, keys.json is the temporary link.
  ready() { grep -qx "$MOD" "$dir/ledger" 2>/dev/null && grep -q '^HOLDING' "$OUT/out" \
    && { [ "$MODE" != smoke ] || [ "$(readlink "$H/keys.json" 2>/dev/null)" = "$REPO/user/keys.json" ]; } \
    && { [ "$MODE" != smoke-mods ] || grep -q '^space ' "$dir/owned" 2>/dev/null; }; }
  OUT=$(mktemp -d /private/tmp/live-test.XXXXXX) || exit 1
  [ -n "$OUT" ] && [ -d "$OUT" ] || exit 1
  trap 'cd /; safe_rm "$OUT" >/dev/null 2>&1 || echo "leftover: $OUT"' EXIT
  before=$(names)
  set -m
  "${CMD[@]}" >"$OUT/out" 2>"$OUT/err" &
  P=$!
  set +m
  dir="" i=0
  while [ "$i" -lt 600 ]; do
    dir=$(sed -n 's/^LIVE_DIR=//p' "$OUT/out" | head -1)
    if [ -n "$dir" ] && ready; then break; fi
    kill -0 "$P" 2>/dev/null || break
    sleep 0.1; i=$((i + 1))
  done
  if [ -z "$dir" ] || ! ready; then
    echo "FAIL live $MODE: never reached HOLDING"; cat "$OUT/err"; kill -TERM "$P" 2>/dev/null || true; wait "$P" || true; exit 1
  fi
  echo "holding: ledger lists $MOD; keys.json -> $(readlink "$H/keys.json" 2>/dev/null || echo "(regular file)")"
  kill -TERM "$P"
  rc=0; wait "$P" || rc=$?
  if [ -f "$dir/sleeper" ]; then kill "$(cat "$dir/sleeper")" 2>/dev/null || true; fi
  cat "$OUT/err"
  echo "$MODE exit after TERM: $rc (expect 143)"
  sleep 2
  vr=0; bash "$LIB" --verify "$dir" || vr=$?
  left=$(names | grep -vxF -f <(printf '%s\n' "$before") || true)
  if [ -f "$dir/tmpdirs" ]; then while IFS= read -r d; do [ -z "$d" ] || [ ! -e "$d" ] || left="$left fixture:$d"; done < "$dir/tmpdirs"; fi
  [ -z "$left" ] || { echo "FAIL live $MODE: left behind: $left"; exit 1; }
  [ "$rc" -eq 143 ] && [ "$vr" -eq 0 ] && { echo "live $MODE: ok"; exit 0; }
  echo "FAIL live $MODE"; exit 1
fi

[ -f "$LIB" ] || { echo "FAIL: missing $LIB (all cases fail until L1 exists)"; exit 1; }

T=$(mktemp -d /private/tmp/apollo-test.XXXXXX) || exit 1
[ -n "$T" ] && [ -d "$T" ] || exit 1
T=$(realpath "$T")
cleanup() { cd /; chmod -R u+w "$T" 2>/dev/null || true; SAFE_RM_BASE=/private/tmp safe_rm "$T" >/dev/null 2>&1 || echo "leftover: $T"; }
trap cleanup EXIT
REAL_TAR=$(command -v tar)

pass=0 fail=0
ok() { pass=$((pass + 1)); echo "ok   $CASE_NAME: $1"; }
no() { fail=$((fail + 1)); echo "FAIL $CASE_NAME: $1"; }
check() { local what=$1; shift; if "$@"; then ok "$what"; else no "$what"; fi; }
eq() { [ "$1" = "$2" ]; }

_sha() { if command -v shasum >/dev/null 2>&1; then shasum -a 256; else sha256sum; fi | cut -c1-64; }
_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }
# treesum <dir>: one line per entry: kind, path, mode, link text or content sha.
treesum() {
  (cd "$1" && find . -print | LC_ALL=C sort | while IFS= read -r p; do
    if [ -L "$p" ]; then echo "L $p -> $(readlink "$p")"
    elif [ -d "$p" ]; then echo "D $p $(_mode "$p")"
    else echo "F $p $(_mode "$p") $(_sha < "$p")"; fi
  done)
}

# new_case <name> <settings: file|link> <keys: file|link>: a fake home with layouts A (240), B (300), C (no sidebar).
new_case() {
  CASE_NAME=$1
  C="$T/$1"
  mkdir -p "$C/home/layouts/.state" "$C/home/mods/other" "$C/home/themes" "$C/tmp" "$C/bin" "$C/stub" \
    "$C/w" "$C/arch" "$C/repo/user" "$C/repo/layouts" "$C/repo/themes" "$C/repo/mods/apollo-x"
  printf 'x\n' > "$C/home/mods/other/x"
  printf '{"zoom": 1}\n' > "$C/w/settings.json"
  printf '{"global": {"cmd-w": "pane.close"}}\n' > "$C/w/keys.json"
  if [ "$2" = link ]; then ln -s "$C/w/settings.json" "$C/home/settings.json"; else printf '{"zoom": 1, "sounds": {"enabled": true}}\n' > "$C/home/settings.json"; fi
  if [ "$3" = link ]; then ln -s "$C/w/keys.json" "$C/home/keys.json"; else printf '{"global": {}}\n' > "$C/home/keys.json"; fi
  jq -n '{file: "A", nodes: {sidebar: {size: {px: 240}}}}' > "$C/home/layouts/.state/A.json"
  jq -n '{file: "B", nodes: {sidebar: {size: {px: 300}}}}' > "$C/home/layouts/.state/B.json"
  jq -n '{file: "C", nodes: {}}' > "$C/home/layouts/.state/C.json"
  printf '{"global": {"cmd-left": "tab.prev"}}\n' > "$C/repo/user/keys.json"
  printf '{"zoom": 1.2}\n' > "$C/repo/user/settings.json"
  printf '{"id": "root"}\n' > "$C/repo/layouts/apollo.json"
  printf '{"background": "#141617"}\n' > "$C/repo/themes/apollo.json"
  printf 'export default 1;\n' > "$C/repo/mods/apollo-x/main.js"
  jq -n '{layout: "A", space: "s1", tab: "t2", overlays: [], errors: []}' > "$C/stub/status.json"
  jq -n '{spaces: [{id: "s1", active: true, tabs: [{id: "t1"}, {id: "t2", active: true}]}]}' > "$C/stub/ls.json"
  : > "$C/stub/log"
  cat > "$C/bin/herdr-app" <<EOF
#!/usr/bin/env bash
S="$C/stub"; H="$C/home"
EOF
  cat >> "$C/bin/herdr-app" <<'EOF'
upd() { jq "${@:2}" "$S/$1" > "$S/$1.t" && mv "$S/$1.t" "$S/$1"; }
case "${1:-}" in
  status) z=$(jq '.zoom // 1' "$H/settings.json" 2>/dev/null || echo 1); jq --argjson z "$z" '. + {zoom: $z}' "$S/status.json" ;;
  ls) cat "$S/ls.json" ;;
  do)
    cmd=$2; a=${3:-}; [ -n "$a" ] || a='{}'; a=$(printf '%s' "$a" | jq -c .)
    echo "$cmd $a" >> "$S/log"
    case $cmd in
      layout.switch) upd status.json --arg n "$(jq -r .name <<<"$a")" '.layout = $n' ;;
      layout.resize)
        f="$H/layouts/.state/$(jq -r .layout "$S/status.json").json"
        if [ -f "$f" ]; then jq --argjson px "$(jq .px <<<"$a")" '.nodes.sidebar.size.px = $px' "$f" > "$f.t" && mv "$f.t" "$f"; fi ;;
      tab.new) id="tn$(wc -l < "$S/log" | tr -d ' ')"; upd ls.json --arg id "$id" '.spaces[0].tabs += [{id: $id}]'
        upd status.json --arg id "$id" '.tab = $id'; printf '{"tab": "%s"}\n' "$id" ;;
      tab.close) id=$(jq -r .id <<<"$a"); upd ls.json --arg id "$id" 'del(.spaces[].tabs[] | select(.id == $id))'
        if [ "$(jq -r .tab "$S/status.json")" = "$id" ]; then upd status.json --arg t "$(jq -r '.spaces[0].tabs[0].id' "$S/ls.json")" '.tab = $t'; fi ;;
      space.new) id="sn$(wc -l < "$S/log" | tr -d ' ')"
        upd ls.json --arg id "$id" '.spaces += [{id: $id, tabs: [{id: ($id + "-t")}]}]'
        upd status.json --arg id "$id" '.space = $id | .tab = ($id + "-t")'
        printf '{"space": "%s", "tab": "%s-t"}\n' "$id" "$id" ;;
      space.close) id=$(jq -r .id <<<"$a"); upd ls.json --arg id "$id" 'del(.spaces[] | select(.id == $id))'
        if [ "$(jq -r .space "$S/status.json")" = "$id" ]; then upd status.json --slurpfile l "$S/ls.json" '.space = $l[0].spaces[0].id | .tab = $l[0].spaces[0].tabs[0].id'; fi ;;
      space.move) id=$(jq -r .id <<<"$a"); ix=$(jq .index <<<"$a")
        upd ls.json --arg id "$id" --argjson ix "$ix" '(.spaces | map(select(.id != $id))) as $r | (.spaces[] | select(.id == $id)) as $s | .spaces = ($r[:($ix - 1)] + [$s] + $r[($ix - 1):])' ;;
      space.select) upd status.json --arg id "$(jq -r .id <<<"$a")" '.space = $id' ;;
      tab.select) upd status.json --arg id "$(jq -r .id <<<"$a")" '.tab = $id' ;;
    esac
    case $cmd in tab.new | space.new) ;; *) echo '{}' ;; esac ;;
  *) echo "stub: unsupported $*" >&2; exit 2 ;;
esac
EOF
  chmod +x "$C/bin/herdr-app"
}

# child <body>: writes the child script for the current case.
child() {
  { printf '#!/usr/bin/env bash\nset -eu\n. %q\n. %q\ncd "$HERDR_APP_HOME"\n' "$LIB" "$REPO/test/helpers/safe-rm.sh"; cat; } > "$C/child.sh"
}
run_env() { env HERDR_APP_HOME="$C/home" TMPDIR="$C/tmp" PATH="$C/bin:$PATH" LIVE_REPO="$C/repo" SAFE_RM_BASE="$T" CASE="$C" bash "$C/child.sh"; }
run_child() { RC=0; (cd "$C" && run_env >"$C/out" 2>"$C/err") || RC=$?; }
start_child() {
  set -m
  (cd "$C" && exec env HERDR_APP_HOME="$C/home" TMPDIR="$C/tmp" PATH="$C/bin:$PATH" LIVE_REPO="$C/repo" SAFE_RM_BASE="$T" CASE="$C" bash "$C/child.sh" >"$C/out" 2>"$C/err") &
  CHILD=$!
  set +m
  local i=0
  while [ ! -e "$C/ready" ] && [ "$i" -lt 100 ]; do kill -0 "$CHILD" 2>/dev/null || break; sleep 0.1; i=$((i + 1)); done
}
stop_child() { kill "-$1" "$CHILD" 2>/dev/null || true; RC=0; wait "$CHILD" || RC=$?; reap; }
reap() { if [ -f "$C/sleeper" ]; then kill "$(cat "$C/sleeper")" 2>/dev/null || true; fi; }
snap() { treesum "$C/home" > "$C/before.home"; treesum "$C/w" > "$C/before.w"; }
same_home() { treesum "$C/home" | cmp -s - "$C/before.home"; }
same_w() { treesum "$C/w" | cmp -s - "$C/before.w"; }
no_layout_calls() { ! grep -q '^layout\.' "$C/stub/log"; }
log_tail_is() { tail -n 5 "$C/stub/log" | cmp -s - <(printf '%s\n' "$@"); }
ROLLBACK_TAIL=('layout.switch {"name":"A"}' 'layout.resize {"id":"sidebar","px":240}' 'layout.switch {"name":"B"}' 'layout.resize {"id":"sidebar","px":300}' 'layout.switch {"name":"A"}')

KILL_BODY='live_begin rollback
live_claim mods/apollo-probe
mkdir mods/apollo-probe && printf "probe\n" > mods/apollo-probe/main.js
herdr-app do layout.switch "{\"name\":\"B\"}" >/dev/null
herdr-app do layout.resize "{\"id\":\"sidebar\",\"px\":500}" >/dev/null
live_swap_keys "$LIVE_REPO/user/keys.json"
if [ ! -L settings.json ]; then printf "{\"zoom\":1.5}\n" > settings.json.tmp && mv settings.json.tmp settings.json; fi
touch "$CASE/ready"
sleep 300 & echo $! > "$CASE/sleeper"; wait $!'

# Rollback kill test, twice: regular settings + linked keys (TERM), then the reverse (INT).
for spec in "kill-term file link TERM 143" "kill-int link file INT 130"; do
  set -- $spec
  new_case "$1" "$2" "$3"; snap
  echo "$KILL_BODY" | child
  start_child
  check "child reached ready" test -e "$C/ready"
  check "probe dir created before kill" test -e "$C/home/mods/apollo-probe"
  stop_child "$4"
  check "exit $5 after $4" eq "$RC" "$5"
  check "home restored (bytes, kind, link text, ledger gone, mods/other kept)" same_home
  check "link targets untouched" same_w
  check "log ends with layout restore A, B, shown A" log_tail_is "${ROLLBACK_TAIL[@]}"
  check "live_verify ok" grep -q 'live_verify: ok' "$C/err"
done

new_case early-kill file link; snap
child <<'EOF'
live_begin rollback
touch "$CASE/ready"
sleep 300 & echo $! > "$CASE/sleeper"; wait $!
EOF
start_child; stop_child TERM
check "nonzero exit" test "$RC" -ne 0
check "nothing changed" same_home

new_case guard file file
mkdir "$C/home/mods/apollo-probe"; printf 'mine\n' > "$C/home/mods/apollo-probe/main.js"; snap
child <<'EOF'
live_begin rollback
live_claim mods/apollo-probe
echo reached > "$CASE/reached"
EOF
run_child
check "exit 3" eq "$RC" 3
check "refusal message" grep -q 'refusing: mods/apollo-probe exists and is not ours' "$C/err"
check "stopped" test ! -e "$C/reached"
check "every file unchanged" same_home

new_case owned-tabs file file; snap
child <<'EOF'
live_begin rollback
id=$(live_new_tab '{}'); echo "$id" > "$CASE/own"
herdr-app do tab.new '{}' | jq -r .tab > "$CASE/foreign"
EOF
run_child
own=$(cat "$C/own" 2>/dev/null || true); foreign=$(cat "$C/foreign" 2>/dev/null || true)
check "owned tab closed" grep -qxF "tab.close {\"id\":\"$own\",\"confirmed\":true}" "$C/stub/log"
check "foreign tab never closed" bash -c '! grep -qF "\"id\":\"$1\",\"confirmed\"" "$2"' _ "$foreign" "$C/stub/log"
check "selection restored to t2" grep -qxF 'tab.select {"id":"t2"}' "$C/stub/log"
check "verify flags the foreign tab" grep -q 'MISMATCH tabs' "$C/err"
check "exit 1 on verify mismatch" eq "$RC" 1

new_case new-tab-owned file file; snap
child <<'EOF2'
live_begin rollback
id=$(live_new_tab '{"name":"probe"}')
[ -n "$id" ] && grep -qxF "tab $id" "$LIVE_DIR/owned"
echo "$id" > "$CASE/own"
EOF2
run_child
own=$(cat "$C/own" 2>/dev/null || true)
check "live_new_tab prints the new id and owns it" test -n "$own"
check "the owned tab is closed on rollback" grep -qxF "tab.close {\"id\":\"$own\",\"confirmed\":true}" "$C/stub/log"
check "tab set restored, exit 0" eq "$RC" 0
check "verify ok" grep -q 'live_verify: ok' "$C/err"

new_case new-tab-unowned file file; snap
child <<'EOF2'
live_begin rollback
herdr-app do tab.new '{}' | jq -r .tab > "$CASE/foreign"
EOF2
run_child
foreign=$(cat "$C/foreign" 2>/dev/null || true)
check "an unowned tab is left open" bash -c '! grep -qF "\"id\":\"$1\",\"confirmed\"" "$2"' _ "$foreign" "$C/stub/log"
check "verify fails closed (exit 1)" eq "$RC" 1
check "verify names the extra tab" grep -q "MISMATCH tabs/spaces: .*tab $foreign" "$C/err"

new_case manual file link; snap
child <<'EOF'
live_begin rollback
live_claim mods/apollo-probe
mkdir mods/apollo-probe
live_swap_keys "$LIVE_REPO/user/keys.json"
touch "$CASE/ready"
sleep 300 & echo $! > "$CASE/sleeper"; wait $!
EOF
start_child; stop_child KILL
dir=$(sed -n 's/^LIVE_DIR=//p' "$C/out")
check "SIGKILL left the probe behind" test -d "$C/home/mods/apollo-probe"
MRC=0; env PATH="$C/bin:$PATH" bash "$LIB" --rollback "$dir" >"$C/mout" 2>&1 || MRC=$?
check "--rollback exits 0" eq "$MRC" 0
check "--rollback restores everything" same_home

new_case link-apollo file file
ln -s "$C/repo/mods/apollo-x" "$C/home/mods/apollo-x"; snap
child <<'EOF'
live_begin rollback
live_link_apollo layouts/apollo.json mods/apollo-x themes/apollo.json
[ "$(readlink layouts/apollo.json)" = "$LIVE_REPO/layouts/apollo.json" ]
[ "$(readlink themes/apollo.json)" = "$LIVE_REPO/themes/apollo.json" ]
grep -qx layouts/apollo.json "$LIVE_DIR/ledger"
! grep -qx mods/apollo-x "$LIVE_DIR/ledger"
EOF
run_child
check "links made, existing repo link reused" eq "$RC" 0
check "rollback removes only claimed links" same_home

new_case link-refuse file file
printf '{"mine": true}\n' > "$C/home/themes/apollo.json"; snap
child <<'EOF'
live_begin rollback
live_link_apollo themes/apollo.json
echo reached > "$CASE/reached"
EOF
run_child
check "exit 3 on a foreign file" eq "$RC" 3
check "foreign file untouched" same_home

# Durable cases. Fixture mods are named apollo-test.* so test-side deletes can use safe_rm.
mkmods() { mkdir -p "$C/home/mods/apollo-test.mn-x/sub" "$C/home/mods/apollo-test.mn-y"; printf 'x\n' > "$C/home/mods/apollo-test.mn-x/sub/f"; printf 'y\n' > "$C/home/mods/apollo-test.mn-y/f"; }

new_case d1 file file; snap
child <<'EOF'
live_begin durable
live_journal keys.json
live_claim layouts/apollo.json
ln -sf "$LIVE_REPO/user/keys.json" keys.json
ln -s "$LIVE_REPO/layouts/apollo.json" layouts/apollo.json
exit 1
EOF
run_child
check "exit 1" eq "$RC" 1
check "original keys back, new link gone" same_home

new_case d2 file file; mkmods
treesum "$C/home/mods" > "$C/before.mods"
child <<'EOF'
live_begin durable
live_claim layouts/apollo.json
ln -s "$LIVE_REPO/layouts/apollo.json" layouts/apollo.json
live_archive "$CASE/arch/a.tar" mods/apollo-test.mn-x
live_phase deleting
safe_rm "$HERDR_APP_HOME/mods/apollo-test.mn-x"
exit 1
EOF
run_child
check "exit 1" eq "$RC" 1
check "mods back from the tar (tree sha)" eq "$(treesum "$C/home/mods")" "$(cat "$C/before.mods")"
check "new link kept" eq "$(readlink "$C/home/layouts/apollo.json")" "$C/repo/layouts/apollo.json"
check "no layout.* calls" no_layout_calls

new_case d3 file file; mkmods
child <<'EOF'
live_begin durable
live_journal keys.json
ln -sf "$LIVE_REPO/user/keys.json" keys.json
live_claim layouts/apollo.json
ln -s "$LIVE_REPO/layouts/apollo.json" layouts/apollo.json
live_archive "$CASE/arch/a.tar" mods/apollo-test.mn-x
live_finalize
touch "$CASE/ready"
sleep 300 & echo $! > "$CASE/sleeper"; wait $!
EOF
start_child; stop_child TERM
check "killed by TERM" eq "$RC" 143
check "links kept" eq "$(readlink "$C/home/layouts/apollo.json")|$(readlink "$C/home/keys.json")" "$C/repo/layouts/apollo.json|$C/repo/user/keys.json"
check "archive kept" test -s "$C/arch/a.tar"
check "no layout.* calls" no_layout_calls

new_case d4 file file
ln -s "$C/w/apollo.json" "$C/home/layouts/apollo-w.json"; printf 'w1\n' > "$C/w/apollo.json"
printf 'theme\n' > "$C/home/themes/apollo.json"; chmod 640 "$C/home/themes/apollo.json"
mkdir -p "$C/home/mods/apollo-test.dir/a/b"; printf 'deep\n' > "$C/home/mods/apollo-test.dir/a/b/f"; chmod 700 "$C/home/mods/apollo-test.dir/a"
snap
child <<'EOF'
live_begin durable
live_journal layouts/apollo-w.json themes/apollo.json mods/apollo-test.dir mods/apollo-new
ln -sfn "$CASE/w/other.json" layouts/apollo-w.json
printf 'changed\n' > themes/apollo.json.t && chmod 600 themes/apollo.json.t && mv themes/apollo.json.t themes/apollo.json
safe_rm "$HERDR_APP_HOME/mods/apollo-test.dir"
mkdir mods/apollo-new && printf 'n\n' > mods/apollo-new/f
printf 'w2 newer\n' > "$CASE/w/apollo.json"
exit 1
EOF
run_child
check "exit 1" eq "$RC" 1
check "link, file bytes+mode, dir tree, absent all restored" same_home
check "W's newer edit kept" eq "$(cat "$C/w/apollo.json")" "w2 newer"

for mode in rollback durable; do
  new_case "d8-$mode" link link; snap
  if [ "$mode" = rollback ]; then
    child <<'EOF'
live_begin rollback
live_swap_keys "$LIVE_REPO/user/keys.json"
printf '{"zoom": 1, "newer": true}\n' > "$CASE/w/settings.json"
EOF
  else
    child <<'EOF'
live_begin durable
live_journal settings.json keys.json
ln -sfn "$LIVE_REPO/user/settings.json" settings.json
ln -sfn "$LIVE_REPO/user/keys.json" keys.json
printf '{"zoom": 1, "newer": true}\n' > "$CASE/w/settings.json"
exit 1
EOF
  fi
  run_child
  check "links restored" same_home
  check "newer target edit survives" grep -q newer "$C/w/settings.json"
  check "keys target untouched" cmp -s "$C/w/keys.json" <(printf '{"global": {"cmd-w": "pane.close"}}\n')
  check "verify flags the target change" grep -q 'MISMATCH settings.json: link target bytes changed' "$C/err"
  check "nonzero exit" test "$RC" -ne 0
done

new_case d5 file file; mkmods; mkdir "$C/ro"; chmod 555 "$C/ro"; snap
child <<'EOF'
live_begin durable
live_journal keys.json
ln -sf "$LIVE_REPO/user/keys.json" keys.json
live_archive "$CASE/ro/a.tar" mods/apollo-test.mn-x
live_phase deleting
echo reached > "$CASE/reached"
EOF
run_child
chmod 755 "$C/ro"
check "exit 1" eq "$RC" 1
check "deleting never reached" test ! -e "$C/reached"
check "mods kept and journal rolled back" same_home

new_case d6 file file; mkmods; snap
printf '#!/usr/bin/env bash\nif [ "${1:-}" = -cf ]; then set -- "${@:1:$(($#-1))}"; fi\nexec %q "$@"\n' "$REAL_TAR" > "$C/bin/tar"; chmod +x "$C/bin/tar"
child <<'EOF'
live_begin durable
live_journal keys.json
ln -sf "$LIVE_REPO/user/keys.json" keys.json
live_archive "$CASE/arch/a.tar" mods/apollo-test.mn-x mods/apollo-test.mn-y
live_phase deleting
echo reached > "$CASE/reached"
EOF
run_child
check "exit 1" eq "$RC" 1
check "deleting never reached" test ! -e "$C/reached"
check "mods kept and journal rolled back" same_home

new_case d7 file file; mkmods; snap
child <<'EOF'
live_begin durable
live_journal keys.json
ln -sf "$LIVE_REPO/user/keys.json" keys.json
live_phase deleting
echo reached > "$CASE/reached"
EOF
run_child
check "exit 4" eq "$RC" 4
check "deleted nothing, journal rolled back" same_home
check "stopped" test ! -e "$C/reached"

# QA: restore steps that fail must fail the run, and live_verify must catch what they left.
for mode in durable rollback; do
  new_case "restore-fail-$mode" file file
  printf 'theme\n' > "$C/home/themes/apollo.json"; snap
  { printf 'live_begin %s\n' "$mode"; cat <<'EOF2'; } | child
live_journal themes/apollo.json
printf 'changed\n' > themes/apollo.json
live_claim mods/apollo-x
ln -s "$LIVE_REPO/mods/apollo-x" mods/apollo-x
chmod 555 themes mods
exit 0
EOF2
  run_child
  chmod 755 "$C/home/themes" "$C/home/mods"
  check "child began the run" grep -q '^LIVE_DIR=' "$C/out"
  check "nonzero exit when a restore fails" test "$RC" -ne 0
  check "restore failure reported" grep -q 'restore failed' "$C/err"
  check "live_verify says FAIL" grep -q 'live_verify: FAIL' "$C/err"
  check "verify names the journaled path" grep -q 'MISMATCH journal .*themes/apollo.json' "$C/err"
  check "verify names the claimed path" grep -q 'MISMATCH claimed mods/apollo-x' "$C/err"
done

# QA CRITICAL: a failed or short snapshot read must abort live_begin before any change.
new_case snap-short file link; snap
printf '#!/usr/bin/env bash\ncase "${!#}" in */home/settings.json) exit 0 ;; esac\nexec /bin/cat "$@"\n' > "$C/bin/cat"; chmod +x "$C/bin/cat"
child <<'EOF2'
live_begin rollback
echo reached > "$CASE/reached"
mkdir mods/apollo-probe
EOF2
run_child
check "short read: live_begin fails" test "$RC" -ne 0
check "short read: stopped before the first change" test ! -e "$C/reached"
check "short read: nothing mutated" same_home
check "short read: says why" grep -q 'snapshot failed: settings.json' "$C/err"

new_case snap-unreadable file file
chmod 000 "$C/home/settings.json"
child <<'EOF2'
live_begin rollback
echo reached > "$CASE/reached"
mkdir mods/apollo-probe
EOF2
run_child
chmod 644 "$C/home/settings.json"
check "unreadable: live_begin fails" test "$RC" -ne 0
check "unreadable: stopped before the first change" test ! -e "$C/reached"
check "unreadable: no probe dir" test ! -e "$C/home/mods/apollo-probe"
check "unreadable: settings.json bytes intact" cmp -s "$C/home/settings.json" <(printf '{"zoom": 1, "sounds": {"enabled": true}}\n')
check "unreadable: says why" grep -q 'snapshot failed: settings.json' "$C/err"

new_case snap-ls-fails file file; snap
printf '#!/usr/bin/env bash\n[ "$1" = ls ] && exit 1\nexec %q "$@"\n' "$C/bin/herdr-app.real" > "$C/bin/herdr-app.wrap"
mv "$C/bin/herdr-app" "$C/bin/herdr-app.real"; mv "$C/bin/herdr-app.wrap" "$C/bin/herdr-app"; chmod +x "$C/bin/herdr-app"
child <<'EOF2'
live_begin rollback
echo reached > "$CASE/reached"
EOF2
run_child
check "herdr-app ls fails: live_begin fails" test "$RC" -ne 0
check "herdr-app ls fails: stopped" test ! -e "$C/reached"
check "herdr-app ls fails: nothing mutated" same_home

# A23: an owned fixture space and a fixture temp dir are both undone by rollback.
new_case new-space-owned file file; snap
child <<'EOF2'
live_begin rollback
id=$(live_new_space '{"name":"fixture"}')
[ -n "$id" ] && grep -qxF "space $id" "$LIVE_DIR/owned"
echo "$id" > "$CASE/own"
d=$(live_tmpdir)
case "$d" in /private/tmp/apollo-test.?*) ;; *) exit 9 ;; esac
mkdir -p "$d/repo/sub" && echo x > "$d/repo/sub/f"
echo "$d" > "$CASE/tmpd"
EOF2
run_child
own=$(cat "$C/own" 2>/dev/null || true); tmpd=$(cat "$C/tmpd" 2>/dev/null || true)
check "live_new_space prints and owns the new space" test -n "$own"
check "the owned space is closed on rollback" grep -qxF "space.close {\"id\":\"$own\",\"confirmed\":true}" "$C/stub/log"
check "live_tmpdir made an apollo-test dir" test -n "$tmpd"
check "the fixture dir is removed on rollback" test ! -e "${tmpd:-/nonexistent-apollo}"
check "selection and ids restored, exit 0" eq "$RC" 0
check "verify ok" grep -q 'live_verify: ok' "$C/err"
check "home unchanged" same_home

new_case tmpdir-kill file file; snap
child <<'EOF2'
live_begin rollback
d=$(live_tmpdir); echo "$d" > "$CASE/tmpd"; echo y > "$d/f"
touch "$CASE/ready"
sleep 300 & echo $! > "$CASE/sleeper"; wait $!
EOF2
start_child; stop_child TERM
tmpd=$(cat "$C/tmpd" 2>/dev/null || true)
check "kill: exit 143" eq "$RC" 143
check "kill: fixture dir removed by the trap" test ! -e "${tmpd:-/nonexistent-apollo}"
check "kill: home unchanged" same_home

# A24 rule 1: fixture spaces moved ahead of the owner's spaces; rollback restores the owner's order.
new_case space-order file file
jq '.spaces += [{id: "s9", tabs: [{id: "t9"}]}]' "$C/stub/ls.json" > "$C/stub/ls.t" && mv "$C/stub/ls.t" "$C/stub/ls.json"; snap
child <<'EOF2'
live_begin rollback
id=$(live_new_space '{"name":"fixture"}')
herdr-app do space.move "$(jq -cn --arg id "$id" '{id: $id, index: 1}')" >/dev/null
herdr-app do space.move '{"id":"s9","index":2}' >/dev/null
herdr-app ls | jq -r '[.spaces[].id] | join(" ")' > "$CASE/during"
EOF2
run_child
check "during: fixture first, owner order changed" bash -c 'read -r a b c < "$1"; [ "$b" = s9 ] && [ "$c" = s1 ]' _ "$C/during"
check "order saved at begin" test -n "$(ls "$C"/tmp/apollo-live-*/order 2>/dev/null)"
check "rollback restores the owner's order (s1 then s9)" test "$(jq -r '[.spaces[].id] | join(" ")' "$C/stub/ls.json")" = "s1 s9"
check "exit 0, verify ok" eq "$RC" 0
check "verify ok" grep -q 'live_verify: ok' "$C/err"

new_case space-order-verify file file
jq '.spaces += [{id: "s9", tabs: [{id: "t9"}]}]' "$C/stub/ls.json" > "$C/stub/ls.t" && mv "$C/stub/ls.t" "$C/stub/ls.json"; snap
child <<'EOF2'
live_begin rollback
live_rollback >/dev/null 2>&1 || true
herdr-app do space.move '{"id":"s9","index":1}' >/dev/null
live_verify && echo VERIFY_OK > "$CASE/v" || echo VERIFY_FAIL > "$CASE/v"
live_rollback >/dev/null 2>&1 || true
EOF2
run_child
check "live_verify flags a changed space order" grep -qx VERIFY_FAIL "$C/v"
check "it names the order" grep -q 'MISMATCH space order' "$C/err"

# A24: Herdr does not load svg() assets through a symlinked mod dir, so captures install copies.
new_case copy-apollo file file
ln -s "$C/repo/mods/apollo-x" "$C/home/mods/apollo-x"; snap
child <<'EOF2'
live_begin rollback
live_copy_apollo layouts/apollo.json themes/apollo.json mods/apollo-x
[ -f layouts/apollo.json ] && [ ! -L layouts/apollo.json ] && cmp -s layouts/apollo.json "$LIVE_REPO/layouts/apollo.json"
[ -d mods/apollo-x ] && [ ! -L mods/apollo-x ] && cmp -s mods/apollo-x/main.js "$LIVE_REPO/mods/apollo-x/main.js"
grep -qx mods/apollo-x "$LIVE_DIR/ledger"
EOF2
run_child
check "copy refuses a path that exists (even a link into this repo)" eq "$RC" 3
check "copy refusal leaves the home unchanged" same_home

new_case copy-apollo-ok file file; snap
child <<'EOF2'
live_begin rollback
live_copy_apollo layouts/apollo.json themes/apollo.json mods/apollo-x
[ -f layouts/apollo.json ] && [ ! -L layouts/apollo.json ] && cmp -s layouts/apollo.json "$LIVE_REPO/layouts/apollo.json"
[ -d mods/apollo-x ] && [ ! -L mods/apollo-x ] && cmp -s mods/apollo-x/main.js "$LIVE_REPO/mods/apollo-x/main.js"
grep -qx mods/apollo-x "$LIVE_DIR/ledger" && grep -qx themes/apollo.json "$LIVE_DIR/ledger"
echo copied > "$CASE/ok"
EOF2
run_child
check "copies are real files and dirs with the repo's bytes, claimed" test -e "$C/ok"
check "copy: exit 0, verify ok" eq "$RC" 0
check "rollback removes the copies" same_home

echo "live: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
