# Packet Q1b — Related-thread rows must honour the route-active thread

Work in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`
(HEAD `aa6a2d4` or later; Q1, Q2, Q3 are integrated). Read brief §4.1,
`packet-Q1-rows.md` (the pane-state contract and the anchor rules), then
`src/RelatedThreadTree.tsx`, `src/ThreadCard.tsx`, the `renderActiveThread`
region of `src/ThreadList.tsx`, `src/pane-state.ts`, and
`src/RelatedThreadTree.test.tsx` in full.

## The defect (from the Q1 gate, unresolved after two rounds)

`RelatedThreadNode` calls `resolvePaneState(false, layout)`; neither
`RelatedThreadTree` nor `RelatedThreadNode` receives a route-active signal.
When a related child is the route's active thread and it is not in a split
(`layout === null`), its row gets `data-thread-pane-state="none"`; brief
§4.1 requires `focused` whenever `isActive === true`. `ThreadList` passes
only the parent card's `isActive` and `ThreadCard` does not forward the
active thread id to the tree.

## Produce

1. Carry `activeThreadId` (or a per-node `isActive`) from `ThreadList` →
   `ThreadCard` → `RelatedThreadTree` → every recursive `RelatedThreadNode`
   call, and resolve with `resolvePaneState(node.thread.id === activeThreadId, layout)`.
   Do not change any anchor, any exported name, or any other packet's file
   beyond the minimal prop threading.
2. Test in `src/RelatedThreadTree.test.tsx`: the related child is route-active
   and the mocked split layout is `null` → `data-thread-pane-state="focused"`,
   focused classes and rail present; the existing split pointer and open
   behaviour unchanged; a non-active child with `layout === null` stays `none`.

## Verify

`npx tsc --noEmit`; `npx vitest run`; `bb plugin build`; `node --test test/*.test.mjs`;
bundle budget unchanged. No timers, no new dependencies. Commit only the
files you touched with explicit paths, subject exactly
`[Q1b] related-thread rows honour the active thread`. Report per brief §5.
