# Packet P6 — Liquid Glass: the sidebar keeps its glass on phones

Work in `/home/system/workspaces/LAL/Development/bb-plugins/liquid-glass`
(installed, active, 0.5.0). Read brief §5 (Preservation rule) and
`packet-P4-overlay-opacity.md` first.

User report (2026-09-02, after P4): "now on mobile the sidebar opacity is
always 100 %, so no wallpaper shows through." The orchestrator has set
`compactSolidPanes false` as an interim measure; the rule itself must change.

## Rule

The P4 compact-viewport rule exists so that stacked surfaces (page over
drawer, sheet over page) do not reveal legible content beneath. The sidebar
drawer on a phone is the **top** layer when open, over a page the host dims
with its scrim, so it never needs to be solid. Therefore:

- Remove the sidebar drawer from the compact solid rule entirely. On compact
  viewports the sidebar (`[data-sidebar="sidebar"]`, its mobile drawer
  variant, and the vaul content wrapper the host uses) keeps
  `var(--lg-sidebar-a)` and the sidebar blur exactly as on desktop.
- The compact rule keeps covering the main pane, the compact home page, and
  overlays. Its toggle `compactSolidPanes` keeps its name and default, and
  its description changes to "Main pane and sheets go near-solid on phones;
  the sidebar keeps its glass."
- Verify against the P4 selectors that nothing else forces the sidebar to
  alpha 1 on compact (`grep -n "sidebar" themes/*.css` inside every
  `@media (max-width: 767px)` / `(pointer: coarse)` block).
- While here: confirm the sidebar-opacity slider maps 15–100 % to 0.15–1
  and back without clamping to 1 on a re-render (the user found the value
  at 1; add a test that a stored 0.85 renders as 85 and that dragging to 85
  stores 0.85).

## Tests and docs

Contract test: no compact-media rule sets a sidebar alpha above
`var(--lg-sidebar-a)`; README line under "Dialling in the glass". Bump to
0.5.1.

## Constraints

Preservation rule; no `bb theme set`; no reinstall (I1 does it). This directory is not a git repository; list changed files.

## Verify

`npm test`, `npx tsc --noEmit`, `bb plugin build`. Report per brief §5.
