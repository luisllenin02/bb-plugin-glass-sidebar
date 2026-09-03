# Packet Q4 — Project decor absorbed: store, classifier, auto colour, picker, header chip

**Depends on: Q1 and Q2.** Wave 3 with Q5 and Q6. Downstream: Q7.

**Integration gate (read before you start).** Q1 and Q2 have landed. Apply the
header-action registration and row/menu wiring in Produce 7–8 directly at
Q1's `@header-actions`, `@hooks:decor`, `@rows:decor` and `@menu:decor`
anchors, and import Q2's `resolveAccent` directly. Produce
6's settings block plugs into `src/SidebarSettings.tsx`, which Q6 owns and may
be landing concurrently in wave 3. If that shell is absent, defer only the
`ProjectDecorBlock` mounting to Q7. Leave every anchor in place and never
touch another packet's anchor.

Work in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`.
This packet **absorbs** the project icon and colour feature so the plugin owns
it outright: its own store, its own classifier, its own picker, its own header
chip. Nothing here reads another plugin's SQLite file and nothing here depends
on ariofrio's Project Icons being installed (decision recorded in
`02-own-plugin-plan.md` §2 and §3).

Read `00-brief.md` §4.2 and §5, `02-own-plugin-plan.md` §3 ("Absorbed from the
Project Icons fork") and §4, `packet-Q0-scaffold.md`, `packet-P2-project-link.md`,
`packet-P8-project-icons-auto.md`, `packet-P8b-matter-icons.md`, and
`packet-P9-sidebar-icon-menu.md`, plus Q1's and Q2's reports in your prompt.
Do not touch `forks/bb-sidebar` or the vendored Project Icons tree.

**Entrypoint paths.** In this tree the plugin's entrypoints are the **root**
`app.tsx` and the **root** `server.ts` (Q0 Produce 2–3); everything else is
under `src/`. The vendored plugin's `server.ts` named in the Read list is
**its** file, not ours.

## Read

- Vendored Project Icons, source of the absorbed code —
  `/home/system/workspaces/LAL/Development/.bb/vendor/bb-plugins-ariofrio-39a8cf1a/plugins/bb-plugin-project-icons`:
  `matter-classifier.ts`, `matter-classifier.test.ts`, `test/fixtures/matters/**`,
  `auto-assign.ts`, `auto-assign.test.ts`, `project-icon-colors.ts`,
  `project-icon-colors.test.ts`, `icon-search.ts`, `icon-search.test.ts`,
  `IconPicker.tsx`, `store.ts`, `scripts/build-icon-catalog.mjs`, and
  `server.ts` lines 1–160 (RPC surface). `icon-catalog.json` — inspect its
  shape only (2,532 entries of `{name, export, category, tags}`); do not read
  it whole.
- From the fork, in full: `src/project-decor.ts`, `src/project-decor.test.ts`,
  `src/project-glyphs.ts`, `src/project-glyphs.test.ts`,
  `src/useProjectDecor.ts`, `src/ProjectGlyph.tsx`,
  `src/ProjectIconMenuItem.tsx`, and the project-icon half of `src/accent.ts`
  (`PROJECT_ICON_COLOR_NAMES`, the OKLCH anchors, `projectIconColorCss`,
  `autoProjectColorCss`).
- In the new tree: `src/accent.ts`, `src/organization.ts`, the root
  `server.ts` (migrations + contract), `src/components/Icon.tsx`,
  `src/ThreadCard.tsx`, `src/SlimRow.tsx`, `src/SearchResults.tsx`,
  `src/RowContextMenu.tsx`, `src/ThreadList.tsx`, `src/row-props.ts`, the root
  `app.tsx`, and `src/SidebarSettings.tsx` if Q6 has landed.
- SDK: `bb-plugin-sdk-app.d.ts` for `experimental_threadHeaderAction` /
  `PluginThreadHeaderActionProps`, and `bb-plugin-sdk.d.ts` for
  `experimental_aiServices` (`aiInferenceComplete`) and
  `bb.server.experimental_dataDir`.

## Produce

1. **`project_decor` is the single source.** Q0 created
   `project_decor (project_id TEXT PK, icon TEXT, color TEXT, source TEXT NOT
   NULL DEFAULT 'auto', updated_at INTEGER NOT NULL)`. Write
   `src/project-decor-store.ts` — `list`, `get`, `set` (writes
   `source: 'manual'`), `upsertAuto` (returns true only when an auto row was
   inserted or changed and **never** overwrites a manual row), `clear`,
   `clearManual` — modelled on the vendored `store.ts` but against this
   plugin's own table and column names. `color` holds one of the eight names
   `red orange yellow green teal blue purple pink`, or null.
2. **Classifier, ported unchanged.** `src/matter-classifier.ts` +
   `src/matter-classifier.test.ts` + `test/fixtures/matters/**`, copied
   verbatim from the vendored plugin with a credit comment (ariofrio/bb-plugins,
   our P8b commits). Keep every family, every keyword and weight, every
   reading cap (top-level listing ≤ 200 names; ≤ 100 names each in `notes/`,
   `pleadings/`, `_context/`, `work-product/`; first 80 lines of
   `case_strategy.md`; first 40 lines of any `_context/*.md`), and the rule
   that it never reads PDFs, DOCX, or `client-production/` and never sends
   content anywhere. `src/auto-assign.ts` + tests likewise: name rules,
   content rules, `AUTO_ICON_CHOICES`, `readTopLevelListing`,
   `reconcileProjectIcons`, and the reason strings (`matter:<family>`,
   `name:*`, `content:*`, `default`) with the top three scoring keywords.
3. **Auto colour by the sidebar hash rule.** `autoProjectColorCss(projectId)`
   in `src/accent.ts` is the single definition of the rule (the nine-entry
   `ACCENT_PALETTE` order from brief §4.2, hashed on the project id). Add,
   beside what Q0/Q2 wrote and without changing it: `PROJECT_ICON_COLOR_NAMES`,
   the OKLCH anchors copied verbatim from the vendored
   `project-icon-colors.ts` with its credit comment, `projectIconColorCss`,
   and `autoProjectColorCss`. On the server, map palette index → colour name
   (blue→blue, coral→red, amber→yellow, green→green, pink→pink, violet→purple,
   teal→teal, orange→orange, index 0→null) when writing an auto row, and pin
   that mapping plus three fixed project ids in tests. Because header chip and
   sidebar rows now read the same table, they match by construction.
4. **Icon drawings on disk, never in a bundle.** `scripts/build-icon-catalog.mjs`
   (adapted from the vendored script, network-free at build time, output
   committed) emits **two** files:
   - `assets/icon-catalog.json` — metadata only: `{ name, export, category, tags }`;
   - `assets/icon-catalog-glyphs.json` — `{ [name]: drawing }`, the
     `[tag, attributes][]` pairs `@hugeicons/react` renders.
   The server reads the glyph file **lazily** — on the first
   `getProjectGlyphs` or `listIconCatalog` call, via
   `readFile(new URL("../assets/icon-catalog-glyphs.json", import.meta.url))`
   — caches it in memory, and never touches it at import time (the plan §1
   measured 72 ms / 9.7 MB when the catalog is imported at start). Add a test
   that the asset resolves after `bb plugin build` and that `assets/` is in
   `package.json` `files`.
5. **RPCs** (new names, permitted by the plan because project decor is new
   data). **Naming rule, binding:** the fork already owns
   `listProjectIconSettings`, `searchProjectIconFiles`, `setProjectIcon` and
   `uploadProjectIcon` for the per-project **favicon** feature; brief §5
   forbids renaming an existing RPC to make room for new work, so Q6 ports
   those four under their existing names and **every decor RPC you add takes a
   collision-free `*ProjectDecor*` name**:
   `getProjectDecor({}) -> { projects: Record<projectId, { icon, iconColor, source }>, updatedAt }`
   (Q0 already declared it),
   `getProjectGlyphs({ projectIds: string[] }) -> { glyphs: Record<name, drawing> }`
   (bounded: ≤ 200 ids per call),
   `listIconCatalog({ query?, category? }) -> { icons: [...], total }`
   (the picker calls it once on open, results capped as in `icon-search.ts`;
   the fork has no RPC of this name, so it collides with nothing),
   `setProjectDecorIcon({ projectId, icon, color })`,
   `clearProjectDecorIcon({ projectId })`,
   `resetProjectDecorToAuto({ projectId })`,
   `redetectAllAutoIcons({})`.
   Do not declare, shadow, re-implement or rename `setProjectIcon` or any other
   favicon RPC; if one is already in the contract when you arrive, leave it
   exactly as it is.
   All inputs zod-validated; every mutation publishes realtime
   `project-decor` with `{ reason }`. `setProjectAccent` stays Q2's — do not
   duplicate it. Auto reconciliation runs on server start and on the first
   `getProjectDecor` of a session, for projects without a manual row, with a
   single publish when something changed; if `bb.events.on` exposes a
   project-created event, subscribe and assign on creation and name the event
   in your report. No polling, no timers.
6. **Frontend.** `src/project-decor.ts` (types: `ProjectDecorMap` and the
   `glyph?` carrier, over the `ProjectDecorEntry` it imports and re-exports
   from `./row-props` — Q1's canonical declaration, whose `source` is
   `"manual" | "auto"` to match your `project_decor.source` column, with
   absence represented by **no entry in the map**; there is no `"none"` row and
   no `NO_PROJECT_DECOR` sentinel in this plugin, and `decorFor` returns
   `ProjectDecorEntry | null`), `src/project-glyphs.ts` (adapted: fetch
   drawings from **this plugin's** `getProjectGlyphs`, not from
   `/api/v1/plugins/project-icons/rpc/listProjectIcons`; keep
   `parseProjectGlyphReply`, `mergeProjectGlyphs` and their tests),
   `src/useProjectDecor.ts` (loads `getProjectDecor`, refreshes on
   `useRealtime("project-decor")` and on `visibilitychange`, exposes
   `decorFor(projectId)`), `src/ProjectGlyph.tsx` (Project-decor Hugeicons
   glyph → favicon → tinted folder fallback, `data-project-glyph-source`),
   `src/IconPicker.tsx` + `src/icon-search.ts` + tests (ported from the
   vendored plugin; catalog loaded on open through `listIconCatalog`, Auto
   badge with the reason tooltip, "Auto-select", "Reset to auto",
   "Re-detect all"), and `src/ProjectDecorBlock.tsx` — the settings block
   showing each project's effective colour and source ("Manual", "Auto") with
   an `autoProjectColours` toggle, exported standalone with its own test. It
   takes its settings values as props (Q1's `SettingsAccess` /
   `DEFAULT_SIDEBAR_SETTINGS` in `src/row-props.ts`) so it compiles with or
   without Q6's settings hook. Q6 owns `src/SidebarSettings.tsx`: if Q6 has
   landed, mount the block there after Q6's
   `{/* @settings:project-decor (Q4) */}` anchor, leaving the anchor in place;
   if Q6 has not landed, ship the block and reproduce that one mounting step
   verbatim under `Deferred wiring` for Q7.
7. **Header chip.** `src/ProjectChip.tsx` registered in the **root** `app.tsx`
   (there is no `src/app.tsx`) as a third `experimental_threadHeaderAction`
   (id `project`): the project's glyph in its colour plus the project name,
   click opens `IconPicker` for that project. Register it by appending one
   element at Q1's `/* @header-actions (Q4) */` anchor inside the
   `HEADER_ACTIONS` array — nothing else in `app.tsx` changes, and you do not
   touch Q1's `/* @settings-section (Q6) */` anchor. Extend Q1's `app.test.tsx`
   expectation to `["parent", "children", "project"]` — extend the exported
   expectation array, never rewrite the assertion, and keep the
   single-child-thread-control guard intact.
   **Record for the user in the README and your report:** the host title bar's
   own project icon cannot be replaced through a public slot, so the chip sits
   beside the title. Keeping ariofrio's Project Icons installed is the only way
   to get the in-title icon, and the two plugins are independent.
8. **Accent source, row and menu wiring.**
   - **`src/accent-source.ts` is yours, and it is a new file, not an edit to
     Q2's.** In the fork, `resolveAccentSource` lives in `organization.ts` and
     reaches into project-icon colours; here the last two precedence steps are
     *your* data, so you own the whole function and Q2 owns only the three
     manual steps (`resolveAccent`). Write `resolveAccentSource(threadId,
     projectId, organization, decor, options)` in `src/accent-source.ts`,
     returning Q1's `ResolvedAccentSource` over Q1's `AccentSource`, with the
     brief §4.2 precedence extended by the two decor steps in this order:
     thread → folder → project (delegate to Q2's `resolveAccent`) →
     `projectIconColorCss(decor[projectId]?.iconColor ?? null)` with
     `source: "project-decor"` → `autoProjectColorCss(projectId)` with
     `source: "auto"` when `options.autoProjectColours !== false` → else
     `{ css: undefined, source: "none" }`. There is no `linkProjectIconsColour`
     option: the setting is dropped (Q2 and Q6 drop it too), so the decor step
     is unconditional. Port the fork's `resolveAccentSource` test cases here,
     relabelled `project-decor`. Import `folderOf` and `resolveAccent` directly
     from Q2's `src/organization.ts`; do not duplicate or locally fall back
     from that three-step resolution, and never edit Q2's file.
   - `src/RowContextMenu.tsx`: after the `{/* @menu:decor (Q4) */}` anchor,
     which Q1 placed above Q2's organisation anchor so the item lands above
     `Thread colour ▸`, add `Project icon & colour…` opening this plugin's own
     picker (no BroadcastChannel, never disabled for a missing sibling plugin).
   - `src/ThreadList.tsx`, two anchors. Q1 declares the default `decor`
     binding immediately **before** `// @hooks:decor (Q4)` at the top level of
     the list component. Insert exactly one unconditional line immediately
     **after** that anchor — `decor = useProjectDecor();` — assigning the
     existing binding. Keep the default, anchor and assignment above
     `renderActiveThread`. Your hook goes here and nowhere else in this file;
     `renderActiveThread` runs once
     per thread, so a hook opened inside it would run in a loop. `ProjectDecorApi`
     must be structurally assignable to Q1's `DecorAccess`
     (`{ projects, decorFor(projectId): ProjectDecorEntry | null }`); widen your
     own API rather than editing `row-props.ts`. Then, after
     `// @rows:decor (Q4)`, add **props only** — `projectDecor` and
     `accentSource` from `resolveAccentSource` — to the row props
     `renderActiveThread` receives.
   - **How folder headers and strip chips get the same map.** They read Q1's
     `decor` binding too: Q2 passes `projectDecor={decor.projects}` to
     `<FolderShelf>` at its own anchor and Q3 passes the same to `<LiveStrip>`
     at its own anchor, both specified in their packets. You add nothing to
     their code and they import nothing of yours; before you land, both see
     `EMPTY_DECOR_ACCESS.projects` (`{}`) and fall back correctly. Prove the
     shared result rather than asserting it: add a render test that mounts the
     list with a seeded decor map and asserts a row, a folder header and a
     live-strip chip for the same project all show the same colour and glyph
     source, skipping whichever of the three is absent because its packet has
     not landed, and name in your report which of the three were exercised.
   Leave every anchor comment in place and touch no other packet's anchor.
   `src/row-props.ts` is Q1's canonical declaration of `ProjectDecorEntry` and
   you do **not** rewrite it: `src/project-decor.ts` imports the type from
   `./row-props` and re-exports it under its own name, so the structural type
   keeps exactly one definition.
9. **"Suggest with AI" stays click-only and optional.** Rendered only when
   `experimental_aiServices` is available on the host, never run
   automatically, never on load, one `aiInferenceComplete` call per explicit
   click, sending only the project name, the top-level listing names, and the
   candidate icon names. Absent service → the button is not rendered. Test
   both branches with a stubbed service.

## Drop (do not port)

- `icon-catalog.generated.ts` (the 5,071-line TS module of drawings) — replaced
  by the lazily-read `assets/icon-catalog-glyphs.json`. The app bundle must
  never contain catalog drawings; keep Q0's contract-test grep.
- The sibling-store SQLite reader for project icons — `readProjectIconStore`,
  `projectIconStorePath`, `PROJECT_ICON_STORE_CACHE_TTL_MS`,
  `invalidateProjectIconStoreCache` and their tests. The absorbed
  `project_decor` store replaces them. (Q3's **workflows** sibling reader is a
  different store and stays.)
- `broadcast.ts` / `PROJECT_ICONS_BROADCAST_CHANNEL` /
  `postProjectIconPickerRequest` / `OpenProjectIconPickerMessage` and the
  disabled-when-Project-Icons-is-missing tooltip: this plugin owns the picker.
- `header-dom.ts` — ariofrio's DOM patching of the host title bar. The chip is
  a registered slot.
- The `linkProjectIconsColour` setting — meaningless once decor is absorbed.
  Keep `autoProjectColours`.
- `import * as` from `@hugeicons/core-free-icons` anywhere in `src/`.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`; `bb plugin build`;
`node --test test/*.test.mjs`. Suite only grows. Verify the classifier against
**five of the vendored fixture directories you copied into
`test/fixtures/matters/**`** — name the five you used (the vendored set
includes `construction`, `contract`, `foreclosure`, `landlord-tenant`,
`personal-injury`, `probate`, `collections`, `employment`, `family`, `appeal`,
`fallback` and more) and report each one's family, icon and reason. Do **not**
run the classifier over real matter folders: the brief forbids reading them,
QP limits you to the files this packet lists, and the classifier inspects
directory listings and `case_strategy.md` content, not just names. If you want
a case the fixtures do not cover, add a synthetic fixture directory under
`test/fixtures/matters/` and say so.

Budget (plan §4 — binding on every packet):
- `dist/app.js` ≤ 300 KB, `dist/server.js` ≤ 800 KB; report both. The glyph
  asset is read at runtime and is not counted in `server.js`; assert that it is
  not bundled into either file.
- **No timers**: no `setInterval` anywhere in your own files, and plugin-wide
  no `setInterval` except the two owners the plan allows — the minute clock in
  `ThreadList.tsx` (Q1) and Q3's 60 s workflow fallback in
  `useWorkflowActivity.ts`. Q1 and Q3 landed in earlier waves, so the build
  legitimately contains theirs; assert the allowlist (exactly those two
  owners), not absence. No server timers, process spawning or watchers. The only
  `bb.background` use in the completed plugin is Q5's preserved 5-minute
  auto-settle schedule; this packet adds none. Auto reconciliation is
  start-and-signal driven.
- **No new dependencies**: `zod` only at runtime; `@hugeicons/*` stay
  devDependencies bundled by `bb plugin build`.
- Frontend RPCs on mount ≤ 4 plugin-wide, allocated once for the whole plan:
  `getOrganization` (Q2), `listInboxOrder` (Q2), `getProjectDecor` (**yours**),
  `listLifecycle` (Q5). `getSidebarSettings` (Q6) and `getWorkflowActivity`
  (Q3) load after first paint. `useProjectDecor` issues `getProjectDecor` once
  on mount and refreshes only on the `project-decor` realtime channel and
  `visibilitychange`; `getProjectGlyphs` rides the same load or a signal, never
  a separate mount call; `listIconCatalog` is on-open, never on mount.
- Named icon imports only.

No `bb plugin install`, `enable`, `reload`, or `bb theme set`.

Commit (no `git add -A`):
`git add <your files> && git commit -m "[Q4] absorb project decor: store, classifier, picker, header chip"`.
Report per brief §5, adding: the family → export table, the five **fixture**
classifications with their families, icons and reasons, the palette-index →
colour-name mapping, the
project-created event name if one exists, the glyph asset size, whether
`experimental_aiServices` was available, the anchors you filled, confirmation
that `useProjectDecor` is called only immediately after `// @hooks:decor (Q4)`,
with its default binding immediately before the anchor, which of the
three shared decor consumers (row, folder header, strip chip) the shared-result
test exercised, and — if Q6 had not landed — a `Deferred wiring` section
reproducing Produce 6's settings mount verbatim for Q7.
