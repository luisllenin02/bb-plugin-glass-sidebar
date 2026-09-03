# Packet Q3 — Live strip (open panes, now) and running workflows as child rows

**Depends on: Q1.** Wave 2 with Q2. Downstream: Q7.

Work in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`.
A **port** of B4 + P5/P5b/P5c/P5d (fork commits `f30bb07`, `954411a`,
`0e15453`, `55dd5c5`, `344595b`) into the new tree. Read `00-brief.md` §4.1,
§4.5 and §5 in full (§4.5 is reproduced verbatim and does not change),
`02-own-plugin-plan.md` §1, §3, §4, `packet-Q0-scaffold.md`, and Q1's report.

Do not touch `forks/bb-sidebar`.

**Entrypoint paths.** In this tree the plugin's entrypoints are the **root**
`app.tsx` and the **root** `server.ts` (Q0 Produce 2–3); everything else is
under `src/`. A `src/server.ts` in the "From the fork" Read list is the
**fork's** file; every server edit this packet asks for is in the root
`server.ts`.

## Read

- From the fork, in full — the files you port: `src/split-registry.ts`,
  `src/split-registry.test.ts`, `src/SplitProbe.tsx`, `src/live-strip.ts`,
  `src/live-strip.test.ts`, `src/LiveStrip.tsx`, `src/LiveStrip.test.tsx`,
  `src/workflow-activity-shared.ts`, `src/workflow-activity.ts`,
  `src/workflow-activity.test.ts`, `src/useWorkflowActivity.ts`,
  `src/useWorkflowActivity.test.tsx`,
  `src/useWorkflowActivity.browser-imports.test.ts`,
  `src/WorkflowRunRow.tsx`, `src/WorkflowRunRow.test.tsx`.
- From the fork, mapped not read whole: `src/server.ts` — grep
  `getWorkflowActivity\|workflowStorePath\|experimental_dataDir\|sourceStatus`
  and read only those blocks (this is the P5d fix you must carry over).
- `packet-P5b-workflow-signal.md` and `packet-P5d-store-path.md` in this
  folder, for the reasoning behind the read-only sibling store and the data-dir
  path resolution.
- In the new tree: `src/ThreadList.tsx`, `src/ThreadCard.tsx`,
  `src/RelatedThreadTree.tsx`, `src/SlimRow.tsx`, `src/pane-state.ts`,
  `src/row-props.ts` (Q1's canonical row types and access interfaces — you
  re-export from it, never rewrite it), and the root `server.ts` migrations and
  contract.
- SDK: `node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts`
  around `PluginSidebarThreadIndicator` (~858) and `PluginSidebarThreadSplit`
  (~1050).

## Produce

1. **Split registry and probes.** `src/split-registry.ts` + tests and
   `src/SplitProbe.tsx`, ported unchanged. One probe per candidate thread
   (pinned + active + folder members, never archived); the per-thread split
   hook is never called in a loop; the registry snapshot is stable and cleans
   up on unmount.
2. **Live strip.** `src/live-strip.ts` (+ tests) with `classifyNow`,
   `nowRows`, `chipLabel`, and `src/LiveStrip.tsx` (+ tests) with
   `OpenPanesRow`, `NowRow`, `LiveStrip`, `LiveStripCommonProps`, exactly per
   brief §4.5: chips in `paneOrdinal` order, focused chip filled
   (`bg-primary/15 ring-1 ring-primary/60`), hidden below two panes; Now rows
   with needs-you first in `text-attention`, max 8 then `+N more`, hidden when
   empty; both sections collapsible.
   The collapse keys are the brief's literal ones,
   `bb-sidebar.liveStrip.openPanes` and `bb-sidebar.liveStrip.now`
   (`COLLAPSE_STORAGE_PREFIX = "bb-sidebar.liveStrip."`): §4.5 fixes them
   verbatim, the fork's `LiveStrip.test.tsx` asserts the literal key, and this
   packet does not amend a shared contract. Q1's `glass-sidebar:` rename covers
   only the `bb-sidebar:` **colon**-prefixed preference keys and explicitly
   excludes these. Port §4.5 verbatim, keys included.
3. **Workflow activity, server.** `src/workflow-activity-shared.ts` and
   `src/workflow-activity.ts` (+ tests) ported with the **P5d version** of the
   path rule: derive `<dataDir>/plugins/workflows/data.db` from
   `bb.server.experimental_dataDir`, keep the `db.name` sibling derivation only
   as a fallback, open read-only (`{ readonly: true, fileMustExist: true }`),
   never write, cache the prepared statement (not the result), warn once per
   path on failure, and return `sourcePath` + `sourceStatus:
   "ok" | "missing" | "error"` in the RPC result. Add the
   `getWorkflowActivity` method to the contract in the root `server.ts`
   (surgical addition; nothing else in that file changes) and port the integration test
   that seeds a temp data directory with the real `workflow_runs` schema.
   This is the **only** sibling store this plugin reads — Q4's absorbed
   `project_decor` replaces the project-icons sibling read entirely.
4. **Workflow rows.** `src/WorkflowRunRow.tsx` (+ test) and
   `src/useWorkflowActivity.ts` (+ both tests), ported. Rows render under the
   origin thread's card in the related-thread tree's grammar; the card's
   related count and expand/collapse include them; queued runs show "queued";
   finished runs disappear on the next update; clicking opens the origin
   thread.
   `getWorkflowActivity` is **not** one of the four first-paint reads (see
   Verify): `useWorkflowActivity` issues its first call after first paint — on
   the first host thread-list revision after mount, or a
   `requestIdleCallback` / `setTimeout(0)` fallback where that API is missing —
   and thereafter only on signals plus the 60 s mounted fallback. Add a test
   that no RPC is issued during the mount render pass. Workflow child rows are
   additive, so a list painted without them is correct, not degraded.
5. **Wiring** (shared file, anchors only). `src/ThreadList.tsx`, three anchors:
   - Q1 declares the default `workflow` binding immediately **before**
     `// @hooks:workflow (Q3)` at the top level of the list component. Insert
     exactly one unconditional line immediately **after** that anchor,
     `workflow = useWorkflowActivity();`. Keep the default, anchor and
     assignment above `renderActiveThread`. Your hook goes here and nowhere
     else in this file; `renderActiveThread` runs once per thread, so a hook
     opened inside it would run in a loop. Your return type must be structurally
     assignable to Q1's `WorkflowAccess`; widen your own API rather than
     editing `row-props.ts`.
   - after `{/* @slot:live-strip (Q3) */}` — Q1 placed it as the first child of
     the scroll container — mount one `<SplitProbe>` per candidate thread and
     `<LiveStrip …>`. `LiveStrip` takes an optional
     `projectDecor?: Record<string, ProjectDecorEntry>` prop (Q1's type from
     `./row-props`, default `{}`) for the chips' project colour dot per brief
     §4.5, and you feed it `projectDecor={decor.projects}` from Q1's shared
     `decor` binding — `EMPTY_DECOR_ACCESS` before Q4 lands, Q4's map
     afterwards, so chips, folder headers and rows agree without Q4 editing
     your file or you importing anything of Q4's. With `{}` the chip falls back
     to the provider glyph, exactly as §4.5 specifies. Test both cases.
   - after `// @rows:workflow (Q3)`, add **props only** — `workflowRuns`, read
     from the `workflow` binding — to the row props `renderActiveThread`
     receives.
   Leave every anchor comment in place and touch no other packet's anchor, so
   Q2/Q4/Q5/Q6 can patch the same file in any order.
   `src/row-props.ts` is Q1's canonical declaration of `WorkflowRun` and you do
   **not** rewrite it: `src/workflow-activity-shared.ts` imports the type from
   `./row-props` and re-exports it under its own name, so the structural type
   keeps exactly one definition. Q1 already threaded `workflowRuns` through
   `ThreadCard` / `RelatedThreadTree` / `SlimRow`; change nothing in those
   three files. A missing prop is a blocking Q1 contract failure; do not add
   it in Q3.
6. **Timer allowlist.** The 60 s workflow fallback in
   `src/useWorkflowActivity.ts` is one of the two `setInterval` call sites the
   plan permits, and it exists only while the sidebar is mounted. Update Q0's
   `test/contract.test.mjs` from "no `setInterval(` in `dist/app.js`" to an
   **allowlist assertion**: exactly two occurrences, and a source-level test
   naming their owners (`useWorkflowActivity.ts`, and the minute clock in
   `ThreadList.tsx`). Do not weaken any other contract assertion; record the
   change in your report.

## Drop (do not port)

- Any polling of the workflows plugin beyond the mounted 60 s fallback: no
  server interval, no process spawning, no CLI. This packet adds no
  `bb.background`; Q5 alone preserves its 5-minute auto-settle schedule.
- The `db.name`-first path derivation the P5d packet replaced (keep it only as
  the documented fallback).
- Nothing about the `bb-sidebar.liveStrip.*` keys: they are contract, ported
  verbatim (see Produce 2). Do not rename them.
- Anything that would make the strip re-render on a timer: refresh is
  signal-driven (host thread-list revision, realtime, `visibilitychange`).

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`; `bb plugin build`;
`node --test test/*.test.mjs`. Suite only grows. The test runtime cannot seed a
split layout — assert that `OpenPanesRow` renders nothing under the harness and
test the pure helpers (`paneOrdinal`, registry ordering, `classifyNow`,
`nowRows`, `chipLabel`) instead.

Budget (plan §4 — binding on every packet):
- `dist/app.js` ≤ 300 KB, `dist/server.js` ≤ 800 KB; report both.
- **No timers** except the two allowed owners named in Produce 6; no server
  timers, no spawning, no watchers. The only `bb.background` use in the
  completed plugin is Q5's preserved 5-minute auto-settle schedule.
- **No new dependencies**: `zod` only at runtime.
- Frontend RPCs on mount ≤ 4 plugin-wide, allocated once for the whole plan:
  `getOrganization` (Q2), `listInboxOrder` (Q2), `getProjectDecor` (Q4),
  `listLifecycle` (Q5). `getWorkflowActivity` is **yours and is not one of
  them** — it must not run during the mount render pass (Produce 4);
  `getSidebarSettings` (Q6) is likewise post-paint.
- Named icon imports only.

No `bb plugin install`, `enable`, `reload`, or `bb theme set`.

Commit (no `git add -A`):
`git add <your files> && git commit -m "[Q3] port the live strip and workflow child rows"`.
Report per brief §5, adding the contract-test change, the anchors you filled,
confirmation that `useWorkflowActivity` is called only immediately after
`// @hooks:workflow (Q3)`, with its default binding immediately before the
anchor, and never inside `renderActiveThread`, proof that
`getWorkflowActivity` does not run during mount, and the two bundle sizes.
