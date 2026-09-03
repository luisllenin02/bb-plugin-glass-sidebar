# Native macOS vibrancy for bb desktop — assessment and patch sketch

Reference the user pointed at: `mayfer/electrobun-macos-native-blur`
(cloned at `/home/system/workspaces/LAL/Development/refs/electrobun-macos-native-blur`).

## What that repo does

It is an **Electrobun** app (Bun runtime, not Electron). Electrobun exposes
`titleBarStyle: "hiddenInset"` and `transparent: true` but no vibrancy API, so
the author ships a 100-line Objective-C bridge (`native/macos/window-effects.mm`)
loaded over Bun FFI that, on the NSWindow: `setOpaque:NO`,
`setBackgroundColor:clearColor`, `setTitlebarAppearsTransparent:YES`,
`setHasShadow:YES`, then inserts an `NSVisualEffectView` (blendingMode
behind-window) under the web view, plus traffic-light repositioning and a
native drag region.

## Does it apply to bb?

Not directly: bb desktop is **Electron 41** (`apps/desktop/package.json`), and
the FFI/dylib approach is Electrobun-specific. But Electron already has the
same capability built in, so the *idea* transfers with far less code:

```ts
new BrowserWindow({
  frame: false,
  titleBarStyle: "hiddenInset",
  transparent: true,               // or backgroundColor: "#00000000"
  vibrancy: "under-window",        // NSVisualEffectView behind the web view
  visualEffectState: "active",     // keep the blur when the window is unfocused
  // …
});
```

Electron's `vibrancy` option *is* an `NSVisualEffectView` with
behind-window blending — the same thing the Objective-C bridge builds by hand.
`"under-window"`, `"sidebar"`, `"hud"`, `"fullscreen-ui"`, `"popover"`, and
`"menu"` are the current non-deprecated materials.

What bb does today (`apps/desktop/src/desktop-window-factory.ts`,
`createWindowOptions`): macOS gets `frame: false` + `hiddenInset`; only Linux
gets `transparent: true`, gated by a `--transparent-window` CLI flag
(`desktop-window-transparency.ts`). There is no vibrancy anywhere in the
desktop source. **A bb plugin cannot change BrowserWindow options**, so this is
a change to bb itself: either a small upstream PR to `get-bb/bb`, or a local
build of the desktop app on the Mac.

## Patch sketch (against desktop-v0.41.0)

Mirror the existing Linux flag with a macOS one so the default stays opaque:

```diff
--- a/apps/desktop/src/desktop-window-transparency.ts
+++ b/apps/desktop/src/desktop-window-transparency.ts
@@
 export const LINUX_TRANSPARENT_WINDOW_ARGUMENT = "--transparent-window";
+export const MAC_VIBRANCY_WINDOW_ARGUMENT = "--vibrancy";
@@
+export function shouldUseMacVibrancyWindow(args: {
+  argv: readonly string[];
+  platform: NodeJS.Platform;
+}): boolean {
+  return (
+    args.platform === "darwin" && args.argv.includes(MAC_VIBRANCY_WINDOW_ARGUMENT)
+  );
+}

--- a/apps/desktop/src/desktop-window-factory.ts
+++ b/apps/desktop/src/desktop-window-factory.ts
@@ interface CreateWindowOptionsArgs {
   isLinuxTransparent: boolean;
+  isMacVibrancy: boolean;
   isMac: boolean;
@@ function createWindowOptions(
     ...(args.isMac
       ? {
           frame: false,
           titleBarStyle: "hiddenInset" as const,
           trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION,
+          ...(args.isMacVibrancy
+            ? {
+                transparent: true,
+                backgroundColor: "#00000000",
+                vibrancy: "under-window" as const,
+                visualEffectState: "active" as const,
+              }
+            : {}),
         }
       : {}),
```

plus threading `isMacVibrancy` through `createDesktopWindowFactory` the same
way `isLinuxTransparent` is (factory args at ~line 83, the create call at
~line 238) and the `main.ts` call site (~line 2235):
`isMacVibrancy: shouldUseMacVibrancyWindow({ argv: process.argv, platform: process.platform })`.

Two follow-ons the Electrobun repo also handles, which Electron gives for free
or nearly so: window shadow stays on with `hasShadow: true` (default), and
traffic lights are already positioned by `trafficLightPosition`.

## What the web side must do when the window is transparent

The app's own `theme.css` paints an opaque `--background` on `body`, so a
transparent window shows nothing until a theme makes the shell translucent.
That is exactly what the Liquid Glass plugin does — with one switch: its
"Native window transparency" setting (packet T1 v2, optional row) turns the
wallpaper layer off and lets `html`/`body` go transparent, so the desktop
shows through the blurred sidebar and panes like monocode. Leave it off in the
web/browser client and on an opaque desktop build; otherwise Electron paints
the default white window background behind the transparent body.

## How to try it on the Mac

1. Clone `get-bb/bb` at tag `desktop-v0.41.0` on the MacBook, apply the sketch above, `pnpm install`, and run the desktop app from source (`apps/desktop` README) with `--vibrancy`.
2. Install Liquid Glass, select it, enable "Native window transparency".
3. If it looks right, open an upstream PR: it is a ~25-line, flag-gated change with a Linux precedent already in the tree.

Until then the wallpaper layer is the fallback and looks the same inside the window.

## Durability across bb updates (asked 2026-09-02)

A source patch to the desktop app does **not** survive updates. The Mac app is
a packaged Electron build; every bb release replaces it wholesale, and the
window options live in the Electron main process, which plugins cannot reach
(plugins run in the bb server and in the renderer, never in the main process).
So there are exactly three durability tiers:

| Route | Survives bb updates? | Effort |
|---|---|---|
| Upstream PR merged into get-bb/bb (flag-gated `--vibrancy`, Linux precedent exists) | Yes, permanently | One PR; then `open -a bb --args --vibrancy` or a launcher alias |
| Local fork of bb desktop, rebuilt per release | Only while you rebuild each release | Recurring; not recommended |
| Wallpaper layer in the Liquid Glass plugin | Yes: plugins are separate from the app | Already built |

The plugin's "Native window transparency" toggle is inert until the window is
actually transparent, so it is safe to leave in place while the PR is pending.
Recommendation: treat the local build as a proof for the PR, not as the
install. The queued Mac prompt is written that way (build from source, verify,
report the diff, then decide on the PR).

## Maintained fork that tracks upstream (the durable self-managed route)

Yes: the same pattern as `forks/sync-forks.sh` for plugins, applied to the
desktop app, with GitHub doing the build. Facts that make it light:

- The Mac app is a thin Electron shell that loads the UI from the server URL
  (`existing-server` / `server-url` dialogs in `apps/desktop/src/main.ts`).
  Your server updates on WSL via npm as today; the shell only has to stay
  protocol-compatible, so it can lag a release or two without losing features.
- Upstream already ships the build pipeline: `.github/workflows/build-desktop.yml`
  builds macOS artifacts on a macOS runner and explicitly tolerates missing
  signing secrets (it warns and produces unsigned artifacts). A fork inherits
  that workflow unchanged.
- The app self-updates through `electron-updater` from a feed fixed in
  `apps/desktop/electron-builder.config.json` (`publish[]` pointing at
  `github.com/get-bb/bb/releases/download/desktop-latest/`) and applied in
  `desktop-auto-update.ts` (`setFeedURL(DESKTOP_AUTO_UPDATE_FEED_CONFIG)`).
  A custom build left on the upstream feed would update itself back to the
  official app and lose vibrancy. The fork therefore points that feed at its
  own GitHub Releases, so the app updates *from your fork*.

Design:

1. Fork `get-bb/bb` to `luisllenin02/bb`. Branch `vibrancy` = upstream
   `desktop-vX.Y.Z` tag + two commits: (a) the flag-gated `--vibrancy` patch,
   (b) the updater feed repoint (`publish[].url` and
   `DESKTOP_AUTO_UPDATE_FEED_CONFIG` → `luisllenin02/bb/releases/download/desktop-latest/`).
2. A fork-only workflow `sync-upstream-desktop.yml` (schedule daily +
   manual): fetch upstream tags; when a new `desktop-v*` tag appears, rebase
   `vibrancy` onto it, run the desktop unit tests, and, on success, dispatch
   the inherited `build-desktop.yml` with `release_channel: stable` and
   `publish: true`, so a `desktop-latest` release with the arm64 zip/dmg and
   `desktop-version.json` lands in the fork. A rebase conflict opens an issue
   on the fork instead of publishing (same policy as `sync-forks.sh`).
3. Unsigned builds: Gatekeeper blocks the first launch; either
   right-click → Open once, or `xattr -dr com.apple.quarantine /Applications/bb.app`.
   electron-updater on macOS **requires a signed app** for in-app updates, so
   either add Developer ID signing + notarization secrets to the fork
   (Apple Developer account, ~$99/yr; the upstream workflow already consumes
   the standard secret names) or accept manual replacement of the app when
   the fork publishes. With signing, updates are fully automatic.
4. Launch with the flag: `open -a bb --args --vibrancy`, or make the fork
   default the flag to on for macOS in commit (a) so no launcher is needed.
5. Keep the upstream PR open regardless: once merged, delete the fork's patch
   commit and the feed repoint, and go back to the official app.

Effort: one-time setup ~1–2 hours on the Mac plus the fork workflow; steady
state is zero-touch when rebases are clean, and a conflict issue when not.

Update to the queued Mac prompt: it now builds this fork and workflow rather
than a one-off local build.
