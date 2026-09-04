import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginSidebarThread,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import { cn } from "./lib/utils";
import { Tooltip } from "./components/Tooltip";
import { Disc } from "./Disc";
import { RelatedThreadNode } from "./RelatedThreadTree";
import {
  buildRelatedThreadTree,
  flattenRelatedThreadTree,
} from "./related-thread-tree";
import { useCompactThreadHeaderControl } from "./useCompactThreadHeaderControl";
import { usePortalScopeProps } from "./lib/portal-scope";

const MAX_DISCS = 3;
const MENU_GUTTER = 8;
const MENU_MAX_WIDTH = 448;

interface MenuGeometry {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
}

/**
 * The home for child threads the flat list hides: a chip in the thread header
 * that opens an expandable view of the full descendant tree.
 *
 * This is deliberately the only child-thread header registration in the
 * maintained sidebar fork. Other sidebar replacements are kept disabled so
 * the host does not stack duplicate header actions.
 */
export function SubagentsChip({
  threadId,
  isCompactViewport,
}: PluginThreadHeaderActionProps) {
  const { threads } = useSidebarThreads();
  const actions = useSidebarThreadActions();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuGeometry, setMenuGeometry] = useState<MenuGeometry | null>(null);
  const portalScopeProps = usePortalScopeProps();
  const isCompactControl = useCompactThreadHeaderControl(
    rootRef,
    isCompactViewport,
  );

  const tree = buildRelatedThreadTree(threads, threadId);
  const related = flattenRelatedThreadTree(tree);
  const needsYou = related.some((node) => node.thread.hasPendingInteraction);
  const label = needsYou ? "Needs you" : `${related.length} children`;

  // Every hook runs before the chip decides whether it draws: a thread that
  // spawns its first child would otherwise change this component's hook count
  // between renders, which React refuses. The measuring effects below are
  // already gated on `open`, so nothing runs for a chip that draws nothing.
  const measureMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;

    const pane = trigger.closest<HTMLElement>("[data-split-pane-id]");
    const paneRect = pane?.getBoundingClientRect();
    const leftEdge = (paneRect?.left ?? 0) + MENU_GUTTER;
    const rightEdge = (paneRect?.right ?? window.innerWidth) - MENU_GUTTER;
    const availableWidth = Math.max(0, rightEdge - leftEdge);
    const width = Math.min(MENU_MAX_WIDTH, availableWidth);
    const top = Math.max(MENU_GUTTER, trigger.getBoundingClientRect().bottom + 6);

    setMenuGeometry({
      left: Math.max(leftEdge, rightEdge - width),
      maxHeight: Math.max(160, window.innerHeight - top - MENU_GUTTER),
      top,
      width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measureMenu();

    const trigger = triggerRef.current;
    const pane = trigger?.closest<HTMLElement>("[data-split-pane-id]");
    const observer =
      pane && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measureMenu)
        : null;
    if (observer && pane) observer.observe(pane);
    window.addEventListener("resize", measureMenu);
    document.addEventListener("scroll", measureMenu, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureMenu);
      document.removeEventListener("scroll", measureMenu, true);
    };
  }, [measureMenu, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (tree.length === 0) return null;

  const openAllInSplit = () => {
    for (const node of related) {
      actions.open(node.thread.id, { split: true });
    }
    setOpen(false);
  };

  return (
    <span ref={rootRef} className="relative">
      <Tooltip label={`${related.length} child threads`} side="bottom">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${related.length} child threads`}
          onClick={() => {
            if (!open) measureMenu();
            setOpen((value) => !value);
          }}
          ref={triggerRef}
          className={cn(
            "flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border px-2 text-2xs text-muted-foreground",
            "hover:bg-accent hover:text-foreground",
            open && "bg-accent text-foreground",
          )}
          data-glass-sidebar-child-action=""
        >
          <DiscCluster threads={related.map((node) => node.thread)} />
          {isCompactControl ? (
            <span className="shrink-0 tabular-nums">{related.length}</span>
          ) : (
            <span className="min-w-0 truncate">{label}</span>
          )}
        </button>
      </Tooltip>
      {open && menuGeometry && typeof document !== "undefined"
        ? createPortal(
          <>
          <span
            className="fixed inset-0 z-[80]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            aria-label="Child threads"
            {...portalScopeProps}
            style={{
              left: menuGeometry.left,
              maxHeight: menuGeometry.maxHeight,
              top: menuGeometry.top,
              width: menuGeometry.width,
            }}
            className="fixed z-[81] flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
          >
            <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-2.5">
              <span className="text-xs font-semibold">Children</span>
              <span className="text-2xs text-muted-foreground">
                {related.length}
              </span>
              <button
                type="button"
                onClick={openAllInSplit}
                className="ml-auto rounded-md px-1.5 py-1 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Open all in split
              </button>
            </div>
            <ul
              role="tree"
              aria-label="Related child threads"
              className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-1.5 pt-0.5"
            >
              {tree.map((node) => (
                <RelatedThreadNode
                  key={node.thread.id}
                  node={node}
                  onOpen={() => setOpen(false)}
                  buttonRole="menuitem"
                />
              ))}
            </ul>
          </div>
          </>,
          document.body,
        )
        : null}
    </span>
  );
}

function DiscCluster({ threads }: { threads: readonly PluginSidebarThread[] }) {
  const shown = threads.slice(0, MAX_DISCS);
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      {shown.map((thread, index) => (
        <span key={thread.id} className={cn(index > 0 && "-ml-1.5")}>
          <Disc thread={thread} />
        </span>
      ))}
      {threads.length > MAX_DISCS ? (
        <span className="-ml-1.5">
          <Disc thread={null} />
        </span>
      ) : null}
    </span>
  );
}
