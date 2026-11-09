#!/usr/bin/env bash
# Regenerates the logo assets from assets/logo/apollo.svg (the owner's design; never edited here):
#   mods/apollo-chrome/logo.png   64×64, shown by apollo-chrome at 20 px
#   assets/logo/apollo.icns       16–512 px @1x and @2x, for scripts/set-app-icon.sh
# Every size is rendered straight from the SVG with rsvg-convert; iconutil (macOS) packs the icns.
#   scripts/gen-logo.sh [--out DIR]   write both files into DIR instead of the repo
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd -P)
SVG="$REPO/assets/logo/apollo.svg"
PNG_OUT="$REPO/mods/apollo-chrome/logo.png"
ICNS_OUT="$REPO/assets/logo/apollo.icns"
if [ "${1:-}" = --out ]; then
  [ -n "${2:-}" ] && [ -d "$2" ] || { echo "usage: scripts/gen-logo.sh [--out DIR]" >&2; exit 2; }
  PNG_OUT="$2/logo.png"; ICNS_OUT="$2/apollo.icns"
elif [ "$#" -gt 0 ]; then
  echo "usage: scripts/gen-logo.sh [--out DIR]" >&2; exit 2
fi
command -v rsvg-convert >/dev/null || { echo "gen-logo: rsvg-convert is missing (brew install librsvg)" >&2; exit 1; }
command -v iconutil >/dev/null || { echo "gen-logo: iconutil is missing (macOS only)" >&2; exit 1; }

W=$(mktemp -d /private/tmp/apollo-test.XXXXXX) || exit 1
[ -n "$W" ] && [ -d "$W" ] || exit 1
# shellcheck source=../test/helpers/safe-rm.sh
. "$REPO/test/helpers/safe-rm.sh"
trap 'cd /; SAFE_RM_BASE=/private/tmp safe_rm "$W" >/dev/null 2>&1 || echo "gen-logo: kept $W" >&2' EXIT

rsvg-convert -w 64 -h 64 "$SVG" -o "$W/logo.png"
S="$W/apollo.iconset"
mkdir "$S"
for z in 16 32 128 256 512; do
  rsvg-convert -w "$z" -h "$z" "$SVG" -o "$S/icon_${z}x${z}.png"
  rsvg-convert -w $((z * 2)) -h $((z * 2)) "$SVG" -o "$S/icon_${z}x${z}@2x.png"
done
iconutil -c icns "$S" -o "$W/apollo.icns"
cp "$W/logo.png" "$PNG_OUT"
cp "$W/apollo.icns" "$ICNS_OUT"
echo "gen-logo: wrote $PNG_OUT and $ICNS_OUT"
