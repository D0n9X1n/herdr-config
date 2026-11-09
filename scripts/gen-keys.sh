#!/usr/bin/env bash
# Generates user/keys.json: the Herdr 0.1.14 defaults deep-merged with user/keys.overrides.json
# (null removes a key). Prints to stdout; --write writes user/keys.json.
set -euo pipefail
cd "$(dirname "$0")/.."
gen() {
  jq -S -s '.[0] * .[1] | walk(if type == "object" then with_entries(select(.value != null)) else . end)' \
    data/herdr-default-keys.json user/keys.overrides.json
}
if [ "${1:-}" = --write ]; then
  gen > user/keys.json.tmp && mv user/keys.json.tmp user/keys.json
else
  gen
fi
