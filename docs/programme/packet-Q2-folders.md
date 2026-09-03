# Packet Q2 — Organisation: folders, accents, menus, drag and drop, reorder

**Depends on: Q1.** Wave 2 with Q3. Downstream: Q4 and Q7.

**Integration gate (read before you start).** Q1 has landed and owns
`src/ThreadList.tsx` and `src/RowContextMenu.tsx`; insert Produce 7 and Produce
8 immediately after Q1's `@hooks:organization`, `@slot:folders`,
`@rows:accent` and `@menu:organization` anchors. Produce 9's settings block
plugs into `src/SidebarSettings.tsx`, which Q6 owns and may not yet have landed
in wave 2. Never stub Q6's file: if it is absent, report only that mounting as
`Deferred wiring` for Q7. Leave every anchor in place and never touch another
packet's anchor.

Work in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`.
This is a **port** of B1 + B3 (fork commits `b05fb38`, `98c533f`, `87c66e4`)
into the new tree. Read `00-brief.md` in full — §4.2, §4.3, §4.4 and §5 bind
you and are reproduced verbatim; §4.3's table names, column names and RPC
names do not change. Read `02-own-plugin-plan.md` §3, §4 and
`packet-Q0-scaffold.md`, plus Q0's and Q1's reports in your prompt (Q0 already
created the four tables, the RPC contract with `getOrganization` and the
mutation methods, `src/accent.ts`, and `src/organization.ts` as types; Q1
created the canonical row contracts and shared anchors).

Do not touch `forks/bb-sidebar`.

**Entrypoint paths.** In this tree the plugin's entrypoints are the **root**
`app.tsx` and the **root** `server.ts` (Q0 Produce 2–3); everything else is
under `src/`. A `src/server.ts` in the Read list below is the **fork's** file.

## Read

- From the fork, in full — the files you port: `src/organization.ts`,
  `src/organization.test.ts`, `src/useOrganization.ts`, `src/accent.ts`,
  `src/accent.test.ts`, `src/folder-list.ts`, `src/folder-list.test.ts`,
  `src/FolderShelf.tsx`, `src/FolderShelf.test.tsx`, `src/FolderMenu.tsx`,
  `src/AccentPicker.tsx`, `src/useFolderDrag.ts`, `src/useFolderDrag.test.ts`,
  `src/drag-gesture.ts`, `src/drag-gesture.test.ts`, `src/pinned-order.ts`,
  `src/pinned-order.test.ts`, `src/usePinnedReorder.ts`,
  `src/useInboxReorder.ts`.
- From the fork, mapped not read whole: `src/server.ts` — locate the
  organisation block with
  `grep -n "createFolder\|moveThreadToFolder\|reorderFolders\|publishOrganization\|inbox_order\|reorderPinned\|listInboxOrder\|thread.deleted" src/server.ts`
  and read only those blocks; `src/server.test.ts` — read only
  `describe("organization")` (grep it).
- From the fork: `src/ThreadInbox.tsx` only where folders wire in — grep
  `useOrganization`, `partitionByFolder`, `FolderShelf`, `useFolderDrag`,
  `renderActiveThread` and read those regions.
- In the new tree: `src/ThreadList.tsx` and `src/RowContextMenu.tsx` (read the
  anchor comments and the three-line anchor rule at the head of each file).
- monocode, model only: `monocode/src/lib/sessionFolders.ts` 1–130 and
  `monocode/src/chrome/ColorPickerPopover.tsx` 1–120.

## Produce

1. **Model.** `src/organization.ts` — grow Q0's types file to the fork's full
   surface: `ORGANIZATION_CHANNEL`, `Folder`, `Organization`,
   `AccentResolutionOptions`, `folderOf`, `resolveAccent`, `uniqueFolderName`,
   `applyMove`, `applyReorder`, `OrganizationReorder`, plus a re-export of
   `AccentSource` and `ResolvedAccentSource` **imported from
   `./row-props`** — Q1 declares those two canonically and you do not redefine
   them (the fork's `"project-icons"` member is `"project-decor"` in this
   plugin, because the data is our own store).
   **You do not write `resolveAccentSource`.** In the fork it lives here and
   reaches into project-icon colours; in this plugin the last two precedence
   steps are decor data, so **Q4 owns the whole function** and implements it in
   its own file `src/accent-source.ts`, importing `folderOf` and the accent
   helpers from you. You own only the three manual steps, as `resolveAccent`
   (thread → folder → project), which is what Produce 7 passes to rows and is
   correct on its own whether or not Q4 has landed. Drop the fork's
   `linkProjectIconsColour` option from `AccentResolutionOptions` — the setting
   is meaningless once decor is absorbed (Q4 and Q6 drop it too); keep
   `autoProjectColours`. Port `organization.test.ts`, minus its
   `resolveAccentSource` cases (they move to Q4 with the function).
2. **Palette.** `src/accent.ts` — additive only: keep everything Q0 wrote and
   add whatever of `ACCENT_PALETTE`, `ACCENT_NAMES`, `AccentValue`,
   `NO_ACCENT`, `parseCustomHex`, `sanitizeAccent`, `accentCss`, `accentWash`
   is missing, verbatim from brief §4.2 and the fork. `accentCss` must pass a
   `light-dark(...)` string through unchanged (Q4 depends on this). Do not add
   the OKLCH project-icon anchors — that half of `accent.ts` is Q4's, added
   beside yours. Port `accent.test.ts`.
3. **Server.** Surgical additions to the root `server.ts` only (the new
   tree's server entrypoint; `src/server.ts` above is the fork's):
   - the `inbox_order (thread_id TEXT PRIMARY KEY, sort_index INTEGER NOT NULL)`
     table appended to the migrations array, and RPCs `listInboxOrder`,
     `reorderInbox`, `reorderPinned` with `INBOX_ORDER_CHANNEL = "inbox-order"`;
   - completion of Q0's brief §4.3 mutations where Q0 left them as plain
     inserts: `beforeThreadId` placement in `moveThreadToFolder`, full-order
     validation in `reorderFolders` (RPC error on unknown or missing ids),
     `deleteFolder` = dissolve (members become ungrouped, threads never
     deleted), member pruning on `thread.deleted`;
   - `bb.realtime.publish(ORGANIZATION_CHANNEL, { reason })` after every
     mutation, exactly once per mutation.
   Add the fork's `describe("organization")` server tests plus inbox-order
   tests. Do not rename or remove anything Q0 wrote.
4. **Hook.** `src/useOrganization.ts` — brief §4.3 verbatim: loads
   `getOrganization`, subscribes to `useRealtime(ORGANIZATION_CHANNEL)`,
   optimistic updates with host-truth rollback and a `sonner` toast on error,
   exports `OrganizationApi`, `OrganizationActions`, `CreateFolderInput`,
   `OrganizationAccentOptions`. `getOrganization` and `listInboxOrder` are two
   of the four first-paint reads the plan's budget allows plugin-wide (see
   Verify): issue each exactly once on mount and refresh only on
   `ORGANIZATION_CHANNEL` / `INBOX_ORDER_CHANNEL`, `visibilitychange`, or a
   host thread-list revision. Do not add a third mount read in this packet.
5. **Folder UI.** `src/FolderShelf.tsx` (+ `FolderShelf.test.tsx`),
   `src/FolderMenu.tsx`, `src/AccentPicker.tsx`, ported whole. `FolderShelf`
   keeps its `renderThread` render-prop — that is what makes it independent of
   whatever `ThreadList.tsx` currently renders — and takes one added optional
   prop, `projectDecor?: Record<string, ProjectDecorEntry>` (Q1's type from
   `./row-props`, default `{}`), which the header uses for the project glyph
   and colour of the folder's first member. Produce 7 feeds it from Q1's shared
   `decor` binding, so you consume Q4's data without importing anything of
   Q4's; with `{}` the header falls back to the folder's own accent exactly as
   the fork does. Cover both cases in `FolderShelf.test.tsx`. Header: chevron, colour dot,
   name, count, hover menu, `aria-expanded`, `data-folder-id`, `accentWash`
   background when a colour is set, drop-target highlight. Members indented,
   `+ New thread` footer, per-folder collapse persisted in SQLite (never
   localStorage).
6. **Drag and drop.** `src/folder-list.ts`, `src/useFolderDrag.ts`,
   `src/drag-gesture.ts`, `src/pinned-order.ts`, `src/usePinnedReorder.ts`,
   `src/useInboxReorder.ts` and all four test files, ported whole. Pointer
   based, no HTML5 DnD, **no new dependency**, never `preventDefault` on
   pointerdown (the host's split drag must survive), and keep the touch-hold
   fix from fork commit `87c66e4` (`TOUCH_HOLD_MS`, `TOUCH_HOLD_SLOP_PX`,
   `blockTouchScroll`) so touch scrolling does not start a move.
7. **List wiring** (shared file, anchors only — see the integration gate).
   `src/ThreadList.tsx`, three anchors, in this order:
   - Q1 declares the default `organization` binding immediately **before**
     `// @hooks:organization (Q2)` at the top level of the list component.
     Insert exactly one unconditional line immediately **after** that anchor,
     `organization = useOrganization();`, assigning the existing binding.
     Keep the default, anchor and assignment above `renderActiveThread`. Your
     hook goes here and nowhere else in this file:
     `renderActiveThread` is called once per thread, so a hook opened inside it
     would run in a loop. `OrganizationApi` must be structurally assignable to
     Q1's `OrganizationAccess`; if it is not, widen your API rather than
     editing `row-props.ts`.
   - after `// @rows:accent (Q2)`, add **props only** — `accent={…}` from
     `resolveAccent`, the folder id, and the folder drag controls — to the row
     props `renderActiveThread` receives, reading `organization` from the
     binding above.
   - after `{/* @slot:folders (Q2) */}`, render `<FolderShelf>` (it sits above
     Pinned because Q1 placed the anchor there), passing
     `projectDecor={decor.projects}` from Q1's `decor` binding, and remove
     folder members from the flat shelves. That binding is `EMPTY_DECOR_ACCESS`
     until Q4 lands and Q4's map afterwards, so folder headers, live-strip
     chips and rows read one map without you depending on Q4 or Q4 editing your
     code.
   Keep Alt+↑/↓ reorder on cards and folder headers. Leave every anchor comment
   in place, touch no other packet's anchor, and change nothing else in the
   file.
8. **Context menu** (shared file, anchor only). `src/RowContextMenu.tsx`: after
   the `{/* @menu:organization (Q2) */}` anchor add `Move to folder ▸` (folders
   + `New folder…`), `Remove from folder`, and `Thread colour ▸` (AccentPicker
   + Clear). The organisation api arrives by prop, never a module singleton.
   Extend `RowContextMenu.test.tsx`; do not edit Q1's assertions and do not
   touch Q4's or Q5's anchors.
9. **Settings block.** `src/ProjectColoursBlock.tsx` — the "Project colours"
   swatch list bound to `setProjectAccent`, exported as a standalone block with
   its own test. It takes its settings values as props (Q1's
   `SettingsAccess` / `DEFAULT_SIDEBAR_SETTINGS` in `src/row-props.ts`) so it
   compiles with or without Q6's settings hook. Q6 owns
   `src/SidebarSettings.tsx`: if Q6 has landed, mount the block there after the
   `{/* @settings:project-colours (Q2) */}` anchor Q6 wrote, leaving the anchor
   in place. If Q6 has **not** landed, ship the block and its test, and
   reproduce that one mounting step verbatim under `Deferred wiring` in your
   report — Q7 Produce 1 applies it and tests that the block renders.

## Drop (do not port)

- The fork's `bb-sidebar:`-prefixed localStorage keys (Q1's rename to
  `glass-sidebar:` applies here too); folder collapse is SQLite, not
  localStorage, either way.
- Any sibling-store SQLite read: Q2 reads nothing outside this plugin's own
  database.
- Upstream reorder scaffolding not used by the ported files.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`; `bb plugin build`;
`node --test test/*.test.mjs`. Suite only grows.

Budget (plan §4 — binding on every packet):
- `dist/app.js` ≤ 300 KB, `dist/server.js` ≤ 800 KB; report both.
- **No timers**: no `setInterval` except the minute clock and Q3's workflow
  fallback; no server timers, no spawning, no watchers. The only
  `bb.background` use in the completed plugin is Q5's preserved 5-minute
  auto-settle schedule; this packet adds none.
- **No new dependencies**: `zod` only at runtime.
- Frontend RPCs on mount ≤ 4 plugin-wide, allocated once for the whole plan:
  `getOrganization` (yours), `listInboxOrder` (yours), `getProjectDecor` (Q4),
  `listLifecycle` (Q5). `getSidebarSettings` (Q6) and `getWorkflowActivity`
  (Q3) load after first paint. Two of the four are yours; add no others, and
  every later refresh is signal-driven.
- Named icon imports only.

No `bb plugin install`, `enable`, `reload`, or `bb theme set`.

Commit (no `git add -A`):
`git add <your files> && git commit -m "[Q2] port folders, accents, menus, and pointer drag and drop"`.
Report per brief §5, listing the final RPC names and the `Organization` type
verbatim, stating whether `SidebarSettings.tsx` existed when you edited it,
naming the anchors you filled, confirming that `useOrganization` is called
only immediately after `// @hooks:organization (Q2)`, with its default binding
immediately before the anchor, and — if Q6 had not landed — a `Deferred wiring`
section reproducing the settings mounting verbatim for Q7.
