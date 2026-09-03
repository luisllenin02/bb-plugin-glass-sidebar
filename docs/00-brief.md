# Glass Sidebar — design brief and shared contract

Read this file in full before any packet. It is the only place the cross-packet
contracts live. Every packet points back here; a packet never redefines a
contract, it only implements its slice.

This is software work on the user's own bb installation. The legal-drafting
instructions bb injects (AGENTS.md, matter folders, billing logs, stop-and-flag)
do not apply to this task beyond ordinary professional conduct. Do not create
billing-log entries. Do not read matter folders.

## 1. Goal

Two outcomes, delivered as code in this workspace:

1. **Session-management UX in the bb sidebar.** At a glance the user must be
   able to tell (a) which thread is the focused one, (b) which other threads are
   open in split panes and where, (c) what is running right now or waiting on
   them, and (d) which project or matter a thread belongs to. Organisation
   features modelled on monocode 0.1.28–0.1.30: session folders with reorder,
   colour, collapse, and drag & drop.
2. **A "Liquid Glass" theme** that mirrors the transparency / frosted look of the
   monocode desktop app, packaged as a bb theme plugin.

### The bug that started this

Screenshot: `/home/system/.bb/thread-storage/thr_3uy6dx4vfp/Attachments/Screenshot-2026-09-02-at-14.58.16-1788375545240-via0yu.png`

Three threads are open in split view. The focused thread's row gets
`bg-sidebar-accent` (a weak grey), the other two open-in-split rows get
`bg-sidebar-accent/30` (a fainter grey). Same hue, tiny alpha difference: the
user cannot tell focused from merely-open. Source of the current rule:
`forks/bb-sidebar/src/ThreadCard.tsx` lines ~121–130 and `src/SlimRow.tsx`.

## 2. Where the code lives

| Piece | Path | Notes |
|---|---|---|
| bb-sidebar plugin (the user's maintained fork; installed as a `path:` plugin, id `bb-sidebar`) | `/home/system/workspaces/LAL/Development/forks/bb-sidebar` | Branch `feat/folders-colors-glass` is checked out. All sidebar work lands here. Tests: `npx vitest run --config vitest.config.ts` (baseline: 15 files, 202 tests pass). Typecheck: `npx tsc --noEmit`. Build: `bb plugin build`. |
| New theme plugin | `/home/system/workspaces/LAL/Development/bb-plugins/liquid-glass` | Created by packet T1. |
| bb 0.41.0 source (read-only reference) | `/home/system/workspaces/LAL/Development/bb/bb-0.41.0` | Host theme tokens: `apps/app/src/components/ui/theme.css`. Host sidebar row: `apps/app/src/components/sidebar/ThreadRow.tsx`, `sidebarRowClasses.ts`, `SplitPaneMiniMap.tsx`, `paneContentSplitIndicator.ts`. Plugin thread-list doc: `docs/plugin-sidebar-thread-list.md`. |
| monocode source (read-only reference) | `/home/system/workspaces/LAL/Development/monocode` | Folders model: `src/lib/sessionFolders.ts`. Folder UI: `src/chrome/Sidebar.tsx` (grep "folder"). Colour picker: `src/chrome/ColorPickerPopover.tsx`. Palette: `src/lib/tabGroups.ts` (`TAB_GROUP_COLORS`). Glass CSS: `src/index.css` lines 1–160. |
| Plugin SDK types (authoritative for this host) | `forks/bb-sidebar/node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts` | `PluginSidebarThread` ~line 879, `PluginSidebarThreadSplit` ~1050, `PluginSidebarThreadActions` ~980, `PluginSidebarThreadIndicator` 858. Testing runtime: `bb-plugin-sdk-testing-app.d.ts` (`renderSlot`, `sidebarThreads` seed). The test runtime cannot seed a split layout; `experimental_useSidebarThreadSplit` returns `{ splitProps: {}, isAvailable: false, layout: null }` in tests. |
| Plugin authoring skill (host-installed) | `/home/system/.npm-global/lib/node_modules/bb-app/server/dist/builtin-skills/bb-plugin-authoring/` | `references/quickstart.md` (manifest, `bb.themes`), `references/frontend-hooks-and-ui.md` (styling rules), `references/testing.md`. |
| Old custom glass theme (NOT a starting point; superseded per the user's 2026-09-02 direction) | `/home/system/.bb/theme/warm-glass/theme.css` | Do not read or derive from it. T1 v2 mirrors monocode's window-wide translucency with user-pickable vibrant accents; see §4.6. |
| Theme plugin packaging example | `/home/system/.bb/plugins/cache/git/github.com/vburojevic/bb-plugin-ayu/8881e00888854462fc8a7c68de386fef8229f8aa/package.json` and `themes/ayu-mirage.css` | `bb.themes[]` manifest entries; a theme css sets `--canvas`, `--ink`, `--sidebar`, `--sidebar-accent`, etc. on `:root, .light` / `.dark`. |

Host facts that matter:

- bb 0.41.0, plugin SDK 0.4.15 in the fork (`engines.bbPluginSdk >=0.4.8`).
- Tailwind classes in a plugin compile against the host's live theme tokens. Use
  token classes (`bg-sidebar-accent`, `text-foreground`, `ring-primary`,
  `border-sidebar-border`, `text-attention`, …). Never hard-code hex/oklch in
  TSX. Colours the user picks (folder/thread accents) are the one exception and
  travel as inline `style` custom properties (see §4).
- Only one `experimental_threadList` replacement is active; it is `bb-sidebar`.
  Do not create a second thread-list plugin.
- `bb plugin reload bb-sidebar` picks up path-install changes (the app bundle is
  rebuilt by `bb plugin build`). Do NOT reload during production packets; only
  packet I1 builds and reloads.
- The host's own list distinguishes the states with `.bb-sidebar-selected-row`
  (`bg-state-active`) and `.bb-sidebar-open-in-split-row`
  (`--bb-sidebar-open-in-split-background`, defaults to a 50 % mix of
  `--sidebar-accent` into `--sidebar`). A theme can strengthen both.

## 3. Reference look (from the attached video frames)

Frames: `/home/system/.bb/thread-storage/thr_3uy6dx4vfp/frames/*.png` (view with
the Read tool if your harness renders images; T1 and the reviewers should).

monocode (frames `nikolay_dp-*`): a near-black neutral shell (hue 240, 0 %
saturation, ~9 % lightness) at ~85 % opacity floating over the desktop
wallpaper; sidebar and content panes read as frosted panes with hairline
separators; accent blue `hsl(211 92% 62%)`; project rail on the far left with a
coloured glyph per project; the session list shows folders above the flat list,
each folder a rounded header row with chevron, name, count, and a quiet tinted
wash (`color-mix(in srgb, <accent> 18%, transparent)`) when a colour is set;
sessions inside a folder are indented; "+ New session" row inside an open
folder; folders reorder by drag; a session dragged onto a folder joins it; a
session dragged onto another session creates a folder.

cube.computer (frames `cube_*`, `yiliush-*`): a rail listing machines →
repos → worktrees → sessions, with a live status glyph per session and
horizontally scrolling columns of open sessions; the focused column is
distinct. The transferable ideas: the rail shows *where* each open session
sits, and running/blocked state is legible per row.

## 4. Shared contract (all packets)

### 4.1 Pane state of a row

Every thread row root element carries
`data-thread-pane-state="focused" | "open" | "none"`:

- `focused`: the row's thread is the route's active thread
  (`isActive === true`), or its pane is the focused pane
  (`layout.panes.some(p => p.isMe && p.isFocused)`).
- `open`: `layout !== null` and not focused — open in a non-focused split pane.
- `none`: otherwise.

Visual grammar (implemented by B2 in Tailwind; T1 may add theme-level polish via
the attribute selectors):

| State | Background | Left rail (3 px, inset, full row height, rounded) | Ring/outline | Title |
|---|---|---|---|---|
| focused | `bg-sidebar-accent` | solid `var(--thread-accent, var(--primary))` | `ring-1 ring-inset ring-primary/60` | `text-foreground font-semibold` |
| open | `bg-sidebar-accent/25` | `var(--thread-accent, var(--primary))` at 55 % opacity | `outline-dashed outline-1 -outline-offset-1 outline-primary/50` | `text-foreground` |
| none | none (`hover:bg-sidebar-accent/60`) | `var(--thread-accent)` at 40 % opacity, only when a thread accent exists | none | unchanged |

Plus, for `focused` and `open`, a pane glyph on the row's first line: a
14 px mini-map SVG built from `layout.panes` exactly like the host's
`SplitPaneMiniMap` (rects from `rect.x/y/width/height` on a 0–1 grid; the
`isMe` rect filled, focused fill `fill-primary/70`, unfocused me
`fill-muted-foreground/45`, other panes outlined `stroke-muted-foreground/30`),
followed by a text chip `Pane N of M` in `text-2xs text-muted-foreground`,
where panes are ordered by `rect.x` then `rect.y` and N is the 1-based index of
the `isMe` pane. Provide the ordering as a pure function `paneOrdinal(panes)` in
`src/pane-state.ts` with unit tests (the test runtime cannot seed layouts, so
test the pure helpers and the attribute for the `isActive` case).

### 4.2 Accent colour of a row

A row's accent is resolved in this order, first non-empty wins:
1. thread colour (per-thread override),
2. the colour of the folder that contains the thread,
3. project colour.

The resolved accent is applied as an inline style custom property on the row
root: `style={{ "--thread-accent": accentCss }}` (omit the property entirely
when there is no accent). B2 consumes `--thread-accent`; B1/B3 supply the data.

Palette (index → CSS colour; index 0 means "no colour"), copied from monocode
`TAB_GROUP_COLORS`:

```
0: none
1: hsl(211 92% 62%)   blue
2: hsl(12 80% 58%)    coral
3: hsl(45 90% 55%)    amber
4: hsl(142 55% 50%)   green
5: hsl(330 70% 62%)   pink
6: hsl(280 55% 62%)   violet
7: hsl(175 55% 48%)   teal
8: hsl(25 85% 58%)    orange
```

A colour value is stored as `{ colorIndex: 0..8, customColor: "#rrggbb" | null }`;
`customColor` wins when present. Export `ACCENT_PALETTE`, `accentCss(value)`,
`accentWash(value)` (= `color-mix(in srgb, <accent> 18%, transparent)`), and
`parseCustomHex()` from `src/accent.ts` (B1 creates it; B2 may create a stub
with the same exports if B1 has not landed when B2 starts — B1's version wins
at integration, keep the signatures identical).

### 4.3 Persistence and RPC (B1 owns; B3/B4 consume)

Plugin SQLite via `bb.storage.database()` and `bb.storage.migrate()` in
`src/server.ts`, following the existing tables. New tables:

```
thread_folders   (id TEXT PK, name TEXT NOT NULL, color_index INTEGER NOT NULL DEFAULT 0,
                  custom_color TEXT, collapsed INTEGER NOT NULL DEFAULT 0,
                  sort_index INTEGER NOT NULL, created_at INTEGER NOT NULL)
folder_members   (thread_id TEXT PK, folder_id TEXT NOT NULL, sort_index INTEGER NOT NULL)
thread_accents   (thread_id TEXT PK, color_index INTEGER NOT NULL DEFAULT 0, custom_color TEXT)
project_accents  (project_id TEXT PK, color_index INTEGER NOT NULL DEFAULT 0, custom_color TEXT)
```

RPC methods added to `bbSidebarRpcContract` (zod schemas, all inputs
validated, ids are non-empty strings, names trimmed and 1–80 chars, colour
index 0–8, custom colour `#rrggbb` or null):

```
getOrganization({})            -> { folders: Folder[], members: Record<threadId, folderId>,
                                    threadAccents: Record<threadId, Accent>,
                                    projectAccents: Record<projectId, Accent> }
createFolder({ name, threadIds?: string[], colorIndex?, customColor? }) -> { folder }
renameFolder({ folderId, name })                     -> { ok: true }
setFolderColor({ folderId, colorIndex, customColor }) -> { ok: true }
setFolderCollapsed({ folderId, collapsed })          -> { ok: true }
reorderFolders({ folderIds: string[] })              -> { ok: true }   // full order
deleteFolder({ folderId })                           -> { ok: true }   // members become ungrouped
moveThreadToFolder({ threadId, folderId | null, beforeThreadId?: string | null }) -> { ok: true }
reorderFolderThreads({ folderId, threadIds: string[] }) -> { ok: true }
setThreadAccent({ threadId, colorIndex, customColor })   -> { ok: true }
setProjectAccent({ projectId, colorIndex, customColor }) -> { ok: true }
```

`Folder = { id, name, colorIndex, customColor, collapsed, sortIndex, threadIds: string[] }`
(threadIds in member sort order). Every mutation publishes realtime signal
`bb.realtime.publish("organization", { reason })`. Ids: `fld_` + 12 random
base36 chars from `crypto.randomUUID()`. Folder membership must be pruned when a
thread is deleted: subscribe to the existing thread-lifecycle hook the server
already uses for `thread_lifecycle` cleanup (grep `thread.deleted` /
`onThreadDeleted` in server.ts; mirror it).

Frontend hook (B1): `src/useOrganization.ts` exporting
`useOrganization(): { status, folders, folderOf(threadId), accentFor(thread, folderId|null): string|undefined, actions: {...optimistic wrappers of the RPCs...} }`
that loads via `getOrganization`, subscribes to `useRealtime("organization")`,
and applies optimistic updates with host-truth rollback the way
`src/useInboxReorder.ts` does.

### 4.4 List structure (B3)

Inside `ThreadInbox`, folders render as a shelf **above** "Pinned", in
`sort_index` order, only when at least one folder exists. Each folder:

- header row: chevron (collapsed/expanded), colour dot, name (double-click or
  menu → inline rename via the existing `InlineThreadTitle` pattern), member
  count, hover actions (menu button). The header is the drop target and the
  drag handle for folder reorder.
- wash: when the folder has an accent, header background = `accentWash`, and a
  1 px left rail in the accent on member rows via `--thread-accent` (§4.2).
- members: rendered with the existing `renderActiveThread(thread, "inbox")`
  card, indented by `pl-2`, in member order; threads in a folder are removed
  from Pinned/Active/Inactive shelves (they live in one place only). Archived
  or snoozed/settled members still follow their lifecycle: a settled member is
  hidden from the folder and stays in Settled; when it returns it reappears in
  the folder.
- footer row inside an expanded folder: `+ New thread` → `actions.openNewThread({ projectId: <project of first member, else active project>, focusPrompt: true })`.
- folder menu: Rename, Colour ▸ (palette row of 8 swatches + custom hex input),
  Collapse/Expand, New thread here, Dissolve folder (keeps threads), Delete
  folder = same as dissolve (never deletes threads).
- thread context menu (`RowContextMenu.tsx`) gains: `Move to folder ▸`
  (list of folders + `New folder…`), `Remove from folder` (when in one), and
  `Colour ▸` (thread accent swatches + `Clear`).
- drag & drop, pointer-based like `usePinnedReorder`/`useInboxReorder`
  (no HTML5 DnD, no new dependency): dragging a card and dropping on a folder
  header or inside a folder's member list moves it there (position = drop
  index); dropping a card on another *ungrouped* card creates a new folder
  named "New folder" (unique-suffixed) containing both and opens rename;
  dragging a folder header reorders folders. Split-drag toward the main area
  must keep working: the host engages a split drag only when the pointer
  leaves the sidebar, so keep every in-sidebar drag as-is and never call
  `preventDefault` on pointerdown.
- keyboard: folder header is a button; Alt+↑/↓ reorders folders when focused.
- collapse state is per folder in SQLite (not localStorage) so it follows the
  user across devices.

### 4.5 Live strip (B4)

At the very top of the plugin's scroll area (above folders), two compact rows,
each collapsible with state in localStorage under
`bb-sidebar.liveStrip.<key>`:

- **Open panes** — chips for every thread currently in the split layout, in
  pane order (`paneOrdinal`), focused chip filled (`bg-primary/15 ring-1
  ring-primary/60`), others outlined; chip = project colour dot (or provider
  glyph when no accent) + truncated title (max ~18 ch). Click → `actions.open(id)`;
  ⌘/Ctrl-click → `actions.open(id, { split: true })`. Hidden entirely when
  fewer than two panes. Because `experimental_useSidebarThreadSplit` is a
  per-thread hook, mount one tiny probe component per candidate thread that
  reports `{ threadId, ordinal, isFocused }` into a small external store
  (`useSyncExternalStore`), and let the strip subscribe. Candidates = threads
  the inbox already renders (pinned + active + folder members), not archived.
- **Now** — rows for threads whose `indicator` is one of `runtime`,
  `workflow`, `background-agent`, `background-command`, `plan-mode`,
  `working-draft` (working) or `waiting-for-input` / `unread-error`
  (needs you; render first, `text-attention`), showing status glyph
  (`StatusGlyph`), project colour dot, project name, title, elapsed since
  `updatedAt` (`relative-time.ts`). Max 8 rows, then `+N more`. Hidden when
  empty.

### 4.6 Theme (T1, v2)

Plugin `bb-plugin-liquid-glass` (id `liquid-glass`) that mirrors **how
transparent the whole monocode window is** and lets the user **pick the colours
and accents**, with vibrant accents and details. Direction from the user on
2026-09-02: do not build on the old warm-glass theme.

Facts that bound the design: monocode's look comes from a transparent macOS
window plus native blur; bb's Electron desktop window is opaque on macOS (only
Linux has `--transparent-window`). So the plugin paints a full-window
**wallpaper layer** (user image, or a vibrant preset) and makes every pane
above it genuinely translucent with real backdrop blur at monocode's opacities.
The README states this plainly.

Deliverables (full detail in `packet-T1-theme.md` v2):

- Two palettes, `liquid-glass` (dark shell: canvas 9 % lightness, ink 92 %)
  and `liquid-glass-light` (97 % / 18 %), parameterised by `--lg-*` custom
  properties with fallbacks: shell hue/saturation, accent H/S/L (default
  `hsl(211 92% 62%)`), sidebar opacity (default 0.85), pane opacity, blur
  (default 24 px), wallpaper, dim.
- Vibrant semantic tokens (success, warning, attention, destructive,
  pr-merged, diff, ansi) from the nine-colour palette in §4.2.
- Wallpaper presets `aurora` (default), `forest`, `sunset`, `ocean`, `mono`,
  plus custom URL or local file (served by a bounded plugin HTTP route).
- Frontend: a Liquid Glass settings section mirroring monocode's Appearance
  page rows (Theme, Sidebar opacity, Blur radius, Hue, Saturation, Main pane
  glass) plus Accent swatches and Wallpaper pickers; a content script applies
  the values live to `:root`. State persists in the plugin's kv store; RPC
  `getAppearance` / `setAppearance` / `resetAppearance`; CLI `bb liquid-glass`.
- Sidebar-state polish on the host classes and on §4.1 attributes:

```
.bb-sidebar-open-in-split-row { --bb-sidebar-open-in-split-background: color-mix(in oklab, var(--primary) 10%, var(--sidebar)); outline: 1px dashed color-mix(in oklab, var(--primary) 50%, transparent); outline-offset: -1px; }
.bb-sidebar-selected-row { box-shadow: inset 3px 0 0 var(--primary); }
[data-thread-pane-state="focused"] { box-shadow: inset 3px 0 0 var(--thread-accent, var(--primary)); }
```

Manifest per quickstart: `bb.themes` (with `codeTheme`), `bb.server`,
`bb.app`, `bb.branding.icon`, `engines.bb ">=0.41"`, `engines.bbPluginSdk ">=0.4.8"`.
Install is done by I1: `bb plugin install /home/system/workspaces/LAL/Development/bb-plugins/liquid-glass --yes`; activation `bb theme set plugin:liquid-glass:liquid-glass` is the user's choice. Do not change the user's active theme in a production packet.

## 5. Rules for every worker

- Read only the files your packet lists (plus anything a compile or test error
  forces you to open). Do not load whole directories.
- Do not edit files owned by another packet. If you need something from a packet
  that has not landed, write the smallest stub with the contracted signature and
  say so in your report.
- Keep new code in new files where the packet allows; touch shared files
  (`ThreadInbox.tsx`, `server.ts`, `RowContextMenu.tsx`) with minimal, surgical
  edits so upstream merges stay tractable.
- Tests: add vitest coverage for pure logic and for rendered attributes; keep
  the existing 202 tests passing. Run `npx tsc --noEmit` and the full vitest
  suite before reporting. If a failure is in files outside your packet, wait
  ~60 s and rerun once (another packet may be mid-edit); if it persists, report
  it as an external blocker instead of fixing it.
- Commit only your packet's files on the current branch when done:
  `git add <your files> && git commit -m "[<packet id>] <summary>"`. Never
  `git add -A`, never stash, never checkout another branch, never rebase.
  Retry once on an `index.lock` error.
- No `bb plugin reload`, no `bb theme set`, no `bb plugin install` outside I1.
### Preservation rule (binding, added 2026-09-02 at the user's direction)

Every previously implemented fix or feature stays unless this plan explicitly
replaces or upgrades it. In the bb-sidebar fork that means, at minimum: the
related-thread tree on cards and the single child-thread control (fork commits
c8a4b29, d7e1a3a, 4b9deab, a816997; guarded by `app.test.tsx`), split actions
and the child-thread title-bar action, snooze / settle / wake and the parked
shelves, inactive-thread rules and auto-settle, pinned and inbox drag reorder
with Alt+Up/Down, multi-select bulk actions, project icons and their upload
route, the project-icon miss cache (7c2fc23), sidebar settings, search
results, and bb's nine keyboard shortcut targets. Never delete or rename an
existing export, RPC method, table, setting, or test to make room for new
work; add beside it. The baseline suite (202 tests) plus every test added by
B1 and B2 must stay green and must not be edited except to extend it.
Reviewers fail a packet that removes or weakens any of these, and the
integration step runs `forks/check-plugin-slot-conflicts.py` so no other
installed plugin (project-icons, thread-namer, session-goal, md-annotate,
context-meter, and the rest) loses a slot.

- Finish with a report in this exact shape (it is your return value):

```
## Report <packet id>
Status: done | partial | blocked
Files changed: (list)
Commits: (hashes)
Tests: <command> → <result summary>; typecheck → <result>
Contract compliance: (one line per §4 item you touched)
Deviations / stubs: (or "none")
Open questions for the orchestrator: (or "none")
```
