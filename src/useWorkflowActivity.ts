import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginSidebarThread,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { glassSidebarRpcContract } from "../server";
import {
  WORKFLOW_ACTIVITY_REFRESH_MS,
  type WorkflowActivitySnapshot,
  type WorkflowRun,
} from "./workflow-activity-shared";

const EMPTY_SNAPSHOT: WorkflowActivitySnapshot = {
  runs: [],
  updatedAt: 0,
  sourcePath: "",
  sourceStatus: "missing",
};

/**
 * One shared array for "this thread has no runs". `runsFor` is called once per
 * visible row on every render; a fresh `[]` each time gave each row a new prop
 * identity and re-rendered the whole list for nothing.
 */
const NO_RUNS: readonly WorkflowRun[] = Object.freeze([]);

/**
 * How long a burst of host list revisions may coalesce into one read. The
 * first revision of a quiet period still loads at once, so a workflow that
 * starts or finishes shows up immediately; the ticks behind it ride along.
 */
export const WORKFLOW_ACTIVITY_COALESCE_MS = 400;

/**
 * Snapshots repeat far more often than they change: the 60 s refresh, every
 * visibility flip and every host revision re-read the same rows. Keeping the
 * previous object when the answer matches keeps `runsFor` — and every row that
 * consumes it — identical across those reads.
 */
function sameSnapshot(
  left: WorkflowActivitySnapshot,
  right: WorkflowActivitySnapshot,
): boolean {
  if (left === right) return true;
  if (
    left.updatedAt !== right.updatedAt ||
    left.sourcePath !== right.sourcePath ||
    left.sourceStatus !== right.sourceStatus ||
    left.runs.length !== right.runs.length
  ) {
    return false;
  }
  return left.runs.every((run, index) => {
    const other = right.runs[index]!;
    return (
      run.id === other.id &&
      run.originThreadId === other.originThreadId &&
      run.name === other.name &&
      run.status === other.status &&
      run.phase === other.phase &&
      run.startedAt === other.startedAt
    );
  });
}

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

export function withEffectiveWorkflowActivity(
  thread: PluginSidebarThread,
  activeRuns: readonly WorkflowRun[],
): PluginSidebarThread {
  const workflows = Math.max(thread.activity.workflows, activeRuns.length);
  if (workflows === thread.activity.workflows) return thread;
  return {
    ...thread,
    activity: {
      ...thread.activity,
      workflows,
    },
  };
}

export function useWorkflowActivity(): {
  status: "loading" | "ready" | "error";
  runs: readonly WorkflowRun[];
  updatedAt: number;
  runsFor: (threadId: string) => readonly WorkflowRun[];
} {
  const rpc = useRpc<typeof glassSidebarRpcContract>();
  const threadState = useSidebarThreads();
  const threadListRevision = useMemo(
    () =>
      `${threadState.status}\u001e${threadState.threads
        .map((thread) => `${thread.id}:${thread.updatedAt}`)
        .join("\u001f")}`,
    [threadState.status, threadState.threads],
  );
  const initialRevision = useRef(threadListRevision);
  const hasRequestedFirstLoad = useRef(false);
  const [snapshot, setSnapshot] =
    useState<WorkflowActivitySnapshot>(EMPTY_SNAPSHOT);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  // The interval, a visibility flip and a host revision can all ask at once.
  // They all want the same answer, so they share one request rather than
  // racing three identical round trips.
  const inFlight = useRef<Promise<void> | null>(null);
  const load = useCallback(async () => {
    hasRequestedFirstLoad.current = true;
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
      try {
        const next = await rpc.call("getWorkflowActivity", {});
        if (!sameSnapshot(snapshotRef.current, next)) {
          snapshotRef.current = next;
          setSnapshot(next);
        }
        setStatus("ready");
      } catch {
        setStatus("error");
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = request;
    return request;
  }, [rpc]);

  // Never spend a first-paint RPC. A real host list revision wins; otherwise
  // one idle callback (or a zero-delay fallback) performs the initial read.
  useEffect(() => {
    const hostWindow = window as IdleWindow;
    const run = () => {
      if (!hasRequestedFirstLoad.current) void load();
    };
    if (hostWindow.requestIdleCallback) {
      const handle = hostWindow.requestIdleCallback(run);
      return () => hostWindow.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(run, 0);
    return () => window.clearTimeout(handle);
  }, [load]);

  // Leading edge plus trailing edge. The first revision after a quiet spell
  // loads straight away, so nothing the user can see is delayed; the ticks a
  // streaming agent produces behind it collapse into the single trailing read
  // that the timer makes, and the last tick of a burst is always followed by
  // one, so no change is ever dropped.
  const coalesceTimer = useRef<number | null>(null);
  const pendingRevisionLoad = useRef(false);
  useEffect(
    () => () => {
      if (coalesceTimer.current !== null) {
        window.clearTimeout(coalesceTimer.current);
        coalesceTimer.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (threadListRevision === initialRevision.current) return;
    initialRevision.current = threadListRevision;
    if (coalesceTimer.current !== null) {
      pendingRevisionLoad.current = true;
      return;
    }
    const openWindow = () => {
      coalesceTimer.current = window.setTimeout(() => {
        coalesceTimer.current = null;
        if (!pendingRevisionLoad.current) return;
        pendingRevisionLoad.current = false;
        void load();
        openWindow();
      }, WORKFLOW_ACTIVITY_COALESCE_MS);
    };
    void load();
    openWindow();
  }, [load, threadListRevision]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(
      () => void load(),
      WORKFLOW_ACTIVITY_REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, [load]);

  const runsByThread = useMemo(() => {
    const grouped = new Map<string, WorkflowRun[]>();
    for (const run of snapshot.runs) {
      const runs = grouped.get(run.originThreadId) ?? [];
      runs.push(run);
      grouped.set(run.originThreadId, runs);
    }
    return grouped;
  }, [snapshot.runs]);

  const runsFor = useCallback(
    (threadId: string): readonly WorkflowRun[] =>
      runsByThread.get(threadId) ?? NO_RUNS,
    [runsByThread],
  );

  // One object per real change, so a consumer can memoise on it.
  return useMemo(
    () => ({
      status,
      runs: snapshot.runs,
      updatedAt: snapshot.updatedAt,
      runsFor,
    }),
    [runsFor, snapshot.runs, snapshot.updatedAt, status],
  );
}
