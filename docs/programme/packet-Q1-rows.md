# Packet Q1 — Rows: pane state, accent rail, pane glyph, cards, slim rows, search

**Depends on: Q0.** Downstream: Q2, Q3, Q4, Q5, Q6 (and Q7).

**Wave order (binding):** wave 1 `Q1`; wave 2 `Q2, Q3`; wave 3
`Q4, Q5, Q6`; wave 4 `Q7`.

Work in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`
(the repo Q0 created; its own git repo, branch `main`). This is a **port**:
every file named below already exists in final, reviewed, tested form in
`/home/system/workspaces/LAL/Development/forks/bb-sidebar`. Copy it into the
new tree, change only what this packet says to change, and keep the tests.
Do not redesign, do not "improve" while copying.

Read `00-brief.md` §1, §2, §4.1, §4.2, §5 and `02-own-plugin-plan.md` §3, §4
in full first. Do not touch `forks/bb-sidebar` — it stays live until Q7.

**Entrypoint paths in this tree (binding on Q1–Q7).** Q0 Produce 2 and 3 put
the plugin's two entrypoints at the **repo root**: `app.tsx` and `server.ts`.
Everything else lives under `src/`. The fork's layout is nearly the same but
its server is at `src/server.ts`, so in every packet a `src/server.ts` inside a
"From the fork" Read list means the **fork's** file, while every edit this plan
asks for in the new tree's server is an edit to the root `server.ts`. There is
no `src/app.tsx` in either tree.

## Read

- `00-brief.md` (whole), `02-own-plugin-plan.md` (whole), `packet-Q0-scaffold.md`,
  and Q0's report in your prompt (it names the derived plugin id, the files it
  already created, and the two bundle sizes).
- From the fork, in full — these are the files you port:
  `src/pane-state.ts`, `src/pane-state.test.ts`, `src/AccentRail.tsx`,
  `src/AccentRail.test.tsx`, `src/PaneGlyph.tsx`, `src/PaneGlyph.test.tsx`,
  `src/StatusGlyph.tsx`, `src/StatusSlot.tsx`, `src/status-tone.ts`,
  `src/ProviderGlyph.tsx`, `src/Disc.tsx`, `src/InlineThreadTitle.tsx`,
  `src/relative-time.ts`, `src/relative-time.test.ts`, `src/inbox.ts`,
  `src/inbox.test.ts`, `src/related-thread-tree.ts`,
  `src/RelatedThreadTree.tsx`, `src/ParentChip.tsx`, `src/ParentChip.test.tsx`,
  `src/SubagentsChip.tsx`, `src/SubagentsChip.test.tsx`, `src/ThreadCard.tsx`,
  `src/SlimRow.tsx`, `src/SearchResults.tsx`, `src/RowContextMenu.tsx`,
  `src/RowContextMenu.test.tsx`, `src/row-pane-state.test.tsx`,
  `src/components/Tooltip.tsx`, `src/components/Tooltip.test.tsx`,
  `src/components/Select.tsx`, `src/lib/utils.ts`, `src/lib/portal-scope.ts`,
  `app.tsx`, `app.test.tsx`.
- From the fork, **type declarations only** (you copy three interfaces out of
  them and port nothing else): `src/workflow-activity-shared.ts`,
  `src/project-decor.ts`, `src/lifecycle.ts`. They are the source of the three
  cross-packet row types you declare in `src/row-props.ts` (Produce 3).
- From the fork, **mapped, not read whole**: `src/ThreadInbox.tsx` — use
  `grep -n "^function \|^const [A-Z]\|renderActiveThread\|CollapsibleShelf\|Shelf(\|ProjectGroups\|data-sidebar-thread" src/ThreadInbox.tsx`
  and then read only `renderActiveThread` (~1037–1180), the flat-shelf JSX, and
  `CollapsibleShelf` / `Shelf` / `ActiveEmptyState` (~1434–1719).
- Host: `bb/bb-0.41.0/docs/plugin-sidebar-thread-list.md` §8 (keyboard DOM
  contract) and `apps/app/src/components/sidebar/SplitPaneMiniMap.tsx`.
- The bug screenshot named in the brief §1, so you can see what "focused vs
  merely open" has to fix.

## Produce

1. **Pure row logic.** `src/pane-state.ts` — extend Q0's copy to the fork's
   complete surface: `PaneState`, `ACCENT_ROW_CLASS`, `SELECTED_ROW_CLASS`,
   `resolvePaneState`, `orderedPanes`, `paneOrdinal`, `isFocusedPane`,
   `rowBackgroundClass`, `rowEmphasisClass`, `rowSurfaceClass`,
   `rowTitleClass`, `railOpacity`, `showAccentRail`, `rowStateClasses`,
   `rowRootClasses`, `rowAccentStyle`. Names and behaviour verbatim — Q3, Q5,
   Q6 and the Liquid Glass theme are written against them. Port
   `src/pane-state.test.ts` whole.
2. **Row chrome.** `src/AccentRail.tsx`, `src/PaneGlyph.tsx`,
   `src/StatusGlyph.tsx`, `src/StatusSlot.tsx`, `src/status-tone.ts`,
   `src/ProviderGlyph.tsx`, `src/Disc.tsx`, `src/InlineThreadTitle.tsx`,
   `src/relative-time.ts`, plus their tests, ported unchanged.
3. **Row components.** `src/ThreadCard.tsx`, `src/SlimRow.tsx`,
   `src/SearchResults.tsx`, ported whole **including every optional prop they
   already carry** (`accent`, `accentSource`, `projectDecor`, `projectAccent`,
   `projectIconUrl`, `projectIconsAvailable`, `snoozePresets`, `wakeAt`,
   `workflowRuns`, `isSelected`, `onSelectionClick`, reorder controls). Those
   props are the seams Q3/Q4/Q5/Q6 fill; keeping them now is what makes those
   packets pure additions in `ThreadList.tsx` instead of edits here.
   The three types those props need are owned by packets that may not have
   landed, so you declare them **once, canonically and permanently**, in
   `src/row-props.ts`: `WorkflowRun` (Q3), `ProjectDecorEntry` (Q4),
   `ConfiguredSnoozePreset` (Q5), written as self-contained structural
   interfaces copied field for field from the fork's
   `src/workflow-activity-shared.ts`, `src/project-decor.ts` and
   `src/lifecycle.ts`, each with a comment naming its owning packet — **with
   one deliberate correction**, because this plugin owns its decor store
   instead of reading a sibling's: `ProjectDecorEntry.source` is
   `"manual" | "auto"`, the two values Q4's `project_decor.source` column
   actually holds, and *absence* is represented by no entry in the map, never
   by a synthetic row. The fork's `"project-icons" | "none"` union and its
   `NO_PROJECT_DECOR` sentinel are artefacts of the sibling read and are not
   ported; an accessor returns `ProjectDecorEntry | null`.

   `src/row-props.ts` carries three more things, for the same one-definition
   reason — they are cross-packet contract, not row plumbing:
   - `AccentSource = "thread" | "folder" | "project" | "project-decor" | "auto" | "none"`
     and `ResolvedAccentSource = { css: string | undefined; source: AccentSource }`.
     The fork's `"project-icons"` label becomes `"project-decor"` because the
     data is now this plugin's own. Q2 imports and re-exports both from
     `src/organization.ts`; Q4 implements `resolveAccentSource` against them in
     its own file. Neither rewrites the other's.
   - `SidebarSettingsValues` and `DEFAULT_SIDEBAR_SETTINGS`, copied field for
     field from the fork's `src/sidebar-settings.ts` **minus
     `linkProjectIconsColour`** (Q4 absorbs decor and Q6 drops that column):
     `snoozePresets: "30m, 2h, 1d, 1w"`, `inactiveThreadsEnabled: true`,
     `inactiveAfterHours: 6`, `autoSettleInactive: true`,
     `autoSettleAfterDays: 3`, `autoSettleOnMerge: true`,
     `autoProjectColours: true`. Q6 imports and re-exports them from
     `src/sidebar-settings.ts`; Q5's settings block falls back to them when Q6
     has not landed.
   - The five **access interfaces with a frozen default each**, which are what
     let `ThreadList.tsx` compile and render correctly before the packets that
     fill them land (Produce 8 uses them):
     `OrganizationAccess` / `EMPTY_ORGANIZATION_ACCESS` (Q2),
     `WorkflowAccess` / `EMPTY_WORKFLOW_ACCESS` (Q3),
     `DecorAccess` / `EMPTY_DECOR_ACCESS` (Q4),
     `LifecycleAccess` / `EMPTY_LIFECYCLE_ACCESS` (Q5),
     `SettingsAccess` / `DEFAULT_SETTINGS_ACCESS` (Q6).
     Each declares **only** the members `ThreadList.tsx`, `FolderShelf` and
     `LiveStrip` actually read, so a later packet's richer hook API is
     structurally assignable to it and neither side imports the other. For
     example
     `interface DecorAccess { projects: Record<string, ProjectDecorEntry>; decorFor(projectId: string): ProjectDecorEntry | null }`
     with `EMPTY_DECOR_ACCESS: DecorAccess = { projects: {}, decorFor: () => null }`.
     Derive each member list from the fork's `ProjectDecorApi`,
     `OrganizationApi`, `LifecycleApi`, `useWorkflowActivity`'s return type and
     `SidebarSettingsValues`, and list them in your report.

   `src/row-props.ts` is **not a placeholder and is never rewritten**: Q3, Q4
   and Q5 import their type from `./row-props` and re-export it under their
   module's own name, so each type has exactly one definition and no packet
   ordering can change it. Say in your report the exact field list you
   declared for each of the three row types, for the three contract items, and
   for the five access interfaces.
4. **Related threads (preservation).** `src/related-thread-tree.ts`,
   `src/RelatedThreadTree.tsx`, `src/ParentChip.tsx`, `src/SubagentsChip.tsx`
   and their tests, ported whole. `RelatedThreadTree` keeps its optional
   `workflowRuns` prop (Q3 fills it) and renders nothing extra when empty.
5. **Context menu, base.** `src/RowContextMenu.tsx` with only the items that
   need no other packet: open, open in split, rename (inline), pin/unpin,
   copy id/title, and the existing native actions. Leave the file's props
   object open (`organization?`, `decor?`, `lifecycle?` optional) so Q2 adds
   `Move to folder ▸` / `Remove from folder` / `Thread colour ▸`, Q4 adds
   `Project icon & colour…`, and Q5 adds snooze/settle **without touching the
   items you wrote**. Port the matching part of `RowContextMenu.test.tsx`.
6. **The list.** `src/ThreadList.tsx` — move the minimal list Q0 put in
   `app.tsx` into this file and grow it into the fork's flat list, reduced to
   what Q1 owns: project/threads data from `experimental_useSidebarThreads`,
   Pinned + Active + Inactive-free flat rendering, the search-results mode,
   `renderActiveThread(thread, shelf)` as the single card construction point
   (exported shape reused by Q2's `FolderShelf` render-prop), `CollapsibleShelf`
   / `Shelf` / `ActiveEmptyState`, the scroll container
   (`min-h-0 flex-1 overflow-y-auto px-1.5 pb-2`) that Q3 mounts into, and the
   minute clock for relative times. **Not** in Q1: folders (Q2), live strip
   (Q3), project glyphs (Q4), lifecycle shelves and parking (Q5), sort modes,
   project filter, multi-select (Q6). Where a later packet's section belongs,
   leave the render-prop or the container it needs, not a `TODO`.
7. **Registration.** Root `app.tsx` (there is no `src/app.tsx`): keep Q0's
   `experimental_threadList` (id `inbox`), now pointing at `ThreadList`, and
   add exactly two `experimental_threadHeaderAction` registrations, `parent`
   (`ParentChip`) and `children` (`SubagentsChip`). Q0 registered **no**
   settings section ("No other slot yet") and neither do you: the shell is
   `src/SidebarSettings.tsx`, which **Q6 owns and registers itself** at the
   `/* @settings-section (Q6) */` anchor you write in Produce 8. Do not
   register it, do not stub it, do not import it.
   Port `app.test.tsx` — it is the guard against the duplicate child-thread
   control (fork commits c8a4b29, d7e1a3a, 4b9deab, a816997) and must keep
   asserting exactly one thread list and exactly the header actions present in
   `HEADER_ACTIONS`. Q4 adds a third header action (`project`) and Q6 adds the
   settings section (id `glass-sidebar-settings`); write both assertions as
   extensible arrays — `expect(headerActionIds).toEqual(EXPECTED_HEADER_ACTIONS)`
   over an exported constant, and a settings-section count of "at most one,
   and exactly one once Q6 has landed" — so Q4 and Q6 extend the expectation
   rather than rewriting the assertion.
8. **Extension anchors in the shared files (binding on Q2–Q6).** Q2, Q3, Q4,
   Q5 and Q6 all add to `src/ThreadList.tsx`, `src/RowContextMenu.tsx` and the
   root `app.tsx`, and the plan's dependency table lets some of them run
   concurrently. Make every one of those additions collision-free by writing,
   at the exact point where each later packet's content belongs, one anchor
   comment per owner and nothing else.

   **`src/ThreadList.tsx`, top-level hook seams — this is the part that keeps
   the Rules of Hooks intact.** `renderActiveThread` is a helper called once
   per thread, so no packet may open a hook inside it or inside any other row
   loop. Declare, at the top level of the list component and **above**
   `renderActiveThread`, one mutable binding per later packet, each initialised
   to its `row-props.ts` default and each followed by its own anchor on its own
   line:

   ```tsx
   // Shared row inputs. Each later packet calls its hook immediately after its
   // own anchor and assigns the binding declared directly above it. The defaults keep this file
   // correct before those packets land. Hooks go here and nowhere else in
   // this file — never inside renderActiveThread or any row loop.
   let organization: OrganizationAccess = EMPTY_ORGANIZATION_ACCESS;
   // @hooks:organization (Q2)
   let workflow: WorkflowAccess = EMPTY_WORKFLOW_ACCESS;
   // @hooks:workflow (Q3)
   let decor: DecorAccess = EMPTY_DECOR_ACCESS;
   // @hooks:decor (Q4)
   let lifecycle: LifecycleAccess = EMPTY_LIFECYCLE_ACCESS;
   // @hooks:lifecycle (Q5)
   let settings: SettingsAccess = DEFAULT_SETTINGS_ACCESS;
   // @hooks:settings-selection (Q6)
   ```

   Every default `let` binding is declared immediately **before** its own
   `@hooks:*` anchor. A later packet inserts exactly one unconditional
   assignment immediately **after** that anchor —
   `organization = useOrganization();` — so the call is top level, runs on
   every render, and its position among the five is fixed by anchor order.
   Keep every default, anchor and inserted assignment above
   `renderActiveThread`; never move one to make room for another packet.
   These five bindings are also the **only** channel by which one packet's
   component reads another packet's data: Q2's `<FolderShelf>` and Q3's
   `<LiveStrip>` take `projectDecor={decor.projects}` from the `decor` binding
   declared above them, so folder headers, strip chips and rows show one map
   without Q4 editing either file, and without Q2 or Q3 depending on Q4 having
   landed.

   **`src/ThreadList.tsx`, render and row-prop anchors.** Inside the scroll
   container in render order: `{/* @slot:live-strip (Q3) */}`,
   `{/* @slot:folders (Q2) */}`, `{/* @slot:bulk-bar (Q6) */}`,
   `{/* @slot:parked-shelves (Q5) */}`; and in the row-props assembly that
   feeds `renderActiveThread`, one per line and for **props only — never a
   hook call**: `// @rows:accent (Q2)`, `// @rows:workflow (Q3)`,
   `// @rows:decor (Q4)`, `// @rows:lifecycle (Q5)`,
   `// @rows:selection-sort (Q6)`.

   **`src/RowContextMenu.tsx`**, between your base items and the native
   actions, in this order (§4.4 puts `Project icon & colour…` above
   `Thread colour ▸`): `{/* @menu:decor (Q4) */}`,
   `{/* @menu:organization (Q2) */}`, `{/* @menu:lifecycle (Q5) */}`.

   **Root `app.tsx`**: register the header actions from one array literal,
   `const HEADER_ACTIONS = [parentAction, childrenAction /* @header-actions (Q4) */]`,
   so Q4 appends one element instead of rewriting the registration; and add
   `/* @settings-section (Q6) */` inside the `definePluginApp` body, on its own
   line, where Q6 registers its settings shell.

   The rule every later packet follows, and which you state at the top of each
   of the three files in a three-line comment: **leave the anchor comment in
   place and insert your content immediately after your own anchor; never edit,
   move or reorder another packet's anchor.** Two packets can then patch the
   same file in either order with no textual overlap.
   Add `test/anchors.test.mjs` (Node) asserting: each of the 19 anchor ids
   above occurs exactly once in its own file (`src/ThreadList.tsx`,
   `src/RowContextMenu.tsx`, root `app.tsx`); each hook default `let` appears
   immediately before its matching `@hooks:*` anchor, every `@hooks:*` anchor
   appears **before** the `renderActiveThread` declaration, every matching
   assignment, when present, appears immediately after its anchor, and every
   `@rows:*` anchor appears **after** `renderActiveThread`; and no `use[A-Z]`
   call appears between the `renderActiveThread` declaration and the end of
   its body. Later packets extend the same test with their assignment and keep
   it passing by construction. List all 19 ids in your report.

9. **Keyboard DOM contract.** Every row anchor keeps
   `data-sidebar-thread-shortcut-target=""` and `data-sidebar-thread-id`, and
   `aria-current="page"` stays tied to `isActive` alone. Port
   `src/row-pane-state.test.tsx` whole; it is the contract test for §4.1.

## Drop (do not port)

- Upstream scaffolding: `bb.branding.icon: "PanelLeft"`, the `yusuf8834`
  package metadata, `THIRD_PARTY_NOTICES.md` as written (Q7 rewrites it),
  `CHANGELOG.md`, the fork's `docs/`.
- Dependencies no ported file imports: `@pierre/diffs`, `cron-parser`, `hono`,
  `vaul`, `bb-app`, and the Radix packages for menubar, navigation-menu and
  hover-card. Keep only the Radix packages your ported files actually import.
- Any `import * as` from `@hugeicons/core-free-icons`; icons come through
  Q0's `src/components/Icon.tsx` by name.
- `localStorage` keys: rename the `bb-sidebar:` **colon** prefix to
  `glass-sidebar:` (`glass-sidebar:active-grouping:v1`, `:active-sort:v1`,
  `:shelf-expansion:v1`, and the sidebar-settings cache key). The two plugins
  are installed side by side during the Q7 switch-over and must not share
  those preferences. Note the rename in your report; Q7 documents that these
  client-side preferences reset once. **Exception, do not rename:** the
  live-strip collapse keys `bb-sidebar.liveStrip.<key>` are fixed verbatim by
  brief §4.5, are asserted literally by the fork's `LiveStrip.test.tsx`, and
  Q3 ports them unchanged.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts` (Q0's tests plus
every test you ported, all green — the suite only grows); `bb plugin build`;
`node --test test/*.test.mjs`.

Budget (plan §4 — binding on every packet):
- `dist/app.js` ≤ 300 KB and `dist/server.js` ≤ 800 KB after `bb plugin build`;
  report both numbers.
- **No timers**: no `setInterval` anywhere except the two allowed owners (the
  minute clock in `ThreadList.tsx`, and Q3's 60 s workflow fallback); no server
  timers, no process spawning, no watchers. The only `bb.background` use in
  the completed plugin is Q5's preserved 5-minute auto-settle schedule.
- **No new dependencies**: `zod` is the only runtime dependency; anything else
  is a devDependency bundled by `bb plugin build`.
- Frontend RPCs on mount ≤ 4 plugin-wide. The four are allocated once, for the
  whole plan, and this allocation binds every packet: `getOrganization` (Q2),
  `listInboxOrder` (Q2), `getProjectDecor` (Q4), `listLifecycle` (Q5).
  `getSidebarSettings` (Q6, seeded from its localStorage cache) and
  `getWorkflowActivity` (Q3) load **after** first paint; every later refresh is
  signal-driven (realtime, `BroadcastChannel`, `visibilitychange`, host
  thread-list revision). Q1 itself issues no RPC on mount and must not add
  one.
- Named icon imports only.

Do NOT run `bb plugin install`, `bb plugin enable`, `bb plugin reload`, or
`bb theme set`.

Commit in the glass-sidebar repo only, no `git add -A`:
`git add <your files> && git commit -m "[Q1] port row states, cards, slim rows, and search results"`.
Report per brief §5, adding: the three type declarations in `src/row-props.ts`
with their fields, the full list of anchor ids you wrote and the file each
lives in, the two bundle sizes, and the test count.
