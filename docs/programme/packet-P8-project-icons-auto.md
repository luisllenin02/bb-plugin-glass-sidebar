# Packet P8 — Project Icons: automatic colour (mirrored from the sidebar) and automatic icon

Work in the user's vendored, path-installed copy of the Project Icons plugin:
`/home/system/workspaces/LAL/Development/.bb/vendor/bb-plugins-ariofrio-39a8cf1a/plugins/bb-plugin-project-icons`
(git repo root is two levels up, upstream `ariofrio/bb-plugins`, branch
`main`, only two tracked type files modified). Create branch
`feat/auto-icon-colour` from `main` before editing, commit there, and leave
`main` untouched. Read brief §5 (Preservation rule) and addendum §2 first.

User direction (2026-09-02): "the auto colour for projects works in the
sidebar, but it is not reflected on the thread title icon/colour plugin.
Possible to have them linked/mirrored? Also the icon picker has a lot of
icons; possible to auto-select an icon based on the content/matter of the
project?"

## Read

1. This plugin: `README.md`, `server.ts` (RPC contract, store wiring, realtime
   `icons-changed`), `store.ts` (schema, `PROJECT_ICON_COLORS`), `broadcast.ts`,
   `project-icon-colors.ts`, `app.tsx` (header icon + picker mount),
   `IconPicker.tsx` (picker UI), `icon-search.ts`, `icon-catalog.json`
   (2,532 entries: `name`, `export`, `category`, `tags`), existing tests.
2. The sidebar's auto-colour rule you must mirror exactly:
   `/home/system/workspaces/LAL/Development/forks/bb-sidebar/src/accent.ts`
   and `src/organization.ts` (grep `auto`, `hash`, `ACCENT_PALETTE`,
   `ACCENT_NAMES`, `resolveAccentSource`) and `src/project-decor.ts`
   (how the sidebar reads this plugin's rows and the precedence
   thread → folder → manual project → Project Icons → auto).
3. SDK: `backend-events.md` (`bb.events.on` lifecycle events — check whether a
   project-created event exists), `backend-foundation.md` (`bb.sdk.projects`
   listing, `bb.storage`), and `bb-plugin-sdk.d.ts` for
   `experimental_aiServices` (`aiInferenceComplete`) in case the optional
   AI suggestion is feasible.

## Produce

### 1. Auto colour, mirrored

- Add a `source` column to `project_icon` via a migration: `'manual'` for
  every existing row, `'auto'` for rows this packet writes. Manual rows are
  never overwritten by automation. `setProjectIcon` from the picker writes
  `manual`; a new RPC `resetProjectIconToAuto({ projectId })` deletes the
  manual row and recomputes.
- Copy the sidebar's auto-colour rule **verbatim** (same hash of the project
  id, same nine-entry palette order, credit the file) into
  `auto-assign.ts`, then map the palette index to this plugin's eight names:
  blue→blue, coral→red, amber→yellow, green→green, pink→pink,
  violet→purple, teal→teal, orange→orange, none→null. Result: for any
  project without a manual colour, this plugin stores the auto colour, the
  sidebar's precedence then finds a Project Icons colour and uses it, so
  header and sidebar match by construction. Add a test that pins the mapping
  and one that computes the colour for three fixed project ids and asserts
  the values the sidebar would produce (copy those expected values from a
  quick run of the sidebar's function and note the commit you took them from).

### 2. Auto icon

`suggestIcon(project: { id, name, path }, listing: string[])` in
`auto-assign.ts`, deterministic, no network, no model calls:

1. **Name rules** (first match wins; case-insensitive; keep the table in one
   place with tests): a matter folder `Last, First 1101.XXXX` (regex on the
   four-digit dot four-digit matter number) → a law icon (choose from the
   catalog by tags `law`, `legal`, `court`, `justice`, `scale`; record the
   chosen `export`), `esq|counsel|law|legal` → briefcase, `dev|development|
   plugin|code|repo|src` → code, `docs|notes|writing` → document,
   `personal|home` → user, `finance|billing|invoice` → money,
   `design|ui|theme` → paint, `data|db|sql` → database, `mobile|ios|android`
   → smartphone, `web|site` → globe.
2. **Content rules** when the name matches nothing: from a shallow directory
   listing (top level only, via `bb.sdk` file access or Node `fs` readdir
   with a 200-entry cap): `package.json`/`pnpm-lock.yaml`/`Cargo.toml`/
   `pyproject.toml`/`go.mod` → code; a majority of `.docx/.pdf/.msg` →
   document; `.git` alone → git branch icon; otherwise the folder default.
3. Return `{ icon: export, reason: "name:matter" | "name:dev" | "content:package.json" | "default" }`.

Apply the auto icon the same way as the auto colour (row with `source: 'auto'`
only when no manual row exists).

### 3. When automation runs

- On server start and whenever `listProjectIcons` is asked for the first time
  in a session: for each project from `bb.sdk.projects` without a manual row,
  compute icon + colour and upsert an `auto` row if it differs (one
  `icons-changed` publish only when something changed). If a project-created
  event exists in `bb.events.on`, subscribe and assign on creation; record
  the event name in the report. No polling, no timers.
- Picker: show a small "Auto" badge on the current icon and colour when the
  row is `auto`, an "Auto-select" button that reruns `suggestIcon` and
  shows the reason, and a "Reset to auto" action for manual rows.
- Optional, only if `experimental_aiServices` is available on this host
  and only on explicit click: a "Suggest with AI" button that sends the
  project name plus the top-level listing (names only) and the list of
  candidate icon names from the name/content rules' categories to
  `aiInferenceComplete` and pre-selects the returned icon. It never runs
  automatically. If the service is absent, the button is not rendered.

### 4. Docs and tests

README: "Automatic icon and colour" section including the parity promise
with the sidebar. Tests: migration marks existing rows manual; auto rows
never overwrite manual; mapping table; three-id parity; name rules; content
rules with a temp directory; single publish on change; RPC shapes. Bump the
plugin version.

## Constraints

Preservation rule for this plugin too: picker, catalog, search, header icon,
broadcast all stay. No writes to any other plugin's store. Commit on the new
branch with subject `[P8] automatic project icon and colour`. No reinstall
(I1 does it).

## Verify

`npm test` (or the plugin's vitest config), `npx tsc --noEmit`, `bb plugin build`. Report per brief §5 with the chosen law icon export and the three parity values.
