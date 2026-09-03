import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { toast } from "sonner";
import type { glassSidebarRpcContract } from "../server";
import type { BulkActionResult } from "./row-props";
import {
  LIFECYCLE_CHANNEL,
  canPark,
  formatSnoozeWakeTime,
  nextWakeDelayMs,
  resolveShelf,
  resolveWakeReason,
  type ThreadLifecycleRow,
  type ThreadShelf,
} from "./lifecycle";

/** Any live work at all, which blocks parking and wakes a parked thread. */
export function isWorking(thread: PluginSidebarThread): boolean {
  const { activity } = thread;
  return (
    activity.workflows > 0 ||
    activity.backgroundAgents > 0 ||
    activity.backgroundCommands > 0 ||
    activity.planMode > 0 ||
    activity.goals > 0 ||
    thread.indicator === "runtime" ||
    thread.indicator === "working-draft"
  );
}

export interface LifecycleApi {
  shelfFor(thread: PluginSidebarThread): ThreadShelf;
  canPark(thread: PluginSidebarThread): boolean;
  wakeAtFor(thread: PluginSidebarThread): number | null;
  settledAtFor(thread: PluginSidebarThread): number | null;
  wokeFor(thread: PluginSidebarThread): boolean;
  acknowledgeWake(threadId: string): Promise<boolean>;
  settle(threadId: string): Promise<boolean>;
  unsettle(threadId: string): Promise<boolean>;
  snooze(threadId: string, snoozedUntil: number): Promise<boolean>;
  unsnooze(threadId: string): Promise<boolean>;
  bulkSettle(threadIds: readonly string[]): Promise<BulkActionResult>;
  bulkSnooze(
    threadIds: readonly string[],
    snoozedUntil: number,
  ): Promise<BulkActionResult>;
}

type LifecycleMutation =
  | "settle"
  | "unsettle"
  | "snooze"
  | "unsnooze"
  | "acknowledgeWake";
type LifecycleMutationRequest =
  | { method: "snooze"; threadId: string; snoozedUntil: number }
  | { method: Exclude<LifecycleMutation, "snooze">; threadId: string };

type LifecycleRows = ReadonlyMap<string, ThreadLifecycleRow>;

const lifecycleRowsByRpcClient = new WeakMap<object, LifecycleRows>();
const LIFECYCLE_ROWS_CACHE_KEY = "glass-sidebar:lifecycle-cache:v1";

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function readStoredLifecycleRows(): LifecycleRows | null {
  try {
    const stored = window.localStorage.getItem(LIFECYCLE_ROWS_CACHE_KEY);
    if (!stored) return null;
    const values = JSON.parse(stored) as unknown;
    if (!Array.isArray(values)) return null;
    const rows = new Map<string, ThreadLifecycleRow>();
    for (const value of values) {
      if (typeof value !== "object" || value === null) return null;
      const row = value as Partial<ThreadLifecycleRow>;
      if (
        typeof row.threadId !== "string" ||
        !isNullableNumber(row.settledAt) ||
        !isNullableNumber(row.snoozedUntil) ||
        !isNullableNumber(row.snoozedAt) ||
        (row.settledOverride !== undefined &&
          row.settledOverride !== null &&
          row.settledOverride !== "active" &&
          row.settledOverride !== "settled")
      ) {
        return null;
      }
      rows.set(row.threadId, row as ThreadLifecycleRow);
    }
    return rows;
  } catch {
    return null;
  }
}

function cacheLifecycleRows(rpcClient: object, rows: LifecycleRows): void {
  lifecycleRowsByRpcClient.set(rpcClient, rows);
  try {
    window.localStorage.setItem(
      LIFECYCLE_ROWS_CACHE_KEY,
      JSON.stringify([...rows.values()]),
    );
  } catch {
    // Keep the current runtime correct even when durable storage is blocked.
  }
}

const SUCCESS_MESSAGE: Record<
  Exclude<LifecycleMutation, "snooze" | "acknowledgeWake">,
  string
> = {
  settle: "Thread settled",
  unsettle: "Thread returned to the inbox",
  unsnooze: "Thread woke up",
};

const ERROR_MESSAGE: Record<LifecycleMutation, string> = {
  settle: "Could not settle thread",
  unsettle: "Could not un-settle thread",
  snooze: "Could not snooze thread",
  unsnooze: "Could not wake thread",
  acknowledgeWake: "Could not dismiss Woke marker",
};

function errorDescription(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const message = error.message.trim();
  return message.length > 0 ? message : undefined;
}

/**
 * The optimistic row a mutation produces, or null when it clears the row.
 * Applied immediately so a parked card leaves the shelf on the click, not on
 * the round trip; the server's realtime signal is what reconciles it.
 */
function optimisticRow(
  request: LifecycleMutationRequest,
  current: ThreadLifecycleRow | undefined,
  now: number,
): ThreadLifecycleRow | null {
  switch (request.method) {
    case "settle":
      return {
        threadId: request.threadId,
        settledAt: now,
        settledOverride: "settled",
        snoozedUntil: null,
        snoozedAt: null,
      };
    case "unsettle":
      return {
        threadId: request.threadId,
        settledAt: null,
        settledOverride: "active",
        snoozedUntil: current?.snoozedUntil ?? null,
        snoozedAt: current?.snoozedAt ?? null,
      };
    case "snooze":
      return {
        threadId: request.threadId,
        settledAt: null,
        settledOverride: null,
        snoozedUntil: request.snoozedUntil,
        snoozedAt: now,
      };
    default:
      return null;
  }
}

/**
 * Reads the plugin's own lifecycle store and classifies threads onto shelves.
 *
 * `now` is state, not a render-time clock read: a snooze that elapses must
 * move its row without waiting for an unrelated re-render, and re-reading the
 * clock during render would make the classification unstable.
 *
 * One `listLifecycle` on mount is this packet's whole share of the plan's
 * four-RPC first-paint budget. The initial idempotent auto-settle evaluation
 * happens inside that handler, so there is no second mount-time RPC; later
 * evaluations ride later refreshes, or the server's 5-minute schedule.
 */
export function useLifecycle(
  threads: readonly PluginSidebarThread[],
): LifecycleApi {
  const rpc = useRpc<typeof glassSidebarRpcContract>();
  const [rows, setRows] = useState<LifecycleRows>(
    () =>
      lifecycleRowsByRpcClient.get(rpc) ?? readStoredLifecycleRows() ?? new Map(),
  );
  const [now, setNow] = useState(() => Date.now());

  // Live-work signals the server cannot see. Read through a ref so a thread
  // update does not re-arm the mount effect and spend a second first-paint RPC.
  const signalsRef = useRef<readonly PluginSidebarThread[]>(threads);
  signalsRef.current = threads;

  // Responses can land out of order (a mutation's refresh racing a realtime
  // one), and an older list would silently restore state the user just
  // changed. Only the newest request may write.
  const requestSeq = useRef(0);
  const inFlightThreadIds = useRef(new Set<string>());
  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const result = await rpc.call("listLifecycle", {
        signals: signalsRef.current.map((thread) => ({
          threadId: thread.id,
          hasPendingInteraction: thread.hasPendingInteraction,
          isWorking: isWorking(thread),
        })),
      });
      if (seq !== requestSeq.current) return;
      const nextRows = new Map(
        result.rows.map((row) => [row.threadId, row] as const),
      );
      cacheLifecycleRows(rpc, nextRows);
      setRows(nextRows);
    } catch {
      // A backend generation can briefly lag the app bundle during a reload.
      // The cached rows stay on screen and the next signal reconciles them.
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtime(LIFECYCLE_CHANNEL, () => {
    void refresh();
  });

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refresh]);

  // A host thread-list revision is the other signal that can change a policy
  // outcome (new activity, a new pin), so it drives the next evaluation.
  const threadListRevision = threads
    .map((thread) => `${thread.id}:${thread.updatedAt}`)
    .join("");
  const lastRevision = useRef(threadListRevision);
  useEffect(() => {
    if (threadListRevision === lastRevision.current) return;
    lastRevision.current = threadListRevision;
    void refresh();
  }, [refresh, threadListRevision]);

  // Arm one timer for the soonest wake instead of polling: the shelf empties
  // the moment a snooze expires, and nothing ticks while nothing is snoozed.
  useEffect(() => {
    // Read a fresh clock here rather than trusting `now`: `now` is only
    // updated when a timer fires, so arming from it after a long idle period
    // would schedule a new snooze far too late.
    const armedAt = Date.now();
    const delay = nextWakeDelayMs(
      [...rows.values()].flatMap((row) =>
        row.snoozedUntil === null ? [] : [row.snoozedUntil],
      ),
      armedAt,
    );
    if (delay === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [now, rows]);

  return useMemo<LifecycleApi>(() => {
    const signalsFor = (thread: PluginSidebarThread) => ({
      hasPendingInteraction: thread.hasPendingInteraction,
      isWorking: isWorking(thread),
      isUnread: thread.isUnread,
      latestAttentionAt: thread.latestAttentionAt,
    });
    // One mutation per thread at a time. The write publishes on the realtime
    // channel, and that subscription refreshes every client after success.
    const mutate = async (
      request: LifecycleMutationRequest,
    ): Promise<boolean> => {
      const { method, threadId } = request;
      if (inFlightThreadIds.current.has(threadId)) return false;
      inFlightThreadIds.current.add(threadId);
      const rollback = rows;
      const next = new Map(rows);
      const optimistic = optimisticRow(request, rows.get(threadId), Date.now());
      if (optimistic === null) next.delete(threadId);
      else next.set(threadId, optimistic);
      setRows(next);
      // Discard any list already in flight: it predates this write and would
      // put the row the user just moved straight back.
      requestSeq.current += 1;
      try {
        if (method === "snooze") {
          await rpc.call("snooze", {
            threadId,
            snoozedUntil: request.snoozedUntil,
          });
        } else {
          await rpc.call(method, { threadId });
        }
      } catch (error) {
        setRows(rollback);
        toast.error(ERROR_MESSAGE[method], {
          description: errorDescription(error),
        });
        return false;
      } finally {
        inFlightThreadIds.current.delete(threadId);
      }

      if (method === "snooze") {
        toast.success("Thread snoozed", {
          description: `Wakes ${formatSnoozeWakeTime(request.snoozedUntil)}`,
          action: {
            label: "Undo",
            onClick: () => void mutate({ method: "unsnooze", threadId }),
          },
        });
      } else if (method !== "acknowledgeWake") {
        toast.success(SUCCESS_MESSAGE[method]);
      }
      return true;
    };
    return {
      shelfFor: (thread) => {
        const row = rows.get(thread.id);
        // Pinning keeps policy-settled rows active. Explicit snooze and
        // manual settle remain authoritative, then return to pinned on wake.
        if (
          thread.isPinned &&
          row?.settledOverride !== "settled" &&
          row?.snoozedUntil == null
        ) {
          return "active";
        }
        return resolveShelf(row, signalsFor(thread), now);
      },
      canPark: (thread) => canPark(signalsFor(thread)),
      wakeAtFor: (thread) => rows.get(thread.id)?.snoozedUntil ?? null,
      settledAtFor: (thread) => rows.get(thread.id)?.settledAt ?? null,
      wokeFor: (thread) =>
        resolveWakeReason(rows.get(thread.id), signalsFor(thread), now) !== null,
      acknowledgeWake: (threadId) =>
        mutate({ method: "acknowledgeWake", threadId }),
      settle: (threadId) => mutate({ method: "settle", threadId }),
      unsettle: (threadId) => mutate({ method: "unsettle", threadId }),
      unsnooze: (threadId) => mutate({ method: "unsnooze", threadId }),
      snooze: (threadId, snoozedUntil) =>
        mutate({ method: "snooze", threadId, snoozedUntil }),
      bulkSettle: (threadIds) =>
        rpc.call("bulkSettle", { threadIds: [...threadIds] }),
      bulkSnooze: (threadIds, snoozedUntil) =>
        rpc.call("bulkSnooze", { threadIds: [...threadIds], snoozedUntil }),
    };
  }, [now, rows, rpc]);
}
