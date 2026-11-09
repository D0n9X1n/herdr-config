#!/usr/bin/env bash
# shellcheck disable=SC1010 # `herdr-app do` is a subcommand, not a loop keyword
# L1: live-state guard for steps that drive the owner's running Herdr.
# Source it, then call `live_begin rollback|durable` before the first change.
#   rollback: every change is temporary; any exit runs live_rollback, then live_verify.
#   durable:  live_journal records paths first; a failure in phase `pre` rolls back,
#             a failure after `live_phase deleting` re-extracts the verified archive,
#             and live_finalize keeps the result.
# Manual fallback after SIGKILL: ctrl-alt-shift-escape, then
#   bash scripts/lib/live.sh --rollback <LIVE_DIR>     (or --verify <LIVE_DIR>)
# Rollback deletes only ledger paths, never writes into a symlink target, never changes zoom.
# Works on bash 3.2.

HERDR_HOME=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
LIVE_REPO=${LIVE_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd -P)}
_LIVE_LIB_REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd -P)
LIVE_TMP_BASE=${LIVE_TMP_BASE:-/private/tmp}
LIVE_FILES="settings.json keys.json"
LIVE_DIR=${LIVE_DIR:-}
LIVE_MODE=${LIVE_MODE:-}
LIVE_PHASE=${LIVE_PHASE:-}
LIVE_ARCHIVE=${LIVE_ARCHIVE:-}
LIVE_ARCHIVE_OK=${LIVE_ARCHIVE_OK:-0}

_live_log() { echo "live: $*" >&2; }
_live_sha() { if command -v shasum >/dev/null 2>&1; then shasum -a 256; else sha256sum; fi | cut -c1-64; }
_live_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }
_live_kind() { if [ -L "$1" ]; then echo link; elif [ -f "$1" ]; then echo file; elif [ -d "$1" ]; then echo dir; elif [ -e "$1" ]; then echo other; else echo absent; fi; }

# _live_rel <rel>: a safe path relative to $HERDR_HOME.
_live_rel() {
  case "$1" in "" | /* | -* | . | .. | ../* | */.. | */../* | ./* | */./* | */.) return 1 ;; esac
}

# _live_abs <path>: an absolute path for a journal entry (relative paths are under $HERDR_HOME).
_live_abs() {
  case "$1" in
    /*) case "$1" in */../* | */.. | */./* | */.) return 1 ;; esac; printf '%s\n' "$1" ;;
    *) _live_rel "$1" || return 1; printf '%s\n' "$HERDR_HOME/$1" ;;
  esac
}

# _live_within <a> <b>: a equals b or is inside b.
_live_within() { [ "$1" = "$2" ] || case "$1/" in "$2"/*) return 0 ;; *) return 1 ;; esac; }

# _live_rm <abs>: removes a link, file or dir that is not /, $HOME, $HERDR_HOME, the repo or LIVE_DIR (or a parent of them).
_live_rm() {
  local p=$1 r h
  case "$p" in /*) ;; *) _live_log "refusing to remove non-absolute ${p:-<empty>}"; return 1 ;; esac
  if [ -L "$p" ] || [ -f "$p" ]; then rm -f -- "$p"; return; fi
  [ -e "$p" ] || return 0
  r=$(cd "$p" 2>/dev/null && pwd -P) || return 1
  for h in / "$HOME" "$HERDR_HOME" "$LIVE_REPO" "$LIVE_DIR"; do
    [ -n "$h" ] || continue
    h=$(cd "$h" 2>/dev/null && pwd -P) || continue
    if _live_within "$h" "$r"; then _live_log "refusing to remove $p: contains $h"; return 1; fi
  done
  rm -rf -- "$r"
}

_live_state() {
  [ -n "$LIVE_DIR" ] || return 0
  printf '%s\n' "$HERDR_HOME" > "$LIVE_DIR/home"
  printf '%s\n' "$LIVE_MODE" > "$LIVE_DIR/mode"
  printf '%s\n' "$LIVE_PHASE" > "$LIVE_DIR/phase"
  printf '%s\n' "$LIVE_ARCHIVE" > "$LIVE_DIR/archive"
  printf '%s\n' "$LIVE_ARCHIVE_OK" > "$LIVE_DIR/archive_ok"
}

# _live_copy <src> <dst>: copies bytes and proves the copy (same size and sha256 as the source).
_live_copy() {
  cat "$1" > "$2" 2>/dev/null || return 1
  [ "$(wc -c < "$1" 2>/dev/null)" = "$(wc -c < "$2")" ] || return 1
  [ "$(_live_sha < "$1" 2>/dev/null)" = "$(_live_sha < "$2")" ] || return 1
}

# live_save: snapshot settings/keys (bytes, kind, link text, realpath, target bytes), status, sidebar px, ids.
# It runs inside `||` (errexit is off), so every step is checked; any failure returns 1 with the reason.
live_save() {
  local f d n px src kind
  mkdir -p "$LIVE_DIR/files" "$LIVE_DIR/j" || { _live_log "snapshot failed: cannot create $LIVE_DIR"; return 1; }
  for f in $LIVE_FILES; do
    d="$LIVE_DIR/files/$f"; src="$HERDR_HOME/$f"
    mkdir -p "$d" || { _live_log "snapshot failed: $f: cannot create $d"; return 1; }
    kind=$(_live_kind "$src") && printf '%s\n' "$kind" > "$d/kind" || { _live_log "snapshot failed: $f: kind"; return 1; }
    case $kind in
      link)
        readlink "$src" > "$d/target" && [ -s "$d/target" ] || { _live_log "snapshot failed: $f: readlink"; return 1; }
        (realpath "$src" 2>/dev/null || true) > "$d/realpath" || { _live_log "snapshot failed: $f: realpath"; return 1; }
        if [ -f "$src" ]; then _live_copy "$src" "$d/bytes" || { _live_log "snapshot failed: $f: link target bytes"; return 1; }; fi ;;
      file)
        _live_copy "$src" "$d/bytes" || { _live_log "snapshot failed: $f: bytes (unreadable or short read)"; return 1; }
        _live_mode "$src" > "$d/mode" && [ -s "$d/mode" ] || { _live_log "snapshot failed: $f: mode"; return 1; } ;;
      absent) ;;
      *) _live_log "snapshot failed: $f is neither a file nor a link"; return 1 ;;
    esac
  done
  herdr-app status > "$LIVE_DIR/status.json" || { _live_log "snapshot failed: herdr-app status"; return 1; }
  jq -e . "$LIVE_DIR/status.json" >/dev/null || { _live_log "snapshot failed: herdr-app status is not JSON"; return 1; }
  herdr-app ls > "$LIVE_DIR/ls.json" || { _live_log "snapshot failed: herdr-app ls"; return 1; }
  jq -e . "$LIVE_DIR/ls.json" >/dev/null || { _live_log "snapshot failed: herdr-app ls is not JSON"; return 1; }
  : > "$LIVE_DIR/layouts" || { _live_log "snapshot failed: layouts"; return 1; }
  for f in "$HERDR_HOME"/layouts/.state/*.json; do
    [ -f "$f" ] || continue
    n=${f##*/}; n=${n%.json}
    px=$(jq -r '.nodes.sidebar.size.px // empty | . + 0' "$f" 2>/dev/null) || { _live_log "snapshot failed: cannot read $f"; return 1; }
    if [ -n "$px" ]; then printf '%s %s\n' "$n" "$px" >> "$LIVE_DIR/layouts" || { _live_log "snapshot failed: layouts"; return 1; }; fi
  done
  _live_ids > "$LIVE_DIR/ids" || { _live_log "snapshot failed: space and tab ids"; return 1; }
  jq -r '.spaces[].id' "$LIVE_DIR/ls.json" > "$LIVE_DIR/order" || { _live_log "snapshot failed: space order"; return 1; }
  { : > "$LIVE_DIR/ledger" && : > "$LIVE_DIR/owned" && echo 0 > "$LIVE_DIR/jn"; } || { _live_log "snapshot failed: ledger"; return 1; }
}

# Sorted "space <id>" / "tab <id>" lines; fails if herdr-app ls or jq fails.
_live_ids() {
  local j ids
  j=$(herdr-app ls) || return 1
  ids=$(jq -r '.spaces[] | "space \(.id)", (.tabs[] | "tab \(.id)")' <<<"$j") || return 1
  if [ -n "$ids" ]; then printf '%s\n' "$ids" | LC_ALL=C sort; fi
}

# live_begin <rollback|durable>: snapshot to $LIVE_DIR, then arm the trap.
live_begin() {
  case "${1:-}" in rollback | durable) ;; *) _live_log "usage: live_begin rollback|durable"; exit 2 ;; esac
  [ -z "$LIVE_MODE" ] || { _live_log "live_begin called twice"; exit 2; }
  local base=${TMPDIR:-/tmp}
  base=${base%/}
  LIVE_DIR=$(mktemp -d "$base/apollo-live-$(date +%Y%m%d%H%M%S).XXXXXX") || exit 1
  [ -n "$LIVE_DIR" ] && [ -d "$LIVE_DIR" ] || exit 1
  LIVE_MODE=$1 LIVE_PHASE=pre LIVE_ARCHIVE="" LIVE_ARCHIVE_OK=0
  live_save || { _live_log "live_begin: snapshot failed; nothing was changed"; exit 1; }
  _live_state
  echo "LIVE_DIR=$LIVE_DIR"
  trap 'live_on_exit' EXIT
  trap 'live_on_exit 130' INT
  trap 'live_on_exit 143' TERM
  trap 'live_on_exit 129' HUP
}

# live_on_exit [status]: the trap. Restores per mode and phase, then exits with the status.
live_on_exit() {
  local st=$?
  [ -n "${1:-}" ] && st=$1
  trap - EXIT INT TERM HUP
  set +e
  case "$LIVE_MODE" in
    final) ;;
    rollback) live_rollback || { [ "$st" -eq 0 ] && st=1; }; live_verify || { [ "$st" -eq 0 ] && st=1; } ;;
    durable)
      if [ "$LIVE_PHASE" = pre ]; then
        live_rollback || { [ "$st" -eq 0 ] && st=1; }; live_verify || { [ "$st" -eq 0 ] && st=1; }
      elif [ "$st" -ne 0 ] && [ "$LIVE_ARCHIVE_OK" = 1 ] && [ -s "$LIVE_ARCHIVE" ]; then
        tar -xpf "$LIVE_ARCHIVE" -C "$HERDR_HOME" && _live_log "restored $LIVE_ARCHIVE; installed links kept"
      fi ;;
  esac
  exit "$st"
}

# live_claim <rel>: refuses (exit 3) an existing path, else adds it to the ledger.
live_claim() {
  _live_rel "${1:-}" || { _live_log "refusing: bad path ${1:-<empty>}"; exit 3; }
  [ -n "$LIVE_DIR" ] || { _live_log "live_claim before live_begin"; exit 2; }
  if [ -e "$HERDR_HOME/$1" ] || [ -L "$HERDR_HOME/$1" ]; then
    echo "refusing: $1 exists and is not ours" >&2; exit 3
  fi
  printf '%s\n' "$1" >> "$LIVE_DIR/ledger"
}

# live_own <tab|space> <id>: a tab or space this run created; rollback closes it.
live_own() { printf '%s %s\n' "$1" "$2" >> "$LIVE_DIR/owned"; }

# live_new_tab [json-args]: runs tab.new, finds the new tab id in the `herdr-app ls` diff, owns it
# (so rollback closes it) and prints it. Every task that creates a tab uses this; rollback never
# closes a tab it does not own, and live_verify fails on any other new tab.
live_new_tab() {
  local args=${1:-'{}'} before reply id new
  [ -n "$LIVE_DIR" ] || { _live_log "live_new_tab before live_begin"; return 2; }
  before=$(_live_ids) || return 1
  reply=$(herdr-app do tab.new "$args") || { _live_log "tab.new failed: $reply"; return 1; }
  new=$(_live_ids | grep -vxF -f <(printf '%s\n' "$before") | sed -n 's/^tab //p')
  id=$(jq -r '.tab // empty' <<<"$reply" 2>/dev/null || true)
  if [ -z "$id" ] || ! printf '%s\n' "$new" | grep -qxF "$id"; then
    [ "$(printf '%s\n' "$new" | grep -c .)" -eq 1 ] || { _live_log "live_new_tab: cannot tell the new tab (${new:-none})"; return 1; }
    id=$new
  fi
  live_own tab "$id"
  printf '%s\n' "$id"
}

# live_new_space [json-args]: runs space.new, finds the new space id in the `herdr-app ls` diff, owns it
# (rollback closes it, and its terminals with it) and prints it.
live_new_space() {
  local args=${1:-'{}'} before reply id new
  [ -n "$LIVE_DIR" ] || { _live_log "live_new_space before live_begin"; return 2; }
  before=$(_live_ids) || return 1
  reply=$(herdr-app do space.new "$args") || { _live_log "space.new failed: $reply"; return 1; }
  new=$(_live_ids | grep -vxF -f <(printf '%s\n' "$before") | sed -n 's/^space //p')
  id=$(jq -r '.space // empty' <<<"$reply" 2>/dev/null || true)
  if [ -z "$id" ] || ! printf '%s\n' "$new" | grep -qxF "$id"; then
    [ "$(printf '%s\n' "$new" | grep -c .)" -eq 1 ] || { _live_log "live_new_space: cannot tell the new space (${new:-none})"; return 1; }
    id=$new
  fi
  live_own space "$id"
  printf '%s\n' "$id"
}

# live_tmpdir: makes $LIVE_TMP_BASE/apollo-test.XXXXXX for fixtures, records it, prints it.
# Rollback removes it with safe_rm (after owned spaces, whose terminals may sit in it, are closed).
live_tmpdir() {
  local d
  [ -n "$LIVE_DIR" ] || { _live_log "live_tmpdir before live_begin"; return 2; }
  d=$(mktemp -d "$LIVE_TMP_BASE/apollo-test.XXXXXX") || { _live_log "mktemp failed"; return 1; }
  [ -n "$d" ] && [ -d "$d" ] || { _live_log "mktemp failed"; return 1; }
  d=$(cd "$d" && pwd -P) || return 1
  printf '%s\n' "$d" >> "$LIVE_DIR/tmpdirs" || return 1
  printf '%s\n' "$d"
}

_live_rm_tmpdirs() {
  local d fail=0
  [ -f "$LIVE_DIR/tmpdirs" ] || return 0
  while IFS= read -r d; do
    [ -n "$d" ] && [ -e "$d" ] || continue
    (cd / && SAFE_RM_BASE="$LIVE_TMP_BASE" bash -c '. "$1" && safe_rm "$2"' _ "$_LIVE_LIB_REPO/test/helpers/safe-rm.sh" "$d") \
      || { _live_log "restore failed: fixture dir $d"; fail=1; }
  done < "$LIVE_DIR/tmpdirs"
  return "$fail"
}

# live_swap_keys <src>: points keys.json at <src> (restored by rollback).
live_swap_keys() {
  [ -f "${1:-}" ] || { _live_log "live_swap_keys: no such file ${1:-}"; return 1; }
  rm -f -- "$HERDR_HOME/keys.json" && ln -s "$1" "$HERDR_HOME/keys.json"
}

# live_link_apollo <rel…>: links $HERDR_HOME/<rel> to $LIVE_REPO/<rel>; reuses a link into this repo, refuses (exit 3) anything else.
live_link_apollo() {
  local rel dst src
  for rel in "$@"; do
    _live_rel "$rel" || { _live_log "refusing: bad path $rel"; exit 3; }
    case "${rel##*/}" in apollo*) ;; *) echo "refusing: $rel is not an apollo* path" >&2; exit 3 ;; esac
    src="$LIVE_REPO/$rel"; dst="$HERDR_HOME/$rel"
    [ -e "$src" ] || { echo "refusing: $src does not exist" >&2; exit 3; }
    if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then continue; fi
    if [ -e "$dst" ] || [ -L "$dst" ]; then echo "refusing: $rel exists and is not ours" >&2; exit 3; fi
    [ -d "$(dirname "$dst")" ] || { echo "refusing: $(dirname "$rel") does not exist" >&2; exit 3; }
    live_claim "$rel"
    ln -s "$src" "$dst"
  done
}

# live_copy_apollo <rel…>: copies $LIVE_REPO/<rel> into $HERDR_HOME/<rel> (files with their mode, dirs whole),
# claiming each. Refuses (exit 3) any existing path, a link into this repo included. Used for screenshots:
# Herdr does not load svg() assets through a symlinked mod dir (wiki/Herdr-Notes.md, P10).
live_copy_apollo() {
  local rel dst src
  for rel in "$@"; do
    _live_rel "$rel" || { _live_log "refusing: bad path $rel"; exit 3; }
    case "${rel##*/}" in apollo*) ;; *) echo "refusing: $rel is not an apollo* path" >&2; exit 3 ;; esac
    src="$LIVE_REPO/$rel"; dst="$HERDR_HOME/$rel"
    [ -e "$src" ] || { echo "refusing: $src does not exist" >&2; exit 3; }
    if [ -e "$dst" ] || [ -L "$dst" ]; then echo "refusing: $rel exists" >&2; exit 3; fi
    [ -d "$(dirname "$dst")" ] || { echo "refusing: $(dirname "$rel") does not exist" >&2; exit 3; }
    live_claim "$rel"
    if [ -d "$src" ]; then cp -R "$src" "$dst" || { _live_log "copy failed: $rel"; exit 1; }
    else cp -p "$src" "$dst" || { _live_log "copy failed: $rel"; exit 1; }; fi
  done
}

# live_journal <path…>: records each path's original state (link text, file bytes + mode, dir tar, or absent).
live_journal() {
  local p abs n d
  for p in "$@"; do
    abs=$(_live_abs "$p") || { _live_log "refusing: bad journal path $p"; exit 3; }
    n=$(( $(cat "$LIVE_DIR/jn") + 1 )); echo "$n" > "$LIVE_DIR/jn"
    d="$LIVE_DIR/j/$n"; mkdir -p "$d"
    printf '%s\n' "$abs" > "$d/path"
    if [ -L "$abs" ]; then echo link > "$d/kind"; readlink "$abs" > "$d/target"
    elif [ -f "$abs" ]; then echo file > "$d/kind"; cat "$abs" > "$d/bytes"; _live_mode "$abs" > "$d/mode"
    elif [ -d "$abs" ]; then echo dir > "$d/kind"; tar -cf "$d/tree.tar" -C "$(dirname "$abs")" "$(basename "$abs")" || exit 1
    elif [ -e "$abs" ]; then _live_log "refusing: $abs is not a link, file or dir"; exit 3
    else echo absent > "$d/kind"; fi
  done
}

# live_archive <tar> <rel…>: tar under $HERDR_HOME, verified non-empty, readable, listing every rel.
live_archive() {
  local tarf=${1:-} rel list
  shift || true
  [ -n "$tarf" ] && [ "$#" -gt 0 ] || { _live_log "usage: live_archive <tar> <rel…>"; return 1; }
  for rel in "$@"; do _live_rel "$rel" || { _live_log "bad archive path $rel"; return 1; }; done
  LIVE_ARCHIVE_OK=0; _live_state
  tar -cf "$tarf" -C "$HERDR_HOME" "$@" || { _live_log "archive write failed: $tarf"; return 1; }
  [ -s "$tarf" ] || { _live_log "archive empty: $tarf"; return 1; }
  list=$(tar -tf "$tarf") || { _live_log "archive unreadable: $tarf"; return 1; }
  for rel in "$@"; do
    printf '%s\n' "$list" | sed 's#/$##' | grep -qxF "$rel" || { _live_log "archive lacks $rel"; return 1; }
  done
  LIVE_ARCHIVE=$tarf LIVE_ARCHIVE_OK=1
  _live_state
}

# live_phase <name>: `deleting` exits 4 unless a verified archive exists.
live_phase() {
  if [ "${1:-}" = deleting ] && [ "$LIVE_ARCHIVE_OK" != 1 ]; then
    _live_log "refusing phase deleting: no verified archive"; exit 4
  fi
  LIVE_PHASE=$1; _live_state
}

# live_finalize: disarms the trap and keeps the result.
live_finalize() {
  trap - EXIT INT TERM HUP
  LIVE_MODE=final; _live_state
  [ -n "$LIVE_ARCHIVE" ] && echo "kept archive: $LIVE_ARCHIVE"
  return 0
}

_live_rev() { awk '{a[NR]=$0} END {for (i = NR; i > 0; i--) print a[i]}' "$1"; }

# _live_restore_entry <journal dir>: puts one journaled path back. Returns 1 on any failure.
_live_restore_entry() {
  local d=$1 p kind
  p=$(cat "$d/path"); kind=$(cat "$d/kind")
  _live_rm "$p" || return 1
  case $kind in
    link) ln -s "$(cat "$d/target")" "$p" ;;
    file) cat "$d/bytes" > "$p.apollo-tmp" && chmod "$(cat "$d/mode")" "$p.apollo-tmp" && mv -f "$p.apollo-tmp" "$p" ;;
    dir) tar -xpf "$d/tree.tar" -C "$(dirname "$p")" ;;
    absent) [ ! -e "$p" ] && [ ! -L "$p" ] ;;
  esac
}

_live_rollback_journal() {
  local n d fail=0
  n=$(cat "$LIVE_DIR/jn" 2>/dev/null || echo 0)
  while [ "$n" -gt 0 ]; do
    d="$LIVE_DIR/j/$n"; n=$((n - 1))
    [ -f "$d/path" ] || continue
    _live_restore_entry "$d" 2>/dev/null || { _live_log "restore failed: journal $(cat "$d/path")"; fail=1; }
  done
  return "$fail"
}

_live_journaled() { grep -qxF "$1" "$LIVE_DIR"/j/*/path 2>/dev/null; }

_live_rollback_files() {
  local f d dst kind fail=0
  for f in $LIVE_FILES; do
    d="$LIVE_DIR/files/$f"; dst="$HERDR_HOME/$f"; kind=$(cat "$d/kind")
    case $kind in
      file)
        if [ ! -L "$dst" ] && [ -f "$dst" ] && cmp -s "$dst" "$d/bytes"; then continue; fi
        { rm -f -- "$dst" && cat "$d/bytes" > "$dst.apollo-tmp" && chmod "$(cat "$d/mode")" "$dst.apollo-tmp" && mv -f "$dst.apollo-tmp" "$dst"; } 2>/dev/null ;;
      link)
        if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$(cat "$d/target")" ]; then continue; fi
        { rm -f -- "$dst" && ln -s "$(cat "$d/target")" "$dst"; } 2>/dev/null ;;
      absent) rm -f -- "$dst" 2>/dev/null ;;
    esac || { _live_log "restore failed: $f"; fail=1; }
  done
  return "$fail"
}

_live_status() { herdr-app status 2>/dev/null; }
_live_do() { herdr-app do "$@" >/dev/null 2>&1 || { _live_log "restore failed: herdr-app do $1 $2"; return 1; }; }

_live_order() { herdr-app ls | jq -r '.spaces[].id'; }

# Moves the saved spaces back to their saved positions (1 = first), only where they moved.
_live_restore_order() {
  local i=0 id cur fail=0
  [ -f "$LIVE_DIR/order" ] || return 0
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    i=$((i + 1))
    cur=$(_live_order | grep -nxF "$id" | cut -d: -f1) || continue
    [ -n "$cur" ] && [ "$cur" != "$i" ] || continue
    _live_do space.move "$(jq -cn --arg id "$id" --argjson ix "$i" '{id: $id, index: $ix}')" || fail=1
  done < "$LIVE_DIR/order"
  return "$fail"
}

# live_rollback: journal, files, layouts, owned tabs/spaces, selection, then ledger paths.
# Every step runs even after an earlier one fails; returns 1 if any failed.
live_rollback() {
  local name px t id rel shown z fail=0
  _live_rollback_journal || fail=1
  _live_rollback_files || fail=1
  z=$(jq '.zoom' "$LIVE_DIR/status.json")
  wait_for 5 _live_zoom_is "$z" || { _live_log "restore failed: zoom not back to $z within 5 s"; fail=1; }
  while read -r name px; do
    [ -n "$name" ] || continue
    _live_do layout.switch "$(jq -cn --arg n "$name" '{name: $n}')" || fail=1
    _live_do layout.resize "$(jq -cn --argjson px "$px" '{id: "sidebar", px: $px}')" || fail=1
  done < "$LIVE_DIR/layouts"
  shown=$(jq -r '.layout' "$LIVE_DIR/status.json")
  _live_do layout.switch "$(jq -cn --arg n "$shown" '{name: $n}')" || fail=1
  while read -r t id; do
    [ -n "$id" ] || continue
    if _live_ids | grep -qxF "$t $id"; then
      _live_do "$t.close" "$(jq -cn --arg id "$id" '{id: $id, confirmed: true}')" || fail=1
    fi
  done < <(_live_rev "$LIVE_DIR/owned")
  _live_restore_order || fail=1
  _live_reselect || fail=1
  while IFS= read -r rel; do
    _live_rel "$rel" || { _live_log "restore failed: bad ledger path $rel"; fail=1; continue; }
    _live_journaled "$HERDR_HOME/$rel" && continue
    if [ -e "$HERDR_HOME/$rel" ] || [ -L "$HERDR_HOME/$rel" ]; then
      _live_rm "$HERDR_HOME/$rel" 2>/dev/null || { _live_log "restore failed: claimed $rel"; fail=1; }
    fi
  done < <(_live_rev "$LIVE_DIR/ledger")
  _live_rm_tmpdirs || fail=1
  return "$fail"
}

_live_zoom_is() { [ "$(_live_status | jq '.zoom == ('"$1"')')" = true ]; }

_live_reselect() {
  local sp tb cur
  sp=$(jq -r '.space // empty' "$LIVE_DIR/status.json"); tb=$(jq -r '.tab // empty' "$LIVE_DIR/status.json")
  cur=$(_live_status) || { _live_log "restore failed: herdr-app status"; return 1; }
  if [ -n "$sp" ] && [ "$(jq -r '.space // empty' <<<"$cur")" != "$sp" ]; then
    _live_do space.select "$(jq -cn --arg id "$sp" '{id: $id}')" || return 1
    cur=$(_live_status) || return 1
  fi
  if [ -n "$tb" ] && [ "$(jq -r '.tab // empty' <<<"$cur")" != "$tb" ]; then
    _live_do tab.select "$(jq -cn --arg id "$tb" '{id: $id}')" || return 1
  fi
  return 0
}

# _live_tree <dir>: one line per entry (kind, path, mode, link text or content sha).
_live_tree() {
  (cd "$1" && find . -print | LC_ALL=C sort | while IFS= read -r p; do
    if [ -L "$p" ]; then echo "L $p $(readlink "$p")"
    elif [ -d "$p" ]; then echo "D $p $(_live_mode "$p")"
    else echo "F $p $(_live_mode "$p") $(_live_sha < "$p")"; fi
  done)
}

# Every journaled path matches its first (original) journal entry: kind, link text, bytes and mode, or tree.
_live_verify_journal() {
  local n=1 max d p kind seen="" x bad=0
  max=$(cat "$LIVE_DIR/jn" 2>/dev/null || echo 0)
  while [ "$n" -le "$max" ]; do
    d="$LIVE_DIR/j/$n"; n=$((n + 1))
    [ -f "$d/path" ] || continue
    p=$(cat "$d/path"); kind=$(cat "$d/kind")
    case "
$seen
" in *"
$p
"*) continue ;; esac
    seen="$seen
$p"
    case $kind in
      link) [ -L "$p" ] && [ "$(readlink "$p")" = "$(cat "$d/target")" ] || { echo "MISMATCH journal $p: link" >&2; bad=1; } ;;
      file) [ ! -L "$p" ] && [ -f "$p" ] && cmp -s "$p" "$d/bytes" && [ "$(_live_mode "$p")" = "$(cat "$d/mode")" ] \
              || { echo "MISMATCH journal $p: file bytes or mode" >&2; bad=1; } ;;
      dir)
        x="$LIVE_DIR/jv.$((n - 1))"; mkdir -p "$x"
        if [ -L "$p" ] || [ ! -d "$p" ] || ! tar -xpf "$d/tree.tar" -C "$x" 2>/dev/null \
            || [ "$(_live_tree "$x/$(basename "$p")")" != "$(_live_tree "$p")" ]; then
          echo "MISMATCH journal $p: dir tree" >&2; bad=1
        fi ;;
      absent) [ ! -e "$p" ] && [ ! -L "$p" ] || { echo "MISMATCH journal $p: should be absent" >&2; bad=1; } ;;
    esac
  done
  return "$bad"
}

# Every claimed path that was not journaled is gone.
_live_verify_ledger() {
  local rel bad=0
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    _live_journaled "$HERDR_HOME/$rel" && continue
    if [ -e "$HERDR_HOME/$rel" ] || [ -L "$HERDR_HOME/$rel" ]; then echo "MISMATCH claimed $rel: still present" >&2; bad=1; fi
  done < "$LIVE_DIR/ledger"
  return "$bad"
}

# live_verify: bytes, kind, link text and target bytes; journal and ledger; zoom, layout, sidebar px,
# selection, ids. Prints `live_verify: ok` or `live_verify: FAIL`; returns 1 on any mismatch.
live_verify() {
  local bad=0 f d dst kind cur name px now k
  for f in $LIVE_FILES; do
    d="$LIVE_DIR/files/$f"; dst="$HERDR_HOME/$f"; kind=$(cat "$d/kind")
    [ "$(_live_kind "$dst")" = "$kind" ] || { echo "MISMATCH $f: kind $(_live_kind "$dst") != $kind" >&2; bad=1; continue; }
    case $kind in
      file) cmp -s "$dst" "$d/bytes" || { echo "MISMATCH $f: bytes" >&2; bad=1; }
        [ "$(_live_mode "$dst")" = "$(cat "$d/mode")" ] || { echo "MISMATCH $f: mode" >&2; bad=1; } ;;
      link) [ "$(readlink "$dst")" = "$(cat "$d/target")" ] || { echo "MISMATCH $f: link text" >&2; bad=1; }
        if [ -f "$d/bytes" ] && ! cmp -s "$dst" "$d/bytes"; then echo "MISMATCH $f: link target bytes changed (not rewritten)" >&2; bad=1; fi ;;
    esac
  done
  if [ "$LIVE_MODE" != final ] && { [ "$LIVE_MODE" = rollback ] || [ "$LIVE_PHASE" = pre ]; }; then
    _live_verify_journal || bad=1
    _live_verify_ledger || bad=1
    if [ -f "$LIVE_DIR/tmpdirs" ]; then
      while IFS= read -r k; do
        if [ -n "$k" ] && [ -e "$k" ]; then echo "MISMATCH fixture dir $k: still present" >&2; bad=1; fi
      done < "$LIVE_DIR/tmpdirs"
    fi
  fi
  if cur=$(_live_status); then
    for k in zoom layout space tab; do
      [ "$(jq -c ".$k" <<<"$cur")" = "$(jq -c ".$k" "$LIVE_DIR/status.json")" ] || { echo "MISMATCH $k: $(jq -c ".$k" <<<"$cur") != $(jq -c ".$k" "$LIVE_DIR/status.json")" >&2; bad=1; }
    done
  else
    echo "MISMATCH status: herdr-app status failed" >&2; bad=1
  fi
  while read -r name px; do
    [ -n "$name" ] || continue
    now=$(state_sidebar_px "$name")
    [ -n "$now" ] && [ "$(jq -n "$now == $px")" = true ] || { echo "MISMATCH $name sidebar px: ${now:-none} != $px" >&2; bad=1; }
  done < "$LIVE_DIR/layouts"
  if [ -f "$LIVE_DIR/order" ] && [ "$(_live_order | grep -xF -f "$LIVE_DIR/order" | tr '\n' ' ')" != "$(tr '\n' ' ' < "$LIVE_DIR/order")" ]; then
    echo "MISMATCH space order: $(_live_order | tr '\n' ' ')!= $(tr '\n' ' ' < "$LIVE_DIR/order")" >&2; bad=1
  fi
  if ! _live_ids | cmp -s - "$LIVE_DIR/ids"; then
    echo "MISMATCH tabs/spaces: $(_live_ids | diff "$LIVE_DIR/ids" - | grep '^[<>]' | tr '\n' ' ')" >&2; bad=1
  fi
  if [ "$bad" -eq 0 ]; then echo "live_verify: ok ($LIVE_DIR)" >&2; else echo "live_verify: FAIL ($LIVE_DIR)" >&2; fi
  return "$bad"
}

# state_sidebar_px <layout>: .nodes.sidebar.size.px from layouts/.state/<layout>.json.
state_sidebar_px() { jq -r '.nodes.sidebar.size.px // empty | . + 0' "$HERDR_HOME/layouts/.state/$1.json" 2>/dev/null; }

# wait_for <secs> <cmd…>: polls every 0.2 s until cmd succeeds.
wait_for() {
  local secs=$1 i=0; shift
  while ! "$@"; do
    i=$((i + 1)); [ "$i" -le $((secs * 5)) ] || return 1
    sleep 0.2
  done
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    --rollback | --verify)
      LIVE_DIR=${2:-}
      [ -n "$LIVE_DIR" ] && [ -f "$LIVE_DIR/home" ] || { echo "usage: $0 --rollback|--verify <LIVE_DIR>" >&2; exit 2; }
      HERDR_HOME=$(cat "$LIVE_DIR/home"); LIVE_MODE=$(cat "$LIVE_DIR/mode"); LIVE_PHASE=$(cat "$LIVE_DIR/phase")
      LIVE_ARCHIVE=$(cat "$LIVE_DIR/archive"); LIVE_ARCHIVE_OK=$(cat "$LIVE_DIR/archive_ok")
      if [ "$1" = --verify ]; then live_verify; exit; fi
      if [ "$LIVE_MODE" = durable ] && [ "$LIVE_PHASE" != pre ]; then
        [ "$LIVE_ARCHIVE_OK" = 1 ] && tar -xpf "$LIVE_ARCHIVE" -C "$HERDR_HOME"
        exit
      fi
      rc=0; live_rollback || rc=1; live_verify || rc=1; exit "$rc" ;;
    *) echo "usage: $0 --rollback|--verify <LIVE_DIR> (or source it)" >&2; exit 2 ;;
  esac
fi
