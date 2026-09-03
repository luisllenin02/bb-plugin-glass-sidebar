import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type Database from "better-sqlite3";
import { PROJECT_ICON_COLOR_NAMES } from "./accent";
import {
  legacyLifecycleColumns,
  type ThreadLifecycleRow,
} from "./lifecycle";

export const IMPORT_TABLES = [
  "thread_folders",
  "folder_members",
  "thread_accents",
  "project_accents",
  "inbox_order",
  "project_icons",
  "project_icon_uploads",
  "sidebar_settings",
  "thread_lifecycle",
  "project_decor",
] as const;

export type ImportTableName = (typeof IMPORT_TABLES)[number];

export interface ImportTableStats {
  read: number;
  inserted: number;
  skipped: number;
}

export interface ImportSourceStatus {
  id: "bb-sidebar" | "project-icons";
  path: string;
  status: "ok" | "missing";
}

export interface ImportReport {
  dryRun: boolean;
  force: boolean;
  dataDir: string;
  sources: ImportSourceStatus[];
  tables: Record<ImportTableName, ImportTableStats>;
  warnings: string[];
}

export interface ImportOptions {
  destination: Database.Database;
  dataDir: string;
  dryRun?: boolean;
  force?: boolean;
  now?: number;
}

type Row = Record<string, unknown>;
type ReadonlyDatabaseConstructor = new (
  filename: string,
  options: { readonly: true; fileMustExist: true },
) => Database.Database;

const CUSTOM_HEX = /^#[0-9a-fA-F]{6}$/;
const PROJECT_ICON_COLORS = new Set<string>(PROJECT_ICON_COLOR_NAMES);

function emptyTables(): Record<ImportTableName, ImportTableStats> {
  return Object.fromEntries(
    IMPORT_TABLES.map((table) => [
      table,
      { read: 0, inserted: 0, skipped: 0 },
    ]),
  ) as Record<ImportTableName, ImportTableStats>;
}

/**
 * Prefer the server's authoritative data directory. The fallback mirrors the
 * sibling-store readers: `<dataDir>/plugins/<plugin>/data.db` is three dirname
 * calls above this plugin's own database file.
 */
export function importDataDir(
  destinationDbPath: string,
  experimentalDataDir?: string,
  override?: string,
): string {
  if (override?.trim()) return resolve(override.trim());
  if (experimentalDataDir?.trim()) return resolve(experimentalDataDir.trim());
  return dirname(dirname(dirname(resolve(destinationDbPath))));
}

export function importSourcePaths(dataDir: string): {
  sidebar: string;
  projectIcons: string;
} {
  return {
    sidebar: join(dataDir, "plugins", "bb-sidebar", "data.db"),
    projectIcons: join(dataDir, "plugins", "project-icons", "data.db"),
  };
}

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(table),
  );
}

function tableColumns(db: Database.Database, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || isInteger(value);
}

function isColorIndex(value: unknown): value is number {
  return isInteger(value) && value >= 0 && value <= 8;
}

function isCustomColor(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && CUSTOM_HEX.test(value));
}

function sourceRows(
  source: Database.Database,
  sourceTable: string,
  select: string,
  destinationTable: ImportTableName,
  report: ImportReport,
): Row[] | null {
  if (!tableExists(source, sourceTable)) {
    report.warnings.push(
      `${destinationTable}: source table ${sourceTable} is missing`,
    );
    return null;
  }
  const rows = source.prepare(select).all() as Row[];
  report.tables[destinationTable].read += rows.length;
  return rows;
}

function skip(
  report: ImportReport,
  table: ImportTableName,
  identity: unknown,
  reason: string,
): void {
  report.tables[table].skipped += 1;
  report.warnings.push(`${table} ${String(identity)}: ${reason}`);
}

function createWriter(
  destination: Database.Database,
  report: ImportReport,
  table: ImportTableName,
  existsSql: string,
  insertSql: string,
  forceSql: string,
): (identity: unknown, parameters: unknown[]) => void {
  const findExisting = destination.prepare(existsSql);
  const write = destination.prepare(report.force ? forceSql : insertSql);
  return (identity, parameters) => {
    if (report.dryRun) {
      const existing = findExisting.get(identity);
      if (existing && !report.force) report.tables[table].skipped += 1;
      else report.tables[table].inserted += 1;
      return;
    }
    const result = write.run(...parameters);
    if (result.changes > 0) report.tables[table].inserted += 1;
    else report.tables[table].skipped += 1;
  };
}

function importSidebarStore(
  source: Database.Database,
  destination: Database.Database,
  report: ImportReport,
  now: number,
): void {
  const folderRows = sourceRows(
    source,
    "thread_folders",
    `SELECT id, name, color_index, custom_color, collapsed, sort_index, created_at
       FROM thread_folders ORDER BY sort_index, id`,
    "thread_folders",
    report,
  );
  const prospectiveFolderIds = new Set(
    (destination.prepare(`SELECT id FROM thread_folders`).all() as Array<{ id: string }>).map(
      (row) => row.id,
    ),
  );
  if (folderRows) {
    const write = createWriter(
      destination,
      report,
      "thread_folders",
      `SELECT 1 FROM thread_folders WHERE id = ?`,
      `INSERT INTO thread_folders
         (id, name, color_index, custom_color, collapsed, sort_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      `INSERT INTO thread_folders
         (id, name, color_index, custom_color, collapsed, sort_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         color_index = excluded.color_index,
         custom_color = excluded.custom_color,
         collapsed = excluded.collapsed,
         sort_index = excluded.sort_index,
         created_at = excluded.created_at`,
    );
    for (const row of folderRows) {
      if (
        !isNonEmptyString(row.id) ||
        !isNonEmptyString(row.name) ||
        row.name.trim().length > 80 ||
        !isColorIndex(row.color_index) ||
        !isCustomColor(row.custom_color) ||
        (row.collapsed !== 0 && row.collapsed !== 1) ||
        !isInteger(row.sort_index) ||
        row.sort_index < 0 ||
        !isInteger(row.created_at)
      ) {
        skip(report, "thread_folders", row.id, "invalid folder row");
        continue;
      }
      prospectiveFolderIds.add(row.id);
      write(row.id, [
        row.id,
        row.name.trim(),
        row.color_index,
        row.custom_color,
        row.collapsed,
        row.sort_index,
        row.created_at,
      ]);
    }
  }

  const memberRows = sourceRows(
    source,
    "folder_members",
    `SELECT thread_id, folder_id, sort_index
       FROM folder_members ORDER BY folder_id, sort_index, thread_id`,
    "folder_members",
    report,
  );
  if (memberRows) {
    const write = createWriter(
      destination,
      report,
      "folder_members",
      `SELECT 1 FROM folder_members WHERE thread_id = ?`,
      `INSERT INTO folder_members (thread_id, folder_id, sort_index)
       VALUES (?, ?, ?)
       ON CONFLICT(thread_id) DO NOTHING`,
      `INSERT INTO folder_members (thread_id, folder_id, sort_index)
       VALUES (?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET
         folder_id = excluded.folder_id, sort_index = excluded.sort_index`,
    );
    for (const row of memberRows) {
      if (
        !isNonEmptyString(row.thread_id) ||
        !isNonEmptyString(row.folder_id) ||
        !isInteger(row.sort_index) ||
        row.sort_index < 0
      ) {
        skip(report, "folder_members", row.thread_id, "invalid membership row");
        continue;
      }
      if (!prospectiveFolderIds.has(row.folder_id)) {
        skip(
          report,
          "folder_members",
          row.thread_id,
          `unknown folder id ${row.folder_id}`,
        );
        continue;
      }
      write(row.thread_id, [row.thread_id, row.folder_id, row.sort_index]);
    }
  }

  for (const table of ["thread_accents", "project_accents"] as const) {
    const owner = table === "thread_accents" ? "thread_id" : "project_id";
    const rows = sourceRows(
      source,
      table,
      `SELECT ${owner}, color_index, custom_color FROM ${table}`,
      table,
      report,
    );
    if (!rows) continue;
    const write = createWriter(
      destination,
      report,
      table,
      `SELECT 1 FROM ${table} WHERE ${owner} = ?`,
      `INSERT INTO ${table} (${owner}, color_index, custom_color)
       VALUES (?, ?, ?)
       ON CONFLICT(${owner}) DO NOTHING`,
      `INSERT INTO ${table} (${owner}, color_index, custom_color)
       VALUES (?, ?, ?)
       ON CONFLICT(${owner}) DO UPDATE SET
         color_index = excluded.color_index,
         custom_color = excluded.custom_color`,
    );
    for (const row of rows) {
      const id = row[owner];
      if (
        !isNonEmptyString(id) ||
        !isColorIndex(row.color_index) ||
        !isCustomColor(row.custom_color)
      ) {
        skip(report, table, id, "invalid accent colour");
        continue;
      }
      write(id, [id, row.color_index, row.custom_color]);
    }
  }

  const inboxRows = sourceRows(
    source,
    "inbox_order",
    `SELECT thread_id, sort_index FROM inbox_order ORDER BY sort_index, thread_id`,
    "inbox_order",
    report,
  );
  if (inboxRows) {
    const write = createWriter(
      destination,
      report,
      "inbox_order",
      `SELECT 1 FROM inbox_order WHERE thread_id = ?`,
      `INSERT INTO inbox_order (thread_id, sort_index) VALUES (?, ?)
       ON CONFLICT(thread_id) DO NOTHING`,
      `INSERT INTO inbox_order (thread_id, sort_index) VALUES (?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET sort_index = excluded.sort_index`,
    );
    for (const row of inboxRows) {
      if (
        !isNonEmptyString(row.thread_id) ||
        !isInteger(row.sort_index) ||
        row.sort_index < 0
      ) {
        skip(report, "inbox_order", row.thread_id, "invalid order row");
        continue;
      }
      write(row.thread_id, [row.thread_id, row.sort_index]);
    }
  }

  const projectIconRows = sourceRows(
    source,
    "project_icons",
    `SELECT project_id, path, updated_at FROM project_icons`,
    "project_icons",
    report,
  );
  if (projectIconRows) {
    const write = createWriter(
      destination,
      report,
      "project_icons",
      `SELECT 1 FROM project_icons WHERE project_id = ?`,
      `INSERT INTO project_icons (project_id, path, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO NOTHING`,
      `INSERT INTO project_icons (project_id, path, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         path = excluded.path, updated_at = excluded.updated_at`,
    );
    for (const row of projectIconRows) {
      if (
        !isNonEmptyString(row.project_id) ||
        !isNonEmptyString(row.path) ||
        !isInteger(row.updated_at)
      ) {
        skip(report, "project_icons", row.project_id, "invalid project icon row");
        continue;
      }
      write(row.project_id, [row.project_id, row.path, row.updated_at]);
    }
  }

  const uploadRows = sourceRows(
    source,
    "project_icon_uploads",
    `SELECT project_id, filename, mime_type, content_base64,
            size_bytes, updated_at FROM project_icon_uploads`,
    "project_icon_uploads",
    report,
  );
  if (uploadRows) {
    const write = createWriter(
      destination,
      report,
      "project_icon_uploads",
      `SELECT 1 FROM project_icon_uploads WHERE project_id = ?`,
      `INSERT INTO project_icon_uploads
         (project_id, filename, mime_type, content_base64, size_bytes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO NOTHING`,
      `INSERT INTO project_icon_uploads
         (project_id, filename, mime_type, content_base64, size_bytes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         filename = excluded.filename,
         mime_type = excluded.mime_type,
         content_base64 = excluded.content_base64,
         size_bytes = excluded.size_bytes,
         updated_at = excluded.updated_at`,
    );
    for (const row of uploadRows) {
      if (
        !isNonEmptyString(row.project_id) ||
        !isNonEmptyString(row.filename) ||
        !isNonEmptyString(row.mime_type) ||
        typeof row.content_base64 !== "string" ||
        !isInteger(row.size_bytes) ||
        row.size_bytes < 0 ||
        !isInteger(row.updated_at)
      ) {
        skip(
          report,
          "project_icon_uploads",
          row.project_id,
          "invalid uploaded icon row",
        );
        continue;
      }
      write(row.project_id, [
        row.project_id,
        row.filename,
        row.mime_type,
        row.content_base64,
        row.size_bytes,
        row.updated_at,
      ]);
    }
  }

  if (tableExists(source, "sidebar_settings")) {
    const columns = tableColumns(source, "sidebar_settings");
    const autoProjectColours = columns.has("auto_project_colours")
      ? "auto_project_colours"
      : "1 AS auto_project_colours";
    const settingsRows = sourceRows(
      source,
      "sidebar_settings",
      `SELECT id, snooze_presets, inactive_threads_enabled,
              inactive_after_hours, auto_settle_inactive,
              auto_settle_after_days, auto_settle_on_merge,
              ${autoProjectColours}
         FROM sidebar_settings`,
      "sidebar_settings",
      report,
    );
    if (settingsRows) {
      const write = createWriter(
        destination,
        report,
        "sidebar_settings",
        `SELECT 1 FROM sidebar_settings WHERE id = ?`,
        `INSERT INTO sidebar_settings
           (id, snooze_presets, inactive_threads_enabled,
            inactive_after_hours, auto_settle_inactive,
            auto_settle_after_days, auto_settle_on_merge,
            auto_project_colours)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        `INSERT INTO sidebar_settings
           (id, snooze_presets, inactive_threads_enabled,
            inactive_after_hours, auto_settle_inactive,
            auto_settle_after_days, auto_settle_on_merge,
            auto_project_colours)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           snooze_presets = excluded.snooze_presets,
           inactive_threads_enabled = excluded.inactive_threads_enabled,
           inactive_after_hours = excluded.inactive_after_hours,
           auto_settle_inactive = excluded.auto_settle_inactive,
           auto_settle_after_days = excluded.auto_settle_after_days,
           auto_settle_on_merge = excluded.auto_settle_on_merge,
           auto_project_colours = excluded.auto_project_colours`,
      );
      for (const row of settingsRows) {
        if (
          row.id !== 1 ||
          !isNonEmptyString(row.snooze_presets) ||
          !isInteger(row.inactive_threads_enabled) ||
          !isInteger(row.inactive_after_hours) ||
          !isInteger(row.auto_settle_inactive) ||
          !isInteger(row.auto_settle_after_days) ||
          !isInteger(row.auto_settle_on_merge) ||
          !isInteger(row.auto_project_colours)
        ) {
          skip(report, "sidebar_settings", row.id, "invalid settings row");
          continue;
        }
        write(row.id, [
          row.id,
          row.snooze_presets,
          row.inactive_threads_enabled,
          row.inactive_after_hours,
          row.auto_settle_inactive,
          row.auto_settle_after_days,
          row.auto_settle_on_merge,
          row.auto_project_colours,
        ]);
      }
    }
  } else {
    report.warnings.push(
      "sidebar_settings: source table sidebar_settings is missing",
    );
  }

  const lifecycleRows = sourceRows(
    source,
    "thread_lifecycle",
    `SELECT thread_id, settled_at, settled_override,
            snoozed_until, snoozed_at FROM thread_lifecycle`,
    "thread_lifecycle",
    report,
  );
  if (lifecycleRows) {
    const write = createWriter(
      destination,
      report,
      "thread_lifecycle",
      `SELECT 1 FROM thread_lifecycle WHERE thread_id = ?`,
      `INSERT INTO thread_lifecycle
         (thread_id, state, wake_at, updated_at, settled_at,
          settled_override, snoozed_until, snoozed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(thread_id) DO NOTHING`,
      `INSERT INTO thread_lifecycle
         (thread_id, state, wake_at, updated_at, settled_at,
          settled_override, snoozed_until, snoozed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET
         state = excluded.state,
         wake_at = excluded.wake_at,
         updated_at = excluded.updated_at,
         settled_at = excluded.settled_at,
         settled_override = excluded.settled_override,
         snoozed_until = excluded.snoozed_until,
         snoozed_at = excluded.snoozed_at`,
    );
    for (const row of lifecycleRows) {
      if (
        !isNonEmptyString(row.thread_id) ||
        !isNullableInteger(row.settled_at) ||
        (row.settled_override !== null &&
          row.settled_override !== "active" &&
          row.settled_override !== "settled") ||
        !isNullableInteger(row.snoozed_until) ||
        !isNullableInteger(row.snoozed_at)
      ) {
        skip(
          report,
          "thread_lifecycle",
          row.thread_id,
          "invalid lifecycle row",
        );
        continue;
      }
      const lifecycle: ThreadLifecycleRow = {
        threadId: row.thread_id,
        settledAt: row.settled_at,
        settledOverride: row.settled_override,
        snoozedUntil: row.snoozed_until,
        snoozedAt: row.snoozed_at,
      };
      const legacy = legacyLifecycleColumns(lifecycle, now);
      write(row.thread_id, [
        row.thread_id,
        legacy.state,
        legacy.wakeAt,
        legacy.updatedAt,
        row.settled_at,
        row.settled_override,
        row.snoozed_until,
        row.snoozed_at,
      ]);
    }
  }
}

function importProjectIconStore(
  source: Database.Database,
  destination: Database.Database,
  report: ImportReport,
  now: number,
): void {
  if (!tableExists(source, "project_icon")) {
    report.warnings.push("project_decor: source table project_icon is missing");
    return;
  }
  const columns = tableColumns(source, "project_icon");
  const sourceColumn = columns.has("source") ? "source" : "'manual' AS source";
  const updatedAtColumn = columns.has("updated_at")
    ? "updated_at"
    : "NULL AS updated_at";
  const rows = sourceRows(
    source,
    "project_icon",
    `SELECT project_id, icon, color, ${sourceColumn}, ${updatedAtColumn}
       FROM project_icon`,
    "project_decor",
    report,
  );
  if (!rows) return;
  const write = createWriter(
    destination,
    report,
    "project_decor",
    `SELECT 1 FROM project_decor WHERE project_id = ?`,
    `INSERT INTO project_decor
       (project_id, icon, color, source, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO NOTHING`,
    `INSERT INTO project_decor
       (project_id, icon, color, source, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       icon = excluded.icon,
       color = excluded.color,
       source = excluded.source,
       updated_at = excluded.updated_at`,
  );
  for (const row of rows) {
    if (
      !isNonEmptyString(row.project_id) ||
      !isNonEmptyString(row.icon) ||
      (row.color !== null &&
        (typeof row.color !== "string" || !PROJECT_ICON_COLORS.has(row.color))) ||
      (row.source !== "manual" && row.source !== "auto") ||
      (row.updated_at !== null && !isInteger(row.updated_at))
    ) {
      skip(report, "project_decor", row.project_id, "invalid project decor colour or row");
      continue;
    }
    write(row.project_id, [
      row.project_id,
      row.icon,
      row.color,
      row.source,
      row.updated_at ?? now,
    ]);
  }
}

export function importGlassSidebarData(options: ImportOptions): ImportReport {
  const dataDir = resolve(options.dataDir);
  const report: ImportReport = {
    dryRun: options.dryRun ?? false,
    force: options.force ?? false,
    dataDir,
    sources: [],
    tables: emptyTables(),
    warnings: [],
  };
  const now = options.now ?? Date.now();
  const paths = importSourcePaths(dataDir);
  const DatabaseConstructor = options.destination
    .constructor as unknown as ReadonlyDatabaseConstructor;

  const useSource = (
    id: ImportSourceStatus["id"],
    path: string,
    run: (source: Database.Database) => void,
  ) => {
    if (!existsSync(path)) {
      report.sources.push({ id, path, status: "missing" });
      return;
    }
    report.sources.push({ id, path, status: "ok" });
    const source = new DatabaseConstructor(path, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      run(source);
    } finally {
      source.close();
    }
  };

  const run = () => {
    useSource("bb-sidebar", paths.sidebar, (source) =>
      importSidebarStore(source, options.destination, report, now),
    );
    useSource("project-icons", paths.projectIcons, (source) =>
      importProjectIconStore(source, options.destination, report, now),
    );
  };
  if (report.dryRun) run();
  else options.destination.transaction(run)();
  return report;
}

export function changedImportTables(report: ImportReport): Set<ImportTableName> {
  return new Set(
    IMPORT_TABLES.filter((table) => report.tables[table].inserted > 0),
  );
}

export function formatImportReport(report: ImportReport): string {
  const lines = [
    `Glass Sidebar import${report.dryRun ? " dry-run" : ""}${report.force ? " (force)" : ""}`,
    `data directory: ${report.dataDir}`,
  ];
  for (const source of report.sources) {
    lines.push(
      `source ${source.id}: ${source.status === "missing" ? "missing " : ""}${source.path}`,
    );
  }
  lines.push("table                       read  inserted  skipped");
  for (const table of IMPORT_TABLES) {
    const values = report.tables[table];
    lines.push(
      `${table.padEnd(27)} ${String(values.read).padStart(4)}  ${String(values.inserted).padStart(8)}  ${String(values.skipped).padStart(7)}`,
    );
  }
  if (report.warnings.length > 0) {
    lines.push(`warnings: ${report.warnings.length}`);
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  return lines.join("\n");
}
