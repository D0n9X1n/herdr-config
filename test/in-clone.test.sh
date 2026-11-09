#!/usr/bin/env bash
# Tests scripts/in-clone.sh on a fixture repo: the command runs in a disposable clone that has the
# working tree's changes, its exit status comes back, the clone is removed, and the source is untouched.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd -P)
# shellcheck source=helpers/safe-rm.sh
. "$REPO/test/helpers/safe-rm.sh"

T=$(mktemp -d /private/tmp/apollo-test.XXXXXX) || exit 1
[ -n "$T" ] && [ -d "$T" ] || exit 1
T=$(realpath "$T")
trap 'cd /; SAFE_RM_BASE=/private/tmp safe_rm "$T" >/dev/null 2>&1 || echo "leftover: $T"' EXIT

pass=0 fail=0
check() { local what=$1; shift; if "$@"; then pass=$((pass + 1)); echo "ok   $what"; else fail=$((fail + 1)); echo "FAIL $what"; fi; }

# A fixture repo with the script and the safe-rm helper at their real paths.
S="$T/src"
mkdir -p "$S/scripts" "$S/test/helpers"
cp "$REPO/scripts/in-clone.sh" "$S/scripts/" 2>/dev/null || true
cp "$REPO/test/helpers/safe-rm.sh" "$S/test/helpers/"
(
  cd "$S" && export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
  git init -q -b main
  printf 'ignored.txt\n' > .gitignore
  printf 'old\n' > tracked.txt
  printf 'gone\n' > deleted.txt
  git add -A && git -c user.name=t -c user.email=t@t.invalid commit -q -m init
  printf 'new\n' > tracked.txt
  printf 'fresh\n' > untracked.txt
  printf 'secret\n' > ignored.txt
  rm deleted.txt
)
before=$(cd "$S" && git status --porcelain=v1 --ignored && cat tracked.txt untracked.txt)
run() { RC=0; (cd "$S" && bash scripts/in-clone.sh "$@") > "$T/out" 2> "$T/err" || RC=$?; }

run bash -c 'pwd -P; cat tracked.txt untracked.txt; test -e ignored.txt && echo HAS-IGNORED || echo NO-IGNORED'
where=$(head -n 1 "$T/out")
check "exit 0 for a passing command" test "$RC" -eq 0
check "the command runs in a /private/tmp/apollo-test.* clone, not the source" \
  bash -c 'case "$1" in /private/tmp/apollo-test.?*/repo) [ "$1" != "$2" ] ;; *) false ;; esac' _ "$where" "$S"
check "the clone has the tracked change and the untracked file" test "$(sed -n 2,3p "$T/out" | tr '\n' ' ')" = "new fresh "
check "ignored files are not copied" test "$(sed -n 4p "$T/out")" = NO-IGNORED
check "the clone is removed afterwards" test ! -e "$(dirname "$where")"
check "a file deleted in the working tree does not break it" test ! -s "$T/err"

run bash -c 'exit 7'
check "the command's exit status comes back" test "$RC" -eq 7

run
check "no command: usage, exit 2" test "$RC" -eq 2
check "no command: says usage" grep -q usage "$T/err"

after=$(cd "$S" && git status --porcelain=v1 --ignored && cat tracked.txt untracked.txt)
check "the source working tree is unchanged" test "$before" = "$after"
check "no clone is left behind" test -z "$(grep -o '/private/tmp/apollo-test\.[^/ ]*' "$T/out" | sort -u | while read -r d; do [ -e "$d" ] && echo "$d"; done)"

echo "in-clone: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
