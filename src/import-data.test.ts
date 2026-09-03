import Database from "better-sqlite3";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import plugin, { glassSidebarMigrations } from "../server";
import {
  IMPORT_TABLES,
  importGlassSidebarData,
  importSourcePaths,
} from "./import-data";
import {
  legacyLifecycleColumns,
  resolveShelf,
  type ThreadLifecycleRow,
} from "./lifecycle";

const NOW = 2_000_000_000_000;
const tempDirectories: string[] = [];
const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempDataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "glass-sidebar-import-"));
  tempDirectories.push(directory);
  return directory;
}

function migratedDestination(): Database.Database {
  const destination = new Database(":memory:");
  for (const migration of glassSidebarMigrations) destination.exec(migration);
  return destination;
}

function createForkStore(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const source = new Database(path);
  source.exec(`
    CREATE TABLE thread_lifecycle (
      thread_id TEXT PRIMARY KEY,
      settled_at INTEGER,
      snoozed_until INTEGER,
      snoozed_at INTEGER,
      settled_override TEXT
        CHECK (settled_override IN ('active', 'settled') OR settled_override IS NULL)
    );
    CREATE TABLE inbox_order (
      thread_id TEXT PRIMARY KEY,
      sort_index INTEGER NOT NULL
    );
    CREATE TABLE project_icons (
      project_id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE sidebar_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      snooze_presets TEXT NOT NULL,
      inactive_threads_enabled INTEGER NOT NULL,
      inactive_after_hours INTEGER NOT NULL,
      auto_settle_inactive INTEGER NOT NULL,
      auto_settle_after_days INTEGER NOT NULL,
      auto_settle_on_merge INTEGER NOT NULL,
      auto_project_colours INTEGER NOT NULL DEFAULT 1,
      link_project_icons_colour INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE project_icon_uploads (
      project_id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      content_base64 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE thread_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color_index INTEGER NOT NULL DEFAULT 0,
      custom_color TEXT,
      collapsed INTEGER NOT NULL DEFAULT 0,
      sort_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE folder_members (
      thread_id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      sort_index INTEGER NOT NULL
    );
    CREATE TABLE thread_accents (
      thread_id TEXT PRIMARY KEY,
      color_index INTEGER NOT NULL DEFAULT 0,
      custom_color TEXT
    );
    CREATE TABLE project_accents (
      project_id TEXT PRIMARY KEY,
      color_index INTEGER NOT NULL DEFAULT 0,
      custom_color TEXT
    );
  `);
  return source;
}

function createProjectIconsStore(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const source = new Database(path);
  source.exec(`
    CREATE TABLE project_icon (
      project_id TEXT PRIMARY KEY,
      icon TEXT NOT NULL,
      color TEXT,
      updated_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'auto'))
    );
  `);
  return source;
}

function seedFullSources(dataDir: string): void {
  const paths = importSourcePaths(dataDir);
  const sidebar = createForkStore(paths.sidebar);
  sidebar
    .prepare(
      `INSERT INTO thread_folders
       VALUES ('fld_one', 'One', 2, '#AABBCC', 0, 0, 100)`,
    )
    .run();
  sidebar
    .prepare(`INSERT INTO folder_members VALUES ('thr_one', 'fld_one', 0)`)
    .run();
  sidebar
    .prepare(`INSERT INTO thread_accents VALUES ('thr_one', 3, NULL)`)
    .run();
  sidebar
    .prepare(`INSERT INTO project_accents VALUES ('proj_one', 4, NULL)`)
    .run();
  sidebar.prepare(`INSERT INTO inbox_order VALUES ('thr_two', 0)`).run();
  sidebar
    .prepare(`INSERT INTO project_icons VALUES ('proj_one', 'favicon.svg', 101)`)
    .run();
  sidebar
    .prepare(
      `INSERT INTO project_icon_uploads
       VALUES ('proj_two', 'mark.svg', 'image/svg+xml', 'PHN2Zy8+', 6, 102)`,
    )
    .run();
  sidebar
    .prepare(
      `INSERT INTO sidebar_settings
       VALUES (1, '30m, 2h', 1, 24, 1, 7, 1, 0, 1)`,
    )
    .run();
  sidebar
    .prepare(
      `INSERT INTO thread_lifecycle
       VALUES ('thr_one', 103, NULL, NULL, 'settled')`,
    )
    .run();
  sidebar.close();

  const projectIcons = createProjectIconsStore(paths.projectIcons);
  projectIcons
    .prepare(
      `INSERT INTO project_icon
       VALUES ('proj_one', 'rocket', 'blue', 104, 'manual')`,
    )
    .run();
  projectIcons.close();
}

function insertedTotal(report: ReturnType<typeof importGlassSidebarData>): number {
  return IMPORT_TABLES.reduce(
    (total, table) => total + report.tables[table].inserted,
    0,
  );
}

describe("legacy data importer", () => {
  it("copies every real source table, is idempotent, and force overwrites", () => {
    const dataDir = tempDataDir();
    seedFullSources(dataDir);
    const destination = migratedDestination();

    const first = importGlassSidebarData({ destination, dataDir, now: NOW });
    expect(first.warnings).toEqual([]);
    for (const table of IMPORT_TABLES) {
      expect(first.tables[table]).toEqual({ read: 1, inserted: 1, skipped: 0 });
    }
    expect(
      destination.prepare(`SELECT name FROM thread_folders WHERE id = 'fld_one'`).get(),
    ).toEqual({ name: "One" });
    expect(
      destination
        .prepare(`SELECT icon, color, source, updated_at FROM project_decor`)
        .get(),
    ).toEqual({ icon: "rocket", color: "blue", source: "manual", updated_at: 104 });
    expect(
      destination
        .prepare(`SELECT state, wake_at, updated_at FROM thread_lifecycle`)
        .get(),
    ).toEqual({ state: "settled", wake_at: null, updated_at: NOW });

    const second = importGlassSidebarData({ destination, dataDir, now: NOW + 1 });
    expect(insertedTotal(second)).toBe(0);
    for (const table of IMPORT_TABLES) {
      expect(second.tables[table]).toEqual({ read: 1, inserted: 0, skipped: 1 });
    }

    const paths = importSourcePaths(dataDir);
    const source = new Database(paths.sidebar);
    source.prepare(`UPDATE thread_folders SET name = 'Renamed' WHERE id = 'fld_one'`).run();
    source.close();
    const forced = importGlassSidebarData({
      destination,
      dataDir,
      force: true,
      now: NOW + 2,
    });
    expect(insertedTotal(forced)).toBe(IMPORT_TABLES.length);
    expect(
      destination.prepare(`SELECT name FROM thread_folders WHERE id = 'fld_one'`).get(),
    ).toEqual({ name: "Renamed" });

    // The importer opened both sources read-only and left their rows intact.
    const sourceAfter = new Database(paths.sidebar, { readonly: true });
    expect(sourceAfter.prepare(`SELECT COUNT(*) AS count FROM thread_folders`).get()).toEqual({
      count: 1,
    });
    sourceAfter.close();
    destination.close();
  });

  it("reports a dry run without writing", () => {
    const dataDir = tempDataDir();
    seedFullSources(dataDir);
    const destination = migratedDestination();
    const report = importGlassSidebarData({
      destination,
      dataDir,
      dryRun: true,
      now: NOW,
    });
    expect(insertedTotal(report)).toBe(IMPORT_TABLES.length);
    expect(destination.prepare(`SELECT COUNT(*) AS count FROM thread_folders`).get()).toEqual({
      count: 0,
    });
    destination.close();
  });

  it("counts malformed colours and unknown folders instead of aborting", () => {
    const dataDir = tempDataDir();
    const { sidebar } = importSourcePaths(dataDir);
    mkdirSync(dirname(sidebar), { recursive: true });
    const source = new Database(sidebar);
    source.exec(`
      CREATE TABLE thread_folders (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, color_index INTEGER NOT NULL,
        custom_color TEXT, collapsed INTEGER NOT NULL, sort_index INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE folder_members (
        thread_id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, sort_index INTEGER NOT NULL
      );
      CREATE TABLE thread_accents (
        thread_id TEXT PRIMARY KEY, color_index INTEGER NOT NULL, custom_color TEXT
      );
    `);
    source.prepare(`INSERT INTO thread_folders VALUES ('fld_bad', 'Bad', 99, NULL, 0, 0, 1)`).run();
    source.prepare(`INSERT INTO folder_members VALUES ('thr_bad', 'fld_unknown', 0)`).run();
    source.prepare(`INSERT INTO thread_accents VALUES ('thr_bad', 1, 'red')`).run();
    source.close();

    const destination = migratedDestination();
    const report = importGlassSidebarData({ destination, dataDir, now: NOW });
    expect(report.tables.thread_folders).toEqual({ read: 1, inserted: 0, skipped: 1 });
    expect(report.tables.folder_members).toEqual({ read: 1, inserted: 0, skipped: 1 });
    expect(report.tables.thread_accents).toEqual({ read: 1, inserted: 0, skipped: 1 });
    expect(report.sources).toContainEqual({
      id: "project-icons",
      path: importSourcePaths(dataDir).projectIcons,
      status: "missing",
    });
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("invalid folder row"),
        expect.stringContaining("unknown folder id fld_unknown"),
        expect.stringContaining("invalid accent colour"),
        expect.stringContaining("source table inbox_order is missing"),
      ]),
    );
    destination.close();
  });
});

describe("import round-trip against the plugin's real migration list from empty", () => {
  it("fills all eight lifecycle columns and reproduces the source shelves", async () => {
    const dataDir = tempDataDir();
    const paths = importSourcePaths(dataDir);
    const sidebar = createForkStore(paths.sidebar);
    const futureWake = NOW + 60_000;
    sidebar
      .prepare(
        `INSERT INTO thread_lifecycle
         VALUES ('thr_settled', 100, NULL, NULL, 'settled')`,
      )
      .run();
    sidebar
      .prepare(
        `INSERT INTO thread_lifecycle
         VALUES ('thr_snoozed', NULL, ?, 200, NULL)`,
      )
      .run(futureWake);
    sidebar.close();
    const projectIcons = createProjectIconsStore(paths.projectIcons);
    projectIcons
      .prepare(
        `INSERT INTO project_icon
         VALUES ('proj_roundtrip', 'briefcase', 'blue', 300, 'auto')`,
      )
      .run();
    projectIcons.close();

    const { bb, harness } = createFakePluginHost({
      pluginId: "glass-sidebar",
      dataDir,
      sdk: {
        projects: { list: async () => [] },
        threads: { list: async () => [] },
      },
    });
    await plugin(bb);
    disposers.push(() => harness.lifecycle.dispose());
    const destination = bb.storage.database();
    expect(
      destination.prepare(`SELECT COUNT(*) AS count FROM project_decor`).get(),
    ).toEqual({ count: 0 });
    const report = importGlassSidebarData({ destination, dataDir, now: NOW });
    expect(report.tables.thread_lifecycle).toEqual({ read: 2, inserted: 2, skipped: 0 });
    expect(report.tables.project_decor).toEqual({ read: 1, inserted: 1, skipped: 0 });

    const rawRows = destination
      .prepare(
        `SELECT thread_id, state, wake_at, updated_at, settled_at,
                settled_override, snoozed_until, snoozed_at
           FROM thread_lifecycle ORDER BY thread_id`,
      )
      .all() as Array<Record<string, unknown>>;
    expect(rawRows).toHaveLength(2);
    for (const raw of rawRows) {
      const lifecycle = {
        threadId: raw.thread_id as string,
        settledAt: raw.settled_at as number | null,
        settledOverride: raw.settled_override as "active" | "settled" | null,
        snoozedUntil: raw.snoozed_until as number | null,
        snoozedAt: raw.snoozed_at as number | null,
      };
      expect({ state: raw.state, wakeAt: raw.wake_at, updatedAt: raw.updated_at }).toEqual(
        legacyLifecycleColumns(lifecycle, NOW),
      );
    }
    const listed = (await harness.behavior.callRpc("listLifecycle", {
      signals: [],
    })) as { rows: ThreadLifecycleRow[] };
    expect(
      listed.rows.map((row) =>
        resolveShelf(
          row,
          {
            hasPendingInteraction: false,
            isWorking: false,
            isUnread: false,
            latestAttentionAt: 0,
          },
          NOW,
        ),
      ),
    ).toEqual(["settled", "snoozed"]);
    expect(
      destination
        .prepare(`SELECT icon, color, source, updated_at FROM project_decor`)
        .get(),
    ).toEqual({ icon: "briefcase", color: "blue", source: "auto", updated_at: 300 });

    const second = importGlassSidebarData({ destination, dataDir, now: NOW + 1 });
    expect(insertedTotal(second)).toBe(0);
  });

  it("publishes each affected repaint channel once and none on the second run", async () => {
    const dataDir = tempDataDir();
    seedFullSources(dataDir);
    const { bb, harness } = createFakePluginHost({
      pluginId: "glass-sidebar",
      dataDir,
      sdk: {
        projects: { list: async () => [] },
        threads: { list: async () => [] },
      },
    });
    await plugin(bb);
    disposers.push(() => harness.lifecycle.dispose());

    const first = await harness.behavior.runCli(["import"]);
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toContain("thread_lifecycle");
    const expectedChannels = [
      "inbox-order",
      "lifecycle",
      "organization",
      "project-decor",
      "sidebar-settings",
    ];
    expect(
      harness.inspection.realtimeSignals
        .map((signal) => signal.channel)
        .filter((channel) => expectedChannels.includes(channel))
        .sort(),
    ).toEqual(expectedChannels);

    const signalCount = harness.inspection.realtimeSignals.length;
    const second = await harness.behavior.runCli(["import"]);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toMatch(/thread_lifecycle\s+1\s+0\s+1/);
    expect(harness.inspection.realtimeSignals).toHaveLength(signalCount);
  });

  it("preserves manual project decor from --from before first-start auto assignment", async () => {
    const dataDir = tempDataDir();
    const overrideDataDir = tempDataDir();
    const paths = importSourcePaths(overrideDataDir);
    const projectIcons = createProjectIconsStore(paths.projectIcons);
    projectIcons
      .prepare(
        `INSERT INTO project_icon
         VALUES ('proj_manual', 'scales', 'pink', 400, 'manual')`,
      )
      .run();
    projectIcons.close();
    const project = {
      id: "proj_manual",
      name: "Manual project",
      kind: "standard" as const,
      gitRemoteUrl: null,
      createdAt: 1,
      updatedAt: 1,
      sources: [
        {
          id: "source_manual",
          projectId: "proj_manual",
          type: "local_path" as const,
          hostId: "host_1",
          path: "/missing/manual-project",
          isDefault: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const { bb, harness } = createFakePluginHost({
      pluginId: "glass-sidebar",
      dataDir,
      sdk: {
        projects: { list: async () => [project] },
        threads: { list: async () => [] },
      },
    });
    await plugin(bb);
    disposers.push(() => harness.lifecycle.dispose());
    const destination = bb.storage.database();

    // No source exists under the host's default data dir. The completion
    // marker still holds reconciliation until an explicit --from import runs.
    expect(
      destination.prepare(`SELECT COUNT(*) AS count FROM project_decor`).get(),
    ).toEqual({ count: 0 });
    await expect(
      harness.behavior.runCli(["import", "--from", overrideDataDir]),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: expect.stringMatching(/project_decor\s+1\s+1\s+0/),
    });
    expect(
      destination
        .prepare(
          `SELECT icon, color, source, updated_at
             FROM project_decor WHERE project_id = 'proj_manual'`,
        )
        .get(),
    ).toEqual({
      icon: "scales",
      color: "pink",
      source: "manual",
      updated_at: 400,
    });
    expect(
      destination.prepare(`SELECT COUNT(*) AS count FROM legacy_import_state`).get(),
    ).toEqual({ count: 1 });
  });
});
