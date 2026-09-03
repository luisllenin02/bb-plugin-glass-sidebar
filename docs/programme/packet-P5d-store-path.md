# Packet P5d — Cross-plugin readers return empty inside the plugin host

Work in `/home/system/workspaces/LAL/Development/forks/bb-sidebar`, branch
`feat/folders-colors-glass` (HEAD `55dd5c5`, clean, 310 tests, reloaded and
running). Read brief §5 (Preservation rule) first.

## Verified defect (orchestrator, 2026-09-02 23:13)

Both read-only cross-plugin readers return empty from the running plugin
while the same query succeeds from a plain node process:

```
curl -s -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:38886/api/v1/plugins/bb-sidebar/rpc/getWorkflowActivity
→ {"ok":true,"result":{"runs":[],"updatedAt":…}}      (a run was in progress; node returned 1 row)
curl … /rpc/getProjectDecor
→ {"ok":true,"result":{"projects":{}}}                 (Project Icons has 48 rows)
```

Both readers derive the sibling store path from `db.name` of
`bb.storage.database()` (`src/workflow-activity.ts:36`, `src/project-decor.ts:38`)
and both swallow every error into an empty result, so whatever throws inside
the host (a `name` that is not the absolute file path, an open error, or a
schema difference) is invisible. Consequence: the workflow row never shows,
and the sidebar's "Project Icons" colour precedence never fires, so colours
fall back to auto instead of mirroring the header.

## Fix

1. Derive the store paths from the SDK's authoritative data directory,
   `bb.server.experimental_dataDir` (see `bb-plugin-sdk.d.ts` ~17195 and
   `backend-foundation.md` ~103): `<dataDir>/plugins/workflows/data.db` and
   `<dataDir>/plugins/project-icons/data.db`. Keep the `db.name`-based
   derivation only as a fallback when `experimental_dataDir` is absent.
   Pass the resolved path into the readers from `server.ts` (they stay pure
   and testable).
2. Stop hiding failures: on the first failure per path, `bb.log.warn` one
   line with the path and the error message (never per call); keep returning
   the empty snapshot. Include `sourcePath` and `sourceStatus:
   "ok" | "missing" | "error"` in both RPC results so the frontend and the
   audit can tell an empty store from a broken reader.
3. Diagnose before fixing and record it in the report: add a temporary
   `bb.log.info` of `db.name` and the derived path, reload, read
   `bb plugin logs bb-sidebar -n 40`, then remove the temporary line. State
   the actual cause in the report.
4. Integration test with `createFakePluginHost` using a temp data directory
   containing `plugins/workflows/data.db` and `plugins/project-icons/data.db`
   with the real schemas: both RPCs return the seeded rows; a missing file
   yields `sourceStatus: "missing"` and empty rows; an unreadable file yields
   `"error"` and one warn log.

Commit subject exactly `[P5d] resolve sibling plugin stores from the server data dir`. No reload (I1 does it). Suite must not shrink.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`; `bb plugin build`. Report per brief §5 with the diagnosed cause.
