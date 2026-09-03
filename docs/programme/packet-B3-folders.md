# Packet B3 — Session folders UI: shelf, headers, menus, colour picker, drag & drop

Role: you build the folder organisation UI in the bb-sidebar fork on top of B1's
state layer and B2's row states. Read
`/home/system/workspaces/LAL/Development/plans/glass-sidebar/00-brief.md` in
full first (§3, §4.2, §4.3, §4.4, §5 bind you). B1 and B2 have landed on the
branch and were reviewed; their reports are appended at the bottom of your
prompt.

Working directory: `/home/system/workspaces/LAL/Development/forks/bb-sidebar` (branch `feat/folders-colors-glass`).

## Read

1. The brief; then `/home/system/workspaces/LAL/Development/plans/glass-sidebar/01-marketplace-references.md` sections 1, 2, and 5 (binding: reuse Thread Inbox's reorder pattern and Tinted Threads' inline color-mix technique); then frames `/home/system/.bb/thread-storage/thr_3uy6dx4vfp/frames/nikolay_dp-2026-09-02T115849_001.png`, `_003.png`, `_004.png`, `_005.png` (view them: folder header, wash, "+ New session", collapsed folders stacked, inline rename).
2. B1 outputs: `src/organization.ts`, `src/useOrganization.ts`, `src/accent.ts` (whole files) and the `organization` section of `src/server.ts` (grep `createFolder` and read that RPC block only).
3. B2 outputs: `src/pane-state.ts`, `src/AccentRail.tsx`, and `src/ThreadCard.tsx` (whole, to see the `accent` prop and the row root).
4. `src/ThreadInbox.tsx` — lines 1–120 (imports, helpers), 130–260 (shelf expansion, sort modes, `visibleShelfThreads`), 251–470 (component state, `pinned`/`inbox`/`inactive` derivation), 780–900 (reorder wiring, `renderActiveThread`), 1000–1180 (the JSX tree of shelves), 1323–1452 (`CollapsibleShelf`, `Shelf`, `ProjectGroups`). Skim only what you need between.
5. `src/usePinnedReorder.ts`, `src/useInboxReorder.ts`, `src/pinned-order.ts` — the pointer-drag reorder pattern (find where `reorder.onPointerDown` / `onKeyDown` are produced: grep `ThreadReorderControls` in `src/ThreadCard.tsx` and `src/ThreadInbox.tsx`) and reuse the same mechanics for folder reorder and thread-into-folder drops. No new dependency.
6. `src/RowContextMenu.tsx` (whole) and `src/InlineThreadTitle.tsx` (whole) — you extend the menu and reuse inline rename.
7. `src/components/Icon.tsx` (to know the icon API; icons come from `@hugeicons/core-free-icons` through it) and `src/components/Tooltip.tsx`.
8. `src/ThreadInbox.test.tsx` lines 1–120 and one shelf test (grep `Pinned`) for the testing pattern; `renderSlot`'s `rpc` option lets you stub `getOrganization` and the mutations.
9. monocode reference (model only): `/home/system/workspaces/LAL/Development/monocode/src/chrome/ColorPickerPopover.tsx` lines 1–120 (`ColorSwatchRow`) and `src/chrome/Sidebar.tsx` lines 540–700 (folder menu items and the create/join/remove handlers).

## Produce (new files unless stated)

- `src/FolderShelf.tsx` — renders the folders section per brief §4.4: `FolderHeader` (button; chevron, colour dot, name, count, hover menu trigger, `aria-expanded`, `data-folder-id`), members via the `renderThread` render-prop passed from `ThreadInbox`, `+ New thread` footer, drop-target highlight (`ring-1 ring-primary/50` on the header or an insertion line between members) while a drag is over it.
- `src/FolderMenu.tsx` — the folder context/hover menu (Radix context-menu / dropdown as already vendored in the fork; reuse whatever `RowContextMenu.tsx` uses): Rename, Colour ▸, Collapse/Expand, New thread here, Dissolve folder.
- `src/AccentPicker.tsx` — a swatch row of the 8 palette colours + "none" + a custom `#rrggbb` text input (validated with `parseCustomHex`), used by both the folder menu and the thread menu. `aria-pressed` on the selected swatch; keyboard: arrows move, Enter selects.
- `src/useFolderDrag.ts` — pointer-based drag controller shared by folder headers and thread cards: threshold 5 px; computes the drop target from `document.elementFromPoint` on `[data-folder-id]` / `[data-sidebar-thread-id]` under the pointer; exposes per-item `{ onPointerDown, onKeyDown }` and the current `{ draggingId, target }` for highlight rendering; performs `moveThreadToFolder`, `createFolder` (drop on ungrouped card), `reorderFolders`, `reorderFolderThreads` through `useOrganization().actions`. Cards outside folders keep the existing inbox/pinned reorder; a card drag that ends over a folder header or folder member becomes a move. Never `preventDefault` on pointerdown (split drag must survive).
- `src/folder-list.ts` — pure helpers: `partitionByFolder(threads, org)` → `{ folderEntries: { folder, members }[], ungrouped }` honouring lifecycle (a member that is settled/snoozed/archived is excluded from `members` and left to its shelf), `dropTargetFromPoint(...)` given a list of element rects (testable without DOM). Tests in `src/folder-list.test.ts`.
- `src/ThreadInbox.tsx` — minimal edits: call `useOrganization()`, compute the partition, render `<FolderShelf>` above Pinned, remove folder members from `pinned`/`inbox`/`inactive` before those shelves render, pass `accent={accentCss(resolveAccent(thread.id, thread.projectId, org))}` into `renderActiveThread`'s `ThreadCard`, and pass the folder drag controls to cards. Keep every existing prop and behaviour.
- `src/RowContextMenu.tsx` — add `Move to folder ▸` (existing folders + `New folder…`), `Remove from folder`, `Colour ▸` (AccentPicker with Clear). The menu receives the organisation api via props, not a module singleton.
- `src/SidebarSettings.tsx` — add a "Project colours" block under the existing project icons: per project a swatch row bound to `setProjectAccent` (list projects from `useSidebarThreads().projects`). Keep it short; reuse `AccentPicker`.
- Tests: `src/FolderShelf.test.tsx` (render with two folders and stubbed rpc: header text and count, collapse toggles call `setFolderCollapsed`, members hidden from Pinned/Active, wash style present when colour set, `+ New thread` calls `openNewThread` with the member's project, menu → Rename opens inline editor and commits `renameFolder`), `src/folder-list.test.ts`, and a `RowContextMenu` test for `Move to folder` calling `moveThreadToFolder`. Drag logic: unit-test `dropTargetFromPoint` and the controller's decision function with fake rects rather than pointer simulation.

## Constraints

- Brief §5 **Preservation rule** applies: keep every existing feature, export, RPC, table, setting, and test; extend, never replace.

- Folder headers and member rows must keep bb's keyboard contract: member anchors keep `data-sidebar-thread-shortcut-target` and `data-sidebar-thread-id`.
- Use only token classes; user colours via `--thread-accent` inline style (B2) and `accentWash` inline background on headers.
- Do not touch `server.ts`, `accent.ts`, `organization.ts`, `pane-state.ts`, `PaneGlyph.tsx`, `AccentRail.tsx`.
- Bounded: ≤ 60 folders, ≤ 500 member rows; no virtualization.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts` (all green, baseline + B1 + B2 + yours). Commit: `git add src/FolderShelf.tsx src/FolderMenu.tsx src/AccentPicker.tsx src/useFolderDrag.ts src/folder-list.ts src/folder-list.test.ts src/FolderShelf.test.tsx src/ThreadInbox.tsx src/RowContextMenu.tsx src/SidebarSettings.tsx <other tests you touched> && git commit -m "[B3] session folders with colours, menus, and drag & drop"`. Report per brief §5.
