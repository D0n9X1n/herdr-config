# Install

[简体中文](Install-zh-CN)

## Copy the files

Copy the layout, the theme and the mods into your Herdr home. Then check each mod and switch to Apollo.

```sh
H=~/.config/herdr-app
cp layouts/apollo.json layouts/apollo.svg "$H/layouts/"
cp themes/apollo.json "$H/themes/"
cp -R mods/apollo-* "$H/mods/"
for m in "$H"/mods/apollo-*; do herdr-app check "$m"; done
herdr-app do layout.switch '{"name":"apollo"}'
```

If a name is already taken in your home, rename the new one first. Your own layout stays as it was. To remove Apollo, delete these files.

## Copies, not links

Herdr doesn't load `svg()` glyphs through a symlinked mod folder. The mod's code loads, but its icons stay blank. So copy `mods/apollo-*`; don't symlink them. After an update, copy them again.

## Keys and settings

`user/keys.json` is a full keys file: the Herdr 0.1.14 defaults plus the changes in [Keys](Keys). Copy it over your `keys.json` only if you want all of it. `user/settings.json` is the author's own settings; you don't need it.
