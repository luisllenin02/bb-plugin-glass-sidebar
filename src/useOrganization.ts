import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type PluginSidebarThread,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { accentCss, type AccentValue } from "./accent";
import {
  ORGANIZATION_CHANNEL,
  applyMove,
  applyReorder,
  folderOf as findFolder,
  type AccentResolutionOptions,
  type Folder,
  type Organization,
  type ResolvedAccentSource,
} from "./organization";
import type { glassSidebarRpcContract } from "../server";

export type OrganizationStatus = "loading" | "ready" | "error";

type ThreadIdentity = Pick<PluginSidebarThread, "id" | "projectId">;

export interface CreateFolderInput {
  name: string;
  threadIds?: string[];
  colorIndex?: number;
  customColor?: string | null;
}

export interface OrganizationActions {
  createFolder(input: CreateFolderInput): Promise<{ folder: Folder }>;
  renameFolder(input: { folderId: string; name: string }): Promise<{ ok: true }>;
  setFolderColor(input: {
    folderId: string;
    colorIndex: number;
    customColor: string | null;
  }): Promise<{ ok: true }>;
  setFolderCollapsed(input: {
    folderId: string;
    collapsed: boolean;
  }): Promise<{ ok: true }>;
  reorderFolders(input: { folderIds: string[] }): Promise<{ ok: true }>;
  deleteFolder(input: { folderId: string }): Promise<{ ok: true }>;
  moveThreadToFolder(input: {
    threadId: string;
    folderId: string | null;
    beforeThreadId?: string | null;
  }): Promise<{ ok: true }>;
  reorderFolderThreads(input: {
    folderId: string;
    threadIds: string[];
  }): Promise<{ ok: true }>;
  setThreadAccent(input: {
    threadId: string;
    colorIndex: number;
    customColor: string | null;
  }): Promise<{ ok: true }>;
  setProjectAccent(input: {
    projectId: string;
    colorIndex: number;
    customColor: string | null;
  }): Promise<{ ok: true }>;
}

export interface OrganizationApi {
  status: OrganizationStatus;
  folders: Folder[];
  folderOf(threadId: string): Folder | null;
  accentFor(thread: ThreadIdentity, folderId: string | null): string | undefined;
  accentSourceFor(
    thread: ThreadIdentity,
    folderId: string | null,
  ): ResolvedAccentSource;
  projectAccentFor(projectId: string): ResolvedAccentSource;
  manualProjectAccentFor(projectId: string): AccentValue | undefined;
  actions: OrganizationActions;
}

/**
 * The three manual precedence steps this packet owns. Q4 owns the decor and
 * automatic steps and supplies them through `resolveAccentSource`, so neither
 * packet has to edit the other's file.
 */
export type AccentSourceResolver = (
  threadId: string,
  projectId: string,
  organization: Organization,
  options: AccentResolutionOptions,
) => ResolvedAccentSource;

export interface OrganizationAccentOptions extends AccentResolutionOptions {
  resolveAccentSource?: AccentSourceResolver;
}

const NO_SOURCE: ResolvedAccentSource = { css: undefined, source: "none" };

const EMPTY_ORGANIZATION: Organization = {
  folders: [],
  members: {},
  threadAccents: {},
  projectAccents: {},
};

/** Manual precedence only: thread, then folder, then project. */
function manualAccentSource(
  threadId: string,
  projectId: string,
  organization: Organization,
): ResolvedAccentSource {
  const candidates = [
    { source: "thread" as const, value: organization.threadAccents[threadId] },
    { source: "folder" as const, value: findFolder(organization, threadId) },
    {
      source: "project" as const,
      value: organization.projectAccents[projectId],
    },
  ];
  for (const candidate of candidates) {
    const css = accentCss(candidate.value);
    if (css) return { css, source: candidate.source };
  }
  return NO_SOURCE;
}

function copyOrganization(organization: Organization): Organization {
  return {
    folders: organization.folders.map((folder) => ({
      ...folder,
      threadIds: [...folder.threadIds],
    })),
    members: { ...organization.members },
    threadAccents: { ...organization.threadAccents },
    projectAccents: { ...organization.projectAccents },
  };
}

function setAccent(
  accents: Record<string, AccentValue>,
  id: string,
  value: AccentValue,
): void {
  if (accentCss(value)) accents[id] = value;
  else delete accents[id];
}

/** Durable organization state with immediate UI updates and host-truth rollback. */
export function useOrganization(
  accentOptions: OrganizationAccentOptions = {},
): OrganizationApi {
  const rpc = useRpc<typeof glassSidebarRpcContract>();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [status, setStatus] = useState<OrganizationStatus>("loading");
  const requestSeq = useRef(0);
  const optimisticId = useRef(0);
  const { resolveAccentSource, ...resolutionOptions } = accentOptions;
  const autoProjectColours = resolutionOptions.autoProjectColours;

  const refresh = useCallback(async (): Promise<Organization | null> => {
    const seq = ++requestSeq.current;
    try {
      const next = await rpc.call("getOrganization", {});
      if (seq === requestSeq.current) {
        setOrganization(next);
        setStatus("ready");
      }
      return next;
    } catch {
      if (seq === requestSeq.current) setStatus("error");
      return null;
    }
  }, [rpc]);

  // One read on mount; every later read is signal-driven.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtime(ORGANIZATION_CHANNEL, () => {
    void refresh();
  });

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const commit = useCallback(
    async <T,>(
      optimistic: (current: Organization) => Organization,
      request: () => Promise<T>,
      message: string,
    ): Promise<T> => {
      const rollback = organization ?? EMPTY_ORGANIZATION;
      setOrganization(optimistic(rollback));
      try {
        const result = await request();
        await refresh();
        return result;
      } catch (error) {
        const host = await refresh();
        if (host === null) setOrganization(rollback);
        toast.error(message, {
          description: error instanceof Error ? error.message : undefined,
        });
        throw error;
      }
    },
    [organization, refresh],
  );

  const actions = useMemo<OrganizationActions>(
    () => ({
      createFolder(input) {
        const temporaryId = `optimistic_${++optimisticId.current}`;
        return commit(
          (current) => {
            let next = copyOrganization(current);
            next.folders.push({
              id: temporaryId,
              name: input.name.trim(),
              colorIndex: input.colorIndex ?? 0,
              customColor: input.customColor ?? null,
              collapsed: false,
              sortIndex: next.folders.length,
              threadIds: [],
            });
            for (const threadId of input.threadIds ?? []) {
              next = applyMove(next, threadId, temporaryId);
            }
            return next;
          },
          () => rpc.call("createFolder", input),
          "Could not create folder",
        );
      },
      renameFolder(input) {
        return commit(
          (current) => ({
            ...current,
            folders: current.folders.map((folder) =>
              folder.id === input.folderId
                ? { ...folder, name: input.name.trim() }
                : folder,
            ),
          }),
          () => rpc.call("renameFolder", input),
          "Could not rename folder",
        );
      },
      setFolderColor(input) {
        return commit(
          (current) => ({
            ...current,
            folders: current.folders.map((folder) =>
              folder.id === input.folderId
                ? {
                    ...folder,
                    colorIndex: input.colorIndex,
                    customColor: input.customColor,
                  }
                : folder,
            ),
          }),
          () => rpc.call("setFolderColor", input),
          "Could not update folder colour",
        );
      },
      setFolderCollapsed(input) {
        return commit(
          (current) => ({
            ...current,
            folders: current.folders.map((folder) =>
              folder.id === input.folderId
                ? { ...folder, collapsed: input.collapsed }
                : folder,
            ),
          }),
          () => rpc.call("setFolderCollapsed", input),
          "Could not update folder",
        );
      },
      reorderFolders(input) {
        return commit(
          (current) => applyReorder(current, input),
          () => rpc.call("reorderFolders", input),
          "Could not reorder folders",
        );
      },
      deleteFolder(input) {
        return commit(
          (current) => {
            const next = copyOrganization(current);
            const removed = new Set(
              next.folders.find((folder) => folder.id === input.folderId)
                ?.threadIds ?? [],
            );
            next.folders = next.folders
              .filter((folder) => folder.id !== input.folderId)
              .map((folder, sortIndex) => ({ ...folder, sortIndex }));
            for (const threadId of removed) delete next.members[threadId];
            return next;
          },
          () => rpc.call("deleteFolder", input),
          "Could not delete folder",
        );
      },
      moveThreadToFolder(input) {
        return commit(
          (current) =>
            applyMove(
              current,
              input.threadId,
              input.folderId,
              input.beforeThreadId ?? null,
            ),
          () => rpc.call("moveThreadToFolder", input),
          "Could not move thread",
        );
      },
      reorderFolderThreads(input) {
        return commit(
          (current) => applyReorder(current, input),
          () => rpc.call("reorderFolderThreads", input),
          "Could not reorder folder threads",
        );
      },
      setThreadAccent(input) {
        return commit(
          (current) => {
            const next = copyOrganization(current);
            setAccent(next.threadAccents, input.threadId, input);
            return next;
          },
          () => rpc.call("setThreadAccent", input),
          "Could not update thread colour",
        );
      },
      setProjectAccent(input) {
        return commit(
          (current) => {
            const next = copyOrganization(current);
            setAccent(next.projectAccents, input.projectId, input);
            return next;
          },
          () => rpc.call("setProjectAccent", input),
          "Could not update project colour",
        );
      },
    }),
    [commit, rpc],
  );

  const current = organization ?? EMPTY_ORGANIZATION;
  const resolve = useCallback(
    (threadId: string, projectId: string): ResolvedAccentSource =>
      resolveAccentSource
        ? resolveAccentSource(threadId, projectId, current, {
            autoProjectColours,
          })
        : manualAccentSource(threadId, projectId, current),
    [autoProjectColours, current, resolveAccentSource],
  );
  const folderForThread = useCallback(
    (threadId: string) => findFolder(current, threadId),
    [current],
  );
  const accentFor = useCallback(
    (thread: ThreadIdentity, _folderId: string | null): string | undefined =>
      resolve(thread.id, thread.projectId).css,
    [resolve],
  );
  const accentSourceFor = useCallback(
    (thread: ThreadIdentity, _folderId: string | null): ResolvedAccentSource =>
      resolve(thread.id, thread.projectId),
    [resolve],
  );
  const projectAccentFor = useCallback(
    (projectId: string): ResolvedAccentSource => resolve("", projectId),
    [resolve],
  );
  const manualProjectAccentFor = useCallback(
    (projectId: string) => current.projectAccents[projectId],
    [current.projectAccents],
  );

  return {
    status,
    folders: current.folders,
    folderOf: folderForThread,
    accentFor,
    accentSourceFor,
    projectAccentFor,
    manualProjectAccentFor,
    actions,
  };
}
