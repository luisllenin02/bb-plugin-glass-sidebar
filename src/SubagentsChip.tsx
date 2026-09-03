import { useState } from "react";
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

const MAX_DISCS = 3;

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

  const tree = buildRelatedThreadTree(threads, threadId);
  if (tree.length === 0) return null;

  const related = flattenRelatedThreadTree(tree);
  const needsYou = related.some((node) => node.thread.hasPendingInteraction);
  const label = needsYou ? "Needs you" : `${related.length} children`;

  const openAllInSplit = () => {
    for (const node of related) {
      actions.open(node.thread.id, { split: true });
    }
    setOpen(false);
  };

  return (
    <span className="relative">
      <Tooltip label={`${related.length} child threads`} side="bottom">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${related.length} child threads`}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border px-2 text-2xs text-muted-foreground",
            "hover:bg-accent hover:text-foreground",
            open && "bg-accent text-foreground",
          )}
          data-glass-sidebar-child-action=""
        >
          <DiscCluster threads={related.map((node) => node.thread)} />
          {isCompactViewport ? null : (
            <span className="min-w-0 truncate">{label}</span>
          )}
        </button>
      </Tooltip>
      {open ? (
        <>
          <span
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            aria-label="Child threads"
            className="absolute right-0 top-9 z-50 w-96 max-w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
          >
            <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
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
              className="flex max-h-[min(70vh,36rem)] flex-col gap-px overflow-y-auto p-1.5 pt-0.5"
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
        </>
      ) : null}
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
