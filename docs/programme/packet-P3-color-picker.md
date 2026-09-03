# Packet P3 — Liquid Glass: a real colour picker instead of hue sliders

Work in `/home/system/workspaces/LAL/Development/bb-plugins/liquid-glass`
(after P1 has landed; read P1's report in your prompt appendix). Read brief §2,
§4.6, §5 (Preservation rule) and addendum §3 first.

User direction (2026-09-02): "instead of a hue slider there should be a
cleaner colour picker to pick theme colours; look at the bb Ayu colour
palette settings page for inspiration."

## Read

1. Ayu's settings page, the design reference: `/home/system/.bb/plugins/cache/git/github.com/vburojevic/bb-plugin-ayu/8881e00888854462fc8a7c68de386fef8229f8aa/app.tsx` lines 100–360 (theme cards with a miniature preview and an Apply button; hue rows as clickable graded strips that grow on hover; swatch grids with a colour chip, name and hex; `Section` with title and hint). Also its `themes-meta.ts` for how it describes each palette.
2. This plugin after P1: `src/appearance.ts`, `app.tsx`, `src/components/AppearanceSection.tsx`, `src/components/AccentRow.tsx`, `src/components/rows.tsx`, `server.ts` (RPC), `themes/*.css`, tests.
3. monocode's swatch row for the folder colours, for parity of feel: `/home/system/workspaces/LAL/Development/monocode/src/chrome/ColorPickerPopover.tsx` lines 1–120.
4. SDK: `frontend-hooks-and-ui.md` (vendored components, popovers), `backend-events.md` (`bb.sdk.theme.set` for the Apply button — the plugin server may switch the palette when the user clicks Apply; it is the user's explicit action, so this is allowed here).

## Produce

Replace the hue/saturation sliders in the main flow with a **Colours** section, laid out like Ayu's page (max-width container, sections with title + hint, cards, grids):

1. **Theme cards**: one card per palette (Liquid Glass, Liquid Glass Light) with a miniature preview (sidebar strip + pane + accent dots rendered from the live appearance values), the palette name, a one-line note, and an **Apply** button that calls a new RPC `applyTheme({ id })` → `bb.sdk.theme.set("plugin:liquid-glass:<id>")`. The active palette shows an "Active" badge (read from `activeThemeId` already exposed by `getAppearance`).
2. **Accent**: a swatch grid of named colours — the nine palette colours from brief §4.2 plus a "Monokai-vivid" row (Monokai's green, yellow, orange, pink, purple, cyan taken from its theme css, credited) — each chip shows colour, name and hex; the selected chip carries a ring. Below it a **hue ramp**: one Ayu-style graded strip per hue family (red, orange, amber, green, teal, blue, indigo, violet, pink), each step clickable, hover-grow, title with hex, so the user can pick a precise shade without a slider. Then a **Custom** control: native `<input type="color">` next to a hex field (validated `#rrggbb`), with a live preview chip. Selecting anything writes `accentHue/accentSaturation/accentLightness` (convert hex → HSL) through `setAppearance`.
3. **Shell tint**: chips for Neutral (monocode default: hue 240 / 0 %), Slate, Graphite, Warm, Sepia, Ocean, Forest, Plum — each a small preview of the shell over the current wallpaper — plus the same Custom colour control; writes `hue`/`saturation`.
4. **Wallpaper**: the presets as gradient cards with names (aurora, forest, sunset, ocean, mono) plus the URL / path controls from phase 1, unchanged.
5. **Advanced (collapsed)**: the previous hue, saturation, accent hue/saturation/lightness sliders stay here so nothing is lost (Preservation rule); default collapsed with the hint "Sliders for fine adjustment; the picker above covers most needs."

Keep the Appearance rows (theme mode, sidebar opacity, blur, main-pane glass group, wallpaper filters, vibrancy) from phase 1 and P1 as a separate **Glass** section above Colours.

Implementation notes: colour maths in `src/lib/color.ts` (hex ↔ HSL ↔ OKLCH light steps for the ramps; pure, tested); components under `src/components/colours/` each under 250 lines; token classes only, colour values as inline styles; keyboard: chips are buttons with `aria-pressed`, ramps are `role="radiogroup"` with arrow-key movement.

## Tests

`color.ts` round-trips (hex → HSL → hex within 1/255), ramp generation counts and monotonic lightness; swatch click calls `setAppearance` with the converted HSL; hex field rejects bad input; Apply calls `applyTheme` with the right id; Advanced section is collapsed by default and still renders the sliders when opened; contract test unchanged and green. README: update the settings description and add a screenshot placeholder list.

## Constraints

- Preservation rule: every existing setting, RPC, CLI verb and test survives; the sliders move, they are not deleted.
- No `bb theme set` from a test or on load; only the user's Apply click switches palettes.
- No reload/install (I1 does it). Bump version to 0.4.0. This directory is not a git repository; list changed files in the report.

## Verify

`npm test`, `npx tsc --noEmit`, `bb plugin build`. Report per brief §5.
