# Glass Sidebar

Glass Sidebar is a session-management thread list for [bb](https://getbb.app).
It replaces the default sidebar with a list that makes it obvious which thread
you are in, which ones are open in other split panes, and which are idle, and
it gives you the tools to keep a busy inbox organised.

- **Clear row states.** The focused thread, threads open in other panes, and
  idle threads are three visibly different surfaces, with a pane glyph showing
  where each open thread sits.
- **Folders.** Coloured folders with drag-and-drop and keyboard reordering,
  collapse state, and per-thread or per-project accent colours.
- **Live strip.** A compact row of open panes and running work at the top of
  the list, with workflow children shown under their parent.
- **Project identity.** A project glyph and colour on every row, picked
  automatically from the project name or chosen from an icon catalogue, plus a
  favicon fallback for web projects.
- **Lifecycle shelves.** Pinned, active, settled, snoozed, and inactive
  shelves. Threads can be settled or snoozed by hand, and optionally settled
  automatically after a period of inactivity or once their pull request is
  merged or closed.
- **Search and bulk actions.** Filter the list, multi-select rows, and settle,
  snooze, archive, or move several threads at once.
- **No background polling.** Refreshes are driven by host updates, realtime
  channels, visibility changes, and your own actions. The only timers are a
  once-a-minute clock for relative times and a 60-second fallback for
  workflow rows.

The package is `bb-plugin-glass-sidebar`; bb derives the plugin id
`glass-sidebar`.

## Install

From the community marketplace:

```sh
bb plugin install glass-sidebar
```

Or directly from the repository:

```sh
bb plugin install git:https://github.com/luisllenin02/bb-plugin-glass-sidebar.git@^1.0.0
```

bb allows one thread-list provider at a time. If another sidebar plugin is
enabled, disable it first, then enable Glass Sidebar. To go back, disable
Glass Sidebar and re-enable the other plugin; nothing is deleted either way.

## Import existing data

If you used the `bb-sidebar` or `project-icons` plugins before, a one-shot
importer copies their folders, colours, and project icons. It opens the old
stores read-only and never modifies them:

```sh
bb glass-sidebar import --dry-run
bb glass-sidebar import
```

`--force` replaces rows that already exist in Glass Sidebar; `--from <dataDir>`
points at a different bb data directory. Repeating an import is safe.

## Settings

Open **Settings → Plugins → Glass Sidebar** to choose the active-shelf order,
snooze presets, the inactivity threshold for the inactive shelf, automatic
settling, and automatic project colours. Project icons and colours can also be
changed from a row's context menu.

## Project icons and colours

Glass Sidebar keeps its own project icon and colour store and shows the icon in
a chip beside the thread title. The public Plugin SDK cannot replace the host
title bar's own project icon; if you want an icon there as well, keep
ariofrio's Project Icons plugin installed. The two do not interfere.

## Liquid Glass companion

[Liquid Glass](https://github.com/luisllenin02/bb-plugin-liquid-glass) is an
independent theme plugin that styles the seams Glass Sidebar exposes
(`data-thread-pane-state`, the `.bb-sidebar-*` classes, and
`--thread-accent`). Neither plugin requires the other.

## Development

```sh
npm install
npm run typecheck
npm test
bb plugin build
```

Runtime dependencies are limited to `zod`. Tests cover the server, the thread
list, the hooks, and the settings UI, including render-count budgets.

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
- [Hugeicons](https://hugeicons.com) — the free icon set behind the project
  icon catalogue.

The complete third-party licence texts are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT. Copyright 2026 Luis Llenin. See [LICENSE](LICENSE).
