# Packet P1 — Liquid Glass phase 2: dial-in controls for main-pane glass and wallpaper, vibrant interactive elements

Phase 2 of the theme plugin at
`/home/system/workspaces/LAL/Development/bb-plugins/liquid-glass` (installed
and running as `liquid-glass@0.2.0`; not the active palette). Read brief §2,
§4.6, §5 (including the Preservation rule) and addendum §3 first. Everything
already shipped stays; you extend.

User direction (2026-09-02, verbatim intent): "Main pane glass option needs to
allow for / include opacity, brightness, blur amount for the wallpaper as
well. I want to have the glass for the main shell/pane active and still be
able to control and dial in the amount and settings." And: "buttons (enter the
prompt, for example) and other interactive elements should follow the vibrant,
easy-to-identify colour scheme similar to the buttons/accent colours of
Monokai."

## Read

1. This plugin: `src/appearance.ts` (whole), `src/wallpaper.ts`, `server.ts` (RPC + kv), `app.tsx`, `src/components/AppearanceSection.tsx`, `src/components/rows.tsx`, `src/components/AccentRow.tsx`, `themes/liquid-glass.css` and `themes/liquid-glass-light.css` (whole), `test/theme-contract.test.mjs`, existing vitest files, `README.md`.
2. Monokai's interactive tokens, the reference for "vibrant buttons": `/home/system/.bb/plugins/cache/git/github.com/smsunarto/bb-plugins/2bb1b7e8f5845378edc614fe81f01dc44071667a/plugins/monokai/themes/bb-monokai.css` — grep `--primary`, `--primary-foreground`, `--secondary`, `--accent`, `--ring`, `--pill-`, `--surface-selected`, `--state-active`, `--success`, `--warning`, `--attention`, `--destructive`, `button`, and read the comment blocks around them (they explain which bb controls each token paints).
3. Host token list: `/home/system/workspaces/LAL/Development/bb/bb-0.41.0/apps/app/src/components/ui/theme.css` lines 119–140 and 427–700; and, to learn which tokens paint the composer send button, primary/secondary buttons, toggles, tabs and pills: `apps/app/src/components/ui/button.tsx`, `apps/app/src/components/ui/switch.tsx`, `apps/app/src/components/ui/tabs.tsx`, and grep `bg-primary\|bg-secondary\|bg-accent\|pill-surface` in `apps/app/src/components/composer/*.tsx` (bounded: first 40 hits).
4. monocode for the wallpaper behaviour: `/home/system/workspaces/LAL/Development/monocode/src/index.css` lines 100–160 (`.body-glass`, blur radius) and `src/lib/appearance.ts` lines 44–60 (ranges).

## Produce

### Appearance model (`src/appearance.ts`, `server.ts`, kv migration)

Add, with zod ranges, defaults, and a migration that fills missing keys on read:

```
paneOpacity          0.15–1     default 0.85   main-pane surface alpha while paneGlass is on (sidebarOpacity stays separate)
paneBlur             0–64 px    default 24     backdrop blur of the main pane while paneGlass is on (sidebar `blur` stays separate)
wallpaperBrightness  0.3–1.6    default 1.0    CSS filter brightness on the wallpaper layer
wallpaperBlur        0–40 px    default 0      CSS filter blur on the wallpaper layer (draw the layer with negative inset = blur radius so edges never show)
wallpaperSaturation  0–2        default 1.1    CSS filter saturate on the wallpaper layer
```

Keep `dim`. Every field is independent of `paneGlass`: brightness/blur/saturation/dim always apply to the wallpaper; `paneOpacity` and `paneBlur` take effect only while `paneGlass` is on, and the UI says so. The CLI `bb liquid-glass set <key> <value>` accepts the new keys; `show` prints them; `reset` restores defaults.

### CSS (both palettes)

- Wallpaper layer: `filter: brightness(var(--lg-wp-brightness,1)) saturate(var(--lg-wp-sat,1.1)) blur(var(--lg-wp-blur,0px))`, `inset: calc(-1 * var(--lg-wp-blur,0px))`, then the dim overlay as today.
- Main pane while `html[data-lg-pane-glass="on"]`: `--background` (and the pane-level surfaces the current CSS already treats as "pane") use `var(--lg-pane-a)`; the main pane container gets `backdrop-filter: blur(var(--lg-pane-blur)) saturate(1.2)`. Keep the current near-opaque behaviour when glass is off. Keep `@supports not (backdrop-filter)` fallback.
- The content script sets `--lg-pane-a`, `--lg-pane-blur`, `--lg-wp-brightness`, `--lg-wp-blur`, `--lg-wp-sat` and clears them on dispose.

### Vibrant interactive elements

Mirror Monokai's *structure* with the Liquid Glass accent, so buttons and controls are unmistakable:

- `--primary` (accent), `--primary-foreground` (dark ink on the accent, ≥ 4.5:1 computed) — primary buttons and the composer send button.
- `--secondary` = accent wash `color-mix(in oklab, var(--primary) 18%, var(--canvas))`, `--secondary-foreground` = ink; `--accent` (bb's neutral hover/active fill despite the name) = accent wash at 12 %; `--accent-foreground` = ink.
- `--ring`, `--sidebar-ring`, `--surface-selected` (accent 14 %), `--surface-selected-border` (accent 45 %), `--state-active` (accent 16 %), `--state-hover` (ink 7 %), `--pill-surface-selected` / `--pill-surface-selected-border` accent-tinted, `--pill-icon` = accent.
- Semantic set stays vivid (success, warning, attention, destructive, pr-merged) and `--destructive` also drives destructive buttons with a computed foreground.
- Focus-visible outlines use `--ring` at full strength; disabled controls keep their opacity.
- Add an **Interactive vibrancy** slider in the settings page (0–100, default 70) that scales the wash percentages above via `--lg-vibrancy` so the user can dial it from subtle to loud; the contract test checks the default output values.

### Settings page

Under the existing "Main pane glass" toggle, an indented group that is enabled only when the toggle is on: **Pane opacity** (15–100 %), **Pane blur** (0–64). A **Wallpaper** group: the existing preset/URL/path controls plus **Brightness** (30–160 %), **Blur** (0–40), **Saturation** (0–200 %), **Dim** (existing). Then **Interactive vibrancy**. Every control writes through `setAppearance` immediately. Copy for each row follows monocode's tone (one sentence, what it changes, what it costs).

### Tests and docs

- Server: schema accepts/rejects ranges; migration fills defaults for an old kv record; CLI `set` for a new key.
- App: rows render; pane group disabled when glass is off; slider change calls `setAppearance` with the clamped value.
- Contract test: both css files reference every new `--lg-*` variable with a fallback; `--primary-foreground` on `--primary` ≥ 4.5:1 at defaults; `--secondary`/`--accent`/`--surface-selected` derive from the accent.
- README: new settings and CLI keys; a "Dialling in the glass" paragraph.
- Bump version to 0.3.0.

## Constraints

- Preservation rule (brief §5): no existing setting, RPC, CLI verb, or test is removed or renamed.
- Token classes only in TSX; no font-family in CSS; no `bb theme set`, no reload/install (I1 does it).
- Files under 400 lines; split components as needed.

## Verify

`npm test` (contract + vitest), `npx tsc --noEmit`, `bb plugin build`. Report per brief §5 with the list of new keys, defaults, and the computed contrast table. This directory is not a git repository; list the files you changed instead of commits.
