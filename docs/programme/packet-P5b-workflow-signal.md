# Packet P5b (v2) — Show a running workflow under its thread card, the way a child thread is shown

Work in `/home/system/workspaces/LAL/Development/forks/bb-sidebar`, branch
`feat/folders-colors-glass`. P5's commits (`ccdc850`, `d49b781`) are on the
branch and a cancelled P5b worker may have left uncommitted edits: start from
whatever is in the tree, keep what serves this packet, remove what does not,
and commit once. Read brief §5 (Preservation rule) first.

User direction (2026-09-02, verbatim intent): "Going too deep into the weeds
regarding whether a workflow is running. I want the workflow run identified
similar to a child thread running." And: "I do not want it to waste
resources or tokens just for an icon." Keep this small and free of background work.

## What to build

1. **Data source — zero background cost** (server, `src/server.ts` +
   `src/workflow-activity.ts`): the user rejected any polling or process
   spawning for this feature. The workflows plugin keeps its runs in its own
   SQLite database at `<bb data dir>/plugins/workflows/data.db` (on this host
   `/home/system/.bb/plugins/workflows/data.db`), table `workflow_runs`
   with columns `id, origin_thread_id, name, status, phase, started_at,
   created_at` (status values include `queued`, `running`, `succeeded`,
   `failed`, `cancelled`). Open it **read-only** with `better-sqlite3`
   (`{ readonly: true, fileMustExist: true }`), derive the path from this
   plugin's own database path exactly as `project-decor.ts` does for Project
   Icons, and answer RPC
   `getWorkflowActivity({}) -> { runs: Array<{ id, originThreadId, name, status, phase, startedAt }>, updatedAt }`
   with one prepared `SELECT … WHERE status IN ('queued','running')`.
   No background service, no interval on the server, no CLI. Return `{ runs: [] }`
   when the file or table is missing. Cache the statement, not the result.
   Frontend (`src/useWorkflowActivity.ts`): call the RPC when the sidebar
   mounts, again whenever `experimental_useSidebarThreads()` delivers a new
   thread list (the origin thread's `updatedAt` moves as a run progresses),
   and on a 60 s interval that exists only while the sidebar is mounted, i.e.
   only while a client has the app open. Nothing runs when no client is
   connected. Tests use a temp SQLite file with the schema above.

2. **Presentation** (`src/ThreadCard.tsx`, `src/RelatedThreadTree.tsx`,
   new `src/WorkflowRunRow.tsx`): under the origin thread's card, in the
   same place and with the same visual grammar as a related child thread row
   (indent, connector line, status glyph, title, age), render one row per
   running or queued workflow: the workflow glyph, "workflow · <name>", the
   phase when present ("Produce 2/3"), the running spinner glyph, and the
   elapsed time since `startedAt`. Queued runs show "queued" instead of the
   spinner. The row is not a link (there is no thread to open); clicking it
   opens the origin thread. Finished runs disappear on the next update.
   The card's existing related-thread count and expand/collapse include
   these rows exactly as they include child threads.
3. **Now row** (`src/live-strip.ts`, `LiveStrip.tsx`): a thread with a
   running workflow appears in the Now list as working, with "Workflow" as
   its status text. Nothing else changes: no chip, no rail pulse, no folder
   glyph, no park-gating changes beyond what P5 already committed (keep
   P5's park gating since it is correct and tested).
4. **SlimRow precedence** (`src/SlimRow.tsx` ~204): a snoozed slim row with a
   running workflow shows the workflow glyph instead of the wake label; the
   wake time moves to the tooltip. Add the test.

## Tests

Read-only query against a temp database (running and queued only; missing file → empty); RPC shape; the hook refetches on thread-list change and clears its interval on unmount;
card renders a workflow row under the origin thread with glyph, name, phase,
age; count and collapse behave as for child threads; Now row lists it; the
SlimRow case. Suite only grows (baseline 296).

## Constraints

Preservation rule; token classes only; no reload (I1 does it). Commit subject exactly `[P5b] show running workflows as child rows`.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`. Report per brief §5.
