# Packet B4 — Live strip: "Open panes" and "Now" at the top of the sidebar

Role: you add the two compact live rows described in brief §4.5 to the
bb-sidebar fork. Read
`/home/system/workspaces/LAL/Development/plans/glass-sidebar/00-brief.md` in
full first (§3, §4.1, §4.2, §4.5, §5 bind you). B1, B2, and B3 have landed and
were reviewed; their reports are appended at the bottom of your prompt.

Working directory: `/home/system/workspaces/LAL/Development/forks/bb-sidebar` (branch `feat/folders-colors-glass`).

## Read

1. The brief; then `/home/system/workspaces/LAL/Development/plans/glass-sidebar/01-marketplace-references.md` sections 1 and 5 (binding: 'running' and 'needs you' definitions, Cascade card grammar, provider brand colours); frames `/home/system/.bb/thread-storage/thr_3uy6dx4vfp/frames/yiliush-2026-09-02T000030_001.png` and `cube_001.png` (view: the rail shows every open session with a status glyph; open columns are legible in order).
2. `src/pane-state.ts` (B2: `paneOrdinal`, `resolvePaneState`), `src/PaneGlyph.tsx`, `src/StatusGlyph.tsx` (whole), `src/ProviderGlyph.tsx` lines 1–40, `src/relative-time.ts`, `src/accent.ts` and `src/organization.ts` exports (`resolveAccent`, `accentCss`).
3. `src/ThreadInbox.tsx` — lines 251–300 (component head), the lines where `useOrganization()` and the folder partition were added by B3 (grep `useOrganization`), and lines around the scroll container `<div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">` (grep it) where your strip mounts as the first child. Read nothing else in that file.
4. `src/ThreadInbox.test.tsx` lines 1–120 for the harness; `src/ThreadCard.tsx` lines 90–110 for how `useSidebarThreadSplit` is called per row.
5. SDK: `node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts` lines 855–930 (`PluginSidebarThreadIndicator`, `PluginSidebarThread`) and 1050–1077 (split hook shape).

## Produce

- `src/split-registry.ts` — tiny external store: `reportPane(threadId, entry | null)`, `subscribe`, `getSnapshot` (stable array sorted by ordinal). Tests.
- `src/SplitProbe.tsx` — `<SplitProbe threadId>`: calls `experimental_useSidebarThreadSplit(threadId)`, derives `{ ordinal, count, isFocused }` via `paneOrdinal`, reports to the registry in an effect, cleans up on unmount, renders null.
- `src/LiveStrip.tsx` — `OpenPanesRow` and `NowRow` per brief §4.5, each wrapped in a collapsible header (reuse the `CollapsibleShelf` look: `text-2xs` label, hairline, chevron) with persisted state under `bb-sidebar.liveStrip.openPanes` / `.now` in localStorage (guard `typeof localStorage`). Props: `threads`, `projectNameById`, `accentFor(thread)`, `activeThreadId`, `onNavigate`, `actions`. Chip and row semantics exactly as §4.5, including hidden-when-fewer-than-two-panes and hidden-when-empty.
- `src/live-strip.ts` — pure: `classifyNow(thread): "needs-you" | "working" | null`, `nowRows(threads, max = 8)` (needs-you first, then working by `updatedAt` desc, returns `{ rows, overflow }`), `chipLabel(title, max = 18)`. Tests in `src/live-strip.test.ts`.
- `src/ThreadInbox.tsx` — minimal edits: mount `<SplitProbe>` for each thread the inbox renders (pinned, active, folder members; a single `threads.filter(...)` list) and `<LiveStrip …>` as the first child of the scroll container. No other changes.
- Tests: `src/LiveStrip.test.tsx` — with seeded `sidebarThreads` (harness reports no split layout, so `OpenPanesRow` renders nothing — assert that) and threads with indicators `waiting-for-input`, `runtime`, `unread-success`, `none` → `NowRow` shows the first two in that order, with `text-attention` on the needs-you row; collapse persists; click opens via `sidebarActionCalls`; overflow `+N more` at 9+ rows. Registry tests: ordering and cleanup.

## Constraints

- Brief §5 **Preservation rule** applies: keep every existing feature, export, RPC, table, setting, and test; extend, never replace.

- Hooks per thread only inside `SplitProbe`; never call the split hook in a loop.
- Token classes only; accents via inline `style` from `accentCss`.
- Do not touch `server.ts`, B1/B2/B3 files other than the two edit points in `ThreadInbox.tsx`.

## Verify

`npx tsc --noEmit`; full vitest green. Commit: `git add src/split-registry.ts src/split-registry.test.ts src/SplitProbe.tsx src/LiveStrip.tsx src/LiveStrip.test.tsx src/live-strip.ts src/live-strip.test.ts src/ThreadInbox.tsx && git commit -m "[B4] live strip: open panes and now rows"`. Report per brief §5.
