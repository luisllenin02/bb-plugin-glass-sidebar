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

/**
 * How long a burst of `updatedAt`-only changes may coalesce. Short enough that
 * a policy transition still lands in the same beat as the change that caused
 * it; long enough that a streaming agent cannot turn one read into hundreds.
 */
export const ACTIVITY_COALESCE_MS = 400;

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

/** In-memory only: no serialisation, so it is free to call on a no-op read. */
function rememberLifecycleRows(rpcClient: object, rows: LifecycleRows): void {
  lifecycleRowsByRpcClient.set(rpcClient, rows);
}

function cacheLifecycleRows(rpcClient: object, rows: LifecycleRows): void {
  rememberLifecycleRows(rpcClient, rows);
  try {
    window.localStorage.setItem(
      LIFECYCLE_ROWS_CACHE_KEY,
      JSON.stringify([...rows.values()]),
    );
  } catch {
    // Keep the current runtime correct even when durable storage is blocked.
  }
}

/**
 * Row-for-row equality. Most `listLifecycle` answers repeat the rows already on
 * screen, and re-storing them would replace the Map, re-serialise the whole
 * store into `localStorage`, and hand every consumer a new `LifecycleApi` for
 * no visible change.
 */
function sameLifecycleRows(left: LifecycleRows, right: LifecycleRows): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const [threadId, row] of left) {
    const other = right.get(threadId);
    if (
      other === undefined ||
      other.settledAt !== row.settledAt ||
      other.settledOverride !== row.settledOverride ||
      other.snoozedUntil !== row.snoozedUntil ||
      other.snoozedAt !== row.snoozedAt
    ) {
      return false;
    }
  }
  return true;
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
  // What is on screen right now, readable from a response callback that may
  // land before React has re-rendered.
  const rowsRef = useRef<LifecycleRows>(rows);
  rowsRef.current = rows;

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
      // Hand back the same Map when nothing moved. `LifecycleApi` is memoised
      // on this value, so a stable identity keeps every row's props stable
      // through the refreshes a streaming thread provokes, and skips
      // re-serialising the whole store into `localStorage`.
      const previous = rowsRef.current;
      if (sameLifecycleRows(previous, nextRows)) {
        rememberLifecycleRows(rpc, previous);
        return;
      }
      rowsRef.current = nextRows;
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
  // outcome, and it splits into two keys that deserve different urgency.
  //
  // `signalRevision` is exactly what this client sends: the id set and the two
  // live-work fields. The server holds a thread this client reported live
  // until a later report says it went quiet, and a thread can stop working or
  // drop its raised hand without the host bumping `updatedAt`. Leaving those
  // fields out would mean that release is never sent, so this key still
  // refreshes at once, as it always did.
  //
  // `activityRevision` is `updatedAt` alone. It is never part of the request,
  // so it cannot change what this client asks; it only invites the server to
  // re-run its policy pass over its own view of the threads. A streaming agent
  // bumps it many times a second, which used to cost one round trip per tick.
  // It now settles on the trailing edge of a burst instead.
  let signalRevision = "";
  let activityRevision = "";
  for (const thread of threads) {
    signalRevision += `${thread.id}\u001f${thread.hasPendingInteraction ? 1 : 0}${isWorking(thread) ? 1 : 0}\u001e`;
    activityRevision += `${thread.updatedAt}\u001e`;
  }

  const lastSignalRevision = useRef(signalRevision);
  const lastActivityRevision = useRef(activityRevision);
  const coalesceTimer = useRef<number | null>(null);
  const cancelCoalesced = useCallback(() => {
    if (coalesceTimer.current === null) return;
    window.clearTimeout(coalesceTimer.current);
    coalesceTimer.current = null;
  }, []);
  useEffect(() => cancelCoalesced, [cancelCoalesced]);

  useEffect(() => {
    if (signalRevision === lastSignalRevision.current) return;
    lastSignalRevision.current = signalRevision;
    // This refresh reports the newest `updatedAt` as well, so anything the
    // coalesced timer was still holding would only be a duplicate.
    lastActivityRevision.current = activityRevision;
    cancelCoalesced();
    void refresh();
  }, [activityRevision, cancelCoalesced, refresh, signalRevision]);

  useEffect(() => {
    if (activityRevision === lastActivityRevision.current) return;
    lastActivityRevision.current = activityRevision;
    // One timer per burst. Ticks that arrive while it is armed are already
    // covered by the read it will make, and a tick arriving after it fires
    // arms the next one, so the last tick of a burst is always followed by a
    // read: the signal is delayed, never dropped.
    if (coalesceTimer.current !== null) return;
    coalesceTimer.current = window.setTimeout(() => {
      coalesceTimer.current = null;
      void refresh();
    }, ACTIVITY_COALESCE_MS);
  }, [activityRevision, refresh]);

  // Arm one timer for the soonest wake instead of polling: the shelf empties
  // the moment a snooze expires, and nothing ticks while nothing is snoozed.
  useEffect(() => {
    // Read a fresh clock here rather than trusting `now`: `now` is only
    // updated when a timer fires, so arming from it after a long idle period
    // would schedule a new snooze far too late.
    const armedAt = Date.now();
    const wakeTimes: number[] = [];
    for (const row of rows.values()) {
      if (row.snoozedUntil !== null) wakeTimes.push(row.snoozedUntil);
    }
    const delay = nextWakeDelayMs(wakeTimes, armedAt);
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
