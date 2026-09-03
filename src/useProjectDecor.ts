import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { glassSidebarRpcContract } from "../server";
import { decorFor, type ProjectDecorMap, type ProjectDecorValue } from "./project-decor";
import { fetchProjectGlyphs, mergeProjectGlyphs } from "./project-glyphs";

export const PROJECT_DECOR_CHANNEL = "project-decor";

interface ProjectDecorSnapshot {
  status: "loading" | "ready" | "error";
  projects: ProjectDecorMap;
  updatedAt: number;
}

const listeners = new Set<() => void>();
let snapshot: ProjectDecorSnapshot = { status: "loading", projects: {}, updatedAt: 0 };
let inFlight: Promise<void> | null = null;
let loaded = false;

function emit(next: ProjectDecorSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type DecorRpc = ReturnType<typeof useRpc<typeof glassSidebarRpcContract>>;

async function refreshShared(rpc: DecorRpc): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const result = await rpc.call("getProjectDecor", {});
      const projectIds = Object.keys(result.projects);
      const glyphs = await fetchProjectGlyphs(rpc, projectIds);
      emit({
        status: "ready",
        projects: mergeProjectGlyphs(result.projects, glyphs),
        updatedAt: result.updatedAt,
      });
      loaded = true;
    } catch {
      emit({ status: "error", projects: {}, updatedAt: 0 });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export interface ProjectDecorApi {
  status: ProjectDecorSnapshot["status"];
  projects: ProjectDecorMap;
  updatedAt: number;
  decorFor(projectId: string): ProjectDecorValue | null;
  refresh(): Promise<void>;
}

/** One shared client cache prevents each visible header chip from mounting RPCs. */
export function useProjectDecor(): ProjectDecorApi {
  const rpc = useRpc<typeof glassSidebarRpcContract>();
  const current = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const refresh = useCallback(() => refreshShared(rpc), [rpc]);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [refresh]);

  useRealtime(PROJECT_DECOR_CHANNEL, () => {
    void refresh();
  });

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return {
    ...current,
    decorFor: (projectId) => decorFor(current.projects, projectId),
    refresh,
  };
}

export function resetProjectDecorCacheForTests(): void {
  loaded = false;
  inFlight = null;
  snapshot = { status: "loading", projects: {}, updatedAt: 0 };
  listeners.clear();
}
