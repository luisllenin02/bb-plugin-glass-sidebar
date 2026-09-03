import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import { useRef } from "react";
import { Icon } from "./components/Icon";
import { Tooltip } from "./components/Tooltip";
import { cn } from "./lib/utils";
import { Disc } from "./Disc";
import { parentOf, threadDisplayTitle } from "./inbox";
import { useCompactThreadHeaderControl } from "./useCompactThreadHeaderControl";

/**
 * The way back out of a child thread.
 *
 * The flat list hides a child while its parent is on screen, so opening a
 * child from the parent's header chip leaves the user with no route back. This
 * chip names the parent and opens it. The disc repeats the parent's colour
 * from the list, so the chip points at a thread the user can recognise.
 */
export function ParentChip({
  threadId,
  isCompactViewport,
}: PluginThreadHeaderActionProps) {
  const { threads } = useSidebarThreads();
  const actions = useSidebarThreadActions();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isCompactControl = useCompactThreadHeaderControl(
    buttonRef,
    isCompactViewport,
  );

  const parent = parentOf(threads, threadId);
  if (parent === null) return null;

  const title = threadDisplayTitle(parent);

  return (
    <Tooltip label={`Back to parent: ${title}`} side="bottom">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Back to parent: ${title}`}
        onClick={() => actions.open(parent.id)}
        className={cn(
          "flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border text-2xs text-muted-foreground",
          "hover:bg-accent hover:text-foreground",
          isCompactControl ? "px-1.5" : "px-2",
        )}
      >
        <Icon name="ChevronLeft" className="size-3 shrink-0" aria-hidden />
        <Disc thread={parent} />
        {isCompactControl ? null : <span className="truncate">{title}</span>}
      </button>
    </Tooltip>
  );
}
