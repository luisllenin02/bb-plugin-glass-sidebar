# Packet T1 (v2) — Liquid Glass: a monocode-faithful glass plugin with pickable vibrant accents

Version 2 supersedes v1. The user's direction: **mirror how transparent the
whole monocode window is, not the old warm-glass theme; let the user pick the
colours and accents; make accents and details vibrant.** If you already built
v1 files, keep the scaffold, the contract test, and the code-theme JSON, and
rewrite the CSS and add the frontend described here. Read
`/home/system/workspaces/LAL/Development/plans/glass-sidebar/00-brief.md` §2,
§4.1, §4.6 (v2) and §5, and
`/home/system/workspaces/LAL/Development/plans/glass-sidebar/01-marketplace-references.md`
§3 and §5 first.

## The honest constraint

monocode gets its look from a transparent macOS NSWindow plus native
background blur (`src-tauri/src/macos.rs`, `set_window_background_blur`), then
only tints the shell in CSS (`html, body { background: transparent }`,
sidebar `hsl(hue sat lightness / var(--sidebar-opacity))`). bb's desktop app
is Electron and opens an **opaque** window on macOS (`hiddenInset` title bar,
no vibrancy; `apps/desktop/src/desktop-window-factory.ts`); only Linux has a
`--transparent-window` flag. A plugin cannot change that. So the window cannot
show the real desktop through it.

What we can do, and what the user will see inside the window: a full-window
**wallpaper layer** at the bottom of the stack (their own image, or a vibrant
preset), and every pane above it genuinely translucent with real
`backdrop-filter` blur, using monocode's exact opacities. Inside the window
this is indistinguishable from monocode over a wallpaper. Say this plainly in
the README. Do not claim OS-level transparency.

## Read

1. The brief sections above; the addendum §3.
2. monocode: `/home/system/workspaces/LAL/Development/monocode/src/index.css` lines 1–160 (palette variables, `.sidebar-glass`, `.body-glass`, `glass-body`), `src/lib/appearance.ts` lines 1–60 and 100–290 (the appearance model: theme preference, hue 0–360 default 240, saturation 0–100 default 0, sidebar opacity 0.15–1 default 0.85, blur 1–64 default 24, main-pane glass toggle), `src/surfaces/SettingsView.tsx` lines 737–830 (the Appearance page: exactly the rows and copy to mirror), `src/lib/tabGroups.ts` lines 1–15 (the nine vibrant colours).
3. Frames (view as images): `/home/system/.bb/thread-storage/thr_3uy6dx4vfp/frames/nikolay_dp-2026-09-02T115849_001.png`, `_003.png`, `_005.png` — note how much wallpaper shows through the sidebar and the content pane, how thin the hairlines are, how vivid the project glyph colours are against the neutral shell.
4. bb host tokens: `/home/system/workspaces/LAL/Development/bb/bb-0.41.0/apps/app/src/components/ui/theme.css` lines 119–140 and 427–700 (which tokens exist; which are derived from `--canvas`/`--ink` when a theme leaves them unset), lines 200–260 (sidebar row state rules).
5. Packaging and tests: `/home/system/workspaces/LAL/Development/refs/bb-plugin-vercel-theme/{package.json,test/theme-contract.test.mjs,themes/vercel-dark-code.json}`; ayu manifest at the cache path in the brief.
6. SDK references (host-installed skill): `/home/system/.npm-global/lib/node_modules/bb-app/server/dist/builtin-skills/bb-plugin-authoring/references/` — `quickstart.md` (manifest, `bb.themes`), `frontend-registration.md` (`settingsSection`, `contentScripts.register`), `frontend-hooks-and-ui.md` (`useRpc`, `useRealtime`, styling rules, vendored components), `backend-foundation.md` (`bb.storage.kv`), `backend-events.md` (`bb.http.route`, `bb.rpc`, `bb.realtime`), `testing.md` (fake plugin host, `renderSlot`).

## Produce — `/home/system/workspaces/LAL/Development/bb-plugins/liquid-glass/`

### Manifest

`package.json`: name `bb-plugin-liquid-glass`, `bb.name` "Liquid Glass",
`bb.themes` = `liquid-glass` ("Liquid Glass", dark shell) and
`liquid-glass-light`, each with `codeTheme { dark, light }` JSON; `bb.server`,
`bb.app`, `bb.branding.icon ./assets/icon.svg`, `engines.bb >=0.41`,
`bbPluginSdk >=0.4.8`; scripts `build`, `typecheck`, `test` (node test for the
contract + vitest for app/server). Dev deps: `@get-bb/plugin-sdk 0.4.15`,
react types, vitest, jsdom, `@testing-library/react`, `better-sqlite3` (test
harness peer), typescript, plus the type-only shimmed packages the scaffold
declares (`sonner`, radix portal families) if you import them. Runtime deps:
`zod`, `clsx`, `tailwind-merge`. Use `bb plugin new` output as the template for
the vendored `components/ui` you need (button, input, slider if present, else
a plain `<input type="range">`).

### Theme CSS (`themes/liquid-glass.css`, `themes/liquid-glass-light.css`)

The stylesheet is parameterised by custom properties the frontend sets on
`:root` (with fallbacks, so the theme works with the frontend disabled):

```
--lg-hue        (0–360, default 240)     shell tint hue        = monocode --theme-hue
--lg-sat        (0–100 %, default 0%)    shell tint saturation = monocode --theme-saturation
--lg-accent-h   (default 211)            accent hue
--lg-accent-s   (default 92%)            accent saturation
--lg-accent-l   (default 62%)            accent lightness (light theme default 45%)
--lg-sidebar-a  (0.15–1, default 0.85)   sidebar / rail opacity
--lg-pane-a     (default 0.85)           main-pane opacity when main-pane glass is on
--lg-blur       (1–64 px, default 24px)  backdrop blur
--lg-wallpaper  (an `image-set`/`url()`/gradient; default = the "aurora" preset)
--lg-dim        (0–0.8, default 0.35 dark / 0.10 light) wallpaper dim overlay
```

Dark shell, monocode values: canvas lightness 9 %, content 92 %:
`--canvas: hsl(var(--lg-hue) var(--lg-sat) 9%)`, `--ink: hsl(var(--lg-hue) var(--lg-sat) 92%)`.
Light: 97 % / 18 %. Accent: `--primary: hsl(var(--lg-accent-h) var(--lg-accent-s) var(--lg-accent-l))`,
`--primary-foreground` white on dark / near-black on light computed for ≥ 4.5:1 at the default; `--ring`, `--sidebar-ring`, `--timeline-accent`, `--file-accent`, `--surface-selected`, `--surface-selected-border` all derive from the accent; links use `--primary`.

Vibrant semantic set (keep saturated, do not grey them): `--success hsl(142 55% 50%)`, `--warning hsl(45 90% 55%)`, `--attention hsl(25 85% 58%)`, `--destructive hsl(12 80% 58%)`, `--pr-merged hsl(280 55% 62%)`, `--diff-added`/`--diff-removed` matching success/destructive, and `--warning-text`/`--destructive-text` lightened on dark to clear 4.5:1. The 16 `--ansi-*` colours use the same vivid family.

Translucency, exactly the monocode stack:

- `body::before` fixed full-window layer painting `var(--lg-wallpaper)` (cover, center) with a dim overlay `rgba(0 0 0 / var(--lg-dim))` (dark) or white (light); `body` itself keeps an opaque `--canvas` under it so nothing ever shows a hole.
- `--sidebar: hsl(var(--lg-hue) var(--lg-sat) 9% / var(--lg-sidebar-a))` (light: 97 %). `.bg-sidebar` gets `backdrop-filter: blur(var(--lg-blur)) saturate(1.3)`.
- `--background`, `--card`, `--popover`, `--surface-*`: translucent canvas at monocode's body-glass ratio when `html[data-lg-pane-glass="on"]`; otherwise `--background` stays near-opaque (`/ 0.96`) so long transcripts stay readable — this mirrors monocode's "Main pane glass" toggle. Popovers/menus always frosted (`blur(var(--lg-blur))`), with a 1 px inner top highlight `inset 0 1px 0 hsl(0 0% 100% / 0.06)`.
- Hairlines: `--border`, `--border-hairline`, `--border-seam`, `--sidebar-border` at `hsl(ink / 0.10–0.14)`.
- Selection/hover: `--sidebar-accent: hsl(ink / 0.11)`, `--state-hover: hsl(ink / 0.07)`, `--state-active: hsl(ink / 0.11)`.
- Row-state polish from brief §4.6: `.bb-sidebar-selected-row { box-shadow: inset 3px 0 0 var(--primary) }`, `.bb-sidebar-open-in-split-row { --bb-sidebar-open-in-split-background: color-mix(in oklab, var(--primary) 10%, var(--sidebar)); outline: 1px dashed color-mix(in oklab, var(--primary) 50%, transparent); outline-offset: -1px }`, and `[data-thread-pane-state="focused"] { box-shadow: inset 3px 0 0 var(--thread-accent, var(--primary)) }` as a belt-and-braces rule.
- Reduced motion / no-blur fallback: `@supports not (backdrop-filter: blur(1px))` raises pane alphas to 0.96.

### Wallpaper presets (in CSS, selectable by name)

`aurora` (default: deep teal → violet → magenta bloom, like a night sky), `forest` (the monocode video: greens with sky blue top-left), `sunset` (coral → amber → violet), `ocean` (blues → cyan), `mono` (neutral radial greys). Each is a set of 3–4 layered radial/linear gradients — vivid, not pastel. Expose them as `html[data-lg-wallpaper="aurora"] { --lg-wallpaper: … }` rules; `custom` reads `--lg-wallpaper-custom` set by the frontend.

### Backend (`server.ts`)

- `bb.storage.kv` key `appearance` holding `{ hue, saturation, accentHue, accentSaturation, accentLightness, sidebarOpacity, paneGlass, blur, wallpaper: "aurora"|"forest"|"sunset"|"ocean"|"mono"|"custom", wallpaperUrl: string|null, wallpaperPath: string|null, dim }` with defaults above; zod-validated.
- RPC `getAppearance({}) -> Appearance`, `setAppearance(partial) -> Appearance` (validates ranges, persists, publishes realtime `"appearance"`), `resetAppearance({})`.
- `bb.http.route("GET", "/wallpaper", …)` serving `wallpaperPath` when set: must be an absolute path, must exist, ≤ 20 MB, extension in png/jpg/jpeg/webp/avif/gif; streams with the right content type and `Cache-Control: no-cache`; 404 otherwise. Never serve arbitrary paths from a query parameter.
- CLI `bb liquid-glass` with `show`, `set <key> <value>`, `reset`, `presets` (bounded output) so the user can also drive it from a terminal.
- Tests with `createFakePluginHost`: defaults, validation rejections, persistence, realtime publish, route 404 on missing/invalid path.

### Frontend (`app.tsx`)

- `app.contentScripts.register({ id: "liquid-glass-vars", mount })`: loads appearance via RPC, subscribes to `useRealtime`-equivalent (inside a content script use the plugin's realtime through a tiny React root, or poll the RPC on the realtime signal — pick the SDK-sanctioned way documented in `frontend-registration.md`; a small mounted React component that calls `useRpc`/`useRealtime` and writes the vars is acceptable), and sets on `document.documentElement`: the `--lg-*` custom properties, `data-lg-wallpaper`, `data-lg-pane-glass`, and `--lg-wallpaper-custom: url(...)` (custom URL, or `/api/v1/plugins/liquid-glass/http/wallpaper?v=<updatedAt>` for a local path). Removes everything it set on dispose (`signal`). Only applies when the active theme id starts with `plugin:liquid-glass:` — read it from `bb.sdk.theme.get()` on the server and include `activeThemeId` in `getAppearance`; re-check on the realtime signal and on a 30 s interval (theme changes have no plugin event).
- `app.slots.settingsSection({ id: "appearance", title: "Liquid Glass" })` mirroring monocode's Appearance page rows one for one, in this order: Theme (System / Dark / Light — this is bb's own light/dark switch; write `localStorage["bb.theme"]` and dispatch a synthetic `storage` event exactly like the marketplace Theme Toggle plugin does, see addendum §3), Sidebar opacity (slider 15–100 %), Blur radius (1–64), Hue (0–360), Saturation (0–100), Main pane glass (toggle), then two rows monocode does not have: **Accent** (nine vibrant swatches from `tabGroups.ts` plus a hue/saturation/lightness custom row with a live preview chip) and **Wallpaper** (preset thumbnails rendered as CSS gradient swatches, a URL input, and a local file path input with a "Test" button that hits the wallpaper route and reports the status). A "Reset to monocode defaults" button. Optional, non-blocking row at the end: **Native window transparency** (toggle, default off) — when on, set `data-lg-native="on"` on `<html>` and the CSS drops the wallpaper layer and makes `html, body` transparent so a vibrancy-enabled desktop window shows the real desktop through the panes; the description text must warn that on an opaque window or in a browser it shows a white background (see `bb-desktop-native-vibrancy.md` in the plans folder). Every control writes through `setAppearance` immediately (optimistic, toast on error) so the window updates live.
- Frontend tests (vitest + jsdom via `renderSlot`): the section renders the rows, a slider change calls `setAppearance` with the clamped value, the accent swatch click sets the three accent fields, reset calls `resetAppearance`.

### Docs and tests

- `README.md`: what it is, the honest transparency note, install, `bb theme set plugin:liquid-glass:liquid-glass`, the settings rows, CLI examples, and that Theme Toggle from the marketplace is a good companion for quick palette switching.
- `test/theme-contract.test.mjs` (node:test) as in v1, extended to assert both css files reference every `--lg-*` variable with a fallback and that the computed default accent (`hsl(211 92% 62%)` → `#4d9cf5`-ish) and ink clear 4.5:1 on the default canvas for both palettes. Compute, do not guess.

## Constraints

- Do not start from `~/.bb/theme/warm-glass/theme.css`; do not import its palette. Its only reusable idea (fixed ambient layer) is replaced by the wallpaper layer above.
- No font-family declarations (the Fonts plugin owns that).
- Token classes only in TSX; user colours via inline style / custom properties.
- Do not `bb theme set`, `bb plugin install`, or reload anything; I1 does that.
- Keep every file under 400 lines; split the settings section into components.

## Verify

`npm install`, `npx tsc --noEmit`, `npm test` (contract test + vitest), `bb plugin build`. Report per brief §5, and include: the computed contrast table, the list of `--lg-*` variables with defaults, and the RPC/CLI surface.
