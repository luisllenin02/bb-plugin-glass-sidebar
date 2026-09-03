import type {
  PluginSidebarThread,
  PluginSidebarThreadIndicator,
} from "@get-bb/plugin-sdk/app";
import { threadDisplayTitle } from "./inbox";
import { classifyNow } from "./live-strip";
import type { SplitPaneEntry } from "./split-registry";
import type { WorkflowRun } from "./workflow-activity-shared";

export interface ColumnViewModel {
  threadId: string;
  ordinal: number;
  isFocused: boolean;
  title: string;
  /** Project id consumed by the existing ProjectGlyph/decor lookup. */
  projectGlyph: string | null;
  projectAccent: string | undefined;
  /** Indicator consumed by the existing StatusGlyph component. */
  statusGlyph: PluginSidebarThreadIndicator;
  /** Thread activity timestamp; the view formats it with its shared minute clock. */
  elapsed: number;
  workflowRows: WorkflowRun[];
}

function statusGlyphFor(
  thread: PluginSidebarThread | undefined,
): PluginSidebarThreadIndicator {
  if (!thread) return "none";
  if (classifyNow(thread) === "needs-you") return thread.indicator;
  if (thread.activity.workflows > 0) return "workflow";
  switch (thread.indicator) {
    case "runtime":
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "working-draft":
      return thread.indicator;
  }
  if (thread.activity.backgroundAgents > 0) return "background-agent";
  if (thread.activity.backgroundCommands > 0) return "background-command";
  if (thread.activity.planMode > 0) return "plan-mode";
  if (thread.activity.goals > 0) return "goal";
  return classifyNow(thread) === "working" ? "runtime" : thread.indicator;
}

/**
 * The workflow snapshot exposes scheduler state only (`queued` / `running`).
 * Neither state proves that the run needs user attention, so preserve the
 * authoritative snapshot order until Q3 supplies an explicit indicator.
 */
function orderWorkflowRows(rows: readonly WorkflowRun[]): WorkflowRun[] {
  return [...rows];
}

/** Build the metadata-only session columns from Q3's existing snapshots. */
export function buildColumns(
  panes: readonly SplitPaneEntry[],
  threads: readonly PluginSidebarThread[],
  workflowRows: readonly WorkflowRun[],
  accentFor: (thread: PluginSidebarThread) => string | undefined,
): ColumnViewModel[] {
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  const workflowsByThread = new Map<string, WorkflowRun[]>();
  for (const row of workflowRows) {
    const rows = workflowsByThread.get(row.originThreadId) ?? [];
    rows.push(row);
    workflowsByThread.set(row.originThreadId, rows);
  }

  return [...panes]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((pane) => {
      const thread = threadById.get(pane.threadId);
      return {
        threadId: pane.threadId,
        ordinal: pane.ordinal,
        isFocused: pane.isFocused,
        title: thread ? threadDisplayTitle(thread) : "Untitled thread",
        projectGlyph: thread?.projectId ?? null,
        projectAccent: thread ? accentFor(thread) : undefined,
        statusGlyph: statusGlyphFor(thread),
        elapsed: thread?.updatedAt ?? 0,
        workflowRows: orderWorkflowRows(
          workflowsByThread.get(pane.threadId) ?? [],
        ),
      } satisfies ColumnViewModel;
    });
}
