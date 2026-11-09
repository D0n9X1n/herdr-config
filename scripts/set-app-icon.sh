#!/usr/bin/env bash
# Sets Herdr's Dock and Finder icon to the Apollo logo (assets/logo/apollo.icns) as a Finder custom icon.
#   scripts/set-app-icon.sh [--app PATH] [--remove] [--check] [--restart-dock]
#     --app PATH      the app bundle (default: ~/Applications/Herdr.app, else /Applications/Herdr.app)
#     --remove        remove the custom icon (back to Herdr's own)
#     --check         exit 0 only if the app has a custom icon (Icon\r in the bundle root and the Finder
#                     custom-icon flag set); changes nothing
#     --restart-dock  run `killall Dock` afterwards so the Dock shows the change now
# It uses NSWorkspace setIcon:forFile:options: (JXA, no compile step). It writes only the bundle root's
# Icon\r file and Finder info; it never touches anything inside Contents/. A Herdr update replaces the
# bundle, so run it again after an update. macOS only.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd -P)
ICNS="$REPO/assets/logo/apollo.icns"
usage() { echo "usage: scripts/set-app-icon.sh [--app PATH] [--remove] [--check] [--restart-dock]" >&2; exit 2; }

app="" mode=apply restart=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --app) [ "$#" -ge 2 ] || usage; app=$2; shift 2 ;;
    --remove) [ "$mode" = apply ] || usage; mode=remove; shift ;;
    --check) [ "$mode" = apply ] || usage; mode=check; shift ;;
    --restart-dock) restart=1; shift ;;
    *) usage ;;
  esac
done
[ "$(uname -s)" = Darwin ] || { echo "set-app-icon: macOS only" >&2; exit 1; }
if [ -z "$app" ]; then
  for c in "$HOME/Applications/Herdr.app" /Applications/Herdr.app; do
    if [ -d "$c" ]; then app=$c; break; fi
  done
  [ -n "$app" ] || { echo "set-app-icon: no Herdr.app in ~/Applications or /Applications; use --app" >&2; exit 1; }
fi
case "$app" in *.app | *.app/) ;; *) echo "set-app-icon: $app is not an .app bundle" >&2; exit 1 ;; esac
app=${app%/}
[ ! -L "$app" ] || { echo "set-app-icon: $app is a symlink; give the real bundle" >&2; exit 1; }
[ -d "$app" ] && [ -f "$app/Contents/Info.plist" ] || { echo "set-app-icon: $app has no Contents/Info.plist" >&2; exit 1; }
echo "app: $app"

ICON=$'Icon\r'
has_custom_icon() {
  local h
  [ -f "$app/$ICON" ] || return 1
  h=$(xattr -px com.apple.FinderInfo "$app" 2>/dev/null | tr -d ' \n') || return 1
  [ "${#h}" -ge 18 ] && [ $(( 0x${h:16:2} & 4 )) -ne 0 ]
}

if [ "$mode" = check ]; then
  if has_custom_icon; then echo "custom icon: yes"; exit 0; else echo "custom icon: no"; exit 1; fi
fi

[ "$mode" = remove ] || [ -s "$ICNS" ] || { echo "set-app-icon: missing $ICNS (run scripts/gen-logo.sh)" >&2; exit 1; }
icon_arg=""
[ "$mode" = remove ] || icon_arg=$ICNS
# NSWorkspace.setIcon(image, forFile:, options:); a nil image removes the custom icon.
res=$(osascript -l JavaScript - "$app" "$icon_arg" <<'JXA'
ObjC.import('AppKit');
function run(argv) {
  let img = $();
  if (argv[1]) {
    img = $.NSImage.alloc.initWithContentsOfFile(argv[1]);
    if (img.isNil()) return "bad-icon";
  }
  return $.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, argv[0], 0) ? "ok" : "fail";
}
JXA
)
[ "$res" = ok ] || { echo "set-app-icon: NSWorkspace setIcon failed ($res)" >&2; exit 1; }

if [ "$mode" = remove ]; then
  echo "removed the custom icon"
else
  echo "set the Apollo icon"
  echo "note: codesign --verify --strict will report \"Finder information\" detritus; Gatekeeper (spctl) still accepts the notarized app."
fi
if [ "$restart" = 1 ]; then killall Dock; fi
