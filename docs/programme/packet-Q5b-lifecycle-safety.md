# Packet Q5b — Auto-settle must never settle live work (two held defects)

Work in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`
(HEAD at or after the `[Q5 repair 2]` commit 0f0df4e; Q1–Q6 integrated).
Read brief §5, `packet-Q5-lifecycle.md` (the lifecycle contract; especially
the live-work protection and the single 5-minute `bb.background.schedule`),
then `server.ts` lines 1300–1500 (live-signal store, policy evaluation,
sweep) and `src/server.test.ts` lifecycle sections in full. Server bundle
budget is now 1024 KB (contract test updated).

## The two defects (from the Q5 gate, unresolved after two rounds)

1. `server.ts` ~1373–1403: the `MAX_LIVE_SIGNAL_ENTRIES` eviction loop can
   evict the oldest still-live thread without an explicit quiet signal or
   `thread.deleted`. Successive schema-valid partial snapshots can accumulate
   more than 10,000 IDs, after which a scheduled sweep may settle live work.
2. `server.ts` ~1443–1457: a quiet snapshot arriving after an in-flight
   policy pass has decided is coalesced without a follow-up evaluation. The
   quiet call adds no newly-live IDs while the frozen `policyEvaluationLive`
   still contains the thread, so the release is not evaluated until an
   unrelated future trigger.

## Produce

1. Remove the cap and the eviction loop: a client live hold ends only on an
   explicit quiet snapshot or on thread deletion. Bound memory instead by
   pruning IDs whose threads no longer exist at sweep time (a read of the
   host thread list the sweep already performs), never by age or count.
   Regression test: report 10,001 distinct live IDs across several valid
   calls, run the sweep, prove the earliest eligible thread remains
   unsettled.
2. Track every live-store membership change that the in-flight decision did
   not see (a generation counter or dirty flag set on every membership
   change) and schedule exactly one follow-up pass after the in-flight pass
   completes; derive the decision-point client-live set from current state.
   Test: gated live→quiet concurrency proving a single immediate publication
   and idempotence on repeat.
3. Keep the timer allowlist unchanged (no new timers; the follow-up pass is
   chained from the in-flight promise, not scheduled on a clock).

## Verify

`npx tsc --noEmit`; `npx vitest run` (run twice; the FolderShelf inline-rename
test was flaky once in the audit — if it fails, report it as non-blocking
flakiness with the rerun result, do not edit it); `bb plugin build`;
`node --test test/*.test.mjs`; bundle sizes reported. Commit only touched
files with explicit paths, subject exactly `[Q5b] auto-settle never settles
live work`. Report per brief §5.
