#!/usr/bin/env bash
# Runs a command inside a disposable clone of this repo, with the working tree's changes copied in
# (tracked and untracked files, not ignored ones; a file deleted in the working tree stays in the clone).
# The clone lives under /private/tmp/apollo-test.* and is removed with safe_rm afterwards.
#   scripts/in-clone.sh <command> [args…]     → the command's exit status
set -eu
[ "$#" -gt 0 ] || { echo "usage: scripts/in-clone.sh <command> [args…]" >&2; exit 2; }
SRC=$(cd "$(dirname "$0")/.." && pwd -P)
C=$(mktemp -d /private/tmp/apollo-test.XXXXXX) || exit 1
[ -n "$C" ] && [ -d "$C" ] || exit 1
git clone -q --local "$SRC" "$C/repo"
(cd "$SRC" && git ls-files -z -c -o --exclude-standard |
  while IFS= read -r -d '' f; do if [ -e "$f" ] || [ -L "$f" ]; then printf '%s\0' "$f"; fi; done |
  tar --null -T - -cf -) | tar -xf - -C "$C/repo"
st=0
(cd "$C/repo" && "$@") || st=$?
cd /
# shellcheck source=../test/helpers/safe-rm.sh
. "$SRC/test/helpers/safe-rm.sh"
SAFE_RM_BASE=/private/tmp safe_rm "$C" || echo "in-clone: kept $C" >&2
exit "$st"
