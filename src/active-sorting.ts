export const ACTIVE_SORT_MODES = [
  "manual",
  "activity",
  "created",
  "project",
] as const;
export type ActiveSortMode = (typeof ACTIVE_SORT_MODES)[number];

export const ACTIVE_SORT_LABELS: Record<ActiveSortMode, string> = {
  manual: "Manual order",
  activity: "Recent activity",
  created: "Date created",
  project: "Project",
};

export const ACTIVE_GROUPING_STORAGE_KEY =
  "glass-sidebar:active-grouping:v1";
export const ACTIVE_SORT_STORAGE_KEY = "glass-sidebar:active-sort:v1";
export const SHELF_EXPANSION_STORAGE_KEY =
  "glass-sidebar:shelf-expansion:v1";
export const ALL_PROJECTS = "__all__";

export function isActiveSortMode(value: string): value is ActiveSortMode {
  return ACTIVE_SORT_MODES.some((mode) => mode === value);
}

export function readActiveSort(): ActiveSortMode {
  try {
    const stored = window.localStorage.getItem(ACTIVE_SORT_STORAGE_KEY);
    if (stored && isActiveSortMode(stored)) return stored;
    return window.localStorage.getItem(ACTIVE_GROUPING_STORAGE_KEY) === "true"
      ? "project"
      : "manual";
  } catch {
    return "manual";
  }
}

export function sortActiveThreads<
  T extends {
    readonly id: string;
    readonly projectId: string;
    readonly createdAt: number;
    readonly updatedAt: number;
  },
>(
  threads: readonly T[],
  mode: ActiveSortMode,
  projectNameById: ReadonlyMap<string, string> = new Map(),
): T[] {
  if (mode === "manual") return [...threads];
  return [...threads].sort((left, right) => {
    if (mode === "project") {
      const projectOrder = (
        projectNameById.get(left.projectId) ?? left.projectId
      ).localeCompare(projectNameById.get(right.projectId) ?? right.projectId);
      if (projectOrder !== 0) return projectOrder;
    }
    const primary = mode === "activity" ? "updatedAt" : "createdAt";
    return (
      right[primary] - left[primary] ||
      right.updatedAt - left.updatedAt ||
      right.createdAt - left.createdAt ||
      left.id.localeCompare(right.id)
    );
  });
}

export interface ActiveThreadGroup<T> {
  projectId: string;
  entries: T[];
}

export function groupActiveThreadsByProject<T extends { projectId: string }>(
  threads: readonly T[],
  projectNameById: ReadonlyMap<string, string>,
): ActiveThreadGroup<T>[] {
  const groups = new Map<string, ActiveThreadGroup<T>>();
  for (const thread of threads) {
    const group = groups.get(thread.projectId) ?? {
      projectId: thread.projectId,
      entries: [],
    };
    group.entries.push(thread);
    groups.set(thread.projectId, group);
  }
  return [...groups.values()].sort((left, right) =>
    (projectNameById.get(left.projectId) ?? left.projectId).localeCompare(
      projectNameById.get(right.projectId) ?? right.projectId,
    ),
  );
}

export function visibleShelfThreads<T extends { id: string }>(
  threads: readonly T[],
  expanded: boolean,
  activeThreadId: string | null,
  limit = threads.length,
): T[] {
  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  if (!expanded) return activeThread ? [activeThread] : [];
  return threads.filter(
    (thread, index) => index < limit || thread.id === activeThreadId,
  );
}
