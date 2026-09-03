# Marketplace references — what to reuse, what to avoid

The user asked that bb marketplace plugins be used as reference and foundation.
This addendum is binding for every packet that lists it. Sources are local
checkouts; read only the files named, nothing more. Copying code from these
plugins is allowed where the licence permits (all are MIT unless noted);
credit the origin in a one-line comment.

Local roots:

- Store cache: `/home/system/.bb/plugins/cache/git/github.com/<owner>/<repo>/<sha>/`
- Cloned for this task: `/home/system/workspaces/LAL/Development/refs/`
- Vendored in this workspace: `/home/system/workspaces/LAL/Development/.bb/vendor/`

## 1. Thread-list replacements (foundation for B2, B3, B4)

| Plugin | Where | What it gives us |
|---|---|---|
| **T3 Sidebar** (SawyerHood) — the SDK's reference example; our fork descends from it | cache `SawyerHood/bb-plugin-t3sidebar/*/src/ThreadCard.tsx` | The origin of the bug. Line ~57–60: `isActive ? "bg-sidebar-accent" : …` and `!isActive && layout !== null && "bg-sidebar-accent/30"`. **GTD Sidebar** (`smsunarto/bb-plugins/*/plugins/gtd-sidebar/components/inbox/thread-card.tsx` ~68) and **Tinted Threads** (`grrowl/bb-tinted-threads/*/app.tsx` `idleRowClass`, ~572) carry the identical rule. Every marketplace list inherited the weak split tint, so the B2 fix is a genuine improvement over the ecosystem, not a local quirk. Do not copy those lines. |
| **Tinted Threads** (grrowl) | same `app.tsx`, `rowTone` (~615), `rowStyle` (~581), `statusDotStyle` (~600) | The clean pattern for row hues: a `tone` (`blocked` / `working` / `idle`) drives an inline `style` built from `color-mix(in oklab, var(--token) N%, transparent)` because, in the author's words, "plugin Tailwind often misses host tokens". B2's `AccentRail` and B3's folder wash use exactly this technique with `--thread-accent`. B4's `classifyNow` should reuse its `rowTone` decision table (blocked = `waiting-for-input` / `unread-error`; working = runtime, workflow, background-*, plan-mode). |
| **Thread Inbox (w/ Children)** (wy3z) | `refs/bb-plugin-thread-inbox/src/useThreadOrder.ts`, `thread-order.ts`, `ThreadCard.tsx` (grep `Alt+`) | Persistent drag-and-drop ordering plus `Alt+Up/Down` keyboard reorder in a T3-descended list — the closest published precedent for B3's folder reorder. Read the keyboard handler and the optimistic order store; mirror the key bindings so users of both plugins get one vocabulary. |
| **Sidebar Project Filter** (npm `bb-plugin-sidebar-filter`) | `refs/sidebar-filter/app.tsx` lines 90–160 | Project grouping with collapse state in localStorage and an `activeMode: running` filter defined as indicator `runtime` **or** any live `activity` count (workflows, backgroundAgents, backgroundCommands, goals, planMode). B4's "Now" row must count a thread as working under the same definition, so the two plugins agree on what "running" means. |
| **Thread Provider Icons** (braedonsaunders) | `refs/bb-plugin-thread-provider-icons/app.tsx` (113 lines), `lib/provider-marks.ts` | Wraps the host list via `experimental_threadList`, renders `Original`, and decorates each `[data-sidebar-thread-id]` row through a MutationObserver. Two lessons: (a) the host's row anchor is an `absolute inset-0` overlay, so decorations go on the sibling container, not the anchor; (b) provider brand colours that follow light/dark. B2 keeps the fork's `ProviderGlyph`; B4's chips may borrow the brand-colour map for the provider dot when no accent exists. |
| **Cascade** (SawyerHood) | `refs/bb-plugin-cascade/README.md` first 120 lines; `app.tsx` overview-card section (grep `overview`) | The niri-style strip of live threads and its overview layer of landscape cards (project, title, branch) is the closest bb analogue to the cube.computer rail. B4's "Open panes" chips take the card grammar from here: project mark, title, one status glyph. Cascade also shows `bb.sdk.threads.spawn` with `sectionId`/`parentThreadId` for plugin-created threads — B3's `+ New thread` keeps using `actions.openNewThread` (host composer), but if a later packet wants folders to auto-adopt threads created from a folder, this is the server-side path. |
| **GTD Sidebar** (smsunarto) | `README.md` first 60 lines | "Next Action" vs "Waiting" — organised by who can act next. B4's Now row orders needs-you first, then working, for the same reason. |
| **Arc Switcher** (bighitbiker3) | cache `bighitbiker3/bb-plugin-arc-switcher/*/README.md` | Stable per-thread emoji marker shown in sidebar and header so a thread stays recognisable. Not adopted now; noted as a follow-up option (a per-thread glyph next to the accent colour). |
| **Thread Hover Cards** (brsbl) | `/home/system/workspaces/LAL/Development/bb-plugin-thread-hover-cards/README.md` | Hover/focus card with last agent message, provider, model, runtime. Follow-up candidate for the live strip chips; out of scope now. |

## 2. Colour vocabulary (B1, B3, T1)

**Project Icons** (ariofrio, vendored at
`/home/system/workspaces/LAL/Development/.bb/vendor/bb-plugins-ariofrio-39a8cf1a/plugins/bb-plugin-project-icons/project-icon-colors.ts`)
defines bb's eight favicon colour names (red, orange, yellow, green, teal, blue,
purple, pink) as OKLCH anchors with per-mode lightness via `light-dark()`,
fitted for ≥ 3.5:1 on every built-in theme in both modes. It is already
installed on this host and already colours project icons.

Decision for this work:

- The accent palette in brief §4.2 stays as specified (monocode's nine
  `TAB_GROUP_COLORS`, index 0 = none) so the folder UI matches the video.
- B1 adds one export to `src/accent.ts`: `ACCENT_NAMES = ["none", "blue", "coral", "amber", "green", "pink", "violet", "teal", "orange"]` for labels, and `accentCss()` must return the palette `hsl(...)` string unchanged (no `light-dark()`), because the rail and wash are drawn at low alpha where per-mode fitting does not matter.
- B3's Project colours settings block should say "also see Project Icons for the header icon colour" and must not write to the project-icons store.

## 3. Themes (T1, I1)

| Plugin | Where | Use |
|---|---|---|
| **Vercel Theme** (divyesh-puri) | `refs/bb-plugin-vercel-theme/package.json`, `themes/vercel.css`, `themes/vercel-dark-code.json`, `test/theme-contract.test.mjs` | The best-packaged marketplace theme: `bb.themes[].codeTheme { dark, light }` pointing at VS Code theme JSON, and a `node:test` contract test that checks required tokens and WCAG contrast from the CSS. T1 adds an equivalent `test/theme-contract.test.mjs` and a `test` script. |
| **Cobalt2** (patleeman, vendored) | `/home/system/workspaces/LAL/Development/.bb/vendor/bb-plugins-patleeman-d65f8dbf/packages/bb-plugin-cobalt2/{package.json,server.ts,themes/cobalt2.css}` (absolute path; the directory exists) | Minimal theme-only plugin: no-op `server.ts`, one css. |
| **Ayu**, **Tokyo Night**, **bb Monokai** | installed; ayu cache path in the brief | Full token coverage examples, including the 16 `--ansi-*` entries. |
| **Theme Toggle** (xMinor-1) | cache `xMinor-1/bb-plugins/*/plugins/theme-toggle/{server.ts,app.tsx}` | Shows `bb.sdk.theme` (catalog / get / set) from a plugin server and that light/dark mode is client-side in `localStorage["bb.theme"]`. I1 records the activation command; a footer toggle is not in scope, but the HANDOFF note should point users at Theme Toggle as the marketplace way to switch palettes quickly. |
| **Fonts** (gtramontina) | `refs/bb-plugin-fonts/README.md` | Interface/code font selection lives in a separate plugin; T1 must not set font families in theme CSS. |

## 4. Status rings and footer (follow-ups only)

**Server Status** and **Usage Meter** (xMinor-1) draw a ring around a
`sidebarFooterAction` with shared geometry. Not adopted now. A future "N
running / M waiting" ring in the footer would follow their pattern.

## 5. Rules derived from the research

1. Row state classes must never regress to the T3 rule; B2's `pane-state.ts` is the single source and its tests lock the three states apart.
2. "Running" means what Sidebar Project Filter and Tinted Threads mean: indicator working kinds or any non-zero activity count. "Needs you" means `waiting-for-input` or `unread-error`.
3. Keyboard reorder is `Alt+ArrowUp` / `Alt+ArrowDown`, as in Thread Inbox and the fork's pinned reorder.
4. User colours travel as inline `style` custom properties; token classes for everything else.
5. Theme plugins ship a contract test; T1 adds one.
