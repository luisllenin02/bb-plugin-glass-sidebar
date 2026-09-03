import { useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { cn } from "./lib/utils";
import { AccentRail } from "./AccentRail";
import { Icon } from "./components/Icon";
import { Disc } from "./Disc";
import { PaneGlyph } from "./PaneGlyph";
import { RowContextMenu } from "./RowContextMenu";
import { StatusGlyph } from "./StatusGlyph";
import { WorkflowRunRow } from "./WorkflowRunRow";
import {
  resolvePaneState,
  rowRootClasses,
  rowTitleClass,
} from "./pane-state";
import {
  buildRelatedThreadTree,
  type RelatedThreadTreeNode,
} from "./related-thread-tree";
import { threadDisplayTitle } from "./inbox";
import type { WorkflowRun } from "./row-props";

export function RelatedThreadTree({
  threads,
  parentThreadId,
  workflowRuns = [],
  now = Date.now(),
  onOpen,
  ariaLabel = "Related child threads",
  className,
  projectIconsAvailable = false,
}: {
  threads: readonly PluginSidebarThread[];
  parentThreadId: string;
  workflowRuns?: readonly WorkflowRun[];
  now?: number;
  onOpen?: () => void;
  ariaLabel?: string;
  className?: string;
  projectIconsAvailable?: boolean;
}) {
  const tree = buildRelatedThreadTree(threads, parentThreadId);
  const parentRuns = workflowRuns.filter(
    (run) => run.originThreadId === parentThreadId,
  );
  if (tree.length === 0 && parentRuns.length === 0) return null;

  return (
    <ul
      role="tree"
      aria-label={ariaLabel}
      className={cn("flex flex-col gap-px", className)}
    >
      {parentRuns.map((run) => (
        <WorkflowRunRow
          key={`workflow:${run.id}`}
          run={run}
          now={now}
          onOpen={onOpen}
        />
      ))}
      {tree.map((node) => (
        <RelatedThreadNode
          key={node.thread.id}
          node={node}
          workflowRuns={workflowRuns}
          now={now}
          onOpen={onOpen}
          projectIconsAvailable={projectIconsAvailable}
        />
      ))}
    </ul>
  );
}

export function RelatedThreadNode({
  node,
  workflowRuns = [],
  now = Date.now(),
  onOpen,
  buttonRole,
  projectIconsAvailable = false,
}: {
  node: RelatedThreadTreeNode;
  workflowRuns?: readonly WorkflowRun[];
  now?: number;
  onOpen?: () => void;
  buttonRole?: "menuitem";
  projectIconsAvailable?: boolean;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(node.thread.id);
  const [expanded, setExpanded] = useState(true);
  const title = threadDisplayTitle(node.thread);
  const paneState = resolvePaneState(false, layout);
  const nodeRuns = workflowRuns.filter(
    (run) => run.originThreadId === node.thread.id,
  );
  const hasChildren = node.children.length > 0 || nodeRuns.length > 0;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div className="flex min-w-0 items-stretch gap-0.5">
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="relative z-10 flex w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Icon
              name={expanded ? "ChevronDown" : "ChevronRight"}
              className="size-3"
              aria-hidden
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <RowContextMenu
          thread={node.thread}
          projectIconsAvailable={projectIconsAvailable}
        >
          <button
            type="button"
            {...(buttonRole ? { role: buttonRole } : {})}
            aria-label={title}
            onPointerDown={splitProps.onPointerDown}
            onClick={() => {
              onOpen?.();
              actions.open(node.thread.id, { split: false });
            }}
            data-thread-pane-state={paneState}
            className={cn(
              "relative z-10 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground outline-none hover:text-foreground",
              rowRootClasses({
                state: paneState,
                hasAccent: false,
                isSelected: false,
              }),
            )}
          >
            <AccentRail state={paneState} />
            <Disc thread={node.thread} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn("truncate", rowTitleClass(paneState))}>
                {title}
              </span>
              <span className="truncate text-2xs text-muted-foreground/70">
                {node.thread.originKind ?? "thread"}
              </span>
            </span>
            {layout !== null ? <PaneGlyph panes={layout.panes} /> : null}
            <StatusGlyph
              indicator={node.thread.indicator}
              label={node.thread.indicatorLabel}
            />
          </button>
        </RowContextMenu>
      </div>
      {hasChildren && expanded ? (
        <ul
          role="group"
          className="ml-2 flex flex-col gap-px border-l border-border/60 pl-1.5"
        >
          {nodeRuns.map((run) => (
            <WorkflowRunRow
              key={`workflow:${run.id}`}
              run={run}
              now={now}
              onOpen={onOpen}
            />
          ))}
          {node.children.map((child) => (
            <RelatedThreadNode
              key={child.thread.id}
              node={child}
              workflowRuns={workflowRuns}
              now={now}
              onOpen={onOpen}
              buttonRole={buttonRole}
              projectIconsAvailable={projectIconsAvailable}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
