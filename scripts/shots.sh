#!/usr/bin/env bash
# shellcheck disable=SC1010 # `herdr-app do` is a subcommand, not a loop keyword
# A24 (LIVE): captures expanded, collapsed, plus-menu, changes and specs, plus the traffic-light mask, in the
# owner's window. Fixture spaces (herdr-config, notes) are created, moved ahead of the owner's spaces and
# selected; every change is temporary (L1 rollback, which also restores the space order). Captures go to
# OUT, a fresh /private/tmp/apollo-test.* dir printed as `OUT=…`, never into the repo: the person reviews
# each PNG (privacy gate) before the Changes shot is copied to assets/screenshots/preview.png. No zoom/settings/key changes.
# The person's own sidebar rows are painted out of the preview (scripts/png-mask-rows.mjs): OUT/preview.png
# is the Changes shot with the sidebar from below the last fixture row to the footer filled with chrome.
#   bash scripts/shots.sh                capture into a fresh OUT
#   bash scripts/shots.sh --accept OUT   after the privacy gate passed on OUT/preview.png: copy it to
#                                        assets/screenshots/preview.png and record its sha256 (offline)
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd -P)

if [ "${1:-}" = --accept ]; then
  src=${2:-}
  [ -n "$src" ] && [ -s "$src/preview.png" ] || { echo "shots --accept: no $src/preview.png" >&2; exit 1; }
  [ -s "$src/preview.measure.json" ] || { echo "shots --accept: no $src/preview.measure.json" >&2; exit 1; }
  jq -e '.sidebarPx >= 255 and .sidebarPx <= 257 and .activeRowBg == "#fabd2f" and .trafficViolations == 0' \
    "$src/preview.measure.json" >/dev/null || { echo "shots --accept: preview measure failed: $(cat "$src/preview.measure.json")" >&2; exit 1; }
  dst="$REPO/assets/screenshots"
  [ -d "$dst" ] || { echo "shots --accept: no $dst" >&2; exit 1; }
  cp "$src/preview.png" "$dst/preview.png"
  sum=$(if command -v shasum >/dev/null 2>&1; then shasum -a 256; else sha256sum; fi < "$dst/preview.png" | cut -c1-64)
  printf '%s  preview.png\n' "$sum" > "$dst/preview.sha256"
  echo "accepted: assets/screenshots/preview.png ($sum)"
  exit 0
fi
# shellcheck source=smoke.sh
SMOKE_LIB=1 . "$REPO/scripts/smoke.sh"

OUT=$(mktemp -d /private/tmp/apollo-test.XXXXXX) || exit 1
[ -n "$OUT" ] && [ -d "$OUT" ] || exit 1
echo "OUT=$OUT"
# Copies, not links: Herdr does not load svg() glyphs through a symlinked mod dir.
# shellcheck disable=SC2034 # read by apollo_up in the sourced scripts/smoke.sh
APOLLO_INSTALL=copy
APOLLO_CLAIMS="$APOLLO_CLAIMS layouts/apollo-mask.json layouts/apollo-mask.error layouts/.state/apollo-mask.json mods/apollo-blank data/apollo-blank"

shot() {
  local f="$OUT/$1.png"
  sleep "${2:-1.5}"
  herdr-app shot "$f" >/dev/null || fail "shot $1"
  [ -s "$f" ] || fail "empty shot $1"
  echo "captured $1"
}
overlay_open() { herdr-app status | jq -e --arg m "$1" '.overlays | index($m)' >/dev/null; }

apollo_up
tmp=$(live_tmpdir) || fail "fixture dir"
make_demo_repos "$tmp"
mkdir -p "$tmp/home" "$tmp/zdot"
# Fixture terminals never load the person's shell config: env -i with a fixture HOME and an empty ZDOTDIR.
# Herdr may still start argv through the person's interactive shell, so the script first clears the screen
# and scrollback (a banner printed before it never shows in a capture).
# demo.sh <title> <dir> <command…>: shows "$ <command>" and runs it there (no pager, no user git config).
cat > "$tmp/demo.sh" <<'DEMO'
printf '\033[3J\033[H\033[2J'
title=$1; dir=$2; shift 2
printf '\033]0;%s\007' "$title"
cd "$dir" || exit 1
printf '$ %s\n' "$*"
GIT_PAGER=cat GIT_CONFIG_NOSYSTEM=1 "$@"
while :; do sleep 3600; done
DEMO
ENVI=$(jq -cn --arg h "$tmp/home" --arg z "$tmp/zdot" '["/usr/bin/env", "-i", "HOME=\($h)", "PATH=/usr/bin:/bin", "TERM=xterm-256color", "ZDOTDIR=\($z)", "/bin/sh"]')
sp1=$(live_new_space "$(jq -cn --arg f "$tmp/herdr-config" --arg d "$tmp/demo.sh" --argjson e "$ENVI" \
  '{name: "herdr-config", folder: $f, argv: ($e + [$d, "Herdr Config", $f, "git", "log", "--graph", "--oneline", "--decorate"])}')") || fail "space.new herdr-config"
sp2=$(live_new_space "$(jq -cn --arg f "$tmp/notes" --arg d "$tmp/demo.sh" --argjson e "$ENVI" \
  '{name: "notes", folder: $f, argv: ($e + [$d, "Notes", $f, "ls"])}')") || fail "space.new notes"
herdr-app do space.move "$(jq -cn --arg id "$sp1" '{id: $id, index: 1}')" >/dev/null || fail "space.move herdr-config"
herdr-app do space.move "$(jq -cn --arg id "$sp2" '{id: $id, index: 2}')" >/dev/null || fail "space.move notes"
herdr-app do space.select "$(jq -cn --arg id "$sp1" '{id: $id}')" >/dev/null || fail "space.select"
wait_for 5 space_shown "$sp1" || fail "the fixture space did not show"
tab1=$(herdr-app ls | jq -r --arg s "$sp1" '.spaces[] | select(.id == $s) | .tabs[0].id')
herdr-app do tab.rename "$(jq -cn --arg id "$tab1" '{id: $id, name: "work"}')" >/dev/null || fail "tab.rename"
echo "order: $(herdr-app ls | jq -r '[.spaces[].name] | join(", ")')"

shot expanded 2.5

start=$(apollo_px)
emit_do collapse "$start" "$(herdr-app status | jq '.zoom')" || fail "collapse"
wait_for 3 px_is 184 || fail "collapse did not reach 184"
shot collapsed 2
emit_do expand "$start" || fail "expand"
wait_for 3 px_is "$start" || fail "expand did not restore $start"

# Mask: the same layout with an empty brand block, so the traffic-light area holds chrome and the native
# buttons only (measure.js exempts only a mask's non-chrome pixels).
mkdir "$HERDR_HOME/mods/apollo-blank"
printf '{"place":"none"}\n' > "$HERDR_HOME/mods/apollo-blank/mod.json"
printf 'import { View, div } from "gpui-kit";\nexport default class Blank extends View { render() { return div().size_full(); } }\n' \
  > "$HERDR_HOME/mods/apollo-blank/main.js"
jq '(.. | objects | select(.id? == "brand") | .content) = {mod: "apollo-blank"}' "$REPO/layouts/apollo.json" > "$HERDR_HOME/layouts/apollo-mask.json"
herdr-app do layout.switch '{"name":"apollo-mask"}' >/dev/null || fail "layout.switch apollo-mask"
wait_for 5 layout_is apollo-mask || fail "apollo-mask did not show"
shot mask 2
herdr-app do layout.switch '{"name":"apollo"}' >/dev/null || fail "layout.switch apollo"
wait_for 5 layout_is apollo || fail "apollo did not show again"

prompt_ms=$(node -e 'console.log(Date.now())')
herdr-app do apollo-tabs.menu >/dev/null || fail "apollo-tabs.menu"
wait_for 5 overlay_open apollo-tabs || fail "the + menu did not open"
ov=$(herdr-app status | jq -c '.overlays')
shot plus-menu 1
node "$REPO/scripts/shot-accept.mjs" "$OUT/plus-menu.png" --overlays "$ov" --field self --prompt-ms "$prompt_ms" || fail "plus-menu not accepted"
herdr-app do overlay.close '{}' >/dev/null || true
wait_for 5 no_overlays || fail "the + menu did not close"

emit_do panelClick changes || fail "panelClick changes"
wait_for 3 panel_is false changes || fail "changes panel did not show"
sleep 3
herdr-app do apollo-changes.next >/dev/null || fail "apollo-changes.next"
shot changes 2.5

emit_do panelClick specs || fail "panelClick specs"
wait_for 3 panel_is false specs || fail "specs panel did not show"
sleep 2
emit_do openSpec "$tmp/herdr-config/docs/specs/pending/fixture.md" || fail "openSpec"
shot specs 2.5

ww=$(jq '.bounds[2]' "$HERDR_HOME/window.json"); z=$(herdr-app status | jq '.zoom')
for s in expanded collapsed plus-menu changes specs; do
  printf '%s\n' "$(node "$REPO/scripts/measure.js" "$OUT/$s.png" --window-width "$ww" --zoom "$z" --mask "$OUT/mask.png")" > "$OUT/$s.measure.json"
  echo "measure $s: $(cat "$OUT/$s.measure.json")"
done
jq -e '.sidebarPx >= 183 and .sidebarPx <= 185 and .activeRowBg == "#fabd2f" and .trafficViolations == 0' "$OUT/collapsed.measure.json" >/dev/null \
  || fail "collapsed measure: $(cat "$OUT/collapsed.measure.json")"
jq -e '.activeRowBg == "#fabd2f" and .trafficViolations == 0' "$OUT/expanded.measure.json" >/dev/null \
  || fail "expanded measure: $(cat "$OUT/expanded.measure.json")"

# The preview: the Changes shot with the person's own rows painted chrome. Sidebar geometry (design px):
# brand 48, New space 32 + 12 gap, then the two fixture rows (44 each, 2 apart) end at 48+32+12+44+2+44 = 182.
# The band runs from there to the footer's top (window height - 96), across the sidebar's width.
footer_top=$(jq '.bounds[3] - 96' "$HERDR_HOME/window.json")
node "$REPO/scripts/png-mask-rows.mjs" "$OUT/changes.png" "$OUT/preview.png" --window-width "$ww" --zoom "$z" \
  --x0 0 --x1 "$start" --y0 182 --y1 "$footer_top" || fail "mask preview"
printf '%s\n' "$(node "$REPO/scripts/measure.js" "$OUT/preview.png" --window-width "$ww" --zoom "$z" --mask "$OUT/mask.png")" > "$OUT/preview.measure.json"
echo "measure preview: $(cat "$OUT/preview.measure.json")"
jq -e '.sidebarPx >= 255 and .sidebarPx <= 257 and .activeRowBg == "#fabd2f" and .trafficViolations == 0' "$OUT/preview.measure.json" >/dev/null \
  || fail "preview measure: $(cat "$OUT/preview.measure.json")"

apollo_down
echo "shots: ok (review $OUT/preview.png; if the privacy gate passes: bash scripts/shots.sh --accept $OUT)"
