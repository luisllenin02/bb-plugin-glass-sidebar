import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeWorkflowActivityStore,
  readWorkflowActivity,
  workflowStorePath,
} from "./workflow-activity";

const tempRoots: string[] = [];
const openDatabase = (sourcePath: string) =>
  new Database(sourcePath, { readonly: true, fileMustExist: true });

function tempSidebarDbPath(): string {
  const root = mkdtempSync(join(tmpdir(), "glass-sidebar-workflow-"));
  tempRoots.push(root);
  return join(root, "plugins", "glass-sidebar", "data.db");
}

function createWorkflowDb(
  sidebarDbPath: string,
  withTable = true,
): Database.Database {
  const sourcePath = workflowStorePath(sidebarDbPath);
  mkdirSync(dirname(sourcePath), { recursive: true });
  const database = new Database(sourcePath);
  if (withTable) {
    database.exec(`CREATE TABLE workflow_runs (
      id TEXT PRIMARY KEY,
      origin_thread_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      phase TEXT,
      started_at INTEGER,
      created_at INTEGER NOT NULL
    )`);
  }
  return database;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true });
});

describe("workflow activity store", () => {
  it("derives the Workflows store from dataDir before the db.name fallback", () => {
    expect(workflowStorePath("/tmp/bb-data/plugins/glass-sidebar/data.db")).toBe(
      "/tmp/bb-data/plugins/workflows/data.db",
    );
    expect(
      workflowStorePath(
        "/wrong/plugins/glass-sidebar/data.db",
        "/tmp/bb-data",
      ),
    ).toBe("/tmp/bb-data/plugins/workflows/data.db");
  });

  it("returns only running and queued runs from a read-only cached query", () => {
    const sidebarDbPath = tempSidebarDbPath();
    const database = createWorkflowDb(sidebarDbPath);
    const insert = database.prepare(
      `INSERT INTO workflow_runs
         (id, origin_thread_id, name, status, phase, started_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run("run_running", "thr_origin", "Sidebar", "running", "Produce 2/3", 100, 90);
    insert.run("run_queued", "thr_origin", "Review", "queued", null, null, 110);
    insert.run("run_done", "thr_origin", "Done", "succeeded", null, 80, 70);

    const sourcePath = workflowStorePath(sidebarDbPath);
    expect(readWorkflowActivity(sourcePath, openDatabase, 500)).toEqual({
      runs: [
        {
          id: "run_running",
          originThreadId: "thr_origin",
          name: "Sidebar",
          status: "running",
          phase: "Produce 2/3",
          startedAt: 100,
        },
        {
          id: "run_queued",
          originThreadId: "thr_origin",
          name: "Review",
          status: "queued",
          phase: null,
          startedAt: 110,
        },
      ],
      updatedAt: 500,
      sourcePath,
      sourceStatus: "ok",
    });

    database.prepare("UPDATE workflow_runs SET status = 'succeeded' WHERE id = ?").run("run_running");
    expect(readWorkflowActivity(sourcePath, openDatabase, 600).runs.map((run) => run.id)).toEqual([
      "run_queued",
    ]);
    database.close();
    closeWorkflowActivityStore(sidebarDbPath);
  });

  it("reopens the store when the sibling plugin replaces the file", () => {
    const sidebarDbPath = tempSidebarDbPath();
    const sourcePath = workflowStorePath(sidebarDbPath);
    const insertSql = `INSERT INTO workflow_runs
         (id, origin_thread_id, name, status, phase, started_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const first = createWorkflowDb(sidebarDbPath);
    first.prepare(insertSql).run("run_old", "thr_old", "Old", "running", null, 10, 10);
    expect(
      readWorkflowActivity(sourcePath, openDatabase, 100).runs.map((run) => run.id),
    ).toEqual(["run_old"]);
    first.close();

    // A reinstall or a restore leaves the path in place. The cached handle
    // holds the unlinked file open, so it must be dropped on the next read.
    rmSync(sourcePath);
    const second = createWorkflowDb(sidebarDbPath);
    second.prepare(insertSql).run("run_new", "thr_new", "New", "queued", null, 20, 20);

    expect(
      readWorkflowActivity(sourcePath, openDatabase, 200).runs.map((run) => run.id),
    ).toEqual(["run_new"]);
    second.close();
    closeWorkflowActivityStore(sidebarDbPath);
  });

  it("reports a missing file separately from a broken schema", () => {
    const sidebarDbPath = tempSidebarDbPath();
    const sourcePath = workflowStorePath(sidebarDbPath);
    expect(readWorkflowActivity(sourcePath, openDatabase, 700)).toEqual({
      runs: [],
      updatedAt: 700,
      sourcePath,
      sourceStatus: "missing",
    });

    const database = createWorkflowDb(sidebarDbPath, false);
    database.close();
    const warn = vi.fn();
    expect(readWorkflowActivity(sourcePath, openDatabase, 800, warn)).toEqual({
      runs: [],
      updatedAt: 800,
      sourcePath,
      sourceStatus: "error",
    });
    readWorkflowActivity(sourcePath, openDatabase, 900, warn);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
