#!/usr/bin/env bash
# Tests scripts/set-app-icon.sh on copies only: a fake .app bundle, and (when Herdr.app is installed) a
# copy of it under /private/tmp/apollo-test.*. It never touches the installed app. macOS only; elsewhere
# it prints a skip line and passes.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd -P)
SCRIPT="$REPO/scripts/set-app-icon.sh"
if [ "$(uname -s)" != Darwin ]; then echo "set-app-icon: skipped (macOS only)"; exit 0; fi
# shellcheck source=helpers/safe-rm.sh
. "$REPO/test/helpers/safe-rm.sh"

T=$(mktemp -d /private/tmp/apollo-test.XXXXXX) || exit 1
[ -n "$T" ] && [ -d "$T" ] || exit 1
T=$(realpath "$T")
trap 'cd /; SAFE_RM_BASE=/private/tmp safe_rm "$T" >/dev/null 2>&1 || echo "leftover: $T"' EXIT

pass=0 fail=0
check() { local what=$1; shift; if "$@"; then pass=$((pass + 1)); echo "ok   $what"; else fail=$((fail + 1)); echo "FAIL $what"; fi; }
ICON=$'Icon\r'
run() { RC=0; "$@" > "$T/out" 2> "$T/err" || RC=$?; }
# The script with a recording `killall` first on PATH, so --restart-dock never restarts the real Dock.
mkdir -p "$T/bin"
printf '#!/bin/sh\necho "$@" >> "%s/killall.log"\n' "$T" > "$T/bin/killall"
chmod +x "$T/bin/killall"
SA() { PATH="$T/bin:$PATH" bash "$SCRIPT" "$@"; }
flag_set() { local h; h=$(xattr -px com.apple.FinderInfo "$1" 2>/dev/null | tr -d ' \n') || return 1; [ $(( 0x${h:16:2} & 4 )) -ne 0 ]; }
no_flag() { ! flag_set "$1"; }
no_icon() { [ ! -e "$1/$ICON" ]; }
is_rc() { [ "$RC" -eq "$1" ]; }
contents_sum() {
  (cd "$1/Contents" && find . -print | LC_ALL=C sort | while IFS= read -r p; do
    if [ -L "$p" ]; then echo "L $p $(readlink "$p")"
    elif [ -d "$p" ]; then echo "D $p"
    else echo "F $p $(shasum -a 256 < "$p" | cut -c1-64)"; fi
  done) | shasum -a 256 | cut -c1-64
}
fake() {
  mkdir -p "$1/Contents/MacOS"
  printf '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleName</key><string>Fake</string></dict></plist>\n' \
    > "$1/Contents/Info.plist"
  printf 'bin\n' > "$1/Contents/MacOS/Fake"
}

# ---- arguments and refusals ----
F="$T/Fake.app"; fake "$F"
before=$(contents_sum "$F")
run SA --bogus; check "an unknown flag: usage, exit 2" is_rc 2
run SA --check --remove --app "$F"; check "--check with --remove: usage, exit 2" is_rc 2
mkdir -p "$T/NotApp"; run SA --app "$T/NotApp"
check "a folder that is not an .app is refused" is_rc 1
check "  ...and gets no icon" no_icon "$T/NotApp"
mkdir -p "$T/Empty.app"; run SA --app "$T/Empty.app"
check "an .app with no Contents/Info.plist is refused" is_rc 1
check "  ...and gets no icon" no_icon "$T/Empty.app"
ln -s "$F" "$T/Link.app"; run SA --app "$T/Link.app"
check "a symlinked .app is refused" is_rc 1
check "  ...and its target gets no icon" no_icon "$F"

# ---- apply, check, remove on a fake bundle ----
run SA --check --app "$F"; check "--check before apply: exit 1" is_rc 1
run SA --app "$F"
check "apply: exit 0" is_rc 0
check "apply: Icon\\r in the bundle root" test -f "$F/$ICON"
check "apply: the Finder custom-icon flag is set" flag_set "$F"
check "apply: prints the codesign note" grep -q 'codesign --verify --strict' "$T/out"
check "apply without --restart-dock leaves the Dock alone" test ! -e "$T/killall.log"
run SA --check --app "$F"; check "--check after apply: exit 0" is_rc 0
check "Contents/ is unchanged after apply" test "$(contents_sum "$F")" = "$before"
run SA --remove --app "$F" --restart-dock
check "remove: exit 0" is_rc 0
check "remove: no Icon\\r" no_icon "$F"
check "remove: the custom-icon flag is clear" no_flag "$F"
check "--restart-dock ran killall Dock once" test "$(cat "$T/killall.log" 2>/dev/null)" = Dock
run SA --check --app "$F"; check "--check after remove: exit 1" is_rc 1
check "Contents/ is unchanged after remove" test "$(contents_sum "$F")" = "$before"

# ---- --check needs both: the Icon\r file and the Finder flag ----
G="$T/Half.app"; fake "$G"
printf '' > "$G/$ICON"
# Finder info present (type/creator set) but the custom-icon bit (0x04 of byte 8) clear.
xattr -wx com.apple.FinderInfo "4150504c61706f6c000000000000000000000000000000000000000000000000" "$G"
run SA --check --app "$G"; check "--check: Icon\\r with the custom-icon flag clear is not a custom icon" is_rc 1
rm -f "$G/$ICON"
xattr -wx com.apple.FinderInfo "0000000000000000040000000000000000000000000000000000000000000000" "$G"
run SA --check --app "$G"; check "--check: the flag without Icon\\r is not a custom icon" is_rc 1

# ---- the default app: ~/Applications/Herdr.app first (read-only --check) ----
H="$T/home"; fake "$H/Applications/Herdr.app"
run env HOME="$H" PATH="$T/bin:$PATH" bash "$SCRIPT" --check
check "the default app is ~/Applications/Herdr.app" grep -qxF "app: $H/Applications/Herdr.app" "$T/out"
check "  ...and --check only reads it" no_icon "$H/Applications/Herdr.app"

# ---- a copy of the installed Herdr.app (never the app itself) ----
REAL=""
for c in "$HOME/Applications/Herdr.app" /Applications/Herdr.app; do if [ -d "$c" ]; then REAL=$c; break; fi; done
if [ -n "$REAL" ]; then
  mkdir -p "$T/copy"; C="$T/copy/Herdr.app"
  ditto "$REAL" "$C"
  echo "copy: installed Herdr.app -> $C"
  csum=$(contents_sum "$C")
  run spctl --assess --type execute "$C"; check "copy: Gatekeeper accepts it before" is_rc 0
  run SA --app "$C"
  check "copy: apply exit 0" is_rc 0
  echo "  $(grep '^note:' "$T/out")"
  run SA --check --app "$C"; check "copy: --check after apply: exit 0" is_rc 0
  run spctl --assess --type execute -vv "$C"
  check "copy: Gatekeeper still accepts it after apply" is_rc 0
  sed 's/^/  spctl: /' "$T/err" | sed "s#$T#<copy>#"
  run codesign --verify --strict "$C"
  echo "  codesign --verify --strict: exit $RC; $(head -n 2 "$T/err" | tr '\n' ' ' | sed "s#$T#<copy>#g")"
  check "copy: Contents/ is unchanged after apply" test "$(contents_sum "$C")" = "$csum"
  run SA --remove --app "$C"; check "copy: remove exit 0" is_rc 0
  run SA --check --app "$C"; check "copy: --check after remove: exit 1" is_rc 1
  run spctl --assess --type execute "$C"; check "copy: Gatekeeper accepts it after remove" is_rc 0
  check "copy: Contents/ is unchanged after remove" test "$(contents_sum "$C")" = "$csum"
else
  echo "copy: no Herdr.app installed; skipped the real-app copy"
fi

echo "set-app-icon: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
