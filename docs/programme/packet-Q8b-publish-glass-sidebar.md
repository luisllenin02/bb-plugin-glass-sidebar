# Packet Q8b — Publish glass-sidebar (repo, release, marketplace entry)

Work in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`
after Q7 has landed and the user has confirmed the switch-over by eye (the
orchestrator states this in the appendix). Same conventions and the same
written user approval as `packet-Q8a-publish-liquid-glass.md`: `gh` is
logged in as `luisllenin02`; git identity
`-c user.name=luisllenin02 -c user.email=luisllenin02@users.noreply.github.com`;
pushes use `-c credential.helper= -c 'credential.helper=!gh auth git-credential'`.

## Read

- `packet-Q8a-publish-liquid-glass.md` and `release-liquid-glass.md` (what was done for the theme; mirror it).
- The submit-a-plugin skill and the marketplace contract files it names.
- The plugin's `README.md`, `package.json`, `docs/`, `LICENSE`.

## Produce

1. Create the GitHub repo `luisllenin02/bb-plugin-glass-sidebar` (public,
   description from `package.json`), add it as remote `origin`, push `main`
   (create `main` from the current branch if needed) and set it default.
2. README release-grade: purpose, features (row states, folders, live
   strip, workflow rows, project glyphs and colours with automatic matter
   icons, lifecycle shelves), install (marketplace and git), the switch-over
   note (only one thread-list plugin can be enabled; disable `bb-sidebar`
   first; `bb glass-sidebar import` copies the old stores), no-polling rule,
   credits, MIT. Package metadata (`repository`, `homepage`, `bugs`,
   `keywords`), version `1.0.0`.
3. Commit `[Q8b] release-grade README and metadata`; tag `v1.0.0`; GitHub
   release; marketplace entry and icon in the existing `luisllenin02`
   fork of `get-bb/marketplace`; pull request from `luisllenin02`.
4. Append to `plans/glass-sidebar/release-liquid-glass.md` a
   "glass-sidebar" section with commands, tag, release URL, PR URL (or
   create `release-glass-sidebar.md`).

## Verify

`npm test` (vitest + node contract tests) green; `bb plugin build` ok; `git
status` clean on `main`; `gh release view v1.0.0` ok; PR URL resolves; `bb
plugin list` shows `glass-sidebar` running from the path and `bb-sidebar`
disabled.

Report per brief §5 with the URLs.
