# Changelog

## 1.1.5 — 2026-09-24

- One tab stop for the thread list. Every row anchor and its inline
  controls were separate stops, so from the top of the page it took 500
  Tabs to reach the composer, 302 of them in this list. Now one row takes
  part in the tab order, with its own controls: the row you last focused,
  else the thread you are on, else the first row. Up/Down and Home/End move
  between rows, Enter opens, and the context-menu key or Shift+F10 opens
  the row menu. Focus returns to the row when the menu closes. The list is
  down to 10 stops, and the composer is 208 Tabs from the top. The stop is
  held outside React state, so moving it redraws two rows, not the list.
- Keyboard focus is visible. The Snooze trigger removed its ring
  (`focus:ring-0`); a keyboard focus now gets bb's 1 px ring, while a
  pointer focus still shows none. A row's own focus outline was clipped to
  four corner dots by the card's paint containment; it is now an inset
  ring. "Thread details" is a real button: hover and focus show it as
  before, and a press opens it, which is the only way to open it on touch.
- Touch. Row actions were hover-only, so a phone could not reach them.
  On `(hover: none)` each row shows one trailing "…" (44 × 76 px on a card,
  44 × 32 px on a slim row) that opens the row menu. The column costs the
  card 34 px of width; row height is unchanged at 78 px. The list sets
  `overscroll-behavior: contain`, so scrolling past its end no longer drags
  the drawer or page behind it.
- 44 px touch targets at 390 px: the scope select (was 28 px tall), the
  shelf headers (15 px; the header trades its margin for the button, so the
  label and rule sit 13 px further apart), folder headers (36 px) and their
  actions button (24 px, and now visible on touch), and "Thread details"
  (12 × 12 px; its target is anchored at the card's bottom-right corner
  because the card clips anything past its edge).
- The row and folder menus use bb's own menu classes (6 px panel radius,
  4 px items, 12 px text, 26 px items, bb's enter and exit animation)
  instead of a near miss (8/6 px, 14 px, 31 px, no motion), and carry the
  plugin's portal scope like its tooltips and selects already did.

## 1.1.4 — 2026-09-23

- The Children popover sat above BB's menu layer (z-80/81), so a thread
  context menu right-clicked from a child row opened underneath it. It now
  sits just under BB's menus (z-48/49), still above the header and composer.

## 1.1.1 — 2026-09-10

- The Active and Inactive shelves are windowed like the Settled shelf: 60
  (Active) or 30 (Inactive) cards mount at first, with a "Load N more"
  control for the rest. Every thread stays in the list model — search, bulk
  actions, folders, and the auto-settle pass see all of them — only the DOM
  is capped. A card is about 40 nodes, so a few hundred uncapped rows were
  most of the page, and every style recalc, focus move, and menu open paid
  for them. The thread you are on is always mounted wherever it sits.

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
