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
  const load = useCallback(async () => {
    hasRequestedFirstLoad.current = true;
    try {
      const next = await rpc.call("getWorkflowActivity", {});
      setSnapshot(next);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
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

  useEffect(() => {
    if (threadListRevision === initialRevision.current) return;
    initialRevision.current = threadListRevision;
    void load();
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
    (threadId: string) => runsByThread.get(threadId) ?? [],
    [runsByThread],
  );

  return {
    status,
    runs: snapshot.runs,
    updatedAt: snapshot.updatedAt,
    runsFor,
  };
}
