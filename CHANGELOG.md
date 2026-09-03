# Changelog

## 1.0.4 — 2026-09-03

- The child-thread menu now portals above thread content and is constrained to
  its owning split pane and the visible viewport, with a dedicated scrolling
  list for long child trees.

## 1.0.3 — 2026-09-03

- Thread-header controls now respond to each split pane's width, not only the
  browser width. In a narrow pane, project and parent labels collapse to
  icons, while the child control retains its readable numeric count.

## 1.0.2 — 2026-09-03

- Child-thread action now releases the enclosing host action group in narrow
  split panes, while preserving fixed pane controls and allowing the chip's
  label to truncate rather than be clipped.

## 1.0.1 — 2026-09-03

- Child-thread header action now releases the host's fixed-width wrapper and
  shrinks its label with the split pane instead of being clipped.

## 1.0.0 — 2026-09-03

- First production release of the owned Glass Sidebar plugin.

## 1.0.0-rc.1 — 2026-09-03

- Q1: ported focused/open/idle pane states, pane ordinals, accent rails, and
  search-result parity.
- Q2: ported the organization store, coloured folders, menus, pointer drag and
  drop, and keyboard reorder.
- Q3: ported Open panes, Now, workflow child rows, and expanded session
  columns while preserving authoritative workflow state.
- Q4: absorbed project decor, deterministic classification, the icon picker,
  shared project colour/glyph consumers, and the title-adjacent header chip.
- Q5: ported Snoozed and Settled shelves, lifecycle actions, inactivity policy,
  five-minute auto-settle, and durable live-work protection.
- Q6: ported favicon detection and upload, sort and filter controls,
  multi-selection and bulk actions, and the settings section.
- Q7: added the explicit read-only legacy data importer, switch-over and
  rollback runbook, integration audits, and release documentation.
