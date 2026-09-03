# Packet B2 — Row states: focused vs open-in-split vs idle, accent rail, pane glyph

Role: you fix the core bug — make a focused thread row, an open-in-split row,
and an idle row unmistakably different — on every row component of the
bb-sidebar fork, and add the accent rail hook. Read
`/home/system/workspaces/LAL/Development/plans/glass-sidebar/00-brief.md` in
full first (§1, §2, §4.1, §4.2, §5 bind you).

Working directory: `/home/system/workspaces/LAL/Development/forks/bb-sidebar` (branch `feat/folders-colors-glass`).

## Read

1. The brief, then `/home/system/workspaces/LAL/Development/plans/glass-sidebar/01-marketplace-references.md` sections 1 and 5 (binding), then the bug screenshot `/home/system/.bb/thread-storage/thr_3uy6dx4vfp/Attachments/Screenshot-2026-09-02-at-14.58.16-1788375545240-via0yu.png` (view it).
2. `src/ThreadCard.tsx` (whole file), `src/SlimRow.tsx` (whole), `src/SearchResults.tsx` lines 100–200, `src/StatusSlot.tsx`, `src/lib/utils.ts`.
3. `src/ThreadInbox.tsx` lines 860–900 only (`renderActiveThread`, the one place cards are constructed) and lines 1280–1300 (`SlimRow` use).
4. SDK types: `node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts` lines 1030–1077 (`PluginSidebarSplitPane`, `PluginSidebarThreadSplit`).
5. Host reference for the glyph: `/home/system/workspaces/LAL/Development/bb/bb-0.41.0/apps/app/src/components/sidebar/SplitPaneMiniMap.tsx` (whole, 80 lines).
6. `src/ThreadInbox.test.tsx` lines 1–120 (harness + `renderInbox` helper) and grep it for `aria-current` to find the existing active-row assertions you must keep green.

## Produce

- `src/pane-state.ts` — pure: `type PaneState = "focused" | "open" | "none"`,
  `resolvePaneState(isActive: boolean, layout: PluginSidebarThreadSplit["layout"]): PaneState`,
  `paneOrdinal(panes): { index: number; count: number } | null` (order by `rect.x`, then `rect.y`; index is 1-based for the `isMe` pane),
  `rowStateClasses(state: PaneState, hasAccent: boolean): string` returning the Tailwind classes from brief §4.1 (background, ring/outline, title weight are separate exports if that is cleaner: `rowSurfaceClass`, `rowTitleClass`, `railClass`). Tests in `src/pane-state.test.ts`.
- `src/PaneGlyph.tsx` — the 14 px mini-map SVG + `Pane N of M` chip from brief §4.1, props `{ panes, className? }`, `aria-label` "Open in pane N of M, focused" / "…, not focused". Snapshot-free test in `src/PaneGlyph.test.tsx` asserting rect count, the filled `isMe` rect class, and the chip text.
- `src/AccentRail.tsx` — `<AccentRail state={paneState} />`: an absolutely positioned 3 px rounded bar at the row's left edge using `bg-[var(--thread-accent,var(--primary))]`-style arbitrary value is NOT allowed by the build's Tailwind pass; use an inline `style={{ background: "var(--thread-accent, var(--primary))", opacity }}` with the opacities from §4.1 and `aria-hidden`. Renders nothing for `none` when the row has no `--thread-accent` (pass `hasAccent` prop).
- `src/ThreadCard.tsx`, `src/SlimRow.tsx`, `src/SearchResults.tsx` (its row) — replace the old `isActive` / `layout !== null` tint logic with `resolvePaneState`, apply `data-thread-pane-state` on the row root `<div>` (the `group/card` element), the classes from `pane-state.ts`, the `AccentRail`, and the `PaneGlyph` on the first line (right after the project name, before the pinned button) when state ≠ `none`. Add an optional prop `accent?: string` (already-resolved CSS colour) to each row component; when present set `style={{ "--thread-accent": accent } as React.CSSProperties}` on the row root. `ThreadInbox.tsx`: pass `accent={undefined}` for now — do not wire organisation data (B3 does); make exactly that one-line change per call site and nothing else in that file.
- Keep `aria-current="page"` semantics exactly as today (only `isActive`).
- Keep the multi-select `isSelected` ring; when both selected and focused, selected ring wins.

## Constraints

- Tailwind token classes only (`bg-sidebar-accent`, `ring-primary/60`, `outline-primary/50`, `text-foreground`, …). If a needed utility is not emitted by the build (arbitrary values are not), use inline style with `var(--token)`.
- Do not create `src/accent.ts` unless B1's is absent when you finish; if absent, add a stub with only `accentCss` + `ACCENT_PALETTE` and say so.
- Do not touch `server.ts`, `RowContextMenu.tsx`, or the list structure.

## Verify

Existing tests must stay green; add tests: `resolvePaneState`, `paneOrdinal` orderings (1×2, 2×2 grid, single pane returns null), `rowStateClasses` per state, rendered `data-thread-pane-state="focused"` when `isActive`, `"none"` otherwise (the harness reports no layout), `--thread-accent` style presence when `accent` is passed. `npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`. Commit: `git add src/pane-state.ts src/pane-state.test.ts src/PaneGlyph.tsx src/PaneGlyph.test.tsx src/AccentRail.tsx src/ThreadCard.tsx src/SlimRow.tsx src/SearchResults.tsx src/ThreadInbox.tsx <any test file you changed> && git commit -m "[B2] distinct focused / open-in-split / idle row states with accent rail"`. Report per brief §5.
