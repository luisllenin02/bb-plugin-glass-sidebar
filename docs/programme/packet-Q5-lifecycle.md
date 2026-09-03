# Packet Q5 — Lifecycle: shelves, snooze, settle, wake, inactive rules, auto-settle

**Depends on: Q1.** Wave 3 with Q4 and Q6. Downstream: Q7.

Work in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`.
A **port** of the upstream fork features the preservation rule protects
(`02-own-plugin-plan.md` §3, "port in phase 2"). Read `00-brief.md` §5 in full
— the Preservation rule is the whole point of this packet — plus
`02-own-plugin-plan.md` §3 and §4, and `packet-Q0-scaffold.md` and Q1's report.

Do not touch `forks/bb-sidebar`.

**Entrypoint paths.** In this tree the plugin's entrypoints are the **root**
`app.tsx` and the **root** `server.ts` (Q0 Produce 2–3); everything else is
under `src/`. A `src/server.ts` in the "From the fork" Read list is the
**fork's** file; every server edit this packet asks for is in the root
`server.ts`.

## Read

- From the fork, in full — the files you port: `src/lifecycle.ts`,
  `src/lifecycle.test.ts`, `src/useLifecycle.ts`, `src/auto-settle.ts`,
  `src/auto-settle.test.ts`, `src/inactive.ts`, `src/inactive.test.ts`,
  `src/SnoozeSelect.tsx`.
- From the fork, mapped not read whole: `src/server.ts` — grep
  `thread_lifecycle\|listLifecycle\|settle\|snooze\|unsnooze\|acknowledgeWake\|evaluateAutoSettle\|auto-settle\|LIFECYCLE_CHANNEL\|thread.deleted`
  and read only those blocks and the migrations array head (lines 44–110);
  `src/server.test.ts` — read only the lifecycle and auto-settle describes;
  `src/ThreadInbox.tsx` — grep `useLifecycle\|ParkedShelf\|Snoozed\|Settled\|shelfFor\|SETTLED_INITIAL_LIMIT`
  and read only those regions plus `ParkedShelf` (~1484–1590).
- In the new tree: the root `server.ts` (Q0's migrations and contract),
  `src/ThreadList.tsx`, `src/SlimRow.tsx`, `src/ThreadCard.tsx`,
  `src/RowContextMenu.tsx`, `src/row-props.ts`, `src/inbox.ts`, and — if
  landed — `src/SidebarSettings.tsx` and `src/BulkSelectionBar.tsx` (Q6's).

## Produce

1. **Schema reconciliation — read this before writing any migration.** Q0
   created `thread_lifecycle (thread_id TEXT PK, state TEXT NOT NULL, wake_at
   INTEGER, updated_at INTEGER NOT NULL)`. The fork's shape, which the ported
   code and Q7's import both need, is `(thread_id, settled_at,
   settled_override, snoozed_until, snoozed_at)`. SQLite cannot relax a NOT
   NULL constraint with `ALTER TABLE`, and recreating the table is forbidden,
   so the reconciliation is **additive on the schema and total on the writes** —
   do exactly this, it is not a judgement call:
   - Append four migrations, each `ALTER TABLE thread_lifecycle ADD COLUMN`
     with a nullable type (legal, because none of them is NOT NULL):
     `settled_at INTEGER`,
     `settled_override TEXT CHECK (settled_override IN ('active','settled') OR settled_override IS NULL)`,
     `snoozed_until INTEGER`, `snoozed_at INTEGER`.
   - **Keep Q0's `state`, `wake_at` and `updated_at` columns exactly as they
     are** — no drop, no recreate, no constraint change — and make every write
     path supply them, so the NOT NULL constraints are always satisfied.
   - Export from `src/lifecycle.ts` (pure, no host imports, so the server, the
     hook and Q7's CLI all use the same code):
     `type LegacyLifecycleState = "active" | "snoozed" | "settled"`;
     `legacyLifecycleState(row: ThreadLifecycleRow): LegacyLifecycleState` —
     `"settled"` when `settledAt !== null` or `settledOverride === "settled"`,
     else `"snoozed"` when `snoozedUntil !== null`, else `"active"`;
     `legacyWakeAt(row): number | null` = `row.snoozedUntil`;
     `legacyLifecycleColumns(row, now: number)` returning
     `{ state, wakeAt, updatedAt }` where `updatedAt = now`.
   - The ported `write(row)` helper becomes an eight-column upsert:
     `INSERT INTO thread_lifecycle (thread_id, settled_at, settled_override,
     snoozed_until, snoozed_at, state, wake_at, updated_at) VALUES (…)
     ON CONFLICT(thread_id) DO UPDATE SET` all seven non-key columns from
     `excluded`, with `state`/`wake_at`/`updated_at` taken from
     `legacyLifecycleColumns(row, Date.now())`. Reads keep using the fork's
     five fields; `state`, `wake_at` and `updated_at` are derived mirrors that
     nothing reads back as truth.
   - `StoredLifecycleRow` stays the fork's five fields.
   - Tests, required and named in your report: a round-trip test that opens a
     database built by the plugin's **real migration list from empty** (Q0's
     `CREATE TABLE` plus your four `ADD COLUMN`s) and drives every mutation —
     `settle`, `unsettle`, `snooze`, `unsnooze`, `bulkSettle`, `bulkSnooze`,
     `acknowledgeWake`, `evaluateAutoSettle` — asserting no
     `NOT NULL constraint failed` is ever raised and that the mirrored
     `state` / `wake_at` / `updated_at` match `legacyLifecycleColumns`; plus a
     unit test pinning `legacyLifecycleState` over all four input shapes
     (settled, snoozed, both, neither). Q7's import calls the same helper and
     tests it against the same schema.
   State in your report the exact migrations you appended and the three values
   `legacyLifecycleColumns` writes.
2. **Pure logic.** `src/lifecycle.ts` (+ tests): `ThreadLifecycleRow`,
   `ThreadActivitySignals`, `ThreadShelf`, `WakeReason`, `resolveWakeReason`,
   `canPark`, `resolveShelf`, `DEFAULT_SNOOZE_PRESET_CONFIG`,
   `parseConfiguredSnoozePresets`, `snoozeWakeLabel`, `formatSnoozeWakeTime`,
   `resolveSnoozePresets`, `MAX_TIMEOUT_MS`, `nextWakeDelayMs`.
   `src/auto-settle.ts` (+ tests): `decideAutoSettle`,
   `parseAutoSettleAfterDays`, the three constants, `SettledOverride`.
   `src/inactive.ts` (+ tests): `isInactiveThread`,
   `parseInactiveAfterHours`, the three constants. All ported verbatim.
3. **Server.** Surgical additions to the root `server.ts`: `LIFECYCLE_CHANNEL =
   "lifecycle"`, the eight-column `write` helper from Produce 1, and the RPCs
   `listLifecycle`, `settle`, `unsettle`, `snooze`,
   `unsnooze`, `bulkSettle`, `bulkSnooze`, `acknowledgeWake`,
   `evaluateAutoSettle` — names verbatim from the fork, zod-validated,
   publishing `LIFECYCLE_CHANNEL` on every mutation, with lifecycle rows pruned
   on `thread.deleted` beside Q2's folder pruning. The existing
   `listLifecycle` handler performs the same idempotent auto-settle evaluation
   before returning its rows; it publishes at most once and only when that
   evaluation changed state. Port the fork's lifecycle server tests.
4. **Auto-settle without a fifth mount RPC.** Do not call
   `evaluateAutoSettle` separately on mount. The initial idempotent evaluation
   runs inside the existing `listLifecycle` server handler from Produce 3, so
   Q5 contributes exactly one automatic mount RPC: `listLifecycle`. Later
   evaluations are signal-driven through later `listLifecycle` refreshes, or
   run through the fork's preserved
   `bb.background.schedule("auto-settle", "*/5 * * * *", …)` job. Preserve
   the scheduled job's idempotence and single publish-on-change; add no other
   scheduler or server timer. The per-thread wake `setTimeout` in
   `useLifecycle` stays (it is a timeout, not an interval, and is cleared on
   unmount). Test the SDK runtime's RPC call log after all initial effects have
   settled and assert that Q5 issued `listLifecycle` but no separate
   `evaluateAutoSettle` call.
5. **Hook.** `src/useLifecycle.ts` ported: `LifecycleApi` with `shelfFor`,
   `canPark`, `wakeAtFor`, `settledAtFor`, `wokeFor`, `acknowledgeWake`,
   `settle`, `unsettle`, `snooze`, `unsnooze`, the bulk wrappers, `isWorking`,
   optimistic updates with rollback, `useRealtime(LIFECYCLE_CHANNEL)`, and the
   wake timer. `listLifecycle` is one of the four first-paint reads the plan's
   budget allows plugin-wide (see Verify): issue it once on mount, passing the
   current activity signals needed by the handler's initial idempotent
   evaluation, and refresh only on later signals. The initial thread-list
   delivery is part of that first request, not a second automatic
   `evaluateAutoSettle` effect.
6. **List wiring** (shared file, anchors only — leave every anchor comment in
   place). Q1 declares the default `lifecycle` binding immediately **before**
   `// @hooks:lifecycle (Q5)` at the top level of the list component. Insert
   exactly one unconditional line immediately **after** that anchor —
   `lifecycle = useLifecycle(threads);` — assigning the existing binding.
   Keep the default, anchor and assignment above `renderActiveThread`. Your
   hook goes here and nowhere else in this file; `renderActiveThread` runs once per thread, so a hook opened
   inside it would run in a loop, and `LifecycleApi` must be structurally
   assignable to Q1's `LifecycleAccess` (widen your own API rather than editing
   `row-props.ts`). Then, after `{/* @slot:parked-shelves (Q5) */}`,
   `src/ThreadList.tsx`: partition
   with `shelfFor` into Active / Snoozed / Settled, render `ParkedShelf` for
   the two parked shelves with `SlimRow` members and the settled paging
   (`SETTLED_INITIAL_LIMIT` 10, `SETTLED_PAGE_SIZE` 25), apply the inactive
   rules to the Inactive shelf, and keep `nextThreadAfterParking` navigation.
   A settled or snoozed folder member is hidden from its folder and stays on
   its parked shelf, reappearing in the folder when it returns (brief §4.4) —
   `partitionByFolder` (Q2) already honours this; wire it, do not reimplement.
7. **Row and menu wiring** (shared files, anchors only). `src/SlimRow.tsx`: wake
   label, restore and snooze controls, and the P5b precedence where a snoozed
   row with a running workflow shows the workflow glyph and moves the wake
   time into the tooltip. `src/ThreadCard.tsx`: snooze/settle controls gated by
   `canPark`. `src/RowContextMenu.tsx`: Snooze ▸ / Settle / Wake items inserted
   after the `{/* @menu:lifecycle (Q5) */}` anchor, beside Q1's, Q2's and Q4's
   items without editing them or their anchors. In `src/ThreadList.tsx` your
   three anchors are `// @hooks:lifecycle (Q5)` (the hook call, Produce 6),
   `{/* @slot:parked-shelves (Q5) */}` (Produce 6) and `// @rows:lifecycle
   (Q5)` (**props only** — wake labels, `snoozePresets`, `wakeAt`, `canPark` —
   read from the `lifecycle` binding, never a hook); leave every anchor comment
   in place and touch no other packet's. `src/row-props.ts` is Q1's canonical declaration of
   `ConfiguredSnoozePreset` and you do **not** rewrite it: `src/lifecycle.ts`
   imports the type from `./row-props` and re-exports it under its own name, so
   the structural type keeps exactly one definition.
8. **Settings block, and the two bulk buttons.** `src/LifecycleBlock.tsx` —
   snooze presets, `inactiveThreadsEnabled`, `inactiveAfterHours`,
   `autoSettleInactive`, `autoSettleAfterDays`, `autoSettleOnMerge`, exported
   standalone with its own test. It takes its values and its save callback as
   props (Q1's `SettingsAccess` and `DEFAULT_SIDEBAR_SETTINGS` in
   `src/row-props.ts`, which Q6's `sidebar-settings.ts` re-exports) so it
   compiles and renders whether or not Q6 has landed. Q6 owns the
   `sidebar_settings` table and the `getSidebarSettings` /
   `updateSidebarSettings` RPCs; when Q6 has landed, read through its hook and
   mount the block in `src/SidebarSettings.tsx` after Q6's
   `{/* @settings:lifecycle (Q5) */}` anchor, leaving the anchor in place.
   Q6's `src/BulkSelectionBar.tsx` likewise carries a
   `{/* @bulk:lifecycle (Q5) */}` anchor for the bulk **Settle** and
   **Snooze** buttons, which call your `bulkSettle` / `bulkSnooze` RPCs: when
   Q6 has landed, enable them there. For each of those two mountings that you
   could not apply because Q6 had not landed, reproduce the step verbatim under
   `Deferred wiring` in your report — Q7 Produce 1 applies it and behaviour-tests
   the result. Say which case applied.

## Drop (do not port)

- Any scheduler other than the single preserved
  `bb.background.schedule("auto-settle", "*/5 * * * *", …)` job, and any
  server-side timer (see Produce 4).
- The fork's `bb-sidebar:` localStorage prefix (Q1's `glass-sidebar:` rename).
- Upstream shelf scaffolding not reachable from the ported code.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`; `bb plugin build`;
`node --test test/*.test.mjs`. Suite only grows. Tests must cover: shelf
resolution, park gating while work is live, wake reasons (timer and
attention), snooze preset parsing, auto-settle decisions including the merge
case, inactive thresholds, the initial evaluation inside `listLifecycle`,
later signal-driven and scheduled evaluations, the absence of a separate
mount-time `evaluateAutoSettle` RPC after all initial effects settle, settled
paging, and pruning on thread deletion.

Budget (plan §4 — binding on every packet):
- `dist/app.js` ≤ 300 KB, `dist/server.js` ≤ 800 KB; report both.
- **No timers**: no `setInterval` except the minute clock and Q3's workflow
  fallback; no server timers, spawning or watchers. The single preserved
  5-minute `bb.background` auto-settle schedule is required. The wake
  `setTimeout` is permitted and must be cleared on unmount.
- **No new dependencies**: `zod` only at runtime.
- Frontend RPCs on mount ≤ 4 plugin-wide, allocated once for the whole plan:
  `getOrganization` (Q2), `listInboxOrder` (Q2), `getProjectDecor` (Q4),
  `listLifecycle` (**yours**). `getSidebarSettings` (Q6) and
  `getWorkflowActivity` (Q3) load after first paint. `useLifecycle` issues
  `listLifecycle` once on mount and refreshes only on `LIFECYCLE_CHANNEL`,
  `visibilitychange` and host thread-list revisions. Its initial evaluation
  occurs inside that handler; after all mount effects settle the RPC log must
  contain no automatic `evaluateAutoSettle` call and no fifth mount RPC.
- Named icon imports only.

No `bb plugin install`, `enable`, `reload`, or `bb theme set`.

Commit (no `git add -A`):
`git add <your files> && git commit -m "[Q5] port lifecycle shelves, snooze, settle, and auto-settle"`.
Report per brief §5, adding the migrations you appended, the exact
`legacyLifecycleColumns` mapping and the round-trip test proving no NOT NULL
violation on Q0's schema, the auto-settle integration and preserved 5-minute
schedule, the anchors you filled, confirmation that `useLifecycle` is called
only immediately after `// @hooks:lifecycle (Q5)`, with its default binding
immediately before the anchor,
and — for the settings block and the two bulk buttons if Q6 had not landed — a
`Deferred wiring` section reproducing those mountings verbatim for Q7.
