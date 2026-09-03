# Packet P4 — Liquid Glass: overlays must not reveal the layer beneath

Work in `/home/system/workspaces/LAL/Development/bb-plugins/liquid-glass`
after P1 and P3 have landed (their reports are in your prompt appendix). Read
brief §2, §4.6, §5 (Preservation rule) first.

## The defect (user screenshots, 2026-09-02 20:30, iPhone; also reproduced on the desktop bookmark)

`/home/system/.bb/thread-storage/thr_3uy6dx4vfp/Attachments/IMG_6767-1788395483757-1kxbsz.png`,
`IMG_6768-1788395484063-84qhh2.png`, `IMG_6769-1788395484530-m4uqir.png` (view them).

With Liquid Glass active, surfaces that stack **over other content** are as
translucent as the base pane, so the layer underneath bleeds through:

1. The compact home page ("Recent" list) shows the sidebar drawer's rows
   through it, and the composer card shows list rows through it.
2. The composer's "+" action sheet (Attach files, Skills, Plan, Automation,
   Plugin, Checklists, Prompts, Send later) is drawn over the thread with the
   transcript text readable through the menu.
3. While a route loads, the previous page is visible under the loading state.

4. **Sticky chrome over scrolling content** (screenshots `IMG_6770-1788395866249-fy2c14.png`, `IMG_6771-1788395865873-go4nsi.png`, 20:37): when the transcript scrolls, its text is readable through the bottom composer dock — the composer card, the context-meter line, and the plugin cards mounted above the composer (Goal, Todo, workflow preview strip) — and faintly through the sticky thread header at the top. The dock and header float over the scrolling transcript, so they are overlays too.

Inside a thread with the composer focused it looks right, because there the
only thing under the pane is the wallpaper.

## Rule to implement

Glass is for the **base layer** only: the wallpaper shows through the sidebar
and the main pane when they sit side by side on the wallpaper. Anything that
stacks over content is a **frosted sheet**: near-opaque with strong blur, so
the content beneath contributes only a soft glow, never legible shapes.

Concretely, in both palettes:

- Overlay tokens: `--popover`, `--card` (when used as a sheet), `--surface-raised`, `--surface-raised-solid`, dialog/sheet/drawer surfaces → alpha ≥ 0.94 of the shell colour, `backdrop-filter: blur(32px) saturate(1.2)`. Keep the 1 px top highlight.
- Host overlay roots to cover explicitly (find the stable hooks in the bb 0.41 source at `/home/system/workspaces/LAL/Development/bb/bb-0.41.0/apps/app/src/components/ui/{dialog,sheet,drawer,popover,dropdown-menu,context-menu,command,sidebar}.tsx` and `components/secondary-panel/CompactSecondaryPanelShelf.tsx`): Radix portals `[data-radix-popper-content-wrapper] > *`, `[role="dialog"]`, `[role="menu"]`, `[role="listbox"]`, `[data-bb-portaled-overlay]`, `[data-secondary-panel-shelf]`, the mobile sidebar drawer (`[data-sidebar="sidebar"][data-mobile="true"]` or the vaul drawer content), the composer action sheet, toasts (`[data-sonner-toast]`), the quick palette, and the compact home page container. Read each component once to find its root attribute; do not guess selectors.
- Compact viewports (`@media (max-width: 767px), (pointer: coarse)`): the main pane and the sidebar drawer use alpha ≥ 0.96 regardless of the pane-glass setting, because on a phone they always stack over each other. Keep blur so the wallpaper still glows through.
- Loading states: the route loading skeleton container and `body` keep an opaque `--canvas` under the wallpaper layer so no previous page shows.
- Add a **Overlay opacity** setting (`overlayOpacity`, 0.85–1, default 0.94) to the appearance model, CLI, and the Glass section, so the user can dial sheets from frosted to solid; and a **Compact solid panes** toggle (`compactSolidPanes`, default on) that controls the compact-viewport rule.
- **Sticky chrome**: the thread header bar (find its root in `apps/app/src/components/thread/ThreadHeader*.tsx` / the pane header), the composer dock wrapper that contains the composer and every plugin card slotted above it (`apps/app/src/components/composer/*` — the container that is `sticky`/`fixed` at the bottom, not the individual cards), the context-meter row, and the scroll-to-bottom button: sheet treatment (alpha ≥ 0.94, blur 32px, top hairline highlight on the dock, bottom hairline on the header). Plugin cards inside the dock inherit; do not restyle them individually.
- Optional: for the composer card specifically, `[data-promptbox]` (Monokai targets it; confirm in the bb source) gets the sheet treatment because it floats over the transcript.

## Tests and docs

Contract test: every overlay and sticky-chrome selector above appears in both css files with an
alpha ≥ 0.94 default; compact media rule present; new keys with fallbacks.
Vitest: settings rows for the two new keys; migration fills defaults. README:
"Why sheets are frosted, not clear." Bump to 0.5.0.

## Constraints

Preservation rule; token classes only; no `bb theme set`; no reload (I1 does it). Files under 400 lines.

## Verify

`npm test`, `npx tsc --noEmit`, `bb plugin build`. Report per brief §5 with the list of overlay selectors covered and the source file each came from.
