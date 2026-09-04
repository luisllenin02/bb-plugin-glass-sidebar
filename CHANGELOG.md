# Changelog

## 1.1.0 — 2026-09-03

- Performance review across the server, thread list, hooks, and settings.
  The lifecycle read no longer runs the auto-settle policy pass on every
  sidebar refresh; the pass runs on a 90-second cadence, on its five-minute
  schedule, and when a thread goes quiet, with pull-request lookups cached
  per environment. Prepared statements and the organization and decor views
  are cached until the next change.
- Rows are memoised with stable per-row bindings, so a realtime update that
  changes nothing re-renders nothing. Context and folder menus build their
  content only when opened. Lifecycle and workflow refreshes coalesce during
  streaming.
- Off-screen cards skip layout and paint until scrolled into view, which
  makes long inboxes scroll smoothly and cuts context-menu open time by more
  than half.
- Fixed a hook-order crash in the child-threads chip when a thread gained its
  first child while the chip was mounted.
- Icon search is debounced; the icon grid no longer re-renders on unrelated
  state changes.
- Third-party notices now credit Hugeicons and zod. Internal programme
  documents no longer ship with the plugin.

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
