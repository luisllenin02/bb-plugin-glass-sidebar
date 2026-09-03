import type Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WorkflowActivitySnapshot } from "./workflow-activity-shared";

export {
  WORKFLOW_ACTIVITY_REFRESH_MS,
  type WorkflowActivitySnapshot,
  type WorkflowRun,
} from "./workflow-activity-shared";

interface WorkflowRunDbRow {
  id: string;
  origin_thread_id: string;
  name: string;
  status: "queued" | "running";
  phase: string | null;
  started_at: number | null;
  created_at: number;
}

interface CachedWorkflowQuery {
  database: Database.Database;
  statement: Database.Statement<[], WorkflowRunDbRow>;
}

export type OpenSiblingDatabase = (sourcePath: string) => Database.Database;
export type SiblingStoreWarningSink = (message: string) => void;

const cachedQueries = new Map<string, CachedWorkflowQuery>();
const warnedSourcePaths = new Set<string>();

const ACTIVE_WORKFLOW_RUNS_SQL = `
  SELECT id, origin_thread_id, name, status, phase, started_at, created_at
    FROM workflow_runs
   WHERE status IN ('queued', 'running')
   ORDER BY COALESCE(started_at, created_at), created_at, id
`;

/** Resolve the Workflows store, falling back to the legacy db.name route. */
export function workflowStorePath(
  sidebarDbPath: string,
  dataDir?: string,
): string {
  if (dataDir) return join(dataDir, "plugins", "workflows", "data.db");
  return join(dirname(dirname(sidebarDbPath)), "workflows", "data.db");
}

function closeCachedQuery(sourcePath: string): void {
  const cached = cachedQueries.get(sourcePath);
  cachedQueries.delete(sourcePath);
  cached?.database.close();
}

export function closeWorkflowActivityStore(sidebarDbPath: string): void {
  closeCachedQuery(workflowStorePath(sidebarDbPath));
}

export function closeWorkflowActivitySource(sourcePath: string): void {
  closeCachedQuery(sourcePath);
}

function queryFor(
  sourcePath: string,
  openDatabase: OpenSiblingDatabase,
): CachedWorkflowQuery {
  const cached = cachedQueries.get(sourcePath);
  if (cached) return cached;

  const database = openDatabase(sourcePath);
  try {
    const query = {
      database,
      statement: database.prepare<[], WorkflowRunDbRow>(
        ACTIVE_WORKFLOW_RUNS_SQL,
      ),
    };
    cachedQueries.set(sourcePath, query);
    return query;
  } catch (error) {
    database.close();
    throw error;
  }
}

function warnReadFailure(
  sourcePath: string,
  error: unknown,
  warn: SiblingStoreWarningSink,
): void {
  if (warnedSourcePaths.has(sourcePath)) return;
  warnedSourcePaths.add(sourcePath);
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, " ")
    .trim();
  warn(`Unable to read sibling plugin store ${sourcePath}: ${message}`);
}

/**
 * Read the Workflows plugin's active runs without creating or mutating its
 * store. The prepared query is reused, but every RPC gets fresh rows.
 */
export function readWorkflowActivity(
  sourcePath: string,
  openDatabase: OpenSiblingDatabase,
  now = Date.now(),
  warn: SiblingStoreWarningSink = () => {},
): WorkflowActivitySnapshot {
  if (!existsSync(sourcePath)) {
    closeCachedQuery(sourcePath);
    return {
      runs: [],
      updatedAt: now,
      sourcePath,
      sourceStatus: "missing",
    };
  }
  try {
    const rows = queryFor(sourcePath, openDatabase).statement.all() as WorkflowRunDbRow[];
    return {
      runs: rows.map((row) => ({
        id: row.id,
        originThreadId: row.origin_thread_id,
        name: row.name,
        status: row.status,
        phase: row.phase,
        startedAt: row.started_at ?? row.created_at,
      })),
      updatedAt: now,
      sourcePath,
      sourceStatus: "ok",
    };
  } catch (error) {
    closeCachedQuery(sourcePath);
    warnReadFailure(sourcePath, error, warn);
    return {
      runs: [],
      updatedAt: now,
      sourcePath,
      sourceStatus: "error",
    };
  }
}
