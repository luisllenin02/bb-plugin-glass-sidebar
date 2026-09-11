import type BetterSqlite3 from "better-sqlite3";
import type { ProjectIconColorName } from "./accent";

type Database = BetterSqlite3.Database;

export type ProjectDecorSource = "manual" | "auto";

export interface StoredProjectDecor {
  projectId: string;
  icon: string | null;
  color: ProjectIconColorName | null;
  source: ProjectDecorSource;
  updatedAt: number;
}

export interface ProjectDecorStore {
  list(): StoredProjectDecor[];
  get(projectId: string): StoredProjectDecor | null;
  /** Batch read, chunked under SQLite's variable limit, keyed by project id. */
  getMany(projectIds: readonly string[]): Map<string, StoredProjectDecor>;
  set(entry: Pick<StoredProjectDecor, "projectId" | "icon" | "color">): void;
  upsertAuto(
    entry: Pick<StoredProjectDecor, "projectId" | "icon" | "color">,
  ): boolean;
  clear(projectId: string): boolean;
  clearManual(projectId: string): boolean;
}

export function createProjectDecorStore(db: Database): ProjectDecorStore {
  const listRows = db.prepare(`
    SELECT project_id, icon, color, source, updated_at
    FROM project_decor
    ORDER BY project_id
  `);
  const getRow = db.prepare(`
    SELECT project_id, icon, color, source, updated_at
    FROM project_decor
    WHERE project_id = ?
  `);
  const upsertManualRow = db.prepare(`
    INSERT INTO project_decor(project_id, icon, color, source, updated_at)
    VALUES (?, ?, ?, 'manual', ?)
    ON CONFLICT(project_id) DO UPDATE SET
      icon = excluded.icon,
      color = excluded.color,
      source = 'manual',
      updated_at = excluded.updated_at
  `);
  const upsertAutoRow = db.prepare(`
    INSERT INTO project_decor(project_id, icon, color, source, updated_at)
    VALUES (?, ?, ?, 'auto', ?)
    ON CONFLICT(project_id) DO UPDATE SET
      icon = excluded.icon,
      color = excluded.color,
      source = 'auto',
      updated_at = excluded.updated_at
    WHERE project_decor.source = 'auto'
      AND (project_decor.icon IS NOT excluded.icon
        OR project_decor.color IS NOT excluded.color)
  `);
  const deleteRow = db.prepare("DELETE FROM project_decor WHERE project_id = ?");
  const deleteManualRow = db.prepare(
    "DELETE FROM project_decor WHERE project_id = ? AND source = 'manual'",
  );

  type StoredRow = {
    project_id: string;
    icon: string | null;
    color: ProjectIconColorName | null;
    source: ProjectDecorSource;
    updated_at: number;
  };
  const fromRow = (row: StoredRow): StoredProjectDecor => ({
    projectId: row.project_id,
    icon: row.icon,
    color: row.color,
    source: row.source,
    updatedAt: row.updated_at,
  });

  // `IN (…)` placeholders are sized to the chunk, so cache one prepared
  // statement per distinct chunk length rather than re-preparing per call.
  const GET_MANY_CHUNK = 500;
  const getManyRowsByCount = new Map<number, BetterSqlite3.Statement<unknown[]>>();
  const getManyRows = (count: number): BetterSqlite3.Statement<unknown[]> => {
    let statement = getManyRowsByCount.get(count);
    if (!statement) {
      const placeholders = Array.from({ length: count }, () => "?").join(",");
      statement = db.prepare(`
        SELECT project_id, icon, color, source, updated_at
        FROM project_decor
        WHERE project_id IN (${placeholders})
      `);
      getManyRowsByCount.set(count, statement);
    }
    return statement;
  };

  return {
    list: () => (listRows.all() as StoredRow[]).map(fromRow),
    get(projectId) {
      const row = getRow.get(projectId) as StoredRow | undefined;
      return row ? fromRow(row) : null;
    },
    getMany(projectIds) {
      const result = new Map<string, StoredProjectDecor>();
      const ids = [...projectIds];
      for (let offset = 0; offset < ids.length; offset += GET_MANY_CHUNK) {
        const chunk = ids.slice(offset, offset + GET_MANY_CHUNK);
        const rows = getManyRows(chunk.length).all(...chunk) as StoredRow[];
        for (const row of rows) result.set(row.project_id, fromRow(row));
      }
      return result;
    },
    set({ projectId, icon, color }) {
      upsertManualRow.run(projectId, icon, color, Date.now());
    },
    upsertAuto({ projectId, icon, color }) {
      return upsertAutoRow.run(projectId, icon, color, Date.now()).changes > 0;
    },
    clear(projectId) {
      return deleteRow.run(projectId).changes > 0;
    },
    clearManual(projectId) {
      return deleteManualRow.run(projectId).changes > 0;
    },
  };
}
