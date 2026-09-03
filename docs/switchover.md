# Glass Sidebar switch-over and rollback

Run every command from
`/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar` unless the
command itself uses an absolute path. Do not enable both thread-list plugins at
the same time.

## Switch over

1. Build the plugin.

   ```sh
   bb plugin build
   ```

   Expected: the build succeeds; `dist/app.js` is no larger than 300 KB and
   `dist/server.js` is no larger than 1024 KB.

2. Install Glass Sidebar and immediately leave it disabled.

   ```sh
   bb plugin install /home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar --yes && bb plugin disable glass-sidebar
   ```

   Expected: `glass-sidebar` is installed from the path and is disabled while
   `bb-sidebar` remains enabled. If installation reports that Glass Sidebar was
   already disabled, confirm that state and continue.

3. Run the pre-enable slot-conflict gate while `bb-sidebar` is the sole
   thread-list claimant.

   ```sh
   python3 /home/system/workspaces/LAL/Development/forks/check-plugin-slot-conflicts.py
   ```

   Expected: `ok: no duplicate sidebar/thread-header registrations among enabled plugins`.
   Do not continue if the command reports a conflict.

4. Disable the old claimant before enabling the new claimant.

   ```sh
   bb plugin disable bb-sidebar && bb plugin enable glass-sidebar
   ```

   Expected: `bb-sidebar` is disabled first and `glass-sidebar` is enabled.
   Never reverse this command order.

5. With Glass Sidebar enabled and bb-sidebar disabled, preview the import.

   ```sh
   bb glass-sidebar import --dry-run
   ```

   Expected: both source paths are reported as present or `missing`, followed
   by per-table `read`, `inserted`, and `skipped` counts. Missing source
   files are not errors. Do not import while both thread-list plugins are enabled.

6. After accepting the dry-run counts, import.

   ```sh
   bb glass-sidebar import
   ```

   Expected: the same per-table table is printed and the accepted rows are
   copied into Glass Sidebar. A later ordinary rerun reports zero further
   inserts.

7. Run the slot-conflict gate again.

   ```sh
   python3 /home/system/workspaces/LAL/Development/forks/check-plugin-slot-conflicts.py
   ```

   Expected: `ok: no duplicate sidebar/thread-header registrations among enabled plugins`.
   Confirm in bb that `glass-sidebar` is the sole thread-list claimant and that
   every unrelated plugin slot remains present.

8. Verify preservation by eye.

   ```sh
   bb plugin list
   ```

   Expected: Glass Sidebar is healthy. In the app, verify every item:

   - Focused, open-in-split, and idle rows are unmistakable.
   - Pane glyphs and `Pane N of M` chips match the split layout.
   - Folders support colour, collapse, rename, drag between folders,
     card-on-card folder creation, and Alt+Up/Down reorder.
   - The live strip shows Open panes and Now.
   - A running workflow appears as a child row.
   - Project glyph and colour agree on rows, folder headers, live-strip chips,
     and the header chip.
   - The related-thread tree and the single child-thread control remain.
   - Split actions remain.
   - Snooze, settle, wake, and both parked shelves work.
   - Inactive rules and auto-settle work without hiding live work.
   - Pinned and inbox drag reorder remain.
   - Multi-select bulk actions remain.
   - Favicons and the upload route remain.
   - Search results remain.
   - All nine bb keyboard shortcut targets remain.

9. Record the one-time client preference reset.

   ```sh
   bb glass-sidebar help
   ```

   Expected: the CLI usage is printed. The `glass-sidebar:` localStorage keys
   are new, so sort mode, grouping, shelf expansion, and the sidebar-settings
   cache start at their defaults once. This is client-side preference state;
   nothing in SQLite is affected. The live-strip keys are not reset: both
   plugins use `bb-sidebar.liveStrip.<key>`, so collapsed/expanded state carries
   over unchanged.

## Rollback

Keep the fork installed until the visual parity checklist passes. The importer
opened the old stores read-only, so rollback loses nothing.

1. Disable Glass Sidebar.

   ```sh
   bb plugin disable glass-sidebar
   ```

   Expected: no plugin claims the thread-list slot temporarily.

2. Re-enable the fork.

   ```sh
   bb plugin enable bb-sidebar
   ```

   Expected: `bb-sidebar` is again the sole thread-list claimant.

3. Reload the fork.

   ```sh
   bb plugin reload bb-sidebar
   ```

   Expected: `bb-sidebar` reloads healthy with its unchanged store.
