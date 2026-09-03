# Glass Sidebar

Status: pre-release scaffold

Glass Sidebar is a session-management thread list for bb. It is designed to
make focused, open-in-split, and idle threads unmistakable; organize sessions
with coloured folders and drag and drop; surface open panes and current work;
and carry project glyphs and colours through the list.

The derived plugin id is `glass-sidebar`.

## No polling

Glass Sidebar does not poll in the background. Host thread data, organization
changes, and later project-decoration updates are driven by bb's live cache and
realtime signals. The backend has no timers, background service, file watcher,
or spawned process.

## Install from a path

```sh
cd /home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar
npm install
bb plugin build
bb plugin install .
```

Only one `experimental_threadList` provider may be active. During development,
keep the installed `bb-sidebar` provider live until the dedicated switch-over
packet disables it and enables this plugin.

## Credits

Glass Sidebar builds on patterns and ideas from:

- [yusuf8834/bb-sidebar](https://github.com/yusuf8834/bb-sidebar)
- [SawyerHood/bb-plugin-t3sidebar](https://github.com/SawyerHood/bb-plugin-t3sidebar)
- [ariofrio/bb-plugins](https://github.com/ariofrio/bb-plugins)
- [hardbeat920/monocode](https://github.com/hardbeat920/monocode)

## License

MIT
