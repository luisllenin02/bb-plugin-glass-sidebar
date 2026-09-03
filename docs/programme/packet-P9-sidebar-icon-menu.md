# Packet P9 — Sidebar: project glyph mirrors the header, and right-click opens the icon/colour menu

Work in `/home/system/workspaces/LAL/Development/forks/bb-sidebar`, branch
`feat/folders-colors-glass` (after P5d has landed; its report is in the
appendix). Read brief §4.2, §5 (Preservation rule), `packet-P2-project-link.md`
and `packet-P8b-matter-icons.md` Part B.

User direction (2026-09-02): "the sidebar icon for the project is not
reflecting the top thread title-bar icon. Right-clicking on the thread in the
sidebar should open the icon picker / colour menu with an additional option
for a specific thread colour."

## Produce

1. **Mirror check.** With P5d live, `getProjectDecor` returns Project Icons
   rows. Verify in the running sidebar (curl the RPC, then inspect a card)
   that the row glyph is the Project Icons icon in its colour. If the glyph
   still differs from the header, find why (icon name mapping to
   `@hugeicons/core-free-icons` exports, colour anchors, refresh on the
   `bb.project-icons` broadcast) and fix it. Add a test that a decor row
   `{ icon: "balance-scale", color: "blue" }` renders the BalanceScale glyph
   with the blue anchor.
2. **Context menu.** In `RowContextMenu.tsx` add, above the existing
   `Colour ▸` (thread accent) item, a group **Project icon & colour…** that
   posts `{ type: "open-picker", projectId, source: "bb-sidebar" }` on the
   `bb.project-icons` BroadcastChannel (Part B of P8b). If Project Icons is
   not installed (decor source `missing`), the item is disabled with a
   tooltip. Rename the existing thread-accent item to **Thread colour ▸** so
   the two are clearly distinct, keep its swatches and Clear.
3. **Folder headers** get the same **Project icon & colour…** item when all
   members share one project.
4. Tests: menu renders both items; the project item posts the broadcast
   message with the thread's project id; disabled state when decor is
   missing; thread colour item unchanged.

Commit subject exactly `[P9] project icon menu from the sidebar`. No reload (I1 does it).

## Verify

`npx tsc --noEmit`; `npx vitest run --config vitest.config.ts`. Report per brief §5.
