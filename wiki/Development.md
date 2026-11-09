# Development

[简体中文](Development-zh-CN)

## Tests

Each mod keeps its logic in `lib.js` and its view in `main.js`. Run the tests and the repo checks:

```sh
npm test
scripts/check.sh all
scripts/in-clone.sh bash test/safe-rm.test.sh
scripts/in-clone.sh bash test/live.test.sh
scripts/in-clone.sh bash test/in-clone.test.sh
scripts/in-clone.sh bash test/smoke.test.sh
scripts/in-clone.sh bash -c 'for m in mods/apollo-*; do herdr-app check "$m"; done'
```

`scripts/check.sh all` checks JSON, the theme and keys tables, the agent script, the clean room, privacy (no owner paths or real ids), the wiki pairs and the docs. Tests that make or delete files run only inside a disposable clone (`scripts/in-clone.sh`).

## Live safety

`scripts/smoke.sh all` and `scripts/shots.sh` run against a real Herdr on this Mac. They follow these rules:

- Each run starts with `live_begin rollback`, claims every path it may touch, and rolls back on exit: the layout, keys, sidebar width, tabs, spaces and their order. Then `live_verify` checks that all of it matches.
- They never change zoom or settings, never send keys, and never write through a link.
- Fixture repos and test files go only under `/private/tmp/apollo-test.*`, and every test-side delete goes through `safe_rm`.
- A person reads each capture before it is kept: no owner paths, commands, files or conversation text. Only `assets/screenshots/preview.png` is tracked.

## CI

`.github/workflows/ci.yml` runs on `ubuntu-latest` for every push and pull request, with no secrets. It runs `node --check` and the JSON check, `npm test`, the `scripts/check.sh` sections that don't need Herdr, the safe-rm, live (fake home) and in-clone tests inside a temp clone, and `shellcheck` on every script.

## Release

Before a release, on a Mac with Herdr, run `scripts/check.sh all`, the offline tests above, `herdr-app check` on all seven mods, and `scripts/smoke.sh all` once. Then push, wait for CI, tag `v0.0.1`, and make a GitHub release.
