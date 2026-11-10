# Clean Room

[简体中文](Clean-Room-zh-CN)

## Allowed sources

Apollo was built only from these:

- Herdr's own docs and types: `~/.config/herdr-app/AGENTS.md`, `~/.config/herdr-app/herdr.d.ts` and `~/.config/herdr-app/gpui-kit.d.ts`.
- Command output: `herdr-app commands`, `herdr-app --skill` and `hc --skill`.
- `data/apollo-palette.json`: the Apollo palette v0.2.0, sha256 `550f8c36cf4ef6ac99551541d1fe9554f77d563fa1e7c129a6a82583321d61ef`.
- `data/herdr-default-keys.json`: the Herdr 0.1.14 default keys, sha256 `0660aaf35e31a8f168619ff463189421aeba95e95f2ec6ad2bc8a368ff1af94e`.
- `data/owner-settings.json`: the author's own settings.
- At run time only, Herdr's data file `layouts/.state/<name>.json` (sidebar width, panel state), read by tests and smoke checks.

## Not allowed

- Anything under `~/.config/herdr-app/mods/` or `~/.config/herdr-app/layouts/`, except the data file above.
- The code of any shipped mod. Shipped mods (`files`, `menu`, `worktree`) are used by name only.

## How

1. Write each part from the allowed sources.
2. Keep pure logic in each mod's `lib.js`, and test it.
3. Keep `data/` as the only copy of the palette and the default keys. The theme and keys are built from them, not copied.
4. Run `scripts/check.sh cleanroom`. It fails if a file outside `data/` has the palette's or the default keys' sha256, or if a mod imports `../`.
