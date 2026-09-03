# Packet B1 — Organisation state: folders, thread and project accents (server + hook)

Role: you add the persistence, RPC contract, and frontend data hook for folders
and accent colours to the bb-sidebar fork. No UI. Read
`/home/system/workspaces/LAL/Development/plans/glass-sidebar/00-brief.md` in
full first (§2, §4.2, §4.3, §5 bind you).

Working directory: `/home/system/workspaces/LAL/Development/forks/bb-sidebar` (branch `feat/folders-colors-glass`).

## Read (in full unless a range is given)

1. The brief.
2. `src/server.ts` — the whole file (1181 lines). You are extending it: migrations array at the top, the `bb.rpc.register(bbSidebarRpcContract, {...})` block near line 919, the realtime publish pattern, and the thread-deletion cleanup path for `thread_lifecycle`.
3. `src/server.test.ts` lines 1–120 (harness setup with `createFakePluginHost`) and one existing RPC test block, to copy the style.
4. `src/useInboxReorder.ts` and `src/usePinnedReorder.ts` — the optimistic-update pattern your hook must follow.
5. `src/pinned-order.ts` — pure ordering helpers style.
6. `/home/system/workspaces/LAL/Development/monocode/src/lib/sessionFolders.ts` lines 1–130 and 280–330 — the folder model you are mirroring (only as a model; storage differs).
7. `/home/system/.npm-global/lib/node_modules/bb-app/server/dist/builtin-skills/bb-plugin-authoring/references/testing.md` lines 1–90 if you need harness details beyond what server.test.ts shows.

## Produce

- `src/accent.ts` — `ACCENT_PALETTE`, `type AccentValue = { colorIndex: number; customColor: string | null }`, `NO_ACCENT`, `parseCustomHex(input: unknown): string | null` (accepts `#rgb`/`#rrggbb`, returns lower-case `#rrggbb`), `accentCss(value): string | undefined`, `accentWash(value): string | undefined`, `sanitizeAccent(input: unknown): AccentValue`. Pure; no React. Tests in `src/accent.test.ts`.
- `src/organization.ts` — pure model helpers: `type Folder`, `type Organization` (the `getOrganization` result shape), `resolveAccent(threadId, projectId, org): AccentValue | null` (order thread → folder → project per brief §4.2), `folderOf(org, threadId)`, `uniqueFolderName(folders, base = "New folder")`, `applyMove(org, threadId, folderId, beforeThreadId)` and `applyReorder` optimistic transforms. Tests in `src/organization.test.ts`.
- `src/server.ts` — migrations for the four tables (brief §4.3), the eleven RPC methods with zod validation, realtime publish `"organization"` after every mutation, member pruning on thread deletion, and `ORGANIZATION_CHANNEL = "organization"` exported from `src/organization.ts` (import it in server.ts). `deleteFolder` and dissolve are the same operation. `moveThreadToFolder` with `folderId: null` removes membership. `reorderFolders` accepts the full id list and rejects (RPC error) unknown or missing ids. Keep the existing contract members untouched.
- `src/useOrganization.ts` — the hook in brief §4.3 with optimistic updates and rollback via toast on error (`sonner`), plus `useRealtime(ORGANIZATION_CHANNEL, refresh)`. Export the return type `OrganizationApi`.
- `src/server.test.ts` — add a `describe("organization")` block: migrations run, create/rename/colour/collapse/reorder/delete folder, move thread (with `beforeThreadId`), reorder members, thread & project accents, validation failures (bad hex, bad index, empty name, unknown folder), and pruning on thread deletion (use the same fixture the existing deletion test uses; if none exists, drive the same event the server subscribes to).

## Constraints

- Do not touch `ThreadInbox.tsx`, `ThreadCard.tsx`, `SlimRow.tsx`, `RowContextMenu.tsx`, or `app.tsx`.
- Column names and RPC names exactly as in brief §4.3; B3 and B4 are written against them.
- No new runtime dependencies. `zod` is already present.
- Bounded outputs: `getOrganization` returns everything (folders are few), no pagination.

## Verify

`npx tsc --noEmit` and `npx vitest run --config vitest.config.ts` pass (baseline 202 tests + yours). Commit only your files: `git add src/accent.ts src/accent.test.ts src/organization.ts src/organization.test.ts src/useOrganization.ts src/server.ts src/server.test.ts && git commit -m "[B1] organisation state: folders and accents"`. Return the report per brief §5, listing the final RPC method names and the `Organization` type verbatim so downstream packets can rely on them.
