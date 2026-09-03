# Packet P5 — Sidebar: a thread card must signal a running workflow even when the thread itself is idle

Work in `/home/system/workspaces/LAL/Development/forks/bb-sidebar`, branch
`feat/folders-colors-glass` (after P2 has landed; its report is in your prompt
appendix). Read brief §2, §4.1, §4.5, §5 (Preservation rule) and addendum §1
(Sidebar Project Filter's definition of "running") first.

User direction (2026-09-02): "the sidebar thread card should signal/identify
when a workflow is running, even though the actual thread isn't working."

## Read

1. `src/ThreadCard.tsx` (whole): the `emphasis` derivation near the top, the `StatusSlot` usage, and the activity chips around line 325 (`thread.activity.workflows`).
2. `src/StatusSlot.tsx`, `src/StatusGlyph.tsx` (whole), `src/live-strip.ts` (`classifyNow`), `src/LiveStrip.tsx` (Now row), `src/SlimRow.tsx`, `src/pane-state.ts` (row classes).
3. SDK: `node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts` lines 855–930 (`PluginSidebarThreadActivity`, `indicator`, `indicatorLabel`).
4. Host precedence, to know when `indicator` becomes `"workflow"`: `/home/system/workspaces/LAL/Development/bb/bb-0.41.0/packages/client-core/src/` — grep `resolveThreadListIndicator` and `hasActiveWorkflowActivity` and read those functions only.
5. Live evidence: a workflow run is in progress from thread `thr_3uy6dx4vfp` (project `proj_3fs96txjp3`). Before coding, write a 20-line vitest or a one-off script against `experimental_useSidebarThreads` is not possible outside the app, so instead inspect what the host reports: `bb workflows list --limit 3 --json` for the run, and `bb thread list --json` (or the sidebar-bootstrap API the fork's tests stub) for the origin thread's `activity.workflows` and `indicator`. Record what you found in the report; it decides which branch below applies.

## Produce

Whichever the host reports, the card must show an unmistakable **workflow
running** state:

- **Emphasis**: in `ThreadCard.tsx`, treat `thread.activity.workflows > 0` (and, per the addendum, any non-zero `backgroundAgents`, `backgroundCommands`, `planMode`, `goals`) as working for the `emphasis` value and for `canPark`-style gating that already exists, without changing the `isUnread`/`isWoke` precedence above it.
- **Status slot**: when the host `indicator` is not already a working kind but `activity.workflows > 0`, render the workflow glyph (animated, `animate-shine-icon` as the host does) in the status slot instead of the age, with the accessible label "Workflow running" (or the host's `indicatorLabel` when present). Same for `SlimRow` and search results.
- **Chip**: keep the existing activity count chip and make the workflow one read "Workflow · N" with the accent colour, so the count and the glyph agree.
- **Rail pulse**: the accent rail from B2 gets a subtle pulse (`animate-pulse`, motion-reduce off) while a workflow runs, so the running state is visible even on an idle-coloured row.
- **Now row**: `classifyNow` must return `"working"` for any non-zero activity count, not only for indicator kinds (addendum rule 2); the row shows "Workflow" as its status text and the workflow glyph.
- **Folders and live chips**: the folder header shows a small workflow glyph when any member has a running workflow; the "Open panes" chip likewise.
- **Hidden-thread case**: workflow workers run in hidden threads; only the origin thread appears in the sidebar. If the host reports `activity.workflows` on the origin thread, use it. If it reports nothing (record this), add a server-side fallback: `bb.sdk.workflows`-style listing is not in the SDK, so poll `bb workflows list` is not allowed either; instead subscribe to the host events the fork already handles (grep `bb.events.on` in `server.ts`) for `workflow.*` events if they exist (check `backend-events.md` event names); if there is no such event, stop and report the gap with the exact SDK evidence instead of inventing a poller.

## Tests

Card with `activity.workflows = 1` and indicator `none` → status slot shows the workflow glyph with the accessible label and the row root carries `data-thread-working="workflow"`; `classifyNow` returns working for each non-zero activity count; Now row lists such a thread; folder header glyph when a member has a workflow; SlimRow parity. Full suite stays green and only grows (baseline after P2).

## Constraints

Preservation rule; token classes only; no reload. Commit `[P5] signal running workflows on thread cards`.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`. Report per brief §5, including what the host reported for the origin thread during the live run.
