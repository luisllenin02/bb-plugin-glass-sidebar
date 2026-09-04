import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { Folder } from "./organization";

export const MAX_VISIBLE_FOLDERS = 60;
export const MAX_VISIBLE_FOLDER_MEMBERS = 500;

export interface FolderEntry<T extends Pick<PluginSidebarThread, "id"> = PluginSidebarThread> {
  folder: Folder;
  members: T[];
}

/**
 * Split active, visible threads into durable folder order and the ordinary
 * shelves. Callers deliberately pass only lifecycle-active threads: parked or
 * archived members stay on their lifecycle shelf and reappear here later.
 */
export function partitionByFolder<
  T extends Pick<PluginSidebarThread, "id" | "isArchived">,
>(
  threads: readonly T[],
  organization: { folders: readonly Folder[] },
): { folderEntries: FolderEntry<T>[]; ungrouped: T[] } {
  // Both indexes in one pass each: the previous filter/map/flatMap chain built
  // three throwaway arrays the size of the list on every call, and this runs
  // whenever the thread list changes.
  const visibleById = new Map<string, T>();
  for (const thread of threads) {
    if (!thread.isArchived) visibleById.set(thread.id, thread);
  }
  const groupedIds = new Set<string>();
  for (const folder of organization.folders) {
    for (const threadId of folder.threadIds) groupedIds.add(threadId);
  }
  let remainingMembers = MAX_VISIBLE_FOLDER_MEMBERS;
  const folderEntries = [...organization.folders]
    .sort((left, right) => left.sortIndex - right.sortIndex)
    .slice(0, MAX_VISIBLE_FOLDERS)
    .map((folder) => {
      const members: T[] = [];
      for (const threadId of folder.threadIds) {
        if (members.length >= remainingMembers) break;
        const thread = visibleById.get(threadId);
        if (thread) members.push(thread);
      }
      remainingMembers -= members.length;
      return { folder, members };
    });

  return {
    folderEntries,
    ungrouped: threads.filter(
      (thread) => !thread.isArchived && !groupedIds.has(thread.id),
    ),
  };
}

export interface Point {
  x: number;
  y: number;
}

export interface ElementRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type DropRect =
  | {
      kind: "folder";
      folderId: string;
      rect: ElementRect;
    }
  | {
      kind: "thread";
      threadId: string;
      folderId: string | null;
      rect: ElementRect;
    };

export type FolderDropTarget =
  | {
      kind: "folder";
      folderId: string;
      placement: "before" | "after";
    }
  | {
      kind: "thread";
      threadId: string;
      folderId: string | null;
      placement: "before" | "on" | "after";
    };

function contains(rect: ElementRect, point: Point): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

/** Pure hit-test used by the DOM adapter and unit tests. */
export function dropTargetFromPoint(
  point: Point,
  rects: readonly DropRect[],
): FolderDropTarget | null {
  // A member rect is nested inside its folder; the smaller, actionable row
  // must win even when callers include both rectangles.
  const hit =
    rects.find((candidate) => candidate.kind === "thread" && contains(candidate.rect, point)) ??
    rects.find((candidate) => candidate.kind === "folder" && contains(candidate.rect, point));
  if (!hit) return null;

  const height = Math.max(1, hit.rect.bottom - hit.rect.top);
  const ratio = (point.y - hit.rect.top) / height;
  if (hit.kind === "folder") {
    return {
      kind: "folder",
      folderId: hit.folderId,
      placement: ratio < 0.5 ? "before" : "after",
    };
  }

  // Folder members are insertion anchors. Ungrouped cards reserve their
  // middle half as the explicit "make a folder" target while their edges
  // remain available to the existing inbox/pinned reorder controller.
  const placement = hit.folderId
    ? ratio < 0.5
      ? "before"
      : "after"
    : ratio < 0.25
      ? "before"
      : ratio > 0.75
        ? "after"
        : "on";
  return {
    kind: "thread",
    threadId: hit.threadId,
    folderId: hit.folderId,
    placement,
  };
}
