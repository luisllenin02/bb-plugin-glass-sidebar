# Packet Q6 — Favicons and upload route, bulk actions, sort, filter, settings shell

**Depends on: Q1.** Wave 3 with Q4 and Q5. Downstream: Q7.

Work in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`.
A **port** of the remaining upstream fork features the preservation rule
protects, plus the settings shell every other packet's block plugs into. Read
`00-brief.md` §5 in full, `02-own-plugin-plan.md` §3 and §4,
`packet-Q0-scaffold.md`, and Q1's report.

Do not touch `forks/bb-sidebar`.

**Entrypoint paths.** In this tree the plugin's entrypoints are the **root**
`app.tsx` and the **root** `server.ts` (Q0 Produce 2–3); everything else is
under `src/`. A `src/server.ts` in the "From the fork" Read list is the
**fork's** file; every server edit this packet asks for is in the root
`server.ts`.

**Integration gate.** You depend on Q1, so `src/ThreadList.tsx`, the root
`app.tsx` and their anchors exist when you start. What may **not** exist are
the three settings blocks Q2, Q4 and Q5 export and Q5's bulk lifecycle RPCs.
Never stub a block or an RPC another packet owns: omit it behind its anchor,
and reproduce each omitted mounting verbatim under `Deferred wiring` in your
report. Q7 Produce 1 is the deterministic integration owner: it applies every
deferred item and behaviour-tests the result before the plan closes.

## Read

- From the fork, in full — the files you port: `src/project-icons.ts`,
  `src/project-icons.test.ts`, `src/ProjectFavicon.tsx`,
  `src/ProjectIconSettings.tsx`, `src/bulk-actions.ts`,
  `src/bulk-actions.test.ts`, `src/selection.ts`, `src/selection.test.ts`,
  `src/BulkSelectionBar.tsx`, `src/sidebar-settings.ts`,
  `src/SidebarSettings.tsx`.
- From the fork, mapped not read whole: `src/server.ts` — grep
  `project_icons\|project_icon_uploads\|sidebar_settings\|bb.http.route\|listProjectIconSettings\|searchProjectIconFiles\|setProjectIcon\|uploadProjectIcon\|getSidebarSettings\|updateSidebarSettings\|SIDEBAR_SETTINGS_CHANNEL\|PROJECT_ICONS_CHANNEL`
  and read only those blocks plus the migrations array head (lines 44–110);
  `src/ThreadInbox.tsx` — grep
  `ACTIVE_SORT_MODES\|sortActiveThreads\|groupActiveThreadsByProject\|visibleShelfThreads\|ALL_PROJECTS\|selection\|BulkSelectionBar\|ProjectGroups\|ActiveProjectGroup`
  and read only those regions.
- Fork commit `7c2fc23` (`git -C forks/bb-sidebar show 7c2fc23`) — the
  project-icon miss cache that holds a miss for 6 h instead of 30 s. It is on
  the preservation list and must survive the port intact.
- In the new tree: the root `server.ts`, the root `app.tsx`,
  `src/ThreadList.tsx`, `src/row-props.ts`, `src/inbox.ts`
  (Q1 owns it; you consume `sortByCreatedAtDescending`, `filterByProject`,
  `searchThreadsByTitle`, `partitionPinned`, `visibleInboxThreads`,
  `hideChildrenOfVisibleParents`), and Q2's `ProjectColoursBlock.tsx`, Q4's
  `ProjectDecorBlock.tsx`, Q5's `LifecycleBlock.tsx` if they have landed.

## Produce

1. **Settings store and shell (this packet owns them, registration included).**
   `src/sidebar-settings.ts` (`SIDEBAR_SETTINGS_CHANNEL`,
   `cachedSidebarSettings`, `cacheSidebarSettings`, plus `SidebarSettingsValues`
   and `DEFAULT_SIDEBAR_SETTINGS` **imported from `./row-props` and
   re-exported** — Q1 declares them canonically, already minus
   `linkProjectIconsColour`, so your store, Q5's block and Q2's and Q4's blocks
   share one definition) and the `sidebar_settings` table appended to the
   migrations array in the root `server.ts` with the fork's columns —
   `snooze_presets`, `inactive_threads_enabled`, `inactive_after_hours`,
   `auto_settle_inactive`, `auto_settle_after_days`, `auto_settle_on_merge`,
   `auto_project_colours` — plus the `getSidebarSettings` /
   `updateSidebarSettings` RPCs publishing `SIDEBAR_SETTINGS_CHANNEL`.
   **Drop `link_project_icons_colour`**: it is meaningless once Q4 absorbs
   project decor.
   `src/SidebarSettings.tsx` is the settings-section shell. **Q0 registered no
   settings section and Q1 registered none** ("No other slot yet"): you own the
   registration. Add it to the root `app.tsx` at Q1's
   `/* @settings-section (Q6) */` anchor —
   `app.slots.settingsSection({ id: "glass-sidebar-settings", component: SidebarSettings })`
   — leaving the anchor comment in place, touching neither `HEADER_ACTIONS` nor
   Q4's `/* @header-actions (Q4) */` anchor, and extend Q1's `app.test.tsx`
   settings-section expectation (which Q1 wrote as extensible) to exactly one
   section with that id. Without this step the settings UI has no route into
   the host at all, so it is not optional and it is not deferrable — Q1 is your
   dependency and its anchor is there.
   The shell lays out its own favicon and sort blocks plus the blocks the other
   packets export, each behind its own anchor comment so a later packet or Q7
   can fill it without touching your code:
   `{/* @settings:project-colours (Q2) */}`, `{/* @settings:project-decor (Q4) */}`,
   `{/* @settings:lifecycle (Q5) */}`. Import each block defensively: if its
   packet has landed, mount `ProjectColoursBlock` / `ProjectDecorBlock` /
   `LifecycleBlock` immediately after its anchor; if it has not, leave the
   anchor empty, say so in your report, and reproduce the one-line mounting
   verbatim under `Deferred wiring`. Never stub a block another packet owns.
   Add the three anchor ids to Q1's `test/anchors.test.mjs` (each exactly once
   in `src/SidebarSettings.tsx`).
2. **Favicons and the upload route.** `src/project-icons.ts` (+ tests) with
   `PROJECT_ICON_ROUTE`, `PROJECT_ICONS_CHANNEL`, `PROJECT_ICON_EXTENSIONS`,
   `PROJECT_ICON_CANDIDATES`, `normalizeProjectIconPath`,
   `extractProjectIconHref`, `iconPathsForHref`, `projectIconUrl`;
   `src/ProjectFavicon.tsx`; `src/ProjectIconSettings.tsx`; the
   `project_icons` and `project_icon_uploads` tables; the
   `bb.http.route("GET", "/project-icon", …)` handler; and the
   **6 h miss cache from commit `7c2fc23`**, ported with its test.
   **Keep the four favicon RPC names exactly as the fork has them** —
   `listProjectIconSettings`, `searchProjectIconFiles`, `setProjectIcon`,
   `uploadProjectIcon` — along with the table names `project_icons` /
   `project_icon_uploads`. Brief §5 forbids renaming an existing RPC to make
   room for new work, and project decor is the new surface: Q4's decor
   mutations take the collision-free `*ProjectDecor*` names
   (`setProjectDecorIcon`, `clearProjectDecorIcon`), so nothing collides. If
   you find a `setProjectIcon` already in the contract meaning "project decor",
   stop and report it as a blocking conflict rather than renaming either side.
3. **Multi-select and bulk actions.** `src/selection.ts` (+ tests) with
   `ThreadSelectionState`, `EMPTY_THREAD_SELECTION`, `updateThreadSelection`,
   `reconcileThreadSelection`, `keepFailedSelection`; `src/bulk-actions.ts`
   (+ tests) with `runBulkAction`, `BulkActionResult`, `BulkActionFailure`;
   `src/BulkSelectionBar.tsx`, carrying a `{/* @bulk:lifecycle (Q5) */}` anchor
   where its bulk **Settle** and **Snooze** buttons live (add that id to
   `test/anchors.test.mjs` too). Those two call Q5's `bulkSettle` /
   `bulkSnooze`; when Q5 has landed, wire them there. When Q5 has **not**
   landed, wire mark-read / mark-unread / clear, leave the two buttons disabled
   behind a one-line guard at that anchor, say so in your report, **and
   reproduce the enabling step verbatim under `Deferred wiring`** — a disabled
   bulk Settle/Snooze is a regression against the brief §5 preservation list,
   so it must be handed to Q7, not left standing.
4. **Sort, grouping, project filter** (shared file, anchors only — your three
   anchors are `// @hooks:settings-selection (Q6)`,
   `// @rows:selection-sort (Q6)` and `{/* @slot:bulk-bar (Q6) */}`; insert
   after each, leave the anchor comments in place, and touch no other packet's
   anchor). Q1 declares the default `settings` binding immediately **before**
   `// @hooks:settings-selection (Q6)` at the top level of the list component.
   Insert exactly one unconditional line immediately **after** that anchor,
   `settings = useSidebarSettings();`, assigning the existing binding; if your
   selection state needs a hook of its own, put that call on the next line at
   the same anchor. Keep the default, anchor and assignments above
   `renderActiveThread`. Hooks go here and nowhere else in this file;
   `renderActiveThread` runs once per
   thread, so a hook opened inside it would run in a loop, and your return type
   must be structurally assignable to Q1's `SettingsAccess`. `// @rows:selection-sort
   (Q6)` carries **props only**.
   `src/ThreadList.tsx`: the four active sort modes (`manual`, `activity`,
   `created`, `project`) with their labels and the `glass-sidebar:active-sort:v1`
   / `:active-grouping:v1` / `:shelf-expansion:v1` localStorage keys (Q1's
   renamed prefix), `groupActiveThreadsByProject`, `sortActiveThreads`,
   `visibleShelfThreads`, `ProjectGroups` / `ActiveProjectGroup`, the
   `ALL_PROJECTS` project filter, the selection state and the
   `BulkSelectionBar` mount. Keep manual mode's drag reorder (Q2) working and
   keep `hasKeyboardReorder` false on sorted shelves exactly as the fork does.
5. **Preservation checks.** Confirm in your report that all nine of bb's
   keyboard shortcut targets still resolve (host doc §8), that
   `data-sidebar-thread-shortcut-target` / `data-sidebar-thread-id` are present
   on every row anchor including search results and bulk-selected rows, and
   that search results remain a flat mode that shows parked matches.

## Drop (do not port)

- `link_project_icons_colour` (see Produce 1).
- The fork's `bb-sidebar:` localStorage prefix.
- Any sibling-store SQLite read; Q6 reads only this plugin's database.
- Upstream sort/grouping scaffolding not reachable from the ported code, and
  the Radix packages no ported file imports.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`; `bb plugin build`;
`node --test test/*.test.mjs`. Suite only grows. Tests must cover: favicon path
detection and the 6 h miss cache, the upload route's size/mime bounds,
selection transitions with modifiers, bulk action partial failure and
`keepFailedSelection`, each sort mode's ordering, the project filter, and
settings round-tripping through the RPC.

Budget (plan §4 — binding on every packet):
- `dist/app.js` ≤ 300 KB, `dist/server.js` ≤ 800 KB; report both.
- **No timers**: no `setInterval` except the minute clock and Q3's workflow
  fallback; no server timers, spawning or watchers. The only `bb.background`
  use in the completed plugin is Q5's preserved 5-minute auto-settle schedule;
  this packet adds none. The miss cache is a TTL check on read, not a timer.
- **No new dependencies**: `zod` only at runtime.
- Frontend RPCs on mount ≤ 4 plugin-wide, allocated once for the whole plan:
  `getOrganization` (Q2), `listInboxOrder` (Q2), `getProjectDecor` (Q4),
  `listLifecycle` (Q5). `getSidebarSettings` is **yours and is not one of
  them**: seed first paint synchronously from `cachedSidebarSettings`
  (localStorage) and issue the RPC only after first paint — on the first host
  thread-list revision after mount, or a `requestIdleCallback` /
  `setTimeout(0)` fallback — then refresh on `SIDEBAR_SETTINGS_CHANNEL` and
  `visibilitychange`. Add a test that no RPC is issued during the mount render
  pass. `listProjectIconSettings` and `searchProjectIconFiles` are
  settings-only calls and must not run on sidebar mount at all.
- Named icon imports only.

No `bb plugin install`, `enable`, `reload`, or `bb theme set`.

Commit (no `git add -A`):
`git add <your files> && git commit -m "[Q6] port favicons, bulk actions, sort and filter, and the settings shell"`.
Report per brief §5, adding the four favicon RPC names as landed (unchanged
from the fork), the settings-section registration you added at Q1's anchor and
the id you used, which settings blocks were available to import and which
anchors you left empty, whether the two bulk lifecycle buttons are live or
disabled, proof that `getSidebarSettings` does not run during mount,
confirmation that your hooks are called only immediately after
`// @hooks:settings-selection (Q6)`, with the default binding immediately
before the anchor, the anchors you filled, a `Deferred
wiring` section reproducing every unmounted block and the bulk-button enabling
verbatim for Q7, and the two bundle sizes.
