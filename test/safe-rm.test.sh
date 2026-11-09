#!/usr/bin/env bash
# Proves safe_rm refuses every unsafe path and deletes only a valid apollo-test.* dir.
# Run only from a disposable clone. Never exports TMPDIR.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd -P)
HELPER="$HERE/helpers/safe-rm.sh"
[ -f "$HELPER" ] || { echo "FAIL: missing $HELPER"; exit 1; }
# shellcheck source=helpers/safe-rm.sh
. "$HELPER"

B=$(mktemp -d /private/tmp/apollo-test.XXXXXX) || exit 1
[ -n "$B" ] && [ -d "$B" ] || exit 1
B=$(realpath "$B")
trap 'cd /; safe_rm "$B" >/dev/null 2>&1 || echo "leftover: $B"' EXIT

pass=0 fail=0
ok() { pass=$((pass + 1)); echo "ok   $1"; }
no() { fail=$((fail + 1)); echo "FAIL $1"; }

# refuses <name> <path-still-there> <cmd…>: the command must fail and the path must survive.
refuses() {
  local name=$1 keep=$2; shift 2
  if "$@" >/dev/null 2>&1; then no "$name (returned 0)"; return; fi
  if [ -n "$keep" ] && [ ! -e "$keep" ]; then no "$name (path deleted)"; return; fi
  ok "$name"
}

# A copy of the helper inside a fake repo whose basename passes the prefix check,
# so only the repo-root / parent guards can refuse it.
R="$B/apollo-test.repo"
mkdir -p "$R/test/helpers" "$R/keep"
cp "$HELPER" "$R/test/helpers/safe-rm.sh"
in_repo() { (cd /; . "$R/test/helpers/safe-rm.sh"; safe_rm "$1"); }

mkdir -p "$B/apollo-test.ok/sub" "$B/apollo-test.home" "$B/apollo-test.cwd" \
  "$B/other.dir" "$B/live-test.ok" "$B/base" "$B/apollo-test.out" "$B/apollo-test.target"
echo x > "$B/apollo-test.ok/sub/f"
echo x > "$B/apollo-test.file"
ln -s "$B/apollo-test.target" "$B/apollo-test.link"

refuses "empty path"            ""                       safe_rm ""
refuses "no argument"           ""                       safe_rm
refuses "root /"                /                        safe_rm /
refuses "HOME (real)"           "$HOME"                  safe_rm "$HOME"
refuses "HOME (inside base)"    "$B/apollo-test.home"    env HOME="$B/apollo-test.home" bash -c '. "$1"; safe_rm "$2"' _ "$HELPER" "$B/apollo-test.home"
refuses "HOME under target"     "$B/apollo-test.home"    env HOME="$B/apollo-test.home/inner" bash -c '. "$1"; safe_rm "$2"' _ "$HELPER" "$B/apollo-test.home"
refuses "repo root"             "$R/keep"                in_repo "$R"
refuses "parent of repo"        "$R/keep"                in_repo "$B"
refuses "this repo's root"      "$HERE/.."               safe_rm "$HERE/.."
refuses "outside base"          "$B/apollo-test.out"     env SAFE_RM_BASE="$B/base" bash -c '. "$1"; safe_rm "$2"' _ "$HELPER" "$B/apollo-test.out"
refuses "base itself"           /private/tmp             safe_rm /private/tmp
refuses "missing base"          "$B/apollo-test.out"     env SAFE_RM_BASE="$B/nope" bash -c '. "$1"; safe_rm "$2"' _ "$HELPER" "$B/apollo-test.out"
refuses "base is /"             "$B/apollo-test.out"     env SAFE_RM_BASE=/ bash -c '. "$1"; safe_rm "$2"' _ "$HELPER" "$B/apollo-test.out"
refuses "bad basename"          "$B/other.dir"           safe_rm "$B/other.dir"
refuses "non-directory"         "$B/apollo-test.file"    safe_rm "$B/apollo-test.file"
refuses "missing path"          ""                       safe_rm "$B/apollo-test.missing"
refuses "symlink to a dir"      "$B/apollo-test.target"  safe_rm "$B/apollo-test.link"
[ -L "$B/apollo-test.link" ] && ok "symlink itself kept" || no "symlink itself kept"
refuses "current directory"     "$B/apollo-test.cwd"     bash -c 'cd "$2"; . "$1"; safe_rm .' _ "$HELPER" "$B/apollo-test.cwd"
if [ -d "${TMPDIR:-}" ] && [ "$(realpath "$TMPDIR")" != /private/tmp ]; then
  O=$(env TMPDIR="$TMPDIR" mktemp -d "$TMPDIR/apollo-test.XXXXXX") || exit 1
  refuses "outside /private/tmp (default base)" "$O" safe_rm "$O"
  rmdir "$O"
fi

# zsh: sourcing works with nounset, prints nothing, finds the repo from the file (not the cwd) and still deletes.
mkdir -p "$B/apollo-test.zsh"
if zsh -uc '. "$1"' _ "$HELPER" > "$B/zsh.out" 2>&1 && [ ! -s "$B/zsh.out" ]; then ok "zsh: sourcing prints nothing (nounset)"; else no "zsh: sourcing prints nothing (nounset): $(cat "$B/zsh.out")"; fi
refuses "zsh: refuses its repo root" "$R/keep" zsh -uc 'cd /; . "$1"; safe_rm "$2"' _ "$R/test/helpers/safe-rm.sh" "$R"
if zsh -c 'cd "$3"; . "$1"; safe_rm "$2" 2>&1 | grep -q "is or contains the repo"' _ "$R/test/helpers/safe-rm.sh" "$R" "$B/apollo-test.cwd"; then
  ok "zsh: the repo guard names the helper's repo, wherever it is sourced from"
else no "zsh: the repo guard names the helper's repo, wherever it is sourced from"; fi
if zsh -uc 'cd /; . "$1"; safe_rm "$2"' _ "$HELPER" "$B/apollo-test.zsh" && [ ! -e "$B/apollo-test.zsh" ]; then ok "zsh: deletes valid apollo-test.* dir"; else no "zsh: deletes valid apollo-test.* dir"; fi

if safe_rm "$B/apollo-test.ok" && [ ! -e "$B/apollo-test.ok" ]; then ok "deletes valid apollo-test.* dir"; else no "deletes valid apollo-test.* dir"; fi
if safe_rm "$B/live-test.ok" && [ ! -e "$B/live-test.ok" ]; then ok "deletes valid live-test.* dir"; else no "deletes valid live-test.* dir"; fi
for d in "$B/apollo-test.home" "$B/apollo-test.cwd" "$B/other.dir" "$B/apollo-test.out" "$B/apollo-test.target" "$R/keep"; do
  [ -d "$d" ] || no "survivor $d"
done

echo "safe-rm: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
