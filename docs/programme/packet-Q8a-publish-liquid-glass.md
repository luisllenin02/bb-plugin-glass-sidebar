# Packet Q8a — Publish Liquid Glass (repo, release, marketplace entry)

Work in `/home/system/workspaces/LAL/Development/bb-plugins/liquid-glass`
(git repo, HEAD `e64fde8` on branch `feat/liquid-glass`, remote `fork` =
`https://github.com/luisllenin02/bb-plugin-liquid-glass.git`, already pushed).
GitHub auth: `gh` is logged in as `luisllenin02`. Git identity for commits:
`-c user.name=luisllenin02 -c user.email=luisllenin02@users.noreply.github.com`;
pushes use `-c credential.helper= -c 'credential.helper=!gh auth git-credential'`.

The user approved on 2026-09-03, in writing, the outward actions this packet
performs: pushing to their GitHub account, creating the `main` branch and
tag, and opening the marketplace pull request. Record the exact commands you
ran in your report anyway.

Do not touch the running installation: no `bb plugin install`, `bb plugin
reload`, `bb theme set`, and no change to appearance values. The plugin
stays installed from this path.

## Read

- The submit-a-plugin skill in full: `/home/system/.npm-global/lib/node_modules/bb-app/server/dist/builtin-skills/submit-a-plugin/SKILL.md` and its `references/plugin-release.md`, `references/marketplace-entry.md`, `references/pull-request.md`.
- The current marketplace contract from the default branch of `https://github.com/get-bb/marketplace`: `README.md`, `schema/marketplace.schema.json`, `icons/README.md`, two current files in `entries/` (use `gh api` or `git clone --depth 1`).
- `README.md`, `package.json`, `assets/icon.svg`, and `themes/liquid-glass.css` lines 1–40 of the plugin.
- `/home/system/workspaces/LAL/Development/plans/glass-sidebar/HANDOFF.md` "Activate or switch Liquid Glass" section for the user-facing activation text.

## Produce

1. README: make it release-grade. What it is (monocode-style translucent
   shell over a wallpaper layer, two palettes, vibrant pickable accents),
   install (marketplace and git), activation (`bb theme set
   plugin:liquid-glass:liquid-glass`), settings overview (Settings → Liquid
   Glass; CLI `bb liquid-glass`), the "no background polling" note, the
   limitation that true window transparency needs a host build (link the
   design note is NOT required; one sentence), credits (hardbeat920/monocode
   for the look; vburojevic/bb-plugin-ayu and divyesh-puri vercel theme for
   packaging patterns), MIT. Add `LICENSE` (MIT, Luis Llenin, 2026) if missing.
2. `package.json`: `repository`, `homepage`, `bugs`, `keywords`
   (bb-plugin, theme, glass, monocode), `license` MIT; keep version `0.5.4`.
3. Git: commit as `[Q8a] release-grade README and metadata`; create `main`
   from the branch, push `main`, set it as the GitHub default branch
   (`gh repo edit --default-branch main`), keep `feat/liquid-glass` too; tag
   `v0.5.4` and push the tag; create a GitHub release for the tag with the
   README's first paragraph as notes.
4. Marketplace: following the skill, validate the plugin (`npm ci`,
   `npm test`, `bb plugin build`), derive the plugin id with the skill's
   script, create the entry and vendored icon in a fork of
   `get-bb/marketplace` under `luisllenin02`, validate the marketplace repo
   as its README instructs, commit only the entry and icon, and open the
   pull request from `luisllenin02`. Source: the git tag.
5. Write `/home/system/workspaces/LAL/Development/plans/glass-sidebar/release-liquid-glass.md`
   with: commands run, tag, release URL, PR URL, and anything the marketplace
   maintainers may ask for.

## Verify

`npm test` green; `bb plugin build` ok; `git status` clean on `main`;
`gh release view v0.5.4` ok; PR URL resolves. `bb plugin list` still shows
`liquid-glass@0.5.4 running` from the same path and `bb theme list` still
marks `plugin:liquid-glass:liquid-glass` active.

Report per brief §5 (Files changed, Commits, Tests, plus the URLs).
