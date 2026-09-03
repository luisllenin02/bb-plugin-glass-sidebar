# Packet Q7 — Import command, switch-over runbook, rollback, README, credits

**Depends on: Q1, Q2, Q3, Q4, Q5, Q6.** Wave 4. Nothing depends on Q7 except
Q8.

Work in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`.
This packet closes the plugin: it writes the one-shot data migration, the
runbook that swaps the fork out for it, the rollback, and the documentation.
**It does not execute the switch-over.** `bb plugin install`, `bb plugin
enable`, `bb plugin disable`, `bb plugin reload` and `bb theme set` are run by
the orchestrator/user in the separate integration step, never by this worker
(brief §5). You may run `bb plugin build`, `npx tsc`, vitest and `node --test`.

Read `00-brief.md` §5, `02-own-plugin-plan.md` §5 and §6 in full,
`packet-Q0-scaffold.md`, and the reports of Q1–Q6 in your prompt.

**Entrypoint paths.** In this tree the plugin's entrypoints are the **root**
`app.tsx` and the **root** `server.ts` (Q0 Produce 2–3); everything else is
under `src/`. There is no `src/app.tsx`. A `src/server.ts` below is the
**fork's** file.

**Working directory.** Every command in this packet and in the runbook runs
either in `/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar`
(npm, tsc, vitest, `bb plugin build`, `node --test`) or with an absolute path.
The slot-conflict guard lives outside this repo, at
`/home/system/workspaces/LAL/Development/forks/check-plugin-slot-conflicts.py`,
and must always be invoked by that absolute path — a relative
`forks/check-plugin-slot-conflicts.py` does not resolve from the plugin repo.

## Read

- The new tree's root `server.ts` migrations array and RPC contract, and
  `package.json` — you need the exact table and column names Q0–Q6 landed.
- From the fork, **schemas only** (`git -C forks/bb-sidebar show HEAD:src/server.ts | sed -n '44,112p'`):
  `thread_lifecycle` (`thread_id, settled_at, settled_override, snoozed_until,
  snoozed_at`), `inbox_order`, `project_icons`, `sidebar_settings`,
  `project_icon_uploads`, `thread_folders`, `folder_members`, `thread_accents`,
  `project_accents`.
- From the vendored Project Icons, schema only:
  `.bb/vendor/bb-plugins-ariofrio-39a8cf1a/plugins/bb-plugin-project-icons/store.ts`
  — `project_icon (project_id, icon, color, updated_at, source)`.
- `bb-plugins/liquid-glass/server.ts` around line 125 — the `bb.cli.register`
  shape to copy (`name`, `summary`, `commands`, `run(argv)` returning
  `{ exitCode, stdout?, stderr? }`).
- `forks/check-plugin-slot-conflicts.py` — read it so the runbook invokes it
  correctly.
- `packet-P5d-store-path.md` — the data-dir resolution rule the import reuses.

## Produce

1. **Integration completion — you are the deterministic wiring owner.** Q1
   lands before Q2–Q6, and Q4 also depends on Q2, so list, row, menu and header
   wiring against Q1/Q2 is never deferrable. Q4, Q5 and Q6 share wave 3,
   however, so Q6's settings shell and bulk bar may land before the blocks and
   RPCs that fill them. Q2, Q4, Q5 and Q6 report only those cross-packet
   settings/bulk mountings they could not apply under a `Deferred wiring`
   heading, reproducing the Produce step verbatim. Before anything else in
   this packet:
   - Read the `Deferred wiring` section of every Q1–Q6 report in your prompt
     and apply each deferred step exactly as written, at its own anchor,
     leaving the anchor comment in place and touching no other packet's anchor.
     The full set of deferrable items, so you can check none was silently
     dropped: Q2's `ProjectColoursBlock` mounting; Q4's `ProjectDecorBlock`
     mounting; Q5's `LifecycleBlock` mounting and the two bulk lifecycle
     buttons; Q6's three settings-block mountings and its bulk-button
     enabling. Q2's list/menu wiring, Q4's header-action and row/menu wiring,
     and Q6's settings-section registration are **not** deferrable under the
     dependency graph — if any is missing, that is a blocking finding, not a
     step you invent.
   - Then verify the wiring of **every** packet, landed or deferred, by
     assertion rather than by eye: extend `test/anchors.test.mjs` (Q1's) so
     each anchor id still occurs exactly once — including Q6's
     `@settings:*` and `@bulk:lifecycle` ids — and that each default hook
     binding appears immediately before its `@hooks:*` anchor, each landed
     assignment appears immediately after its anchor, and every default,
     anchor and assignment stays above the `renderActiveThread` declaration
     with no `use[A-Z]` call below it inside that helper. Add
     `test/integration-complete.test.mjs` asserting that for every packet that
     has landed, its anchor is followed by that packet's content — the folder
     shelf and thread-accent props (Q2), the live strip and `workflowRuns`
     (Q3), the project chip in `HEADER_ACTIONS`, the decor menu item and
     `projectDecor` props (Q4), the parked shelves and lifecycle menu items
     (Q5), the bulk bar, the sort controls and the settings-section
     registration (Q6). An anchor still standing empty for a landed packet is a
     **blocking** finding: report it, do not paper over it.
   - Four of these are **behaviour**, not text, and get rendered assertions
     rather than a grep: the settings section renders all three foreign blocks
     (project colours, project decor, lifecycle) once mounted; the bulk
     Settle and Snooze buttons are enabled and call `bulkSettle` / `bulkSnooze`;
     a row, a folder header and a live-strip chip for one project show the same
     decor colour and glyph source; and the list mounts with the hook order
     stable across a re-render (React logs no hook-order warning).
   - Record in your report which deferred steps you applied and for whom, and
     which of the four behaviour assertions passed.
   - Extend Q0's wildcard-import contract scan so it checks the root
     `server.ts` and root `app.tsx` as well as `src/`; no `import * as` from
     `@hugeicons/core-free-icons` may hide in either entrypoint.

2. **`bb glass-sidebar import`** — registered with `bb.cli.register` in the
   root `server.ts` (surgical addition), subcommands
   `import [--dry-run] [--force] [--from <dataDir>]`, plus `help`.
   - Source paths: `<dataDir>/plugins/bb-sidebar/data.db` and
     `<dataDir>/plugins/project-icons/data.db`, with `<dataDir>` from
     `bb.server.experimental_dataDir`, the `db.name` sibling directory as the
     documented fallback, and `--from` as an explicit override.
   - Opened **read-only** (`{ readonly: true, fileMustExist: true }`). Nothing
     is ever written to, renamed in, or deleted from either source.
   - Copies, table by table, into this plugin's own store: `thread_folders`,
     `folder_members`, `thread_accents`, `project_accents`, `inbox_order`,
     `project_icons`, `project_icon_uploads`, `sidebar_settings` (minus
     `link_project_icons_colour`, dropped by Q6), and `thread_lifecycle`.
     **`thread_lifecycle` needs all eight columns, not four.** The destination
     table is Q0's `(thread_id, state NOT NULL, wake_at, updated_at)` plus the
     four columns Q5 appended, and Q0's two NOT NULL constraints still apply,
     so an insert of only the fork's four fields fails. Map the fork's
     `settled_at`, `settled_override`, `snoozed_until`, `snoozed_at` across
     unchanged and derive the remaining three with **Q5's exported helper**,
     `legacyLifecycleColumns(row, now)` from `src/lifecycle.ts` — never a
     second, private copy of that rule — using the import's start timestamp as
     `now`. From Project Icons: `project_icon (project_id, icon, color,
     source)` → `project_decor (project_id, icon, color, source, updated_at)`,
     supplying `updated_at` (also NOT NULL) from the source row's `updated_at`
     when present and the import timestamp otherwise.
   - **Idempotent**: `INSERT … ON CONFLICT DO NOTHING` per row, so a second run
     changes nothing; `--force` overwrites existing rows instead; `--dry-run`
     reports the same counts and writes nothing. Output is a per-table table of
     `read / inserted / skipped`, plus one line per missing source file
     (missing is not an error — it prints `missing` and exits 0).
   - Publishes `organization`, `project-decor`, `lifecycle`,
     `sidebar-settings` and `inbox-order` once each at the end, only when
     something changed, so a running client repaints without a reload.
   - Tests (`vitest` for the copier, `node --test` for the CLI wiring) against
     temp SQLite fixtures carrying the real source schemas: full copy; second
     run inserts nothing; `--force` overwrites; missing file; a source table
     that does not exist; a malformed colour or unknown folder id is skipped
     with a counted warning rather than aborting the run. Two of these are
     required by name: an **import round-trip against the plugin's real
     migration list from empty** — build the destination with the actual
     migrations Q0–Q6 landed, import a fixture carrying the fork's four-column
     lifecycle rows and the vendored `project_icon` rows, and assert every
     insert succeeds with no `NOT NULL constraint failed`, that `state` /
     `wake_at` / `updated_at` match `legacyLifecycleColumns`, and that reading
     the rows back through `listLifecycle` reproduces the source shelves; and a
     second run of the same import asserting zero further inserts.
3. **Mount-RPC audit.** The plan's budget is ≤ 4 frontend RPCs on mount, and
   the allocation is fixed in advance by the packets themselves, so this is a
   verification step and not a design step. The four first-paint reads are
   `getOrganization` (Q2), `listInboxOrder` (Q2), `getProjectDecor` (Q4) and
   `listLifecycle` (Q5). The two remaining reads are deliberately off first
   paint: `getSidebarSettings` (Q6) is seeded synchronously from
   `cachedSidebarSettings` in localStorage and fetched after first paint, and
   `getWorkflowActivity` (Q3) is fetched after first paint because workflow
   child rows are additive. Q5's initial idempotent auto-settle evaluation
   runs *inside* `listLifecycle`; it never creates a separate mount-time
   `evaluateAutoSettle` call. Prove it, do not assume it: add
   `test/mount-rpc-budget.test.mjs` (or a vitest render test, whichever can
   observe the transport) that renders the whole list through
   `createFakePluginHost`, uses the SDK testing runtime's RPC call log, and
   awaits all pending React effects before inspecting the log. Assert that the
   complete initial mount-and-effect-settling window contains **exactly**
   `getOrganization`, `listInboxOrder`, `getProjectDecor` and `listLifecycle`:
   no fifth automatic RPC and specifically no `evaluateAutoSettle`. Report the
   observed ordered log and set.
   **Do not add a bootstrap, batch or coalescing RPC.** Packet QP permits new
   RPC names only where the plan introduces new data (project decor,
   lifecycle); a bootstrap method is neither, and inventing one here would
   amend the shared contract from inside a leaf packet. If the audit finds more
   than four mount calls, report it as **blocking**, name the offending call
   and its owning packet, and stop — the fix is a one-line change in that
   packet or an amendment to `02-own-plugin-plan.md` §4, and both are the
   orchestrator's call, not yours.
4. **Slot-conflict guard.** Run
   `python3 /home/system/workspaces/LAL/Development/forks/check-plugin-slot-conflicts.py`
   and paste its output in your report. It must show exactly one
   `experimental_threadList` claimant in each enabled configuration and no slot
   lost by project-icons, thread-namer, session-goal, md-annotate,
   context-meter, liquid-glass, or any other installed plugin. Add it to the
   runbook as the gate that runs while `bb-sidebar` is still the sole claimant,
   before `bb plugin enable glass-sidebar`, and again after the switch.
5. **`docs/switchover.md`** — the runbook, executable by a person, each step a
   single command with its expected output:
   1. `bb plugin build` in this repo; confirm both bundle sizes against the
      budget.
   2. In one step, run
      `bb plugin install /home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar --yes && bb plugin disable glass-sidebar`.
      The immediate disable is mandatory because `bb-sidebar` remains the
      active thread-list claimant; if installation reports that the plugin was
      already disabled, confirm that state and continue.
   3. `python3 /home/system/workspaces/LAL/Development/forks/check-plugin-slot-conflicts.py`
      (absolute path — the script lives outside this repo and a relative path
      does not resolve from the plugin directory). This is the pre-enable gate
      while `bb-sidebar` is still the sole claimant.
   4. `bb plugin disable bb-sidebar && bb plugin enable glass-sidebar`.
      This command preserves the required claimant order; do not enable
      `glass-sidebar` while `bb-sidebar` remains enabled.
   5. With `glass-sidebar` enabled and `bb-sidebar` disabled, run
      `bb glass-sidebar import --dry-run` and read the counts. Importing while
      both thread-list plugins are enabled is forbidden.
   6. After accepting the dry-run counts, run `bb glass-sidebar import`.
   7. Run
      `python3 /home/system/workspaces/LAL/Development/forks/check-plugin-slot-conflicts.py`
      again and confirm that `glass-sidebar` is now the sole thread-list
      claimant with every unrelated slot preserved.
   8. **Verify by eye** against a checklist that reproduces the brief §5
      preservation list item by item: focused vs open-in-split vs idle rows are
      unmistakable; the pane glyph and `Pane N of M` chip; folders with colour,
      collapse, rename, drag between folders, card-on-card folder creation,
      Alt+↑/↓; the live strip's Open panes and Now sections; a running workflow
      as a child row; project glyph and colour on rows, folder headers and
      chips, and the header chip; the related-thread tree and the single
      child-thread control; split actions; snooze / settle / wake and the
      parked shelves; inactive rules and auto-settle; pinned and inbox drag
      reorder; multi-select bulk actions; favicons and the upload route; search
      results; and bb's nine keyboard shortcut targets.
   9. State plainly that the `glass-sidebar:` localStorage keys are new, so
      sort mode, grouping, shelf expansion and the sidebar-settings cache start
      at their defaults once — this is client-side preference only and nothing
      in SQLite is affected. The live-strip collapse keys are **not** in that
      set: brief §4.5 fixes them as `bb-sidebar.liveStrip.<key>`, both plugins
      read the same two keys, and the strip's collapsed/expanded state carries
      over unchanged. Do not describe a live-strip reset.
   - **Rollback**, as its own section and in exact reverse claimant order:
     `bb plugin disable glass-sidebar` → `bb plugin enable bb-sidebar` →
     `bb plugin reload bb-sidebar`. The fork stays installed until parity is
     confirmed by eye; the import never wrote to its store, so rolling back
     loses nothing.
6. **`README.md` completed** — replace Q0's "pre-release scaffold" line with
   the real thing: what the plugin does; the derived plugin id `glass-sidebar`;
   the no-polling rule, the two permitted `setInterval` owners and Q5's one
   preserved 5-minute `bb.background` auto-settle schedule; the weight budget;
   install from path; the import command; the switch-over pointer; the
   Liquid Glass theme as an independent companion plugin (§4.1 attributes,
   `.bb-sidebar-*` classes and `--thread-accent` are the contract between
   them); Q4's honest note that the host title bar's own project icon cannot be
   replaced through a public slot, so the chip sits beside the title and
   ariofrio's Project Icons remains the only way to get the in-title icon; and
   the RPC naming rule that keeps both surfaces intact — the fork's favicon
   RPCs (`listProjectIconSettings`, `searchProjectIconFiles`, `setProjectIcon`,
   `uploadProjectIcon`) carry their original names, and the absorbed decor
   feature uses `setProjectDecorIcon` / `clearProjectDecorIcon` / `getProjectDecor`
   / `getProjectGlyphs` / `listIconCatalog` beside them.
7. **Credits and licence notices.** In `README.md` and a rewritten
   `THIRD_PARTY_NOTICES.md`: yusuf8834/bb-sidebar and
   SawyerHood/bb-plugin-t3sidebar (patterns), ariofrio/bb-plugins (colour
   anchors, classifier, picker idea), hardbeat920/monocode (palette and folder
   model). Carry each project's licence text. MIT, author Luis Llenin.
8. **Version** `0.1.0` → `1.0.0-rc.1`, and a `CHANGELOG.md` first entry
   listing what Q1–Q6 landed.

## Drop (do not port)

- Any write path to `bb-sidebar`'s or `project-icons`' databases. The import is
  read-only at the source, always.
- Any automatic import on server start: the copy runs once, by explicit
  command.
- Any step in the runbook that this worker executes itself.

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`; `bb plugin build`;
`node --test test/*.test.mjs`. Suite only grows. Paste the slot-conflict script
output and the final bundle sizes.

Budget (plan §4 — binding on every packet):
- `dist/app.js` ≤ 300 KB, `dist/server.js` ≤ 1024 KB; report both. If either is
  over, report it as blocking rather than trimming a feature.
- **No timers**: no `setInterval` except the two allowed owners; no server
  timers, process spawning or watchers. Q5's single preserved 5-minute
  `bb.background` auto-settle schedule is the only background schedule. The
  import runs only when invoked.
- **No new dependencies**: `zod` only at runtime.
- Frontend RPCs on mount ≤ 4 plugin-wide — this packet is where that is
  **measured** (Produce 3). Exceeding it is a blocking report, never a new
  batching RPC.
- Named icon imports only; the contract test's catalog grep still passes.

No `bb plugin install`, `enable`, `disable`, `reload`, or `bb theme set` in
this packet.

Commit (no `git add -A`):
`git add <your files> && git commit -m "[Q7] import command, switch-over runbook, README and credits"`.
Report per brief §5, adding: the deferred wiring you applied and for whom, the
observed ordered log and set of mount RPCs after all pending effects from
`test/mount-rpc-budget.test.mjs` and confirmation that no fifth automatic RPC
occurred, the import's
per-table counts against the real stores in `--dry-run`, the lifecycle
round-trip result, and the slot-conflict output.
