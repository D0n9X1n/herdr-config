#!/usr/bin/env bash
# Repo gates. Usage: scripts/check.sh [all|<section>…]
# A section is added only in the task that creates its inputs.
set -euo pipefail
cd "$(dirname "$0")/.."

SECTIONS=(json test theme settings user keys ctx refresh shared gallery cleanroom gitignore files shots docs wiki privacy logo)

fail() { echo "FAIL $SECTION: $*" >&2; exit 1; }

check_json() {
  local f
  while IFS= read -r -d '' f; do
    jq -e . "$f" >/dev/null 2>&1 || fail "$f is not valid JSON"
  done < <(git ls-files -z -- '*.json')
  while IFS= read -r -d '' f; do
    node --check "$f" 2>/dev/null || fail "node --check $f"
  done < <(git ls-files -z -c -o --exclude-standard -- 'mods/*.js' 'mods/*.mjs' 'scripts/*.js' 'scripts/*.mjs' 'test/*.js' 'test/*.mjs')
}

check_test() {
  npm test --silent >/dev/null 2>&1 || fail "npm test failed (run npm test for details)"
}

check_theme() {
  node --test test/theme.test.js >/dev/null 2>&1 || fail "themes/apollo.json differs from the A1 theme (run node --test test/theme.test.js)"
}

check_settings() {
  cmp -s user/settings.json data/owner-settings.json || fail "user/settings.json differs from data/owner-settings.json"
}

# Owner paths and real Herdr ids: the macOS home and temp roots, and sp/tb + 32 hex ids. This is the only
# line that may hold the pattern; check_privacy exempts it and nothing else.
PRIVACY_PATTERN='/Users/|/var/folders/|(^|[^0-9A-Za-z])(sp|tb)[0-9a-f]{32}([^0-9A-Za-z]|$)'

# user/ must hold no tokens and no owner paths.
USER_SECRETS="$PRIVACY_PATTERN"'|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-|AKIA[0-9A-Z]{16}|"(token|api_?key|secret|password)"[[:space:]]*:'
check_user() {
  [ -d user ] || fail "user/ is missing"
  local hits
  hits=$(grep -rnE "$USER_SECRETS" user/ || true)
  [ -z "$hits" ] || fail "user/ has a token or an owner path: $(printf '%s' "$hits" | cut -d: -f1,2 | tr '\n' ' ')"
}

check_keys() {
  node --test test/keys.test.js >/dev/null 2>&1 || fail "user/keys.json differs from the A1 keys table or from scripts/gen-keys.sh (run node --test test/keys.test.js)"
}

check_ctx() {
  [ -x agent/herdr-context.sh ] || fail "agent/herdr-context.sh is missing or not executable"
  node --test test/context.test.js >/dev/null 2>&1 || fail "agent/herdr-context.sh output is wrong (run node --test test/context.test.js)"
}

check_refresh() {
  cmp -s mods/apollo-changes/refresh.js mods/apollo-specs/refresh.js || fail "mods/apollo-changes/refresh.js and mods/apollo-specs/refresh.js differ"
}

check_shared() {
  local out
  out=$(node scripts/scan-shared.js mods 2>&1) || fail "shared-state keys: $(printf '%s' "$out" | tr '\n' ' ')"
}

# Copying the gallery install set (layouts/, themes/, mods/) into a Herdr home leaves its
# settings.json and keys.json byte-identical and brings themes/apollo.json.
check_gallery() {
  local base tmp before after st=0
  base=$(cd /tmp && pwd -P)
  tmp=$(mktemp -d "$base/apollo-test.XXXXXX") || fail "mktemp failed"
  [ -n "$tmp" ] && [ -d "$tmp" ] || fail "mktemp failed"
  printf '{"zoom":1.3}\n' > "$tmp/settings.json"
  cp data/herdr-default-keys.json "$tmp/keys.json"
  before=$(cd "$tmp" && cat settings.json keys.json | _sha)
  cp -R layouts themes mods "$tmp/" || st=1
  after=$(cd "$tmp" && cat settings.json keys.json | _sha)
  [ "$before" = "$after" ] || st=2
  [ -f "$tmp/themes/apollo.json" ] || st=3
  local helper
  helper="$(pwd -P)/test/helpers/safe-rm.sh"
  (cd / && SAFE_RM_BASE="$base" bash -c '. "$1" && safe_rm "$2"' _ "$helper" "$tmp") || fail "could not remove $tmp"
  case $st in
    1) fail "copying layouts/ themes/ mods/ failed" ;;
    2) fail "the gallery copy changed settings.json or keys.json" ;;
    3) fail "the gallery copy has no themes/apollo.json" ;;
  esac
}

_sha() { if command -v shasum >/dev/null 2>&1; then shasum -a 256; else sha256sum; fi | cut -c1-64; }

# Clean room: no file outside data/ is the Apollo palette or the Herdr default keys; no mod imports ../.
CLEANROOM_SHAS="550f8c36cf4ef6ac99551541d1fe9554f77d563fa1e7c129a6a82583321d61ef 0660aaf35e31a8f168619ff463189421aeba95e95f2ec6ad2bc8a368ff1af94e"
check_cleanroom() {
  local f h hits
  while IFS= read -r -d '' f; do
    [ -f "$f" ] || continue
    h=$(_sha < "$f")
    case " $CLEANROOM_SHAS " in *" $h "*) fail "$f is a copy of a data/ source (sha256 $h)" ;; esac
  done < <(git ls-files -z -co --exclude-standard | grep -zv '^data/')
  hits=$(grep -rnE "from ['\"]\.\./|import\(\s*['\"]\.\./" mods || true)
  [ -z "$hits" ] || fail "a mod imports ../: $(printf '%s' "$hits" | head -3 | tr '\n' ' ')"
}

check_gitignore() {
  local p
  for p in mods/a/jsconfig.json mods/a/gpui-kit.d.ts layout.error .DS_Store mods/apollo-tabs/jsconfig.json mods/apollo-tabs/gpui-kit.d.ts docs/specs/x.md; do
    git check-ignore -q "$p" || fail ".gitignore does not cover $p"
  done
}

# Required files at the code stage (later tasks append theirs).
REQUIRED_FILES="layouts/apollo.json layouts/apollo.svg themes/apollo.json
mods/apollo-chrome/main.js mods/apollo-spaces/main.js mods/apollo-tabs/main.js mods/apollo-pane/main.js
mods/apollo-changes/main.js mods/apollo-specs/main.js mods/apollo-status/main.js
user/settings.json user/keys.json user/keys.overrides.json agent/herdr-context.sh scripts/check.sh .gitignore
scripts/smoke.sh scripts/shots.sh
assets/screenshots/preview.png README.md RECIPE.md LICENSE CLAUDE.md wiki/Home.md wiki/Home-zh-CN.md wiki/_Sidebar.md
scripts/in-clone.sh .github/workflows/ci.yml
assets/logo/apollo.svg assets/logo/apollo.icns mods/apollo-chrome/logo.png scripts/gen-logo.sh scripts/set-app-icon.sh"
check_files() {
  local f tracked
  for f in $REQUIRED_FILES; do [ -f "$f" ] || fail "missing $f"; done
  tracked=$(git ls-files | grep -E '(^|/)(jsconfig\.json|gpui-kit\.d\.ts)$' || true)
  [ -z "$tracked" ] || fail "generated files are tracked: $(printf '%s' "$tracked" | tr '\n' ' ')"
}

# The repo tracks one capture: the preview (the Changes shot). scripts/shots.sh measures and privacy-checks
# every capture in a temp folder at capture time; nothing else from a capture is tracked.
check_shots() {
  local got
  got=$(git ls-files -- 'assets/screenshots/*' | tr '\n' ' ')
  [ "$got" = "assets/screenshots/preview.png " ] || fail "assets/screenshots/ must track only preview.png, has [$got]"
  [ -s assets/screenshots/preview.png ] || fail "assets/screenshots/preview.png is missing or empty"
  [ -z "$(git ls-files -- '*.BLOCKED')" ] || fail "a capture is BLOCKED"
}

# README, RECIPE, LICENSE and CLAUDE.md match the repo; no tracked file names another layout; docs/ is not tracked.
check_docs() {
  node --test test/docs.test.js test/names.test.js test/tree.test.js >/dev/null 2>&1 \
    || fail "the docs are out of date (run node --test test/docs.test.js test/names.test.js test/tree.test.js)"
}

# wiki/: every page has its -zh-CN pair with the same headings and facts; _Sidebar.md links every page.
check_wiki() {
  node --test test/wiki.test.js >/dev/null 2>&1 || fail "the wiki is out of date (run node --test test/wiki.test.js)"
}

# No tracked file holds an owner path or a real space/tab id (scripts/check.sh's pattern line is exempt).
check_privacy() {
  local self hits
  self=$(grep -n '^PRIVACY_PATTERN=' scripts/check.sh | cut -d: -f1)
  [ -n "$self" ] || fail "scripts/check.sh has no PRIVACY_PATTERN line"
  hits=$(git grep -n -I -E "$PRIVACY_PATTERN" -- . | awk -F: -v n="$self" '!($1 == "scripts/check.sh" && $2 == n)' || true)
  [ -z "$hits" ] || fail "owner path or real id in: $(printf '%s' "$hits" | cut -d: -f1,2 | head -5 | tr '\n' ' ')"
}

# The logo: the SVG is pinned; logo.png and apollo.icns match a fresh rsvg-convert render of it.
check_logo() {
  node --test test/logo.test.js >/dev/null 2>&1 || fail "the logo assets drifted from assets/logo/apollo.svg (run scripts/gen-logo.sh)"
}

run_section() {
  SECTION=$1
  declare -F "check_$SECTION" >/dev/null || { echo "FAIL $SECTION: unknown section" >&2; exit 1; }
  "check_$SECTION"
  echo "ok $SECTION"
}

[ "$#" -gt 0 ] || set -- all
for arg in "$@"; do
  if [ "$arg" = all ]; then
    for s in "${SECTIONS[@]}"; do run_section "$s"; done
  else
    run_section "$arg"
  fi
done
