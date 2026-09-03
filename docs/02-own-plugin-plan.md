# Own-plugin split plan — Glass Sidebar (2026-09-03)

Decisions taken by the user on 2026-09-03 (do not relitigate):

1. Build a **new thread-list plugin under the user's own id**, porting features
   from the bb-sidebar fork rather than rebranding the fork.
2. **Absorb project icon and colour** into that plugin (own store, own
   classifier, own header glyph) so nothing depends on ariofrio's Project Icons
   or reads another plugin's SQLite file.
3. The three in-place weight fixes were applied first (see §1).

## 1. Baseline after the in-place fixes

| Plugin | Before | After | Commit |
|---|---|---|---|
| bb-sidebar `dist/app.js` | 5.91 MB (3.65 MB SVG paths from a wildcard `@hugeicons/core-free-icons` import added by packet P2) | 145 KB; glyph drawings arrive with Project Icons' `listProjectIcons` reply and merge into the decor map client-side; decor 60 s poll replaced by a `visibilitychange` refresh | `forks/bb-sidebar` `5356db7` |
| liquid-glass content script | `getAppearance` fetched every 30 s per open client (18.5 k calls in 8.5 h) | zero timers: repaints on the same-window appearance event, on a `MutationObserver` over the host's `#bb-app-theme` style element (palette switch from any client), and on `visibilitychange` | `bb-plugins/liquid-glass` `e64fde8`, v0.5.4 |
| project-icons `dist/server.js` | 4.13 MB (upstream design: the whole catalog's drawings are bundled so consumers never ship it) | **deferred**: measured 72 ms and 9.7 MB heap once per server start, not user-visible; the absorbed version below keeps drawings in an on-disk JSON read lazily | unchanged `7518030` |

Remaining timers in the fork, kept deliberately: the workflow-rows 60 s
fallback (accepted design, tested) and the minute clock for relative times.

## 2. Target shape

Two published plugins, both MIT, both in repos under `luisllenin02`:

| Package | Plugin id | Contributes |
|---|---|---|
| `bb-plugin-liquid-glass` (exists; move to its own GitHub repo) | `liquid-glass` | the two palettes, appearance settings, wallpaper route, CLI |
| `bb-plugin-glass-sidebar` (new) | `glass-sidebar` | `experimental_threadList` replacement, `experimental_threadHeaderAction` project chip, settings section, CLI |

The two stay independent: the sidebar reads only host data and its own
store; the theme styles the sidebar through the `data-thread-pane-state`,
`.bb-sidebar-*`, and `--thread-accent` contract already in the brief §4.

## 3. What the new sidebar plugin ports

Everything below already exists in the fork; the port is a copy into a fresh
tree with the upstream scaffolding removed, not a redesign. Source of truth for
behaviour is the brief (`00-brief.md` §4) and the fork's tests.

**From our packets (must port):**

- Row states: focused / open-in-split / idle with accent rail, pane glyph,
  `paneOrdinal` (B2; `pane-state.ts`, `ThreadCard.tsx`, `SlimRow.tsx`).
- Organisation store and RPCs: folders, members, thread and project accents,
  realtime `organization` signal, optimistic updates (B1; `organization.ts`,
  `useOrganization.ts`, tables in `server.ts`).
- Folder shelf: colours, menus, inline rename, pointer drag and drop,
  Alt+Up/Down (B3; `FolderShelf.tsx`, `FolderMenu.tsx`, `useFolderDrag.ts`).
- Live strip: Open panes and Now (B4; `LiveStrip.tsx`, split probes).
- Workflow rows under the origin thread from a read-only query of the
  workflows store (P5; `workflow-activity.ts`, `WorkflowRunRow.tsx`).
- Project glyph and colour on rows, folder headers, and strip chips, with
  thread → folder → project → project-icon → auto-colour precedence (P2/P9;
  `ProjectGlyph.tsx`, `project-glyphs.ts`, `RowContextMenu.tsx`).

**Absorbed from the Project Icons fork (our commits P8/P8b):**

- Auto colour mirrored from the sidebar hash rule (`auto-assign.ts`).
- Deterministic matter classifier over folder names and the first lines of
  `case_strategy.md` (`matter-classifier.ts`), "Re-detect all", manual picks.
- Icon picker: swatches plus a searchable catalog loaded on open via RPC
  (drawings from an on-disk `icon-catalog-glyphs.json`, never bundled).
- Header chip through `experimental_threadHeaderAction` instead of ariofrio's
  DOM patching of the host title bar (`header-dom.ts`). **Decision for the
  user:** the host title bar icon itself cannot be replaced through a public
  slot; the chip sits beside the title. Keep Project Icons installed only if
  the in-title icon matters more than a clean plugin.

**Upstream fork features the preservation rule protects (port in phase 2):**

- Pinned, Active, Inactive, Snoozed, Settled shelves; snooze / settle / wake;
  auto-settle schedule; inactive-thread rules (`lifecycle.ts`, `useLifecycle.ts`).
- Sort modes, project filter, multi-select bulk actions, search results.
- Favicon detection and custom icon upload route.
- Related-thread tree and single child-thread control; split actions; the
  nine keyboard shortcut targets (DOM contract in the host doc §8).

## 4. Weight budget (enforced by a contract test)

- `dist/app.js` ≤ 300 KB, `dist/server.js` ≤ 800 KB, no `setInterval` in
  either bundle except the minute clock and the workflow fallback.
- Frontend RPCs on mount ≤ 4; every later refresh is signal-driven
  (realtime channel, `BroadcastChannel`, `visibilitychange`, host thread-list
  revision).
- No server timers, no process spawning, no watchers; sibling stores are read
  only through the SDK database constructor and `experimental_dataDir`.
- Named icon imports only; a test greps the app bundle for the catalog.

## 5. Data migration

One CLI command `bb glass-sidebar import` copies, once, from
`<dataDir>/plugins/bb-sidebar/data.db` (`thread_folders`, `folder_members`,
`thread_accents`, `project_accents`, lifecycle rows) and from
`<dataDir>/plugins/project-icons/data.db` (`project_icon`), read-only, into
the new plugin's store. Nothing is deleted from the old stores.

## 6. Switch-over and rollback

Only one `experimental_threadList` plugin may be enabled. Sequence:
build and install `glass-sidebar` disabled → run the import → `bb plugin
disable bb-sidebar` → `bb plugin enable glass-sidebar`. Rollback is the
reverse; the fork stays installed until parity is confirmed by eye.

## 7. Execution

Same delivery model as phase 2 (Codex `gpt-5.6-sol` workers through the
`glass-sidebar-*.js` workflows, Fable as orchestrator, `maxActiveRuns 3`):

| Packet | Scope | Depends on |
|---|---|---|
| Q0 | Scaffold from the host doc's minimal example; store, migrations, contract test, weight test, CI | none |
| Q1 | Rows, pane state, accents, search results | Q0 |
| Q2 | Organisation store, folders, menus, drag and drop | Q0 |
| Q3 | Live strip and workflow rows | Q1 |
| Q4 | Project decor absorbed: store, classifier, auto colour, picker, header chip | Q0 |
| Q5 | Lifecycle shelves and auto-settle | Q1 |
| Q6 | Favicons and upload route, bulk actions, sort and filter | Q1 |
| Q7 | Import command, switch-over runbook, README, credits | Q1–Q6 |
| Q8 | Liquid Glass repo split, README, marketplace entries for both (submit-a-plugin skill) | Q7 |

Credits to carry in both READMEs: yusuf8834/bb-sidebar and
SawyerHood/bb-plugin-t3sidebar (patterns), ariofrio/bb-plugins (colour
anchors and picker idea), hardbeat920/monocode (palette and folder model).
