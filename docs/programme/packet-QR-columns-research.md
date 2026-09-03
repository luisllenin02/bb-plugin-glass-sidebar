# Packet QR — Research note for a cube.computer-style "session columns" view

Plans only: write
`/home/system/workspaces/LAL/Development/plans/glass-sidebar/packet-Q3b-columns-research.md`.
Edit no code, run no builds, commit nothing.

## Read

- `00-brief.md` §3 and §4; `02-own-plugin-plan.md`; `packet-B4-live-strip.md`.
- Reference frames: `/home/system/.bb/thread-storage/thr_3uy6dx4vfp/frames/` (files matching `cube_*` and `yiliush-*`; view up to eight) and `/home/system/.bb/thread-storage/thr_3uy6dx4vfp/Attachments/Screenshot-2026-09-02-at-16.34.12-1788381655244-fbmrd7.png`.
- `01-marketplace-references.md` §1 rows for Cascade, Thread Inbox, GTD Sidebar; then Cascade's README first 120 lines at `/home/system/workspaces/LAL/Development/refs/bb-plugin-cascade/README.md` if present.
- Host surfaces: `/home/system/workspaces/LAL/Development/bb/bb-0.41.0/docs/plugin-sidebar-thread-list.md` §6 and §7; in `/home/system/workspaces/LAL/Development/forks/bb-sidebar/node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts` the declarations for `navPanel`, `homepageSection`, `commandPaletteAction`, `experimental_threadHeaderAction`, and `experimental_useSidebarThreadSplit` (grep, then read ±40 lines each).
- Use case: a Florida litigation practice running four to six matter threads at once, several open in split panes, plus Codex/Claude workflow runs; phone use is common.

## Produce

The note must contain:

1. Candidate surfaces for a horizontally scrolling columns view, scored 0–3
   each on: zero background cost, no new dependency, phone usability,
   one-tap open and modifier-click split, and effort. Candidates at least:
   a `navPanel`, a `homepageSection` overview, an expanded mode of the
   existing Open panes / Now live strip inside the thread list, and a
   command-palette-triggered overlay. State plainly that a plugin cannot
   replace bb's pane manager, so the view is a navigator.
2. The column model: one column per open pane in `paneOrdinal` order with
   project glyph and colour, title, status glyph, elapsed, running workflow
   rows under the origin thread, "needs you" first, focused column
   unmistakable. Which of these the host exposes cheaply and which it does
   not (say what is missing rather than inventing data).
3. A verdict on any "canvas" analogue: keep only if it needs no timers, no
   canvas library, and no heavy DOM; otherwise drop it and say why.
4. A recommended option with a packet contract in the brief's packet format
   (files, RPCs if any, tests, weight budget: no added dependency, app bundle
   growth under 40 KB, no timers), written so it can be run as packet Q3b in
   the own plugin after Q3.

Final message: report per brief §5 with the recommended option in one line.
