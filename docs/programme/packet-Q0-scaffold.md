# Packet Q0 — Scaffold the own thread-list plugin `bb-plugin-glass-sidebar`

Read `00-brief.md` §2 (host facts), §4 (contract), §5 (worker rules) and
`02-own-plugin-plan.md` in full. This packet creates a NEW plugin tree; it
does not touch `forks/bb-sidebar`, `bb-plugins/liquid-glass`, or the vendored
Project Icons. Nothing is installed or reloaded in this packet: only one
`experimental_threadList` plugin may be enabled and `bb-sidebar` stays live
until the switch-over packet (Q7).

Target directory: `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`
(create it; run `git init` there and commit at the end; no other git repo may
be created or modified).

## Read

- `/home/system/workspaces/LAL/Development/bb/bb-0.41.0/docs/plugin-sidebar-thread-list.md` §§1–6, §8, §9 (the complete minimal example is the starting point).
- `/home/system/.npm-global/lib/node_modules/bb-app/server/dist/builtin-skills/bb-plugin-authoring/references/quickstart.md` and `references/testing.md`.
- From the fork, for shape only (copy nothing yet): `forks/bb-sidebar/package.json`, `forks/bb-sidebar/vitest.config.ts`, `forks/bb-sidebar/tsconfig.json`, `forks/bb-sidebar/src/organization.ts` (types), and the first 120 lines of `forks/bb-sidebar/src/server.ts` (storage + migration pattern).
- `bb-plugins/liquid-glass/test/theme-contract.test.mjs` for the shape of a Node contract test.

## Produce

1. `package.json`: name `bb-plugin-glass-sidebar`, version `0.1.0`, MIT,
   author Luis Llenin, `bb.name` "Glass Sidebar", description "Session
   management for bb: unmistakable focused / split / idle rows, folders with
   colours and drag and drop, a live strip of open panes and running work,
   project glyphs and colours, all without background polling.",
   `engines.bb ">=0.41"`, `engines.bbPluginSdk ">=0.4.34"`, `bb.server`,
   `bb.app`, `bb.branding.icon` (`assets/icon.svg`, simple glass-pane
   glyph). Runtime deps: `zod` only. Dev deps: `@get-bb/plugin-sdk` 0.4.34
   pinned like the fork, react, react-dom, vitest, jsdom, typescript,
   @testing-library/react, `@hugeicons/react` and `@hugeicons/core-free-icons`
   as devDependencies only if `bb plugin types --check` places them there;
   otherwise runtime. Run `node /home/system/.npm-global/lib/node_modules/bb-app/server/dist/builtin-skills/submit-a-plugin/scripts/derive-plugin-id.mjs package.json`
   and record the derived id in README (expected `glass-sidebar`).
2. `server.ts`: `bb.storage.database()` + `bb.storage.migrate()` creating
   the brief §4.3 tables (`thread_folders`, `folder_members`,
   `thread_accents`, `project_accents`) plus `project_decor (project_id TEXT PK, icon TEXT, color TEXT, source TEXT NOT NULL DEFAULT 'auto', updated_at INTEGER NOT NULL)`
   and `thread_lifecycle (thread_id TEXT PK, state TEXT NOT NULL, wake_at INTEGER, updated_at INTEGER NOT NULL)`.
   RPC contract `glassSidebarRpcContract` with `getOrganization` and
   `getProjectDecor` implemented against the store (empty results are fine),
   the remaining brief §4.3 mutation methods declared and implemented as
   plain inserts/updates with zod validation, and a realtime publish
   `organization` on every mutation. Thread-deleted pruning hook as in the
   fork. No timers, no `bb.background`, no process spawning.
3. `app.tsx`: `experimental_threadList` registration rendering the host doc's
   minimal list (projects → threads, native actions) inside a root that
   carries `data-glass-sidebar-root`, plus the keyboard DOM contract from
   doc §8. No other slot yet.
4. `src/` layout mirroring the plan: `accent.ts` (brief §4.2 palette and
   exports, copied from the fork with credit comment), `organization.ts`
   (types), `pane-state.ts` (`paneOrdinal`, `resolvePaneState` copied with
   tests), `components/Icon.tsx` with NAMED imports only.
5. Tests: `vitest.config.ts` like the fork; `test/contract.test.mjs` (Node
   test) asserting: `dist/app.js` ≤ 300 KB and `dist/server.js` ≤ 800 KB
   after `bb plugin build`, no `setInterval(` in `dist/app.js`, no
   `import * as` from `@hugeicons/core-free-icons` in `src/`, the manifest
   declares exactly one thread-list slot, `engines` pins as above. Vitest:
   pane-state and accent unit tests, an RPC round trip for
   `createFolder → getOrganization` through `createFakePluginHost`, and a
   `renderSlot` smoke test that the list renders one row per seeded thread
   with `data-sidebar-thread-id`.
6. `README.md`: purpose, the no-polling rule, install from path, credits
   (yusuf8834/bb-sidebar, SawyerHood/bb-plugin-t3sidebar, ariofrio/bb-plugins,
   hardbeat920/monocode), and a "Status: pre-release scaffold" line.
7. Copy `plans/glass-sidebar/00-brief.md` and `02-own-plugin-plan.md` into
   `docs/` of the new repo so the repo is self-describing.

## Verify

`npm install`; `npx tsc --noEmit`; `npx vitest run`; `bb plugin build`;
`node --test test/*.test.mjs`. Do NOT run `bb plugin install`, `bb plugin
reload`, or `bb theme set`.

Commit: `git add -A` is allowed ONLY in this new repo (it is otherwise
empty); subject exactly `[Q0] scaffold glass-sidebar plugin`. Report per
brief §5, adding the derived plugin id and the two bundle sizes.
