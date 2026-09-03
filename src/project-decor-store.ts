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

  return {
    list: () => (listRows.all() as StoredRow[]).map(fromRow),
    get(projectId) {
      const row = getRow.get(projectId) as StoredRow | undefined;
      return row ? fromRow(row) : null;
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
