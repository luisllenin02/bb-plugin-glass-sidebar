# Review rubric — Glass Sidebar packets

You are the reviewing orchestrator's gate for one packet. You do not edit
files. You read the packet, the brief's contract sections the packet cites, the
worker's report, and the actual diff; you run the checks yourself; you return a
structured verdict. A packet is released downstream only on `pass`.

## Procedure

1. Read `/home/system/workspaces/LAL/Development/plans/glass-sidebar/00-brief.md` §4 and §5 and `/home/system/workspaces/LAL/Development/plans/glass-sidebar/01-marketplace-references.md` §5 (its five rules are acceptance points for B2/B3/B4/T1), then the packet file named in your prompt, then the worker report in your prompt.
2. Inspect the change, bounded:
   - Fork packets: `cd /home/system/workspaces/LAL/Development/forks/bb-sidebar && git log --oneline -5 && git show --stat HEAD` and `git diff <base>..HEAD -- <the packet's file list>` where `<base>` is the commit before the packet's commits (use `git log --oneline main..HEAD` to find it). Read the diff, not the whole repo. If the worker did not commit, review `git status` + `git diff` for the packet's files and count that as a blocking finding.
   - Theme packet: read every file under `/home/system/workspaces/LAL/Development/bb-plugins/liquid-glass` except `node_modules` and `dist`.
3. Run the checks yourself, do not trust the report:
   - Fork: `npx tsc --noEmit` and `npx vitest run --config vitest.config.ts` (both must pass; note the test count versus the baseline of 202 + prior packets).
   - Theme: `cd bb-plugins/liquid-glass && npx tsc --noEmit && bb plugin build`; verify with a node script that the report's contrast ratios are right for at least `--ink` on `--canvas` and `--primary` on `--canvas` for both palettes.
4. Judge against the acceptance points below and the packet's Produce/Verify sections. Look for the classic failures: contract drift (names, attributes, palette values), hard-coded colours in TSX, hooks called in loops, `preventDefault` on pointerdown, missing `data-sidebar-thread-*` attributes on member anchors, non-minimal edits to shared files, missing cleanup of listeners, tests that do not assert behaviour, scope creep into other packets' files.
5. Return ONLY the structured result through the workflow result tool.

## Acceptance points

- **T1 (v2)**: manifest valid and builds; two themes with code themes registered; every `--lg-*` variable used with a fallback; wallpaper layer + five presets + custom URL/path route (bounded, no arbitrary paths); translucent sidebar/panes with real backdrop blur at monocode's defaults (0.85 / 24 px); vibrant accent and semantic tokens; settings section mirrors monocode's Appearance rows plus Accent and Wallpaper; content script applies live and cleans up on dispose, only when a liquid-glass theme is active; kv persistence, RPC, CLI; server and frontend tests plus the node contract test with computed contrast; README states the opaque-window constraint honestly; not derived from warm-glass; no `bb theme set` executed.
- **B1**: four tables and eleven RPCs exactly as §4.3; validation rejects bad input; realtime publish on each mutation; pruning on thread deletion; hook with optimistic + rollback; pure helpers tested; no UI files touched.
- **B2**: `data-thread-pane-state` on every row component; classes per §4.1 table; `PaneGlyph` matches the host mini-map geometry; `AccentRail` opacities; `aria-current` unchanged; `ThreadInbox.tsx` changed by exactly the `accent` prop lines; tests for pure helpers and attributes.
- **B3**: folders above Pinned; members removed from other shelves; wash and rail; header keyboard + menu; inline rename; colour picker with custom hex; thread menu additions; drag: move into folder, create from card-on-card, reorder folders; `+ New thread` targets the right project; project colours in settings; keyboard contract kept; tests present for pure logic and rendering.
- **B4**: probes per thread, registry cleanup, chips ordered by ordinal, hidden rules, Now classification order, overflow, persisted collapse, click and modifier-click routing; minimal `ThreadInbox.tsx` edits.

- **P1 (theme phase 2)**: new appearance keys (paneOpacity, paneBlur, wallpaperBrightness, wallpaperBlur, wallpaperSaturation) with ranges, defaults, migration, CLI; wallpaper filter chain and negative inset; pane opacity/blur apply only with pane glass on and the UI says so; interactive tokens (primary, secondary, accent, ring, surface-selected, state-active, pill-*) derive from the accent with an Interactive vibrancy control; contrast computed; contract + vitest green; version 0.3.0; nothing removed.
- **P2 (sidebar phase 2)**: read-only Project Icons store access that tolerates absence; `getProjectDecor` RPC; five-step precedence thread → folder → project → Project Icons → auto with `resolveAccentSource`; `light-dark()` passes through `accentCss`; Hugeicons glyph in rows with favicon and folder fallbacks; live strip and folder headers agree with cards; settings show source and toggles; suite only grew from 282; nothing removed.
- **Preservation (all packets)**: brief §5 Preservation rule. Confirm with `git diff <base>..HEAD --stat` that no existing test file lost assertions, no export/RPC/table/setting was removed or renamed, `app.test.tsx` still guards the single child-thread control, and the full suite count only grew. Any regression is blocking.

## Verdict rules

- `pass`: every acceptance point met; checks green; only cosmetic notes.
- `fail`: any acceptance point unmet, any check red, any contract drift, any unreviewed uncommitted state, any edit outside the packet's file list that changes behaviour. List each blocking item with file, what is wrong, and the concrete fix. Keep the list to what blocks; put the rest in `nonBlocking`.
