# Packet Q3b — Expanded columns mode for the Open panes strip

Instantiated from `packet-Q3b-columns-research.md` §4 (recommended option, scored 15/15). Work in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar` after Q3 has landed. Refresh the two stale d.ts line pointers noted by the QR review (PluginThreadHeaderActionProps ≈ line 484, PluginSidebarThreadSplit ≈ line 1174) by grepping before relying on them.


Role: add an expand/collapse toggle to Q3's OpenPanesRow that swaps its
compact chip row for a horizontally scrolling card grid — the "session
columns" view — reusing Q3's data with no new RPC. Read `00-brief.md` §4.1,
§4.2, §4.5 and this note first. Depends on Q3 (must land first).

Working directory: `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`
(path fixed by Q0's scaffold; confirm against Q0's report before starting).

### Read
1. This note (packet-Q3b-columns-research.md) in full.
2. Q3's `src/split-registry.ts`, `src/live-strip.ts`, `src/LiveStrip.tsx`
   (whole — these are the files this packet extends).
3. `src/pane-state.ts` exports (`paneOrdinal`), `src/accent.ts` exports
   (`accentCss`), `src/relative-time.ts`, `src/StatusGlyph.tsx`,
   `src/ProjectGlyph.tsx` (or Q4's equivalent once absorbed — check which
   has landed).
4. Q3's workflow-activity query module and its row shape (name in Q3's
   report; likely `workflow-activity.ts`).

### Produce
- `src/columns-view.ts` — pure: `buildColumns(panes, threads, workflowRows,
  accentFor): ColumnViewModel[]`, one entry per pane in `paneOrdinal` order,
  each `{ threadId, ordinal, isFocused, title, projectGlyph, projectAccent,
  statusGlyph, elapsed, workflowRows: WorkflowRow[] }` with `workflowRows`
  needs-you-first sorted (reuse `live-strip.ts`'s `classifyNow` ordering
  rule). Unit tests: ordering, needs-you-first, focused flag, empty-panes
  case.
- `src/LiveStrip.tsx` — minimal edit: `OpenPanesRow` gains a collapsed
  header toggle button ("Columns" / chevron) persisted in localStorage
  under `glass-sidebar.liveStrip.openPanes.expanded` (guard `typeof
  localStorage`, same pattern as the row's existing collapse state). When
  expanded, render a `ColumnsStrip` (new, same file or a co-located
  `ColumnsGrid.tsx`) — a `overflow-x-auto` flex row of cards from
  `buildColumns`, min-width ~160px each, `snap-x` scroll. Card click →
  `actions.open(threadId)`; ⌘/Ctrl-click → `actions.open(threadId, { split:
  true })` (identical handler Q3 already wrote for chips). Still hidden
  entirely below two panes, per §4.5.
- No new SQLite table, no new RPC, no new subscription: `buildColumns`
  consumes the same `split-registry` snapshot and thread list Q3 already
  subscribes to.

### Tests
`src/columns-view.test.ts` (pure logic per above). `LiveStrip.test.tsx`
gains: expand toggle persists across remount; expanded view renders one
card per seeded pane in ordinal order (test runtime cannot seed a split
layout, so assert the pure `buildColumns` output feeds the render, per the
same limitation Q3's own tests note); collapsed state still renders chips
unchanged (no regression to Q3's existing assertions).

### Weight budget (binding)
- No new dependency (`package.json` unchanged).
- App bundle growth from this packet < 40 KB (it is markup and one pure
  module; no icon set additions — reuse `StatusGlyph`/`ProjectGlyph`).
- No new timers. No new mount-time RPC (0 added; still within Q3's ≤ 4
  mount RPC budget from `02-own-plugin-plan.md` §4).

### Verify
`npx tsc --noEmit`; full vitest green; grep the built `dist/app.js` for any
accidental wildcard icon import (per the weight-budget contract test Q0
adds).

### Report
Per brief §5 report shape.
```

