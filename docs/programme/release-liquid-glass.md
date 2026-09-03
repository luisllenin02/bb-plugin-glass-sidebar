# Liquid Glass v0.5.4 release

Released 2026-09-03 from `luisllenin02/bb-plugin-liquid-glass`.

## Published artifacts

- Release commit: `31def3fb0d57bc26f63eb9d34959915e2194212a`
- Metadata commit: `7c394ecd132bc0058b7a8308363a8727965e8b0e`
- Contract-repair commit: `31def3fb0d57bc26f63eb9d34959915e2194212a`
- Default branch: `main`
- Tag: `v0.5.4`
- Release: https://github.com/luisllenin02/bb-plugin-liquid-glass/releases/tag/v0.5.4
- Marketplace commit: `add72985a1ddc5dcb367f13ab501b3008db18f22`
- Marketplace PR: https://github.com/get-bb/marketplace/pull/177

## Commands run

Plugin validation and ID:

```bash
npm ci
npm run typecheck
npm test
bb plugin build
node /home/system/.npm-global/lib/node_modules/bb-app/server/dist/builtin-skills/submit-a-plugin/scripts/derive-plugin-id.mjs /home/system/workspaces/LAL/Development/bb-plugins/liquid-glass/package.json
git diff --check
```

Release repair and publication:

```bash
git add test/theme-contract.test.mjs
git -c user.name=luisllenin02 -c user.email=luisllenin02@users.noreply.github.com commit -m '[Q8a] align theme contract with v0.5.4'
git switch -c main
git tag -a v0.5.4 -m 'Release v0.5.4'
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u fork main
gh repo edit luisllenin02/bb-plugin-liquid-glass --default-branch main
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push fork v0.5.4
gh release create v0.5.4 --repo luisllenin02/bb-plugin-liquid-glass --title 'Liquid Glass v0.5.4' --notes "Liquid Glass brings monocode's translucent-window look to bb with a wallpaper layer beneath genuinely frosted panes, two dark and light palettes, and vibrant, pickable accents alongside adjustable shell tint, opacity, and blur."
```

Marketplace preparation and submission:

```bash
gh repo fork get-bb/marketplace --clone=false
git clone https://github.com/luisllenin02/marketplace.git /tmp/q8a-marketplace.oB71Zb/marketplace
git remote add upstream https://github.com/get-bb/marketplace.git
git fetch upstream main
git switch -c submit-liquid-glass upstream/main
sha256sum assets/icon.svg
npm ci --cache /tmp/q8a-npm-cache
git add entries/liquid-glass.json icons/liquid-glass-4b9b6aa2.svg
git -c user.name=luisllenin02 -c user.email=luisllenin02@users.noreply.github.com commit -m 'Add plugin entry: liquid-glass'
npm run build
npm test
npm run gate:v1
env NPM_CONFIG_CACHE=/tmp/q8a-npm-cache npm run check
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin submit-liquid-glass
gh pr create --repo get-bb/marketplace --base main --head luisllenin02:submit-liquid-glass --title 'Add plugin entry: liquid-glass' --body-file /tmp/q8a-liquid-glass-pr-body.md
gh pr edit https://github.com/get-bb/marketplace/pull/177 --body-file /tmp/q8a-liquid-glass-pr-body.md
gh api repos/get-bb/marketplace/pulls/177 --method PATCH -F body=@/tmp/q8a-liquid-glass-pr-body.md --jq .html_url
```

Final verification:

```bash
npm test
bb plugin build
git status --short --branch
gh release view v0.5.4 --repo luisllenin02/bb-plugin-liquid-glass --json url,tagName,targetCommitish,name
gh repo view luisllenin02/bb-plugin-liquid-glass --json defaultBranchRef
git ls-remote --heads fork main
git ls-remote --tags fork v0.5.4
gh pr view https://github.com/get-bb/marketplace/pull/177 --json url,state,title,headRefName,headRepositoryOwner,baseRefName,commits,statusCheckRollup
bb plugin list
bb theme list
```

## Validation results

- Plugin `npm ci`: passed with zero vulnerabilities.
- Plugin typecheck: passed.
- Plugin `npm test`: passed, 25 Node contract tests and 62 Vitest tests.
- `bb plugin build`: passed.
- Derived plugin ID: `liquid-glass`.
- Marketplace `npm ci`: passed using the task-scoped cache after the host's default npm cache returned `EROFS`; the repository's audit reports one existing high-severity dependency vulnerability.
- Marketplace `npm run build`: passed with 123 entries.
- Marketplace `npm test`: passed, including 25 Node tests and the upload-retry suite.
- Marketplace `npm run gate:v1`: passed; the new entry needs no exception.
- Marketplace `npm run check`: entry/schema validation completed, but four full liveness attempts encountered transient 30-second timeouts on changing remote sources. The final attempt timed out only on the unrelated `noisegate` entry. The Liquid Glass tag was separately verified with `git ls-remote`.
- `gh pr edit` hit GitHub's deprecated Projects Classic GraphQL field; the equivalent REST `gh api ... --method PATCH` command updated the PR body successfully.
- Plugin worktree: clean on `main`, tracking `fork/main`.
- Marketplace worktree: clean on `submit-liquid-glass`, tracking the fork.
- Runtime: `liquid-glass@0.5.4` remains running from `/home/system/workspaces/LAL/Development/bb-plugins/liquid-glass`.
- Theme: `plugin:liquid-glass:liquid-glass` remains active.

## Marketplace maintainer follow-up

- The entry uses category `themes-and-appearance`, Git range `^0.5.4`, and a vendored single-color SVG named from SHA-256 prefix `4b9b6aa2`.
- No screenshots are included.
- The plugin requires no external service and does not poll in the background. It optionally accepts a user-selected HTTPS wallpaper URL or one local image through a bounded route.
- True desktop/window transparency still requires a compatible host build; the theme provides in-window translucency over its wallpaper layer.
- If CI reports a liveness failure, rerun it: local failures moved among unrelated existing sources and were network timeouts, not entry/schema failures.

## v0.5.5 (2026-09-03, orchestrator)

- Fix: the closed mobile sidebar panel no longer shows through the translucent chat pane (`78bcdf3`); release commit bumps version and contract test.
- Tag `v0.5.5` on `main`, release https://github.com/luisllenin02/bb-plugin-liquid-glass/releases/tag/v0.5.5. Inside the marketplace entry's `^0.5.4` range, so PR #177 needs no change.
- `liquid-glass@0.5.5` reinstalled from the path; appearance values and active theme unchanged.

## v0.5.6 (2026-09-03, orchestrator)

- Fix: header and composer chrome gradients now fade to fully transparent instead of to the pane alpha (the chrome sits on the pane, so the two tints stacked and the bars read solid). `chromeOpacity` range now starts at 0 so the chrome can be pure blur.
- User dials set on request: chromeOpacity 0.35, chromeFade 72 (was 0.67 / 50). Other values unchanged.
- Tag `v0.5.6` on `main`, release https://github.com/luisllenin02/bb-plugin-liquid-glass/releases/tag/v0.5.6; still inside the marketplace `^0.5.4` range. Follow-up commit `cdb133a` fixes a test pattern only.

## Liquid Glass v0.5.7 and v0.5.8 — 2026-09-03

- `v0.5.7` fixes host hover tooltips inheriting dark primary text after their
  surfaces are restyled as frosted glass.
- `v0.5.8` makes the new-thread home-composer shell transparent so only the
  prompt card receives the frosted surface.
- Releases: https://github.com/luisllenin02/bb-plugin-liquid-glass/releases/tag/v0.5.7 and https://github.com/luisllenin02/bb-plugin-liquid-glass/releases/tag/v0.5.8
- Both remain inside the marketplace entry's `^0.5.4` range; no marketplace
  entry change was required.

## Glass Sidebar v1.0.0 — 2026-09-03

- Release commit: `c470119`; tag `v1.0.0` on `main`.
- Repository: https://github.com/luisllenin02/bb-plugin-glass-sidebar
- GitHub release: https://github.com/luisllenin02/bb-plugin-glass-sidebar/releases/tag/v1.0.0
- Marketplace commit: `a3de7ae` in `luisllenin02/marketplace`.
- Marketplace PR: https://github.com/get-bb/marketplace/pull/180
- Marketplace source: Git range `^1.0.0`, plugin id `glass-sidebar`, category
  `thread-management`, vendored icon `glass-sidebar-e2480dc4.svg`.
- Validation: 61 Vitest files / 380 tests, 10 Node contract tests, TypeScript
  typecheck, `bb plugin build`, marketplace build/tests/v1 gate/liveness all
  passed. The release worktree is clean on `main`; the path install is running.

## Liquid Glass v0.5.9 — 2026-09-03

- Fix: the new-thread prompt form now has enough selector specificity to
  override the host's `.bg-background` utility, while the stable
  `data-promptbox-shell` wrapper and environment strip remain transparent.
- Release commit: `bbff3cf`; tag `v0.5.9` on `main`.
- GitHub release: https://github.com/luisllenin02/bb-plugin-liquid-glass/releases/tag/v0.5.9
- The marketplace entry's `^0.5.4` range already includes this patch; PR #177
  needs no metadata change.
- Validation: 30 Node contract tests, 62 Vitest tests, TypeScript typecheck,
  `bb plugin build`, and path install passed. Runtime reports
  `liquid-glass@0.5.9` running from the owned workspace.

## Liquid Glass v0.5.10 — 2026-09-03

- Fix: the running-thread follow-up composer footer now clears its host chrome
  gradient, matching the transparent new-thread environment/permission row.
- Release commit: `8ddda34`; tag `v0.5.10` on `main`.
- GitHub release: https://github.com/luisllenin02/bb-plugin-liquid-glass/releases/tag/v0.5.10
- The marketplace entry's `^0.5.4` range already includes this patch, so PR
  #177 needs no metadata change.
- Validation: 30 Node contract tests, 62 Vitest tests, TypeScript typecheck,
  `bb plugin build`, and path install passed. Runtime reports
  `liquid-glass@0.5.10` running from the owned workspace.
