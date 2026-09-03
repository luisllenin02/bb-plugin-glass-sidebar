# Glass Sidebar

Glass Sidebar is a complete session-management thread list for bb. It makes the
focused thread, other open split panes, and idle threads visually distinct;
adds pane position, coloured folders, drag and keyboard reordering, live work,
workflow children, project identity, lifecycle shelves, search, bulk actions,
favicons, and the existing related-thread and split controls in one list.

The package is `bb-plugin-glass-sidebar`; bb derives the plugin id
`glass-sidebar`.

## Runtime contract

Glass Sidebar does not poll general sidebar or organization state. Host cache
updates, realtime channels, visibility changes, and explicit user actions drive
refreshes. The frontend bundle has exactly two permitted `setInterval` owners:

- `src/ThreadList.tsx` advances the relative-time minute clock.
- `src/useWorkflowActivity.ts` provides the accepted 60-second workflow-row
  fallback.

The server has no timer, process spawn, or file watcher. Its only background
schedule is Q5's preserved five-minute `bb.background` auto-settle evaluation.
The import command runs only when invoked.

Production budgets are `dist/app.js` at or below 300 KB and `dist/server.js`
at or below 1024 KB. Runtime dependencies are limited to `zod`.

## Install from a path

Build from this repository, then install it disabled while `bb-sidebar` remains
the active thread-list provider:

```sh
cd /home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar
npm install
bb plugin build
bb plugin install /home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar --yes && bb plugin disable glass-sidebar
```

For the released plugin, install it from the community marketplace or directly
from the owned Git repository:

```sh
bb plugin install git:https://github.com/luisllenin02/bb-plugin-glass-sidebar.git@^1.0.0
bb plugin install https://github.com/luisllenin02/bb-plugin-glass-sidebar
```

Only one `experimental_threadList` provider may be enabled. Follow the complete
[switch-over and rollback runbook](docs/switchover.md) before enabling Glass
Sidebar.

## Import existing data

The explicit, one-shot importer opens the old stores read-only and never
deletes, renames, or writes either source:

```sh
bb glass-sidebar import --dry-run
bb glass-sidebar import
```

Use `--force` to replace rows that already exist in Glass Sidebar, and
`--from <dataDir>` to override bb's server data directory. Repeating a normal
import is idempotent.

## Project identity

Glass Sidebar owns its project icon and colour store, deterministic classifier,
picker, and title-adjacent header chip. The public Plugin SDK cannot replace the
host title bar's own project icon, so the chip sits beside the title. Keeping
ariofrio's Project Icons installed is the only way to retain an in-title icon;
the two plugins otherwise remain independent.

The fork's favicon surface keeps its original RPC names:
`listProjectIconSettings`, `searchProjectIconFiles`, `setProjectIcon`, and
`uploadProjectIcon`. The absorbed decor feature lives beside it under
`setProjectDecorIcon`, `clearProjectDecorIcon`, `getProjectDecor`,
`getProjectGlyphs`, and `listIconCatalog`. The distinct names preserve both
surfaces.

## Liquid Glass companion

Liquid Glass is an independent companion theme plugin. Glass Sidebar exposes
`data-thread-pane-state`, the `.bb-sidebar-*` host classes, and
`--thread-accent`; Liquid Glass styles those public seams. Neither plugin
requires the other, and installing Glass Sidebar does not change the active
theme.

## Credits

Glass Sidebar builds on:

- [yusuf8834/bb-sidebar](https://github.com/yusuf8834/bb-sidebar) — sidebar and
  session-management patterns.
- [SawyerHood/bb-plugin-t3sidebar](https://github.com/SawyerHood/bb-plugin-t3sidebar)
  — thread-list patterns.
- [ariofrio/bb-plugins](https://github.com/ariofrio/bb-plugins) — colour
  anchors, the project classifier, and picker ideas.
- [hardbeat920/monocode](https://github.com/hardbeat920/monocode) — the accent
  palette and folder model.

The complete third-party licence texts are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT. Copyright 2026 Luis Llenin. See [LICENSE](LICENSE).
