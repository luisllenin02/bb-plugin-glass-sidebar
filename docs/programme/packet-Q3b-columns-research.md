# Packet Q3b research — a cube.computer-style "session columns" view

Plans only. No code touched, no build run, nothing committed. This note is
the deliverable required by `packet-QR-columns-research.md`; it is written so
it can be run as packet Q3b in the own plugin (`bb-plugin-glass-sidebar`),
after Q3 ("Live strip and workflow rows", `02-own-plugin-plan.md` §7).

Scoring convention used throughout: **3 = best (cheapest / most usable), 0 =
worst**, on all five axes including "effort" (3 = low effort, 0 = high
effort). The packet did not fix a direction, so this note states one and
holds it consistently.

## 1. Candidate surfaces

A plugin cannot replace bb's pane manager: split creation, split placement,
drag-to-split, and pane arrangement are host-internal
(`plugin-sidebar-thread-list.md` §6, "What the host does not give you" —
reorder and moving a thread into a pane arrangement "stay host-internal").
Every candidate below is therefore a **navigator** — it shows what is open
and jumps to it via `actions.open(threadId, { split })` — never a second pane
renderer. None of them may reimplement drag-to-split, and none can draw
live thread content the way Cascade's `ThreadChat` columns or cube's actual
terminal panes do (see §3).

| Candidate | Zero bg cost | No new dep | Phone usable | 1-tap open + ⌘-click split | Effort (3=low) | Total /15 |
|---|---|---|---|---|---|---|
| A. `navPanel` full-page columns view | 3 | 3 | 2 | 3 | 1 | 12 |
| B. `homepageSection` overview | 3 | 3 | 1 | 2 | 2 | 11 |
| C. Expanded mode of the existing Open panes / Now strip | 3 | 3 | 3 | 3 | 3 | **15** |
| D. Command-palette-triggered overlay | 2 | 2 | 2 | 3 | 1 | 10 |

Reasoning per candidate:

**A. `navPanel`.** Registers a whole route (`app.slots.navPanel`,
`bb-plugin-sdk-app.d.ts:740-778`). Own page, own `fixedTabs`,
`experimental_sidebarAccessory`, `headerContent`. Zero cost when the route
isn't open, no dependency needed (plain CSS `overflow-x: scroll` grid).
Costs: `PluginNavPanelProps` carries only `subPath`
(`bb-plugin-sdk-app.d.ts:344-355`) — no `isCompactViewport` flag the way
`experimental_threadHeaderAction` gets one (`:365-373`), so phone-vs-desktop
layout must be done with a hand-rolled `matchMedia` check inside the panel,
costing a point on "phone usable." Effort is the highest of the four: a new
route, a new page shell, and a sidebar entry point to reach it, duplicating
UI the strip already has.

**B. `homepageSection`.** Renders only on the compose homepage
(`PluginHomepageSectionProps` = `{ projectId }`,
`bb-plugin-sdk-app.d.ts:332-336`). Cheap and dependency-free for the same
reasons as A, but wrong place for this use case: an attorney running four to
six matter threads is not usually on the homepage while working, so a
navigator that only appears there is the least likely surface to be seen at
the moment it matters. Scored down on phone usability for the same reason —
mobile users reach the homepage to start new work, not to check on running
threads.

**C. Expanded mode of the existing Open panes / Now strip.** B4 (fork) /
Q3 (own plugin) already builds every piece this needs: `split-registry.ts`
(pane order, `isFocused`, per-thread), `live-strip.ts` (`classifyNow`,
`nowRows`), and `LiveStrip.tsx`'s `OpenPanesRow` chips
(`packet-B4-live-strip.md` lines 21-26). "Expanded" only swaps the chip
row's rendering for a wider card grid inside the same always-mounted
thread-list root, on the same subscriptions, with no new RPC and no new
mount point. That is why it wins on every axis: no background cost beyond
what Q3 already pays, no dependency, works in a narrow phone drawer as a
horizontally scrolling card row (the format cube's own rail uses at similar
width), the same `actions.open` handlers Q3 wired up already do the tap and
⌘/Ctrl-click split, and the implementation is additive to a shipped file
rather than a new surface.

**D. Command-palette-triggered overlay.** `commandPaletteAction`
(`bb-plugin-sdk-app.d.ts:1391-1407`) only registers a row with a `run()`; it
draws nothing itself. An overlay would have to be a plugin-owned portal
mounted from an always-present component (the thread-list root, per the
popover pattern host doc §7 describes for the thread-header slot) and
toggled by a module-level flag the palette action's `run()` sets. Feasible
without a new dependency (hand-rolled focus trap + `Escape` handling), but
that hand-rolled a11y work is real effort and risk, and a full-screen modal
competes with the thread-header's own popover portals for z-index and focus
return. Scored down on "no new dep" only because "no dependency" here still
means writing a modal's worth of focus-management code from scratch, which a
vendored popover primitive would normally cover.

## 2. The column model

One column per open pane, ordered by the existing `paneOrdinal` (B2/Q1
`pane-state.ts`), each showing: project glyph + colour, title, status glyph,
elapsed, and — for the pane holding the origin thread of a running
workflow — the workflow's rows nested under it, with "needs you" rows always
first and the focused column visually unmistakable (thicker/`ring-primary`
border, same treatment §4.1 of the brief gives a focused row).

What the host exposes cheaply (already paid for by Q1/Q3, reusable at zero
extra cost):

- **Pane identity and order** — `split-registry.ts`'s `reportPane` /
  `getSnapshot`, fed by `SplitProbe` calling
  `experimental_useSidebarThreadSplit` (`bb-plugin-sdk-app.d.ts:2340-2345`,
  shape at `:271-297`). `ordinal`, `isFocused`, `paneId` all come free once
  Q3's probes are mounted; a columns view is a second subscriber to the same
  registry, not a new query.
- **Title, indicator, activity** — already on the `PluginSidebarThread`
  objects `experimental_useSidebarThreads()` returns
  (`bb-plugin-sdk-app.d.ts:2308-2321`); `StatusGlyph` and `classifyNow`
  (`live-strip.ts`) already turn those into the glyph and the
  needs-you/working split the column header needs.
- **Elapsed** — `updatedAt` on the same thread object, through the existing
  `relative-time.ts` helper.
- **Project glyph/colour** — the accent-resolution chain in `accent.ts` /
  `organization.ts` (thread → folder → project) that rows and the strip
  chips already resolve; a column reuses the resolved value, no new lookup.
- **Origin-thread workflow rows** — Q3 already runs the read-only
  workflow-store query (`02-own-plugin-plan.md` §3, "workflow rows under the
  origin thread… P5; `workflow-activity.ts`"); a column nests the same rows
  it already fetched for the Now section, keyed by the pane's `threadId`.

What the host does **not** give, and this view must either invent locally or
drop:

- **How long a pane has been open.** Only `updatedAt` (thread last-activity)
  is available, not "when this pane was created." A column showing pane
  duration must timestamp it itself the first time `SplitProbe` reports a
  new `paneId`, stored in `split-registry.ts`'s own map — cheap (one
  `Date.now()` on report), but it is plugin state, not host data.
- **Compact-viewport signal outside the thread-header slot.** No
  `PluginSidebarThreadSplit` or `PluginSidebarThread` field says "this is a
  phone." Only `experimental_threadHeaderAction` gets `isCompactViewport`
  (`:370-372`). A columns view sizes itself with its own media query
  instead of a host flag.
- **Live per-step workflow detail beyond what the Now row already shows.**
  The workflow-activity query is a snapshot read (name/status/elapsed), not
  a timeline stream; asking a column for "what is the agent doing right
  now, this token" would mean subscribing to timeline data, which is
  exactly the heavy path §3 says to avoid. Do not build it — show the same
  coarse status the Now row shows, nothing finer.
- **Branch / worktree / machine identity.** Cube's rail groups by machine →
  repo → worktree; nothing in `PluginSidebarThread` or the split layout
  carries that (bb's plugin surface has no host-daemon/session tree
  equivalent exposed to plugins). Out of scope — the column model in this
  packet's brief (§QR "Produce" item 2) does not ask for it either.

## 3. Verdict on a "canvas" analogue

Drop it. Cube's rail and Cascade's overview (`refs/bb-plugin-cascade/README.md`
lines 55-62) both render **real, live content** per column — Cascade mounts
a `ThreadChat variant="compact"` per thread ("a dozen live chats, each
loading and streaming its own timeline"), and cube's screenshots
(`cube_001.png`, `cube_002.png`) show full live terminal panes, not
summaries. That is a fundamentally different, much heavier surface than a
thread-list replacement:

- It requires either mounting `ThreadChat`-class components per column
  (not available to a `experimental_threadList` slot at all — Cascade is a
  full app-level plugin using `experimental_NewThreadComposer` and
  `ThreadChat` directly, a different, bigger API surface than the
  thread-list slot this work is scoped to) or hand-drawing a canvas/SVG
  facsimile of pane content, which duplicates the host's own pane manager
  for no functional gain — the host already shows the real content the
  moment a pane is open.
- Either path breaks the packet's binding weight budget (`02-own-plugin-plan.md`
  §4: `dist/app.js` ≤ 300 KB, no `setInterval` beyond the two already-accepted
  exceptions, ≤ 4 mount-time RPCs). A dozen concurrently mounted rich
  components is not a "no heavy DOM" surface by any reading.
- Host doc §5 ("No host components") and §6 ("A plugin must not reimplement
  [split behavior], and does not have to") both point the same direction: a
  thread-list plugin's job is glyphs, menus, and navigation, not a second
  content renderer.

So: no canvas element, no canvas-drawing library, no per-column live chat.
The columns view stays a metadata card — text, glyphs, a colour dot, an
elapsed string — exactly the same weight class as the existing `LiveStrip`
chips, just laid out wider.

## 4. Recommended option and packet contract (Q3b)

**Recommendation: Candidate C — expand the existing Open panes strip in
place.** Score 15/15, ships as a small additive change to a file Q3 already
owns, and needs no new RPC, mount point, or dependency.

```
## Packet Q3b — Expanded columns mode for the Open panes strip

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

## Recommended option (one line)

Expand Q3's existing Open panes strip into a horizontally scrolling card
grid (Candidate C, 15/15) — no new RPC, no new dependency, no new mount
point, no live pane content or canvas; drop the canvas/live-chat analogue
entirely as out of budget and out of scope for a thread-list slot.
