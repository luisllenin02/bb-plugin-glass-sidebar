import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import {
  armTouchHold,
  blockTouchScroll,
  pointerKind,
  unengagedMove,
} from "./drag-gesture";
import {
  mergeVisibleOrder,
  movePinnedId,
  movePinnedIdByOffset,
  orderPinnedThreads,
} from "./pinned-order";
import type { ThreadReorderControls } from "./ThreadCard";
import { useInboxReorder } from "./useInboxReorder";
import { usePinnedReorder } from "./usePinnedReorder";

/** Same two shelves as the list's `ActiveShelfKind`, declared here to keep
 * this module independent of the component that mounts it. */
export type ShelfKind = "pinned" | "inbox";

interface DragOrder {
  shelf: ShelfKind;
  movingId: string;
  ids: string[];
}

export interface ShelfReorderApi {
  /** Ungrouped pinned rows in durable order, with the live drag preview. */
  pinned: PluginSidebarThread[];
  /** Ungrouped inbox rows in durable order, with the live drag preview. */
  inbox: PluginSidebarThread[];
  /** True while either shelf has a write in flight. */
  isReordering: boolean;
  /**
   * Reorder controls for one flat-shelf card, composed with the folder-drag
   * controls so a drop onto a folder still wins and only one mutation runs.
   */
  controlsFor(
    thread: PluginSidebarThread,
    shelf: ShelfKind,
    visibleIds: readonly string[],
    organizationControls: ThreadReorderControls,
  ): ThreadReorderControls;
}

/** Swallow the click that ends a drag so the row does not also open. */
function suppressNextClick(threadId: string): void {
  let timeout = 0;
  const suppress = (event: MouseEvent) => {
    const clickedThreadId =
      event.target instanceof Element
        ? event.target
            .closest("[data-sidebar-thread-id]")
            ?.getAttribute("data-sidebar-thread-id")
        : null;
    if (clickedThreadId !== threadId) return;
    event.preventDefault();
    event.stopPropagation();
    window.removeEventListener("click", suppress, true);
    window.clearTimeout(timeout);
  };
  window.addEventListener("click", suppress, true);
  timeout = window.setTimeout(
    () => window.removeEventListener("click", suppress, true),
    300,
  );
}

/**
 * Pointer and Alt+Arrow reordering for the two flat shelves. Folder members
 * are reordered by `useFolderDrag`; these are the ungrouped rows, whose order
 * is durable in the host (pinned) and in this plugin's `inbox_order` table.
 */
export function useShelfReorder({
  pinned,
  inbox,
}: {
  pinned: readonly PluginSidebarThread[];
  inbox: readonly PluginSidebarThread[];
}): ShelfReorderApi {
  const pinnedReorder = usePinnedReorder(pinned);
  const inboxReorder = useInboxReorder(inbox);
  const [dragOrder, setDragOrder] = useState<DragOrder | null>(null);
  const dragOrderRef = useRef<DragOrder | null>(null);
  dragOrderRef.current = dragOrder;
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  const orderedPinned = useMemo(
    () =>
      orderPinnedThreads(
        pinnedReorder.threads,
        dragOrder?.shelf === "pinned" ? dragOrder.ids : null,
      ),
    [dragOrder, pinnedReorder.threads],
  );
  const orderedInbox = useMemo(
    () =>
      orderPinnedThreads(
        inboxReorder.threads,
        dragOrder?.shelf === "inbox" ? dragOrder.ids : null,
      ),
    [dragOrder, inboxReorder.threads],
  );

  const persist = useCallback(
    (shelf: ShelfKind, visibleOrder: readonly string[], movingId: string) => {
      const target = shelf === "pinned" ? pinnedReorder : inboxReorder;
      const globalIds = mergeVisibleOrder(target.ids, visibleOrder);
      if (shelf === "pinned") {
        void pinnedReorder.reorder(globalIds, movingId);
      } else {
        void inboxReorder.reorder(globalIds);
      }
    },
    [inboxReorder, pinnedReorder],
  );

  const shelfControls = useCallback(
    (
      thread: PluginSidebarThread,
      shelf: ShelfKind,
      visibleIds: readonly string[],
    ): ThreadReorderControls => {
      const target = shelf === "pinned" ? pinnedReorder : inboxReorder;
      return {
        disabled: target.isReordering,
        isDragging:
          dragOrder?.shelf === shelf && dragOrder.movingId === thread.id,
        hasKeyboardReorder: true,
        onPointerDown: (event: ReactPointerEvent<HTMLAnchorElement>) => {
          if (target.isReordering || event.button !== 0) return;

          cancelRef.current?.();
          const pointerId = event.pointerId;
          const startX = event.clientX;
          const startY = event.clientY;
          const movingId = thread.id;
          const kind = pointerKind(event.pointerType);
          let engaged = false;
          let finished = false;
          let previousUserSelect = "";
          let previousCursor = "";
          // Touch: hold still first, otherwise the finger is scrolling.
          let held = false;
          let disarmHold: (() => void) | null = null;
          let unblockScroll: (() => void) | null = null;

          function cleanup() {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerCancel);
            window.removeEventListener("keydown", onKeyDown);
            disarmHold?.();
            disarmHold = null;
            unblockScroll?.();
            unblockScroll = null;
            if (engaged) {
              document.body.style.userSelect = previousUserSelect;
              document.body.style.cursor = previousCursor;
            }
            if (cancelRef.current === cancel) cancelRef.current = null;
          }

          function cancel() {
            if (finished) return;
            finished = true;
            cleanup();
            if (engaged) {
              dragOrderRef.current = null;
              setDragOrder(null);
            }
          }

          function engage() {
            if (engaged || finished) return;
            engaged = true;
            if (kind === "touch") {
              unblockScroll = blockTouchScroll();
              navigator.vibrate?.(10);
            }
            previousUserSelect = document.body.style.userSelect;
            previousCursor = document.body.style.cursor;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "grabbing";
            const next = { shelf, movingId, ids: [...visibleIds] };
            dragOrderRef.current = next;
            setDragOrder(next);
          }

          function reorderAt(clientX: number, clientY: number) {
            const hit = document.elementFromPoint(clientX, clientY);
            const row = hit instanceof Element ? hit.closest("li") : null;
            const targetId = row
              ?.querySelector<HTMLElement>("[data-sidebar-thread-id]")
              ?.getAttribute("data-sidebar-thread-id");
            const current = dragOrderRef.current;
            if (
              !row ||
              !targetId ||
              !visibleIds.includes(targetId) ||
              !current ||
              current.shelf !== shelf ||
              current.movingId === targetId
            ) {
              return;
            }
            const rect = row.getBoundingClientRect();
            const placement =
              clientY < rect.top + rect.height / 2 ? "before" : "after";
            const ids = movePinnedId(
              current.ids,
              current.movingId,
              targetId,
              placement,
            );
            const next = { ...current, ids };
            dragOrderRef.current = next;
            setDragOrder(next);
          }

          function onPointerMove(moveEvent: PointerEvent) {
            if (finished || moveEvent.pointerId !== pointerId) return;
            if (!engaged) {
              const deltaX = moveEvent.clientX - startX;
              const deltaY = moveEvent.clientY - startY;
              if (kind === "touch") {
                const outcome = unengagedMove(
                  kind,
                  Math.hypot(deltaX, deltaY),
                  held,
                );
                if (outcome === "wait") return;
                if (outcome === "abort") {
                  cancel();
                  return;
                }
              } else if (
                Math.abs(deltaY) < 6 ||
                Math.abs(deltaY) <= Math.abs(deltaX)
              ) {
                // A mostly horizontal drag is the host's split gesture.
                return;
              }
              engage();
            }
            moveEvent.preventDefault();
            reorderAt(moveEvent.clientX, moveEvent.clientY);
          }

          function onPointerUp(upEvent: PointerEvent) {
            if (finished || upEvent.pointerId !== pointerId) return;
            const current = dragOrderRef.current;
            finished = true;
            cleanup();
            // The folder drag runs first and marks the drop handled when it
            // owns it; roll the preview back instead of writing twice.
            if (upEvent.defaultPrevented) {
              if (engaged) {
                dragOrderRef.current = null;
                setDragOrder(null);
              }
              return;
            }
            if (!engaged || !current || current.shelf !== shelf) return;

            dragOrderRef.current = null;
            setDragOrder(null);
            suppressNextClick(current.movingId);
            persist(shelf, current.ids, current.movingId);
          }

          function onPointerCancel(cancelEvent: PointerEvent) {
            if (cancelEvent.pointerId === pointerId) cancel();
          }

          function onKeyDown(keyEvent: KeyboardEvent) {
            if (keyEvent.key === "Escape") cancel();
          }

          window.addEventListener("pointermove", onPointerMove, {
            passive: false,
          });
          window.addEventListener("pointerup", onPointerUp);
          window.addEventListener("pointercancel", onPointerCancel);
          window.addEventListener("keydown", onKeyDown);
          if (kind === "touch") {
            disarmHold = armTouchHold(() => {
              held = true;
              engage();
            });
          }
          cancelRef.current = cancel;
        },
        onKeyDown: (event: ReactKeyboardEvent<HTMLAnchorElement>) => {
          if (
            !event.altKey ||
            target.isReordering ||
            (event.key !== "ArrowUp" && event.key !== "ArrowDown")
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          persist(
            shelf,
            movePinnedIdByOffset(
              visibleIds,
              thread.id,
              event.key === "ArrowUp" ? -1 : 1,
            ),
            thread.id,
          );
        },
      };
    },
    [dragOrder, inboxReorder, persist, pinnedReorder],
  );

  const controlsFor = useCallback(
    (
      thread: PluginSidebarThread,
      shelf: ShelfKind,
      visibleIds: readonly string[],
      organizationControls: ThreadReorderControls,
    ): ThreadReorderControls => {
      const controls = shelfControls(thread, shelf, visibleIds);
      return {
        disabled: organizationControls.disabled || controls.disabled,
        isDragging: organizationControls.isDragging || controls.isDragging,
        hasKeyboardReorder: true,
        onPointerDown: (event) => {
          // Folder handling registers first so that when it consumes the drop
          // the shelf gesture sees `defaultPrevented` and rolls back.
          organizationControls.onPointerDown(event);
          controls.onPointerDown(event);
        },
        onKeyDown: (event) => {
          organizationControls.onKeyDown(event);
          if (!event.defaultPrevented) controls.onKeyDown(event);
        },
      };
    },
    [shelfControls],
  );

  return {
    pinned: orderedPinned,
    inbox: orderedInbox,
    isReordering: pinnedReorder.isReordering || inboxReorder.isReordering,
    controlsFor,
  };
}
