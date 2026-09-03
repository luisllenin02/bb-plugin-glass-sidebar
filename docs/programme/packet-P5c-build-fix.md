# Packet P5c — Make P5b buildable: browser hook must not import the server module

Work in `/home/system/workspaces/LAL/Development/forks/bb-sidebar`, branch
`feat/folders-colors-glass` (HEAD `0e15453`, clean, 309 tests). P5b passed
review but `bb plugin build` failed in integration. Read brief §5
(Preservation rule) and the audit findings in your prompt appendix.

## Fix, nothing more

1. `src/useWorkflowActivity.ts` imports `WORKFLOW_ACTIVITY_REFRESH_MS` (and
   possibly types) from `src/workflow-activity.ts`, which imports
   `better-sqlite3` and `node:path`; the app bundle therefore reaches Node-only
   modules and the build fails. Move the refresh constant and the shared DTO
   types into a browser-safe module `src/workflow-activity-shared.ts` (no
   Node imports), import it from both the hook and the server module, and
   keep all SQLite/path code in the server-only module. Add a test that
   `src/useWorkflowActivity.ts` and every module it imports contain no
   `better-sqlite3`, `node:`, `fs`, or `path` import (a simple static check
   over the import graph is enough).
2. SDK pin: the package pins `@get-bb/plugin-sdk` 0.4.15 while the host
   provides 0.4.34 and `bb plugin build` reports a contract check. Run
   `bb plugin types --check`; if it reports drift, run `bb plugin types` to
   repin, `npm install`, and commit `package.json`/`package-lock.json`/`types`
   changes. Do not change any other dependency.
3. `bb plugin build` must succeed (do not reload; I1 does it). Full suite and
   typecheck green; suite must not shrink.

Commit subject exactly `[P5c] build fix: browser-safe workflow activity module`.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`; `bb plugin build`. Report per brief §5.
