// Extension rule for Q2-Q6: leave every anchor comment in place.
// Insert content immediately after your own anchor.
// Never edit, move, or reorder another packet's anchor.
import {
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import { ThreadCard } from "./ThreadCard";
import { SearchResults } from "./SearchResults";
import { TRAILING_GLYPH_BOX_CLASS } from "./StatusSlot";
import {
  hideChildrenOfVisibleParents,
  partitionPinned,
  searchThreadsByTitle,
  sortByCreatedAtDescending,
  visibleInboxThreads,
} from "./inbox";
import {
  DEFAULT_SETTINGS_ACCESS,
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

const SHELF_EXPANSION_STORAGE_KEY = "glass-sidebar:shelf-expansion:v1";

interface ShelfExpansionState {
  pinned: boolean;
  active: boolean;
}

export type ActiveShelfKind = "pinned" | "inbox";
export type RenderActiveThread = (
  thread: PluginSidebarThread,
  shelf: ActiveShelfKind,
) => ReactNode;

const DEFAULT_SHELF_EXPANSION: ShelfExpansionState = {
  pinned: true,
  active: true,
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
    };
  } catch {
    return DEFAULT_SHELF_EXPANSION;
  }
}

const EMPTY_THREAD_IDS: ReadonlySet<string> = new Set();

export function ThreadList({
  activeThreadId,
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
  let workflow: WorkflowAccess = EMPTY_WORKFLOW_ACCESS;
  // @hooks:workflow (Q3)
  let decor: DecorAccess = EMPTY_DECOR_ACCESS;
  // @hooks:decor (Q4)
  let lifecycle: LifecycleAccess = EMPTY_LIFECYCLE_ACCESS;
  // @hooks:lifecycle (Q5)
  let settings: SettingsAccess = DEFAULT_SETTINGS_ACCESS;
  // @hooks:settings-selection (Q6)

  void settings;
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
      ),
    [hostThreads, workflow],
  );
  const { pinned, inbox } = useMemo(() => {
    const partitioned = partitionPinned(visibleThreads);
    return {
      pinned: partitioned.pinned,
      inbox: sortByCreatedAtDescending(partitioned.inbox),
    };
  }, [visibleThreads]);
  const isSearching = searchQuery.trim().length > 0;
  const searchResults = useMemo(
    () => searchThreadsByTitle([...pinned, ...inbox], searchQuery),
    [inbox, pinned, searchQuery],
  );

  const renderActiveThread: RenderActiveThread = (thread, _shelf) => {
    const rowProps = {
      thread,
      threads: hostThreads,
      projectName: projectNameById.get(thread.projectId) ?? null,
      isActive: thread.id === activeThreadId,
      onNavigate,
      now,
      // @rows:accent (Q2)
      // @rows:workflow (Q3)
      // @rows:decor (Q4)
      // @rows:lifecycle (Q5)
      // @rows:selection-sort (Q6)
    } satisfies ComponentProps<typeof ThreadCard>;
    return <ThreadCard key={thread.id} {...rowProps} />;
  };

  return (
    <div data-glass-sidebar-root className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {/* @slot:live-strip (Q3) */}
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
            projectIconRevision={0}
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
            wokeThreadIds={EMPTY_THREAD_IDS}
            onAcknowledgeWake={(threadId) =>
              void lifecycle.acknowledgeWake(threadId)
            }
            selectedThreadIds={EMPTY_THREAD_IDS}
            onSelectionClick={() => false}
            onNavigate={onNavigate}
          />
        ) : (
          <div className="flex flex-col">
            {/* @slot:folders (Q2) */}
            {/* @slot:bulk-bar (Q6) */}
            {pinned.length > 0 ? (
              <CollapsibleShelf
                label="Pinned"
                count={pinned.length}
                expanded={expandedShelves.pinned}
                onToggle={() =>
                  setExpandedShelves((current) => ({
                    ...current,
                    pinned: !current.pinned,
                  }))
                }
              >
                <Shelf>
                  {pinned.map((thread) =>
                    renderActiveThread(thread, "pinned"),
                  )}
                </Shelf>
              </CollapsibleShelf>
            ) : null}
            {inbox.length > 0 ? (
              <CollapsibleShelf
                label="Active"
                count={inbox.length}
                expanded={expandedShelves.active}
                onToggle={() =>
                  setExpandedShelves((current) => ({
                    ...current,
                    active: !current.active,
                  }))
                }
              >
                <Shelf>
                  {inbox.map((thread) =>
                    renderActiveThread(thread, "inbox"),
                  )}
                </Shelf>
              </CollapsibleShelf>
            ) : null}
            {pinned.length === 0 && inbox.length === 0 ? (
              <ActiveEmptyState />
            ) : null}
            {/* @slot:parked-shelves (Q5) */}
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
  children,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="mt-3 flex w-full items-center gap-2 px-2.5 pb-1 text-left"
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
      {expanded ? children : null}
    </section>
  );
}

function Shelf({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-px">{children}</ul>;
}
