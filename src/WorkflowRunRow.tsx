import { experimental_useSidebarThreadActions as useSidebarThreadActions } from "@get-bb/plugin-sdk/app";
import { cn } from "./lib/utils";
import { relativeTimeLabel } from "./relative-time";
import { StatusGlyph } from "./StatusGlyph";
import type { WorkflowRun } from "./workflow-activity";

export function WorkflowRunRow({
  run,
  now,
  onOpen,
  className,
}: {
  run: WorkflowRun;
  now: number;
  onOpen?: () => void;
  className?: string;
}) {
  const actions = useSidebarThreadActions();
  const age = relativeTimeLabel(run.startedAt, now);
  const title = `workflow · ${run.name}`;

  return (
    <li role="treeitem">
      <div className="flex min-w-0 items-stretch gap-0.5">
        <span className="w-5 shrink-0" aria-hidden />
        <button
          type="button"
          data-workflow-run-id={run.id}
          aria-label={`${title}${run.phase ? `, ${run.phase}` : ""}, ${run.status}, ${age}`}
          onClick={() => {
            onOpen?.();
            actions.open(run.originThreadId);
          }}
          className={cn(
            "relative z-10 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground",
            className,
          )}
        >
          <StatusGlyph indicator="workflow" label="Workflow" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{title}</span>
            {run.phase ? (
              <span className="truncate text-2xs text-muted-foreground/70">
                {run.phase}
              </span>
            ) : null}
          </span>
          {run.status === "running" ? (
            <StatusGlyph indicator="runtime" label="Workflow running" />
          ) : (
            <span className="shrink-0 text-2xs text-muted-foreground">
              queued
            </span>
          )}
          <span className="shrink-0 tabular-nums text-2xs text-muted-foreground/70">
            {age}
          </span>
        </button>
      </div>
    </li>
  );
}
