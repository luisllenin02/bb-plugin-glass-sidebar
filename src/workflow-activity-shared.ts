import type { WorkflowRun as CanonicalWorkflowRun } from "./row-props";

export const WORKFLOW_ACTIVITY_REFRESH_MS = 60_000;

/** Q3 re-export of Q1's canonical cross-packet row type. */
export type WorkflowRun = CanonicalWorkflowRun;

export interface WorkflowActivitySnapshot {
  runs: WorkflowRun[];
  updatedAt: number;
  sourcePath: string;
  sourceStatus: SiblingStoreSourceStatus;
}

export type SiblingStoreSourceStatus = "ok" | "missing" | "error";
