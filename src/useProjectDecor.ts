import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { glassSidebarRpcContract } from "../server";
import { decorFor, type ProjectDecorMap, type ProjectDecorValue } from "./project-decor";
import type { ProjectGlyph } from "./row-props";
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

/**
 * Glyph drawings are re-parsed on every read, so they never survive as the
 * same array; comparing the pairs is what makes the check useful. Attribute
 * values are primitives, and anything else compares by identity, so an
 * unrecognised shape fails closed into "changed".
 */
function sameGlyph(
  left: ProjectGlyph | null | undefined,
  right: ProjectGlyph | null | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((pair, index) => {
    const other = right[index]!;
    if (pair[0] !== other[0]) return false;
    const keys = Object.keys(pair[1]);
    return (
      keys.length === Object.keys(other[1]).length &&
      keys.every((key) => pair[1][key] === other[1][key])
    );
  });
}

function sameDecorEntry(
  left: ProjectDecorValue,
  right: ProjectDecorValue,
): boolean {
  return (
    left.icon === right.icon &&
    left.iconColor === right.iconColor &&
    left.source === right.source &&
    left.autoReason === right.autoReason &&
    (left.autoKeywords === right.autoKeywords ||
      (left.autoKeywords?.length === right.autoKeywords?.length &&
        (left.autoKeywords ?? []).every(
          (keyword, index) => keyword === right.autoKeywords![index],
        ))) &&
    sameGlyph(left.glyph, right.glyph)
  );
}

function sameDecor(left: ProjectDecorMap, right: ProjectDecorMap): boolean {
  if (left === right) return true;
  const projectIds = Object.keys(right);
  if (projectIds.length !== Object.keys(left).length) return false;
  return projectIds.every((projectId) => {
    const entry = left[projectId];
    return entry !== undefined && sameDecorEntry(entry, right[projectId]!);
  });
}

/**
 * Notify only on a real change. Decor is re-read on its own channel and on
 * every visibility flip, and it almost never differs between those reads; an
 * unconditional emit would re-render every project chip in the list for an
 * identical map.
 */
function emit(next: ProjectDecorSnapshot): void {
  if (
    next.status === snapshot.status &&
    next.updatedAt === snapshot.updatedAt &&
    sameDecor(snapshot.projects, next.projects)
  ) {
    return;
  }
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

  // `decorFor` is called once per project chip on every render, so it — and
  // the object carrying it — only change when the decor itself does.
  const decorForProject = useCallback(
    (projectId: string) => decorFor(current.projects, projectId),
    [current.projects],
  );
  return useMemo(
    () => ({ ...current, decorFor: decorForProject, refresh }),
    [current, decorForProject, refresh],
  );
}

export function resetProjectDecorCacheForTests(): void {
  loaded = false;
  inFlight = null;
  snapshot = { status: "loading", projects: {}, updatedAt: 0 };
  listeners.clear();
}
