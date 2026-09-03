# Packet P7 — Liquid Glass: sticky chrome fades into the pane instead of switching to a solid band

Work in `/home/system/workspaces/LAL/Development/bb-plugins/liquid-glass`
(installed and active). Read brief §5 (Preservation rule), then
`packet-P4-overlay-opacity.md` (the "Sticky chrome" rule) and P6's report in
your prompt appendix.

User direction (2026-09-02): "need to fix the chrome header opacity. Far too
drastic; needs to be a gradual change."

## What is wrong

Desktop screenshot (view it): `/home/system/.bb/thread-storage/thr_3uy6dx4vfp/Attachments/image-1788401831176-h4xlnn.png`. Three panes over a bright wallpaper: each pane's header bar and each composer dock (with the context meter, Goal card, todo card, workflow strip) are near-solid dark bands, while the transcript between them is clear glass at 23 %. The right-hand secondary panel's header shows the same band. That contrast is the complaint; the sidebar and transcript are the look the user wants everywhere else.

P4 gave the thread header bar and the composer dock the same treatment as
popovers: a flat sheet at `overlayOpacity` (0.94) with 32 px blur. Popovers
are separate objects, so a hard edge is right for them. The header and dock
are part of the pane; a flat 94 % band over a 23 % glass pane reads as a
solid bar slammed on top of the glass, and the transcript's edge under it
jumps from clear to hidden in one pixel.

## Rule to implement

Sticky chrome (thread header of every pane, the secondary-panel header, composer dock with its plugin cards, context
meter, scroll-to-bottom button, and the compact shelf header) becomes a
**gradient sheet**: fully frosted at the outer edge (top of the header, bottom
of the dock) and fading to the pane's own glass over a fade distance, with
the blur fading the same way so the transcript disappears gradually under the
chrome rather than at a line.

- New appearance keys (zod-validated, migration defaults, CLI, settings rows in the Glass section under "Sheets and chrome"):
  - `chromeOpacity` 0.3–1, default **0.72**: alpha at the outer edge of the header/dock.
  - `chromeFade` 0–96 px, default **40**: length of the fade toward the content.
  - `chromeBlur` 0–48 px, default **20**: blur at the outer edge.
  - Keep `overlayOpacity` for popovers, menus, dialogs, drawers, toasts, the quick palette (unchanged).
- CSS (both palettes): the header/dock background is a linear gradient from
  `hsl(shell / var(--lg-chrome-a))` at the outer edge to `hsl(shell / var(--glass-pane-a))` at `var(--lg-chrome-fade)`, then transparent-to-pane beyond. The backdrop blur uses a `mask-image` linear gradient of the same length so blur strength fades with the tint (`-webkit-mask-image` too). Hairline: replace the hard 1 px line with a 1 px highlight at 6 % that also fades out over the last third of the fade.
- The composer card itself (`[data-promptbox]`) keeps a readable surface: `chromeOpacity + 0.12` capped at 1, no gradient, since text is typed into it.
- Compact viewports: same rule; the P6 sidebar exemption stays.
- Reduced-transparency preference: `@media (prefers-reduced-transparency: reduce)` raises chrome and sheets to 1 without gradients (small, cheap, honours the OS).

## Tests and docs

Contract test: header/dock selectors use gradient backgrounds referencing `--lg-chrome-a` and `--lg-chrome-fade`, mask-image present, no flat `overlayOpacity` alpha on those selectors; new keys with fallbacks; defaults verified. Vitest: three new rows write clamped values; migration fills defaults. README: one paragraph "Chrome fades, sheets are solid". Bump to 0.5.2 (or the next patch after P6).

## Constraints

Preservation rule; no `bb theme set`; no reinstall (I1 does it); do not touch the active appearance values. Files under 400 lines.

## Verify

`npm test`, `npx tsc --noEmit`, `bb plugin build`. Report per brief §5.
