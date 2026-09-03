// Extension rule for Q2-Q6: leave every anchor comment in place.
// Insert content immediately after your own anchor.
// Never edit, move, or reorder another packet's anchor.
import {
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginSidebarThread,
  type PluginThreadListProps,
  useRealtime,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import { ThreadCard } from "./ThreadCard";
import { SlimRow } from "./SlimRow";
import { SearchResults } from "./SearchResults";
import { LiveStrip } from "./LiveStrip";
import { SplitProbe } from "./SplitProbe";
import { TRAILING_GLYPH_BOX_CLASS } from "./StatusSlot";
import { FolderShelf } from "./FolderShelf";
import { partitionByFolder } from "./folder-list";
import { useFolderDrag } from "./useFolderDrag";
import { useOrganization } from "./useOrganization";
import { useShelfReorder } from "./useShelfReorder";
import { accentCss } from "./accent";
import {
  filterByProject,
  hideChildrenOfVisibleParents,
  nextThreadAfterParking,
  partitionPinned,
  searchThreadsByTitle,
  sortByCreatedAtDescending,
  sortSettledThreads,
  visibleInboxThreads,
} from "./inbox";
import { isInactiveThread, parseInactiveAfterHours } from "./inactive";
import { parseConfiguredSnoozePresets } from "./lifecycle";
import { useLifecycle } from "./useLifecycle";
import type { ConfiguredSnoozePreset } from "./row-props";
import {
  DEFAULT_SETTINGS_ACCESS,
  DEFAULT_SIDEBAR_SETTINGS,
  EMPTY_DECOR_ACCESS,
  EMPTY_LIFECYCLE_ACCESS,
  EMPTY_ORGANIZATION_ACCESS,
  EMPTY_WORKFLOW_ACCESS,
  type DecorAccess,
  type LifecycleAccess,
  type OrganizationAccess,
  type SettingsAccess,
  type WorkflowAccess,
} from "./row-props";
import { useWorkflowActivity } from "./useWorkflowActivity";
import { useProjectDecor } from "./useProjectDecor";
import { resolveAccentSource } from "./accent-source";
import { useSidebarSettings } from "./useSidebarSettings";
import {
  PROJECT_ICONS_CHANNEL,
  projectIconUrl,
} from "./project-icons";
import {
  EMPTY_THREAD_SELECTION,
  keepFailedSelection,
  reconcileThreadSelection,
  updateThreadSelection,
  type ThreadSelectionState,
} from "./selection";
import { runBulkAction, type BulkActionResult } from "./bulk-actions";
import { BulkSelectionBar } from "./BulkSelectionBar";
import {
  ACTIVE_SORT_LABELS,
  ACTIVE_SORT_MODES,
  ACTIVE_SORT_STORAGE_KEY,
  ALL_PROJECTS,
  SHELF_EXPANSION_STORAGE_KEY,
  groupActiveThreadsByProject,
  isActiveSortMode,
  readActiveSort,
  sortActiveThreads,
  type ActiveThreadGroup,
} from "./active-sorting";

/** Q5 paging: the Settled shelf is unbounded, so it opens on a window. */
const SETTLED_INITIAL_LIMIT = 10;
const SETTLED_PAGE_SIZE = 25;

interface ShelfExpansionState {
  pinned: boolean;
  active: boolean;
  /** Q5 shelves. Parked and inactive rows start collapsed: they are out of
   * the way on purpose, and the header count is their whole footprint. */
  inactive: boolean;
  snoozed: boolean;
  settled: boolean;
}

export type ActiveShelfKind = "pinned" | "inbox";
export type RenderActiveThread = (
  thread: PluginSidebarThread,
  shelf: ActiveShelfKind,
) => ReactNode;

const DEFAULT_SHELF_EXPANSION: ShelfExpansionState = {
  pinned: true,
  active: true,
  inactive: false,
  snoozed: false,
  settled: false,
};

function readShelfExpansion(): ShelfExpansionState {
  try {
    const value = window.localStorage.getItem(SHELF_EXPANSION_STORAGE_KEY);
    if (!value) return DEFAULT_SHELF_EXPANSION;
    const parsed = JSON.parse(value) as Partial<ShelfExpansionState>;
    return {
      pinned:
        typeof parsed.pinned === "boolean"
          ? parsed.pinned
          : DEFAULT_SHELF_EXPANSION.pinned,
      active:
        typeof parsed.active === "boolean"
          ? parsed.active
          : DEFAULT_SHELF_EXPANSION.active,
      // Older stored shapes predate these three; absent means collapsed.
      inactive: parsed.inactive === true,
      snoozed: parsed.snoozed === true,
      settled: parsed.settled === true,
    };
  } catch {
    return DEFAULT_SHELF_EXPANSION;
  }
}

/**
 * A collapsed shelf shows nothing but its count — except the thread you are
 * actually looking at, which stays reachable wherever it was filed.
 */
function visibleShelfThreads(
  threads: readonly PluginSidebarThread[],
  expanded: boolean,
  activeThreadId: string | null,
  limit = threads.length,
): PluginSidebarThread[] {
  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  if (!expanded) return activeThread ? [activeThread] : [];
  return threads.filter(
    (thread, index) => index < limit || thread.id === activeThreadId,
  );
}

/**
 * True once `getSidebarSettings` has actually answered (or a cached answer was
 * available). The fork holds its settings at `null` until then, so neither the
 * Inactive tier nor auto project colours acts on a guess during first paint —
 * a thread is never filed away, and a row is never coloured, on a default the
 * user may have turned off. Q6's hook seeds the frozen defaults object instead
 * of `null`, so identity against those two frozen objects is the same signal.
 */
function sidebarSettingsLoaded(settings: SettingsAccess): boolean {
  return (
    settings !== DEFAULT_SETTINGS_ACCESS && settings !== DEFAULT_SIDEBAR_SETTINGS
  );
}

export function ThreadList({
  activeThreadId,
  activeProjectId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, threads: hostThreads, projects } = useSidebarThreads();

  // Shared row inputs. Each later packet calls its hook immediately after its
  // own anchor and assigns the binding declared directly above it. The defaults keep this file
  // correct before those packets land. Hooks go here and nowhere else in
  // this file — never inside renderActiveThread or any row loop.
  let organization: OrganizationAccess = EMPTY_ORGANIZATION_ACCESS;
  // @hooks:organization (Q2)
  organization = useOrganization({
    resolveAccentSource: (threadId, projectId, current, options) =>
      resolveAccentSource(threadId, projectId, current, decor.projects, {
        autoProjectColours: sidebarSettingsLoaded(settings)
          ? (settings.autoProjectColours ?? options.autoProjectColours)
          : false,
      }),
  });
  let workflow: WorkflowAccess = EMPTY_WORKFLOW_ACCESS;
  // @hooks:workflow (Q3)
  workflow = useWorkflowActivity();
  let decor: DecorAccess = EMPTY_DECOR_ACCESS;
  // @hooks:decor (Q4)
  decor = useProjectDecor();
  let lifecycle: LifecycleAccess = EMPTY_LIFECYCLE_ACCESS;
  // @hooks:lifecycle (Q5)
  lifecycle = useLifecycle(hostThreads);
  let settings: SettingsAccess = DEFAULT_SETTINGS_ACCESS;
  // @hooks:settings-selection (Q6)
  settings = useSidebarSettings();
  const [selection, setSelection] = useState<ThreadSelectionState>(
    EMPTY_THREAD_SELECTION,
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const [scope, setScope] = useState(ALL_PROJECTS);
  const [activeSortMode, setActiveSortMode] = useState(readActiveSort);
  const [projectIconRevision, setProjectIconRevision] = useState(0);
  useRealtime(PROJECT_ICONS_CHANNEL, () =>
    setProjectIconRevision((revision) => revision + 1),
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_SORT_STORAGE_KEY, activeSortMode);
    } catch {
      // Keep the selected order for this mount when storage is unavailable.
    }
  }, [activeSortMode]);

  // Q5 lifecycle inputs, derived from the settings binding above. Plain
  // derivations, never hooks: the one lifecycle hook lives at its anchor.
  const snoozePresets: readonly ConfiguredSnoozePreset[] =
    parseConfiguredSnoozePresets(settings.snoozePresets);
  const inactiveAfterHours = parseInactiveAfterHours(
    sidebarSettingsLoaded(settings) && settings.inactiveThreadsEnabled,
    String(settings.inactiveAfterHours),
  );
  const [nowMinute, setNowMinute] = useState(() =>
    Math.floor(Date.now() / 60_000),
  );
  useEffect(() => {
    const timer = setInterval(
      () => setNowMinute(Math.floor(Date.now() / 60_000)),
      60_000,
    );
    return () => clearInterval(timer);
  }, []);
  const now = nowMinute * 60_000;

  const [expandedShelves, setExpandedShelves] =
    useState<ShelfExpansionState>(readShelfExpansion);
  const [settledLimit, setSettledLimit] = useState(SETTLED_INITIAL_LIMIT);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SHELF_EXPANSION_STORAGE_KEY,
        JSON.stringify(expandedShelves),
      );
    } catch {
      // Keep the list usable when client-side preference storage is blocked.
    }
  }, [expandedShelves]);

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const visibleThreads = useMemo(
    () =>
      hideChildrenOfVisibleParents(
        filterByProject(
          visibleInboxThreads(
            hostThreads.map((thread) => {
              const runs = workflow.runsFor(thread.id);
              if (runs.length <= thread.activity.workflows) return thread;
              return {
                ...thread,
                activity: { ...thread.activity, workflows: runs.length },
              };
            }),
          ),
          scope === ALL_PROJECTS ? null : scope,
        ),
      ),
    [hostThreads, scope, workflow],
  );
  // Q5: parked rows leave every active shelf and every folder before anything
  // else is ordered, and come back to exactly where they were when they wake.
  const { activeThreads, snoozed, settled } = useMemo(() => {
    const active: PluginSidebarThread[] = [];
    const onSnoozeShelf: PluginSidebarThread[] = [];
    const onSettledShelf: PluginSidebarThread[] = [];
    for (const thread of visibleThreads) {
      const shelf = lifecycle.shelfFor(thread);
      if (shelf === "snoozed") onSnoozeShelf.push(thread);
      else if (shelf === "settled") onSettledShelf.push(thread);
      else active.push(thread);
    }
    return {
      activeThreads: active,
      // Soonest wake first: "what comes back next" is the shelf's question.
      snoozed: [...onSnoozeShelf].sort(
        (left, right) =>
          (lifecycle.wakeAtFor(left) ?? 0) - (lifecycle.wakeAtFor(right) ?? 0),
      ),
      settled: sortSettledThreads(onSettledShelf, lifecycle.settledAtFor),
    };
  }, [lifecycle, visibleThreads]);
  const { pinned, inbox } = useMemo(() => {
    const partitioned = partitionPinned(activeThreads);
    return {
      pinned: partitioned.pinned,
      inbox: sortByCreatedAtDescending(partitioned.inbox),
    };
  }, [activeThreads]);
  const isSearching = searchQuery.trim().length > 0;
  const searchResults = useMemo(
    () => searchThreadsByTitle(visibleThreads, searchQuery),
    [searchQuery, visibleThreads],
  );

  // The folder shelf's "+ New thread" footer needs the host composer action.
  const sidebarActions = useSidebarThreadActions();
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const folderDrag = useFolderDrag({
    folders: organization.folders,
    folderOf: organization.folderOf,
    actions: organization.actions,
    onFolderCreated: setRenamingFolderId,
  });
  // Durable flat-shelf order: host pinned order and this plugin's inbox_order.
  const shelfReorder = useShelfReorder({ pinned, inbox });
  const orderedPinned = shelfReorder.pinned;
  const orderedInbox = shelfReorder.inbox;
  const folderPartition = useMemo(
    () =>
      partitionByFolder([...orderedPinned, ...orderedInbox], {
        folders: organization.folders,
      }),
    [orderedInbox, orderedPinned, organization.folders],
  );
  // Folder members live in exactly one place, so the flat shelves drop them.
  const ungroupedIds = useMemo(
    () => new Set(folderPartition.ungrouped.map((thread) => thread.id)),
    [folderPartition.ungrouped],
  );
  const shelfPinned = useMemo(
    () => orderedPinned.filter((thread) => ungroupedIds.has(thread.id)),
    [orderedPinned, ungroupedIds],
  );
  const shelfInbox = useMemo(
    () => orderedInbox.filter((thread) => ungroupedIds.has(thread.id)),
    [orderedInbox, ungroupedIds],
  );
  // Q5: Inactive is a quieter tier of Active, not a parked shelf. Both tiers
  // keep the one flat inbox order, so Alt+Up/Down still crosses the boundary.
  const shelfActive = useMemo(
    () =>
      shelfInbox.filter(
        (thread) => !isInactiveThread(thread, now, inactiveAfterHours),
      ),
    [inactiveAfterHours, now, shelfInbox],
  );
  const shelfInactive = useMemo(
    () =>
      shelfInbox.filter((thread) =>
        isInactiveThread(thread, now, inactiveAfterHours),
      ),
    [inactiveAfterHours, now, shelfInbox],
  );
  const visibleInactive = useMemo(
    () =>
      visibleShelfThreads(
        shelfInactive,
        expandedShelves.inactive,
        activeThreadId,
      ),
    [activeThreadId, expandedShelves.inactive, shelfInactive],
  );
  const visibleSnoozed = useMemo(
    () => visibleShelfThreads(snoozed, expandedShelves.snoozed, activeThreadId),
    [activeThreadId, expandedShelves.snoozed, snoozed],
  );
  const visibleSettled = useMemo(
    () =>
      visibleShelfThreads(
        settled,
        expandedShelves.settled,
        activeThreadId,
        settledLimit,
      ),
    [activeThreadId, expandedShelves.settled, settled, settledLimit],
  );
  const shelfPinnedIds = useMemo(
    () => shelfPinned.map((thread) => thread.id),
    [shelfPinned],
  );
  const shelfInboxIds = useMemo(
    () => shelfInbox.map((thread) => thread.id),
    [shelfInbox],
  );
  const folderAccentFor = (
    folder: (typeof organization.folders)[number],
    members: readonly PluginSidebarThread[],
  ) => {
    const manual = accentCss(folder);
    if (manual) return manual;
    const projectIds = new Set(members.map((thread) => thread.projectId));
    if (projectIds.size !== 1) return undefined;
    return organization.projectAccentFor([...projectIds][0]!).css;
  };

  const visiblePinned = useMemo(
    () => visibleShelfThreads(shelfPinned, expandedShelves.pinned, activeThreadId),
    [activeThreadId, expandedShelves.pinned, shelfPinned],
  );
  const sortedActive = useMemo(
    () => sortActiveThreads(shelfActive, activeSortMode, projectNameById),
    [activeSortMode, projectNameById, shelfActive],
  );
  const visibleActive = useMemo(
    () => visibleShelfThreads(sortedActive, expandedShelves.active, activeThreadId),
    [activeThreadId, expandedShelves.active, sortedActive],
  );
  const activeProjectGroups = useMemo(
    () => groupActiveThreadsByProject(visibleActive, projectNameById),
    [projectNameById, visibleActive],
  );
  const visibleFolderThreads = useMemo(
    () =>
      folderPartition.folderEntries.flatMap((entry) =>
        entry.folder.collapsed ? [] : entry.members,
      ),
    [folderPartition.folderEntries],
  );
  const selectableThreads = useMemo(
    () =>
      isSearching
        ? searchResults
        : [
            ...visibleFolderThreads,
            ...visiblePinned,
            ...visibleActive,
            ...visibleInactive,
            ...visibleSnoozed,
            ...visibleSettled,
          ],
    [
      isSearching,
      searchResults,
      visibleActive,
      visibleFolderThreads,
      visibleInactive,
      visiblePinned,
      visibleSettled,
      visibleSnoozed,
    ],
  );
  const selectableThreadIds = useMemo(
    () => selectableThreads.map((thread) => thread.id),
    [selectableThreads],
  );
  const selectableThreadIdsKey = selectableThreadIds.join("\0");
  useEffect(() => {
    setSelection((current) =>
      reconcileThreadSelection(current, selectableThreadIds),
    );
  }, [selectableThreadIds, selectableThreadIdsKey]);
  const selectedThreads = useMemo(
    () =>
      selectableThreads.filter((thread) =>
        selection.selectedIds.has(thread.id),
      ),
    [selectableThreads, selection.selectedIds],
  );
  const scopeLabel =
    scope === ALL_PROJECTS
      ? "All projects"
      : (projectNameById.get(scope) ?? "All projects");

  const handleSelectionClick = (
    threadId: string,
    event: ReactMouseEvent<HTMLAnchorElement>,
  ): boolean => {
    const toggleKey = event.metaKey || event.ctrlKey;
    if (!toggleKey && !event.shiftKey) {
      if (selection.selectedIds.size > 0) {
        setSelection(EMPTY_THREAD_SELECTION);
      }
      return false;
    }
    setSelection((current) =>
      updateThreadSelection(current, selectableThreadIds, threadId, {
        shiftKey: event.shiftKey,
        toggleKey,
      }),
    );
    return true;
  };

  const finishBulkAction = (result: BulkActionResult) => {
    setSelection(
      keepFailedSelection(
        result.failures.map((failure) => failure.threadId),
        selectableThreadIds,
      ),
    );
  };

  const runSelectedAction = async (
    action: (threads: readonly PluginSidebarThread[]) => Promise<BulkActionResult>,
    parksThreads = false,
  ) => {
    if (bulkBusy || selectedThreads.length === 0) return;
    const targets = [...selectedThreads];
    setBulkBusy(true);
    try {
      const result = await action(targets);
      finishBulkAction(result);
      if (
        parksThreads &&
        activeThreadId !== null &&
        result.succeededThreadIds.includes(activeThreadId)
      ) {
        const parkedIds = new Set(result.succeededThreadIds);
        const activeRows = [
          ...folderPartition.folderEntries.flatMap((entry) => entry.members),
          ...shelfPinned,
          ...shelfActive,
          ...shelfInactive,
        ];
        const activeIndex = activeRows.findIndex(
          (thread) => thread.id === activeThreadId,
        );
        const nextThread =
          activeRows
            .slice(activeIndex + 1)
            .find((thread) => !parkedIds.has(thread.id)) ??
          activeRows
            .slice(0, Math.max(0, activeIndex))
            .reverse()
            .find((thread) => !parkedIds.has(thread.id)) ??
          null;
        if (nextThread) sidebarActions.open(nextThread.id);
        else {
          sidebarActions.openNewThread({
            projectId: targets[0]?.projectId,
            focusPrompt: true,
          });
        }
        onNavigate();
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim()
          : "Unknown error";
      finishBulkAction({
        succeededThreadIds: [],
        failures: targets.map((thread) => ({
          threadId: thread.id,
          error: message,
        })),
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkParkAction = (
    action: "settle" | "snooze",
    snoozedUntil?: number,
  ) =>
    runSelectedAction(
      async (targets) => {
        const eligible = targets.filter(lifecycle.canPark);
        const blocked = targets
          .filter((thread) => !lifecycle.canPark(thread))
          .map((thread) => ({
            threadId: thread.id,
            error: "Thread is working or needs input",
          }));
        const result =
          eligible.length === 0
            ? { succeededThreadIds: [], failures: [] }
            : action === "settle"
              ? await lifecycle.bulkSettle(eligible.map((thread) => thread.id))
              : await lifecycle.bulkSnooze(
                  eligible.map((thread) => thread.id),
                  snoozedUntil!,
                );
        return { ...result, failures: [...result.failures, ...blocked] };
      },
      true,
    );

  // Parking the thread you are reading would leave you on a row that is no
  // longer on screen, so navigation follows it: the row below, then the row
  // above, then a fresh thread in the same project.
  const parkActiveThread = async (
    thread: PluginSidebarThread,
    mutation: () => Promise<boolean>,
  ) => {
    const parked = await mutation();
    if (!parked || activeThreadId !== thread.id) return;
    const nextThread = nextThreadAfterParking(
      [
        ...folderPartition.folderEntries.flatMap((entry) => entry.members),
        ...shelfPinned,
        ...shelfActive,
        ...shelfInactive,
      ],
      thread.id,
    );
    if (nextThread) sidebarActions.open(nextThread.id);
    else
      sidebarActions.openNewThread({
        projectId: thread.projectId,
        focusPrompt: true,
      });
    onNavigate();
  };

  const renderActiveThread: RenderActiveThread = (thread, shelf) => {
    const folder = organization.folderOf(thread.id);
    const organizationControls = folderDrag.threadControls(thread.id);
    const rowProps = {
      thread,
      threads: hostThreads,
      projectName: projectNameById.get(thread.projectId) ?? null,
      isActive: thread.id === activeThreadId,
      activeThreadId,
      onNavigate,
      now,
      // @rows:accent (Q2)
      accent: organization.accentFor(thread, folder?.id ?? null),
      organization,
      onFolderCreated: setRenamingFolderId,
      reorder: folder
        ? organizationControls
        : activeSortMode === "manual" || shelf === "pinned"
          ? shelfReorder.controlsFor(
              thread,
              shelf,
              shelf === "pinned" ? shelfPinnedIds : shelfInboxIds,
              organizationControls,
            )
          : { ...organizationControls, hasKeyboardReorder: false },
      // @rows:workflow (Q3)
      workflowRuns: workflow.runs,
      // @rows:decor (Q4)
      projectDecor: decor.decorFor(thread.projectId),
      accentSource: organization.accentSourceFor(thread, folder?.id ?? null)
        .source,
      // @rows:lifecycle (Q5)
      canPark: lifecycle.canPark(thread),
      isWoke: lifecycle.wokeFor(thread),
      snoozePresets,
      onSettle: () =>
        void parkActiveThread(thread, () => lifecycle.settle(thread.id)),
      onSnooze: (snoozedUntil: number) =>
        void parkActiveThread(thread, () =>
          lifecycle.snooze(thread.id, snoozedUntil),
        ),
      onAcknowledgeWake: () => void lifecycle.acknowledgeWake(thread.id),
      // @rows:selection-sort (Q6)
      projectIconUrl: projectIconUrl(thread.projectId, projectIconRevision),
      isSelected: selection.selectedIds.has(thread.id),
      onSelectionClick: (event: ReactMouseEvent<HTMLAnchorElement>) =>
        handleSelectionClick(thread.id, event),
    } satisfies ComponentProps<typeof ThreadCard>;
    return <ThreadCard key={thread.id} {...rowProps} />;
  };

  return (
    <div data-glass-sidebar-root className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {/* @slot:live-strip (Q3) */}
        {visibleThreads.map((thread) => (
          <SplitProbe key={`split-probe:${thread.id}`} threadId={thread.id} />
        ))}
        <LiveStrip
          threads={visibleThreads}
          projectNameById={projectNameById}
          accentFor={(thread) =>
            organization.accentFor(
              thread,
              organization.folderOf(thread.id)?.id ?? null,
            )
          }
          projectDecor={decor.projects}
          activeThreadId={activeThreadId}
          onNavigate={onNavigate}
          actions={sidebarActions}
          now={now}
        />
        {/* @slot:bulk-bar (Q6) */}
        <div className="flex min-h-7 items-center gap-1 px-1.5 py-1">
          {selectedThreads.length > 0 ? (
            <BulkSelectionBar
              count={selectedThreads.length}
              busy={bulkBusy}
              snoozePresets={snoozePresets}
              onSettle={() => void runBulkParkAction("settle")}
              onSnooze={(snoozedUntil) =>
                void runBulkParkAction("snooze", snoozedUntil)
              }
              onMarkRead={() =>
                void runSelectedAction((targets) =>
                  runBulkAction(
                    targets.map((thread) => thread.id),
                    async (threadId) => {
                      await sidebarActions.setRead(threadId, true);
                    },
                  ),
                )
              }
              onMarkUnread={() =>
                void runSelectedAction((targets) =>
                  runBulkAction(
                    targets.map((thread) => thread.id),
                    async (threadId) => {
                      await sidebarActions.setRead(threadId, false);
                    },
                  ),
                )
              }
              onClear={() => setSelection(EMPTY_THREAD_SELECTION)}
            />
          ) : (
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
              <span className="sr-only">Project filter</span>
              <select
                aria-label={`Project scope: ${scopeLabel}`}
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                className="h-7 min-w-0 flex-1 rounded border-0 bg-transparent px-1 text-xs font-medium hover:bg-sidebar-accent"
              >
                <option value={ALL_PROJECTS}>All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {status === "loading" ? null : status === "error" ? (
          <p
            role="status"
            className="px-2 py-6 text-center text-xs text-muted-foreground"
          >
            Could not load threads.
          </p>
        ) : isSearching && searchResults.length === 0 ? (
          <p
            role="status"
            className="px-2 py-6 text-center text-xs text-muted-foreground"
          >
            No threads found
          </p>
        ) : isSearching ? (
          <SearchResults
            threads={searchResults}
            projectNameById={projectNameById}
            projectIconRevision={projectIconRevision}
            decorFor={decor.decorFor}
            accentFor={(thread) =>
              organization.accentSourceFor(
                thread,
                organization.folderOf(thread.id)?.id ?? null,
              )
            }
            projectAccentFor={organization.projectAccentFor}
            activeThreadId={activeThreadId}
            now={now}
            wokeThreadIds={new Set(
              searchResults
                .filter((thread) => lifecycle.wokeFor(thread))
                .map((thread) => thread.id),
            )}
            onAcknowledgeWake={(threadId) =>
              void lifecycle.acknowledgeWake(threadId)
            }
            selectedThreadIds={selection.selectedIds}
            onSelectionClick={handleSelectionClick}
            onNavigate={onNavigate}
          />
        ) : (
          <div className="flex flex-col">
            {/* @slot:folders (Q2) */}
            <FolderShelf
              entries={folderPartition.folderEntries}
              organization={organization}
              drag={folderDrag}
              activeProjectId={activeProjectId}
              renamingFolderId={renamingFolderId}
              onRenamingFolderChange={setRenamingFolderId}
              onNewThread={(projectId) =>
                sidebarActions.openNewThread({ projectId, focusPrompt: true })
              }
              accentForFolder={folderAccentFor}
              projectDecor={decor.projects}
              renderThread={(thread) =>
                renderActiveThread(thread, thread.isPinned ? "pinned" : "inbox")
              }
            />
            {shelfPinned.length > 0 ? (
              <CollapsibleShelf
                label="Pinned"
                count={shelfPinned.length}
                expanded={expandedShelves.pinned}
                onToggle={() =>
                  setExpandedShelves((current) => ({
                    ...current,
                    pinned: !current.pinned,
                  }))
                }
              >
                <Shelf>
                  {visiblePinned.map((thread) =>
                    renderActiveThread(thread, "pinned"),
                  )}
                </Shelf>
              </CollapsibleShelf>
            ) : null}
            {shelfActive.length > 0 ? (
              <CollapsibleShelf
                label="Active"
                count={shelfActive.length}
                expanded={expandedShelves.active}
                onToggle={() =>
                  setExpandedShelves((current) => ({
                    ...current,
                    active: !current.active,
                  }))
                }
                action={
                  <select
                    aria-label={`Sort active threads: ${ACTIVE_SORT_LABELS[activeSortMode]}`}
                    title={`Sort active threads: ${ACTIVE_SORT_LABELS[activeSortMode]}`}
                    value={activeSortMode}
                    onChange={(event) => {
                      if (isActiveSortMode(event.target.value)) {
                        setActiveSortMode(event.target.value);
                      }
                    }}
                    className="h-6 max-w-28 rounded border-0 bg-transparent px-1 text-2xs text-muted-foreground hover:bg-sidebar-accent"
                  >
                    {ACTIVE_SORT_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {ACTIVE_SORT_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                }
              >
                {activeSortMode === "project" ? (
                  <ProjectGroups
                    groups={activeProjectGroups}
                    projectNameById={projectNameById}
                    renderThread={renderActiveThread}
                  />
                ) : (
                  <Shelf>
                    {visibleActive.map((thread) =>
                      renderActiveThread(thread, "inbox"),
                    )}
                  </Shelf>
                )}
              </CollapsibleShelf>
            ) : null}
            {shelfInactive.length > 0 ? (
              <CollapsibleShelf
                label="Inactive"
                count={shelfInactive.length}
                expanded={expandedShelves.inactive}
                onToggle={() =>
                  setExpandedShelves((current) => ({
                    ...current,
                    inactive: !current.inactive,
                  }))
                }
              >
                <Shelf>
                  {visibleInactive.map((thread) =>
                    renderActiveThread(thread, "inbox"),
                  )}
                </Shelf>
              </CollapsibleShelf>
            ) : null}
            {shelfPinned.length === 0 &&
            shelfInbox.length === 0 &&
            folderPartition.folderEntries.length === 0 ? (
              <ActiveEmptyState />
            ) : null}
            {/* @slot:parked-shelves (Q5) */}
            <ParkedShelf
              label="Snoozed"
              shelf="snoozed"
              threads={snoozed}
              visibleThreads={visibleSnoozed}
              projectNameById={projectNameById}
              decor={decor}
              organization={organization}
              activeThreadId={activeThreadId}
              now={now}
              snoozePresets={snoozePresets}
              expanded={expandedShelves.snoozed}
              onToggle={() =>
                setExpandedShelves((current) => ({
                  ...current,
                  snoozed: !current.snoozed,
                }))
              }
              wakeAtFor={lifecycle.wakeAtFor}
              selectedThreadIds={selection.selectedIds}
              onSelectionClick={handleSelectionClick}
              projectIconRevision={projectIconRevision}
              onRestore={(threadId) => void lifecycle.unsnooze(threadId)}
              onSnooze={(threadId, snoozedUntil) =>
                void lifecycle.snooze(threadId, snoozedUntil)
              }
              onNavigate={onNavigate}
            />
            <ParkedShelf
              label="Settled"
              shelf="settled"
              threads={settled}
              visibleThreads={visibleSettled}
              projectNameById={projectNameById}
              decor={decor}
              organization={organization}
              activeThreadId={activeThreadId}
              now={now}
              snoozePresets={snoozePresets}
              expanded={expandedShelves.settled}
              onToggle={() =>
                setExpandedShelves((current) => ({
                  ...current,
                  settled: !current.settled,
                }))
              }
              wakeAtFor={lifecycle.wakeAtFor}
              selectedThreadIds={selection.selectedIds}
              onSelectionClick={handleSelectionClick}
              projectIconRevision={projectIconRevision}
              onRestore={(threadId) => void lifecycle.unsettle(threadId)}
              onSnooze={(threadId, snoozedUntil) =>
                void lifecycle.snooze(threadId, snoozedUntil)
              }
              onNavigate={onNavigate}
              settledLimit={settledLimit}
              onLoadMore={() =>
                setSettledLimit((limit) => limit + SETTLED_PAGE_SIZE)
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveEmptyState() {
  return (
    <div
      role="status"
      className="flex flex-col items-center px-5 pb-7 pt-8 text-center text-muted-foreground"
    >
      <svg viewBox="0 0 180 104" className="mb-3 h-auto w-36" aria-hidden="true">
        <circle cx="132" cy="24" r="11" fill="currentColor" opacity="0.12" />
        <path
          d="M16 77c18-18 36-24 55-17 14 5 23 5 36-3 18-11 36-7 57 20"
          fill="currentColor"
          opacity="0.08"
        />
        <path
          d="M12 78c22-13 43-14 64-3 16 8 31 8 45 0 16-9 31-8 47 3"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
          opacity="0.38"
        />
      </svg>
      <p className="text-xs font-medium text-foreground/75">
        All clear. Time to touch some grass.
      </p>
    </div>
  );
}

function CollapsibleShelf({
  label,
  count,
  expanded,
  onToggle,
  action,
  children,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <div className="mt-3 flex w-full items-center gap-1 px-2.5 pb-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-2xs font-medium text-muted-foreground/70">
            {expanded ? label : `${label} (${count})`}
          </span>
          <span className="h-px flex-1 bg-sidebar-border" />
          <span className={TRAILING_GLYPH_BOX_CLASS}>
            <Icon
              name="ChevronDown"
              className={cn(
                "size-3 text-muted-foreground/70 transition-transform duration-150 ease-out motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
            />
          </span>
        </button>
        {action}
      </div>
      {children}
    </section>
  );
}

function Shelf({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-px">{children}</ul>;
}

function ProjectGroups({
  groups,
  projectNameById,
  renderThread,
}: {
  groups: readonly ActiveThreadGroup<PluginSidebarThread>[];
  projectNameById: ReadonlyMap<string, string>;
  renderThread: RenderActiveThread;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((group) => (
        <ul
          key={group.projectId}
          aria-label={`${projectNameById.get(group.projectId) ?? "Project"} active threads`}
          className={cn(
            "flex flex-col gap-px",
            group.entries.length > 1 &&
              "rounded-lg border border-sidebar-border/30 p-px",
          )}
        >
          {group.entries.map((thread) => renderThread(thread, "inbox"))}
        </ul>
      ))}
    </div>
  );
}

/**
 * A collapsed shelf of parked threads. The header stays while anything is
 * parked — the count is the whole footprint when collapsed — and the shelf
 * vanishes entirely at zero.
 */
function ParkedShelf({
  label,
  shelf,
  threads,
  visibleThreads,
  projectNameById,
  decor,
  organization,
  activeThreadId,
  now,
  snoozePresets,
  expanded,
  onToggle,
  wakeAtFor,
  selectedThreadIds,
  onSelectionClick,
  projectIconRevision,
  onRestore,
  onSnooze,
  onNavigate,
  settledLimit,
  onLoadMore,
}: {
  label: string;
  shelf: "snoozed" | "settled";
  threads: readonly PluginSidebarThread[];
  visibleThreads: readonly PluginSidebarThread[];
  projectNameById: ReadonlyMap<string, string>;
  decor: DecorAccess;
  organization: OrganizationAccess;
  activeThreadId: string | null;
  now: number;
  snoozePresets: readonly ConfiguredSnoozePreset[];
  expanded: boolean;
  onToggle: () => void;
  wakeAtFor: (thread: PluginSidebarThread) => number | null;
  selectedThreadIds: ReadonlySet<string>;
  onSelectionClick: (
    threadId: string,
    event: ReactMouseEvent<HTMLAnchorElement>,
  ) => boolean;
  projectIconRevision: number;
  onRestore: (threadId: string) => void;
  onSnooze: (threadId: string, snoozedUntil: number) => void;
  onNavigate: () => void;
  settledLimit?: number;
  onLoadMore?: () => void;
}) {
  if (threads.length === 0) return null;
  const limit =
    shelf === "settled" ? (settledLimit ?? threads.length) : threads.length;
  const hasMore = shelf === "settled" && threads.length > limit;
  return (
    <CollapsibleShelf
      label={label}
      count={threads.length}
      expanded={expanded}
      onToggle={onToggle}
    >
      <Shelf>
        {visibleThreads.map((thread) => {
          const folderId = organization.folderOf(thread.id)?.id ?? null;
          const resolvedAccent = organization.accentSourceFor(thread, folderId);
          return (
            <SlimRow
              key={thread.id}
              thread={thread}
              projectName={projectNameById.get(thread.projectId) ?? null}
              projectIconUrl={projectIconUrl(
                thread.projectId,
                projectIconRevision,
              )}
              projectDecor={decor.decorFor(thread.projectId)}
              projectAccent={organization.projectAccentFor(thread.projectId).css}
              isActive={thread.id === activeThreadId}
              isSelected={selectedThreadIds.has(thread.id)}
              shelf={shelf}
              accent={resolvedAccent.css}
              accentSource={resolvedAccent.source}
              wakeAt={wakeAtFor(thread)}
              now={now}
              snoozePresets={snoozePresets}
              onSnooze={(snoozedUntil) => onSnooze(thread.id, snoozedUntil)}
              onNavigate={onNavigate}
              onSelectionClick={(event) => onSelectionClick(thread.id, event)}
              onRestore={() => onRestore(thread.id)}
            />
          );
        })}
      </Shelf>
      {expanded && hasMore && onLoadMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          className="ml-2.5 mt-1 rounded px-1.5 py-1 text-2xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          Load {Math.min(SETTLED_PAGE_SIZE, threads.length - limit)} more
        </button>
      ) : null}
    </CollapsibleShelf>
  );
}
