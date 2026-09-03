# Packet P2 — Sidebar phase 2: project icon and colour linked automatically

Work in `/home/system/workspaces/LAL/Development/forks/bb-sidebar`, branch
`feat/folders-colors-glass` (HEAD f30bb07, clean, 282 tests). Read brief §2,
§4.1–§4.5, §5 (Preservation rule binds you) and addendum §2 first.

User direction (2026-09-02): the sidebar colour for active threads should be
linked to and combined with the Project Icons plugin's colour; the sidebar
should show the project's icon and colour; and the linking should happen
automatically.

## Facts you build on

- **Project Icons** (plugin id `project-icons`, installed and running) stores
  one row per project in its own SQLite: table `project_icon(project_id, icon,
  color, updated_at)`; `icon` is a Hugeicons name, `color` is one of bb's
  eight favicon colour names (`red orange yellow green teal blue purple pink`)
  or null. Source (read-only reference):
  `/home/system/workspaces/LAL/Development/.bb/vendor/bb-plugins-ariofrio-39a8cf1a/plugins/bb-plugin-project-icons/{server.ts,store.ts,project-icon-colors.ts,broadcast.ts}`.
  Its database is `<bb data dir>/plugins/project-icons/data.db` (on this host
  `/home/system/.bb/plugins/project-icons/data.db`). Plugins cannot call each
  other's RPC or subscribe to each other's realtime, so Project Icons posts
  `{ type: "icons-changed" }` on the frontend `BroadcastChannel`
  `"bb.project-icons"` for exactly this purpose.
- `project-icon-colors.ts` defines the OKLCH anchors per colour name with
  per-mode lightness via `light-dark()`, fitted for ≥ 3.5:1 on every built-in
  theme. Reuse those anchors verbatim (credit the origin in a comment) so the
  sidebar colour matches the header icon exactly.
- The fork already has: favicon-based project icons (`src/project-icons.ts`,
  `ProjectIconSettings.tsx`, the `/project-icon` HTTP route), the
  organisation store with `project_accents` and `resolveAccent(threadId,
  projectId, org)` (thread → folder → project) in `src/organization.ts`,
  `accentCss()` in `src/accent.ts`, the accent rail (`AccentRail.tsx`), folder
  headers, and the live strip chips (`LiveStrip.tsx`) that all consume one
  resolved accent string.

## Produce

### Server (`src/server.ts`, new `src/project-decor.ts`)

- `readProjectIconStore()` opens the Project Icons database **read-only**
  (`better-sqlite3` with `{ readonly: true, fileMustExist: true }`), derives its
  path from this plugin's own database file path (`db.name` of
  `bb.storage.database()` → sibling directory `project-icons/data.db`), returns
  `Record<projectId, { icon: string; color: string | null }>`, and returns `{}`
  without throwing when the file or table is missing (Project Icons not
  installed). Never write to that database. Cache for 5 s.
- RPC `getProjectDecor({}) -> { projects: Record<projectId, { icon: string|null; iconColor: ColorName|null; source: "project-icons"|"none" }> }`.
- Tests with `createFakePluginHost`: missing file → `{}`; a temp SQLite with the
  Project Icons schema → rows read; malformed colour → null.

### Accent resolution (`src/organization.ts`, `src/accent.ts`)

Extend the precedence, first non-empty wins, and export it as
`resolveAccentSource(threadId, projectId, org, decor)` returning
`{ css: string | undefined; source: "thread" | "folder" | "project" | "project-icons" | "auto" | "none" }`:

1. thread accent (manual),
2. folder accent,
3. project accent (manual, in the fork's own store),
4. **Project Icons colour** → CSS `light-dark(oklch(...), oklch(...))` from the copied anchors,
5. **auto colour**: a stable pick from the nine-colour palette by hashing the project id (monocode's `tabGroupColor` approach, credit it) — so every project has a colour even before anyone picks one. Add a sidebar setting `autoProjectColours` (default on) and `linkProjectIconsColour` (default on) in `sidebar_settings` + `SidebarSettings.tsx`, preserving all existing settings.

`accentCss()` must pass `light-dark()` strings through unchanged.

### Frontend

- `src/useProjectDecor.ts`: loads `getProjectDecor`, refreshes on the
  `bb.project-icons` `BroadcastChannel` message, on `useRealtime(PROJECT_ICONS_CHANNEL)`
  (the fork's own favicon channel), and every 60 s; exposes `decorFor(projectId)`.
- Row project line (`ThreadCard.tsx`, `SlimRow.tsx`, `SearchResults.tsx`):
  render the project glyph as, in order: the Project Icons Hugeicons icon
  (through the fork's `Icon` component; if the name is not in
  `@hugeicons/core-free-icons`, fall back) in the project colour → the
  existing favicon image → a `Folder01Icon` tinted with the resolved accent.
  Project name keeps its muted text; the glyph carries the colour. Add
  `data-project-accent-source` on the row root for tests and themes.
- Wire the extended resolver into `ThreadInbox.tsx` (`renderActiveThread`),
  folder headers, and `LiveStrip.tsx` chips so all three agree.
- `SidebarSettings.tsx` "Project colours": show each project's effective
  colour and its source ("From Project Icons", "Manual", "Auto"), the two
  new toggles, and a "Clear manual override" per project. Link text: "Icon
  and colour come from the Project Icons plugin when set."

### Tests

`resolveAccentSource` precedence for all five sources; `light-dark` string
passes through `accentCss`; rows render `data-project-accent-source`; the
Hugeicons glyph renders when the decor has a known icon name and falls back
otherwise; the live strip chip uses the same colour as the card for the same
thread; settings toggles persist through the RPC; the full suite stays green
and only grows.

## Constraints

- Preservation rule: every existing feature, export, RPC, table, setting and
  test stays; extend beside them.
- Read-only access to the Project Icons database; no schema changes to it.
- Token classes only; colours as inline style custom properties.
- No reload/install; commit your files with `[P2] project icon and colour linked to rows`.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`. Report per brief §5.
