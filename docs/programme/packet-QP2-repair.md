# Packet QP2 — Repair the port packets Q1–Q7 (plans only)

Edit only the seven files `packet-Q1-rows.md` … `packet-Q7-import-switchover.md`
in `/home/system/workspaces/LAL/Development/plans/glass-sidebar/`. No code,
no builds, no commits. Read `00-brief.md` §4–5, `02-own-plugin-plan.md` §7,
`packet-Q0-scaffold.md`, and the seven packets in full.

The QP review held the packets on four blockers. The orchestrator has taken
these decisions; apply them exactly:

1. **Hook anchors (Q1 Produce 8).** Every default `let` binding is declared
   BEFORE its `@hooks:*` anchor; downstream packets insert `binding =
   useHook()` immediately AFTER the anchor. Keep all anchors and assignments
   above `renderActiveThread` in the fixed order. Update the prose and the
   anchor test in Q1, and every downstream packet's insertion instruction
   (Q2–Q6) so they match.
2. **Dependencies are declared honestly instead of stubbed.** Q2 and Q4 use
   Q1's `src/row-props.ts`; Q4's `accent-source.ts` uses Q2's `resolveAccent`.
   Therefore set: Q2 depends on Q1; Q3 depends on Q1; Q4 depends on Q1 and
   Q2; Q5 depends on Q1; Q6 depends on Q1; Q7 depends on Q1–Q6. Remove every
   "standalone / Q0-only build" claim and every local fallback that existed
   only to cover a missing upstream packet (in particular Q4's three-step
   fallback). Record the resulting wave order at the top of Q1:
   wave 1 `Q1`; wave 2 `Q2, Q3`; wave 3 `Q4, Q5, Q6`; wave 4 `Q7`.
   Update `02-own-plugin-plan.md` §7's table to the same dependencies (that
   file may be edited for this purpose only).
3. **No fifth mount RPC (Q5).** Remove the separate mount-time
   `evaluateAutoSettle` call. The initial idempotent evaluation happens
   inside the existing `listLifecycle` handler on the server; later
   evaluations are signal-driven or run on the preserved 5-minute
   `bb.background.schedule` only. Q7's audit must observe the complete
   initial mount and effect-settling window (use the SDK testing runtime's
   RPC call log after `await` of all pending effects) and assert that no
   fifth automatic RPC occurs.
4. **Q7 runbook.** State how the plugin is installed without becoming the
   active thread-list claimant: `bb plugin install <dir> --yes` followed
   immediately by `bb plugin disable glass-sidebar` in the same step, with
   `forks/check-plugin-slot-conflicts.py` run before enabling; the import
   runs with the plugin enabled but `bb-sidebar` still enabled is NOT
   allowed, so the sequence is: install → disable → `bb plugin disable
   bb-sidebar` → `bb plugin enable glass-sidebar` → `bb glass-sidebar import`
   → eye check → (rollback = reverse). Also extend Q0's contract-test gap
   noted by the audit: Q7 adds a line making the wildcard-import scan cover
   root `server.ts` and `app.tsx` as well as `src/`.

Final message: report per brief §5 listing, per packet, the edits made for
each of the four items, plus the new dependency table.
