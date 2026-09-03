import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
} from "react";
import type { ThreadReorderControls } from "./ThreadCard";
import {
  dropTargetFromPoint,
  type DropRect,
  type FolderDropTarget,
} from "./folder-list";
import {
  armTouchHold,
  blockTouchScroll,
  pointerKind,
  unengagedMove,
} from "./drag-gesture";
import { uniqueFolderName, type Folder } from "./organization";
import type { OrganizationActionsAccess } from "./row-props";

export type ThreadDropDecision =
  | {
      kind: "move";
      threadId: string;
      folderId: string | null;
      beforeThreadId?: string | null;
    }
  | { kind: "reorder-folder"; folderId: string; threadIds: string[] }
  | { kind: "create-folder"; threadIds: string[] }
  | null;

function moveBefore(
  ids: readonly string[],
  movingId: string,
  beforeThreadId: string | null,
): string[] {
  const next = ids.filter((id) => id !== movingId);
  const index = beforeThreadId === null ? next.length : next.indexOf(beforeThreadId);
  next.splice(index < 0 ? next.length : index, 0, movingId);
  return next;
}

/** Decide the durable organization mutation without touching the DOM. */
export function decideThreadDrop(options: {
  draggingId: string;
  sourceFolderId: string | null;
  target: FolderDropTarget | null;
  folders: readonly Folder[];
}): ThreadDropDecision {
  const { draggingId, sourceFolderId, target, folders } = options;
  if (!target) return null;
  if (target.kind === "thread" && target.threadId === draggingId) return null;

  if (target.kind === "folder") {
    if (target.folderId === sourceFolderId) return null;
    return {
      kind: "move",
      threadId: draggingId,
      folderId: target.folderId,
      beforeThreadId: null,
    };
  }

  if (target.folderId === null) {
    if (target.placement === "on") {
      return { kind: "create-folder", threadIds: [target.threadId, draggingId] };
    }
    if (sourceFolderId !== null) {
      return { kind: "move", threadId: draggingId, folderId: null };
    }
    return null;
  }

  const destination = folders.find((folder) => folder.id === target.folderId);
  if (!destination) return null;
  const destinationWithoutMoving = destination.threadIds.filter(
    (threadId) => threadId !== draggingId,
  );
  const targetIndex = destinationWithoutMoving.indexOf(target.threadId);
  const beforeThreadId =
    target.placement === "before"
      ? target.threadId
      : (destinationWithoutMoving[targetIndex + 1] ?? null);

  if (sourceFolderId === target.folderId) {
    const threadIds = moveBefore(
      destination.threadIds,
      draggingId,
      beforeThreadId,
    );
    if (threadIds.join("\0") === destination.threadIds.join("\0")) return null;
    return { kind: "reorder-folder", folderId: target.folderId, threadIds };
  }

  return {
    kind: "move",
    threadId: draggingId,
    folderId: target.folderId,
    beforeThreadId,
  };
}

function targetAtPoint(clientX: number, clientY: number): FolderDropTarget | null {
  const hit = document.elementFromPoint(clientX, clientY);
  if (!(hit instanceof Element)) return null;

  const threadElement = hit.closest<HTMLElement>("[data-sidebar-thread-id]");
  if (threadElement) {
    const threadId = threadElement.dataset.sidebarThreadId;
    if (!threadId) return null;
    const row = threadElement.closest<HTMLElement>("li") ?? threadElement;
    const folderId =
      row.closest<HTMLElement>("[data-folder-container-id]")?.dataset
        .folderContainerId ?? null;
    const rect = row.getBoundingClientRect();
    return dropTargetFromPoint(
      { x: clientX, y: clientY },
      [{ kind: "thread", threadId, folderId, rect }],
    );
  }

  const folderElement = hit.closest<HTMLElement>("[data-folder-id]");
  const folderId = folderElement?.dataset.folderId;
  if (!folderElement || !folderId) return null;
  return dropTargetFromPoint(
    { x: clientX, y: clientY },
    [{ kind: "folder", folderId, rect: folderElement.getBoundingClientRect() }],
  );
}

function suppressClick(id: string): void {
  const listener = (event: MouseEvent) => {
    const clickedId =
      event.target instanceof Element
        ? event.target
            .closest("[data-sidebar-thread-id], [data-folder-id]")
            ?.getAttribute("data-sidebar-thread-id") ??
          event.target.closest("[data-folder-id]")?.getAttribute("data-folder-id")
        : null;
    if (clickedId !== id) return;
    event.preventDefault();
    event.stopPropagation();
    window.removeEventListener("click", listener, true);
  };
  window.addEventListener("click", listener, true);
  window.setTimeout(() => window.removeEventListener("click", listener, true), 300);
}

export interface FolderHeaderDragControls {
  disabled: boolean;
  isDragging: boolean;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
}

export interface FolderDragApi {
  draggingId: string | null;
  target: FolderDropTarget | null;
  threadControls(threadId: string): ThreadReorderControls;
  folderControls(folderId: string): FolderHeaderDragControls;
}

export function useFolderDrag({
  folders,
  folderOf,
  actions,
  onFolderCreated,
}: {
  folders: readonly Folder[];
  folderOf: (threadId: string) => Folder | null;
  actions: OrganizationActionsAccess;
  onFolderCreated?: (folderId: string) => void;
}): FolderDragApi {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [target, setTarget] = useState<FolderDropTarget | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const targetRef = useRef<FolderDropTarget | null>(null);
  targetRef.current = target;

  useEffect(() => () => cancelRef.current?.(), []);

  const runDecision = useCallback(
    async (decision: ThreadDropDecision) => {
      if (!decision) return;
      if (decision.kind === "move") {
        await actions.moveThreadToFolder({
          threadId: decision.threadId,
          folderId: decision.folderId,
          beforeThreadId: decision.beforeThreadId,
        });
      } else if (decision.kind === "reorder-folder") {
        await actions.reorderFolderThreads({
          folderId: decision.folderId,
          threadIds: decision.threadIds,
        });
      } else {
        const result = await actions.createFolder({
          name: uniqueFolderName(folders),
          threadIds: decision.threadIds,
        });
        onFolderCreated?.(result.folder.id);
      }
    },
    [actions, folders, onFolderCreated],
  );

  const startDrag = useCallback(
    (kind: "thread" | "folder", id: string, event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      cancelRef.current?.();
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const inputKind = pointerKind(event.pointerType);
      let engaged = false;
      let finished = false;
      // Touch: a finger is scrolling until it has held still (see
      // drag-gesture.ts); a scroll-sized move before then aborts the drag.
      let held = false;
      let disarmHold: (() => void) | null = null;
      let unblockScroll: (() => void) | null = null;

      const cleanup = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        window.removeEventListener("keydown", onWindowKeyDown);
        disarmHold?.();
        disarmHold = null;
        unblockScroll?.();
        unblockScroll = null;
        if (cancelRef.current === cancel) cancelRef.current = null;
      };
      const reset = () => {
        targetRef.current = null;
        setTarget(null);
        setDraggingId(null);
      };
      const cancel = () => {
        if (finished) return;
        finished = true;
        cleanup();
        reset();
      };
      const engage = () => {
        if (engaged || finished) return;
        engaged = true;
        if (inputKind === "touch") {
          unblockScroll = blockTouchScroll();
          navigator.vibrate?.(10);
        }
        setDraggingId(id);
      };
      const updateTarget = (moveEvent: PointerEvent) => {
        const next = targetAtPoint(moveEvent.clientX, moveEvent.clientY);
        targetRef.current = next;
        setTarget(next);
        // Inside-sidebar organization drags own the gesture. A null hit is
        // intentionally left untouched so the host can turn it into a split
        // drag after the pointer leaves the sidebar.
        if (next) moveEvent.preventDefault();
      };
      function onPointerMove(moveEvent: PointerEvent) {
        if (finished || moveEvent.pointerId !== pointerId) return;
        if (!engaged) {
          const outcome = unengagedMove(
            inputKind,
            Math.hypot(
              moveEvent.clientX - startX,
              moveEvent.clientY - startY,
            ),
            held,
          );
          if (outcome === "wait") return;
          if (outcome === "abort") {
            cancel();
            return;
          }
          engage();
        }
        updateTarget(moveEvent);
      }
      function onPointerUp(upEvent: PointerEvent) {
        if (finished || upEvent.pointerId !== pointerId) return;
        finished = true;
        const finalTarget = targetAtPoint(upEvent.clientX, upEvent.clientY) ?? targetRef.current;
        cleanup();
        reset();
        if (!engaged) return;

        if (kind === "thread") {
          const decision = decideThreadDrop({
            draggingId: id,
            sourceFolderId: folderOf(id)?.id ?? null,
            target: finalTarget,
            folders,
          });
          if (!decision) return;
          upEvent.preventDefault();
          suppressClick(id);
          void runDecision(decision);
          return;
        }

        const folderTarget =
          finalTarget?.kind === "folder"
            ? finalTarget
            : finalTarget?.folderId
              ? {
                  kind: "folder" as const,
                  folderId: finalTarget.folderId,
                  placement: finalTarget.placement === "before" ? "before" as const : "after" as const,
                }
              : null;
        if (!folderTarget || folderTarget.folderId === id) return;
        const currentIds = folders.map((folder) => folder.id);
        const nextIds = currentIds.filter((folderId) => folderId !== id);
        const targetIndex = nextIds.indexOf(folderTarget.folderId);
        if (targetIndex < 0) return;
        nextIds.splice(
          folderTarget.placement === "after" ? targetIndex + 1 : targetIndex,
          0,
          id,
        );
        upEvent.preventDefault();
        suppressClick(id);
        void actions.reorderFolders({ folderIds: nextIds });
      }
      function onPointerCancel(cancelEvent: PointerEvent) {
        if (cancelEvent.pointerId === pointerId) cancel();
      }
      function onWindowKeyDown(keyEvent: KeyboardEvent) {
        if (keyEvent.key === "Escape") cancel();
      }

      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("keydown", onWindowKeyDown);
      if (inputKind === "touch") {
        disarmHold = armTouchHold(() => {
          held = true;
          engage();
        });
      }
      cancelRef.current = cancel;
    },
    [actions, folderOf, folders, runDecision],
  );

  const threadControls = useCallback(
    (threadId: string): ThreadReorderControls => ({
      disabled: false,
      isDragging: draggingId === threadId,
      hasKeyboardReorder: folderOf(threadId) !== null,
      onPointerDown: (event) => startDrag("thread", threadId, event),
      onKeyDown: (event) => {
        if (
          !event.altKey ||
          (event.key !== "ArrowUp" && event.key !== "ArrowDown")
        ) {
          return;
        }
        const folder = folderOf(threadId);
        if (!folder) return;
        const index = folder.threadIds.indexOf(threadId);
        const targetIndex = index + (event.key === "ArrowUp" ? -1 : 1);
        if (index < 0 || targetIndex < 0 || targetIndex >= folder.threadIds.length) return;
        event.preventDefault();
        event.stopPropagation();
        const ids = [...folder.threadIds];
        [ids[index], ids[targetIndex]] = [ids[targetIndex]!, ids[index]!];
        void actions.reorderFolderThreads({ folderId: folder.id, threadIds: ids });
      },
    }),
    [actions, draggingId, folderOf, startDrag],
  );

  const folderControls = useCallback(
    (folderId: string): FolderHeaderDragControls => ({
      disabled: false,
      isDragging: draggingId === folderId,
      onPointerDown: (event) => startDrag("folder", folderId, event),
      onKeyDown: (event) => {
        if (
          !event.altKey ||
          (event.key !== "ArrowUp" && event.key !== "ArrowDown")
        ) {
          return;
        }
        const ids = folders.map((folder) => folder.id);
        const index = ids.indexOf(folderId);
        const targetIndex = index + (event.key === "ArrowUp" ? -1 : 1);
        if (index < 0 || targetIndex < 0 || targetIndex >= ids.length) return;
        event.preventDefault();
        event.stopPropagation();
        [ids[index], ids[targetIndex]] = [ids[targetIndex]!, ids[index]!];
        void actions.reorderFolders({ folderIds: ids });
      },
    }),
    [actions, draggingId, folders, startDrag],
  );

  return { draggingId, target, threadControls, folderControls };
}
