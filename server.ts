import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import type Database from "better-sqlite3";
import { z } from "zod";
import {
  DEFAULT_AUTO_SETTLE_AFTER_DAYS,
  decideAutoSettle,
  parseAutoSettleAfterDays,
  type AutoSettlePullRequest,
  type SettledOverride,
} from "./src/auto-settle";
import {
  LIFECYCLE_CHANNEL,
  legacyLifecycleColumns,
} from "./src/lifecycle";
import {
  INBOX_ORDER_CHANNEL,
  ORGANIZATION_CHANNEL,
  type Folder,
  type Organization,
} from "./src/organization";
import { PROJECT_ICON_COLOR_NAMES } from "./src/accent";
import {
  readTopLevelListing,
  reconcileProjectIcons,
  type AutoAssignmentProject,
  type AutoIconSuggestion,
} from "./src/auto-assign";
import { searchIcons, type CatalogEntry } from "./src/icon-search";
import { createProjectDecorStore } from "./src/project-decor-store";
import {
  closeWorkflowActivitySource,
  readWorkflowActivity,
  workflowStorePath,
} from "./src/workflow-activity";
import {
  PROJECT_ICON_CANDIDATES,
  PROJECT_ICONS_CHANNEL,
  extractProjectIconHref,
  iconPathsForHref,
  normalizeProjectIconPath,
} from "./src/project-icons";
import {
  DEFAULT_SIDEBAR_SETTINGS,
  SIDEBAR_SETTINGS_CHANNEL,
  type SidebarSettingsValues,
} from "./src/sidebar-settings";
import {
  changedImportTables,
  formatImportReport,
  importDataDir,
  importGlassSidebarData,
} from "./src/import-data";

const CLI_USAGE = `Usage:
  bb glass-sidebar import [--dry-run] [--force] [--from <dataDir>]
  bb glass-sidebar help`;

function parseImportArguments(argv: string[]):
  | {
      ok: true;
      options: { dryRun: boolean; force: boolean; from?: string };
    }
  | { ok: false; error: string } {
  let dryRun = false;
  let force = false;
  let from: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--force") {
      force = true;
    } else if (argument === "--from") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        return { ok: false, error: "--from requires a data directory" };
      }
      from = value;
      index += 1;
    } else {
      return { ok: false, error: `Unknown import option "${argument}"` };
    }
  }
  return { ok: true, options: { dryRun, force, ...(from ? { from } : {}) } };
}

const idSchema = z.string().trim().min(1);
const nameSchema = z.string().trim().min(1).max(80);
const colorIndexSchema = z.number().int().min(0).max(8);
const customColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable();
const accentSchema = z.object({
  colorIndex: colorIndexSchema,
  customColor: customColorSchema,
});
const folderSchema = accentSchema.extend({
  id: idSchema,
  name: nameSchema,
  collapsed: z.boolean(),
  sortIndex: z.number().int().nonnegative(),
  threadIds: z.array(idSchema),
});
const organizationSchema = z.object({
  folders: z.array(folderSchema),
  members: z.record(z.string(), z.string()),
  threadAccents: z.record(z.string(), accentSchema),
  projectAccents: z.record(z.string(), accentSchema),
});
const projectDecorSchema = z.object({
  icon: z.string().nullable(),
  iconColor: z.enum(PROJECT_ICON_COLOR_NAMES).nullable(),
  source: z.enum(["manual", "auto"]),
  autoReason: z.string().nullable(),
  autoKeywords: z.array(z.string()).max(3),
}).strict();
const glyphSchema = z
  .array(z.tuple([z.string(), z.record(z.string(), z.unknown())]))
  .readonly();
const catalogIconSchema = z
  .object({
    name: z.string(),
    export: z.string(),
    category: z.string(),
    tags: z.array(z.string()),
    glyph: glyphSchema,
  })
  .strict();
const okSchema = z.object({ ok: z.literal(true) });
const emptyInput = z.object({}).strict();
const orderedThreadIdsSchema = z
  .array(idSchema)
  .max(10_000)
  .superRefine((threadIds, context) => {
    if (new Set(threadIds).size !== threadIds.length) {
      context.addIssue({ code: "custom", message: "Thread ids must be unique" });
    }
  });
const workflowRunSchema = z
  .object({
    id: z.string(),
    originThreadId: z.string(),
    name: z.string(),
    status: z.enum(["queued", "running"]),
    phase: z.string().nullable(),
    startedAt: z.number().int().nonnegative(),
  })
  .strict();
const siblingStoreSourceStatusSchema = z.enum(["ok", "missing", "error"]);
const projectIconPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_000)
  .refine((path) => normalizeProjectIconPath(path) !== null, {
    message: "Choose a relative SVG, PNG, ICO, JPEG, GIF, AVIF, or WebP path",
  });
const uploadFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (filename) =>
      !filename.includes("/") &&
      !filename.includes("\\") &&
      normalizeProjectIconPath(filename) !== null,
    { message: "Choose a supported image file" },
  );
const iconBase64Schema = z
  .string()
  .min(1)
  .max(1_400_000)
  .regex(/^[A-Za-z0-9+/]*={0,2}$/, "Invalid image data");
const sidebarSettingsSchema = z
  .object({
    snoozePresets: z.string().trim().min(1).max(500),
    inactiveThreadsEnabled: z.boolean(),
    inactiveAfterHours: z.number().int().min(1).max(720),
    autoSettleInactive: z.boolean(),
    autoSettleAfterDays: z.number().int().min(1).max(90),
    autoSettleOnMerge: z.boolean(),
    autoProjectColours: z.boolean(),
  })
  .strict();
const threadIdInput = z.object({ threadId: idSchema }).strict();
const bulkThreadIdsSchema = z.array(idSchema).min(1).max(500);
const bulkMutationOutputSchema = z
  .object({
    succeededThreadIds: z.array(z.string()),
    failures: z.array(
      z.object({ threadId: z.string(), error: z.string() }).strict(),
    ),
  })
  .strict();
const lifecycleRowSchema = z
  .object({
    threadId: z.string(),
    settledAt: z.number().nullable(),
    settledOverride: z.enum(["active", "settled"]).nullable(),
    snoozedUntil: z.number().nullable(),
    snoozedAt: z.number().nullable(),
  })
  .strict();
/**
 * Live-work signals only the client can see. `bb.sdk.threads.list` reports a
 * session status but not workflow / background-agent / plan / goal counts or a
 * raised hand, and hiding a thread that is still working is the one failure
 * this feature cannot afford — so a thread the sidebar reports live is skipped
 * by the policy pass rather than settled.
 */
const activitySignalSchema = z
  .object({
    threadId: idSchema,
    hasPendingInteraction: z.boolean(),
    isWorking: z.boolean(),
  })
  .strict();

/**
 * One entry of a client's activity snapshot, reduced to the only question the
 * policy pass asks. `live: false` is as meaningful as `live: true`: it is the
 * signal that releases a thread the client reported live before.
 */
interface LiveSignal {
  threadId: string;
  live: boolean;
}

export const glassSidebarRpcContract = defineRpcContract({
  getWorkflowActivity: {
    input: emptyInput,
    output: z
      .object({
        runs: z.array(workflowRunSchema),
        updatedAt: z.number().int().nonnegative(),
        sourcePath: z.string(),
        sourceStatus: siblingStoreSourceStatusSchema,
      })
      .strict(),
  },
  getOrganization: { input: emptyInput, output: organizationSchema },
  getProjectDecor: {
    input: emptyInput,
    output: z
      .object({
        projects: z.record(z.string(), projectDecorSchema),
        updatedAt: z.number().int().nonnegative(),
      })
      .strict(),
  },
  getProjectGlyphs: {
    input: z
      .object({ projectIds: z.array(idSchema).max(200) })
      .strict(),
    output: z.object({ glyphs: z.record(z.string(), glyphSchema) }).strict(),
  },
  listIconCatalog: {
    input: z
      .object({
        query: z.string().max(100).optional().default(""),
        category: z.string().max(100).nullable().optional().default(null),
      })
      .strict(),
    output: z
      .object({ icons: z.array(catalogIconSchema).max(240), total: z.number().int() })
      .strict(),
  },
  setProjectDecorIcon: {
    input: z
      .object({
        projectId: idSchema,
        icon: z.string().trim().min(1).max(128),
        color: z.enum(PROJECT_ICON_COLOR_NAMES).nullable(),
      })
      .strict(),
    output: okSchema,
  },
  clearProjectDecorIcon: {
    input: z.object({ projectId: idSchema }).strict(),
    output: okSchema,
  },
  resetProjectDecorToAuto: {
    input: z.object({ projectId: idSchema }).strict(),
    output: okSchema,
  },
  redetectAllAutoIcons: {
    input: emptyInput,
    output: okSchema,
  },
  createFolder: {
    input: z.object({
      name: nameSchema,
      threadIds: z.array(idSchema).optional().default([]),
      colorIndex: colorIndexSchema.optional().default(0),
      customColor: customColorSchema.optional().default(null),
    }),
    output: z.object({ folder: folderSchema }),
  },
  renameFolder: {
    input: z.object({ folderId: idSchema, name: nameSchema }),
    output: okSchema,
  },
  setFolderColor: {
    input: z.object({
      folderId: idSchema,
      colorIndex: colorIndexSchema,
      customColor: customColorSchema,
    }),
    output: okSchema,
  },
  setFolderCollapsed: {
    input: z.object({ folderId: idSchema, collapsed: z.boolean() }),
    output: okSchema,
  },
  reorderFolders: {
    input: z.object({ folderIds: z.array(idSchema) }),
    output: okSchema,
  },
  deleteFolder: {
    input: z.object({ folderId: idSchema }),
    output: okSchema,
  },
  moveThreadToFolder: {
    input: z.object({
      threadId: idSchema,
      folderId: idSchema.nullable(),
      beforeThreadId: idSchema.nullable().optional().default(null),
    }),
    output: okSchema,
  },
  reorderFolderThreads: {
    input: z.object({ folderId: idSchema, threadIds: z.array(idSchema) }),
    output: okSchema,
  },
  setThreadAccent: {
    input: z.object({
      threadId: idSchema,
      colorIndex: colorIndexSchema,
      customColor: customColorSchema,
    }),
    output: okSchema,
  },
  setProjectAccent: {
    input: z.object({
      projectId: idSchema,
      colorIndex: colorIndexSchema,
      customColor: customColorSchema,
    }),
    output: okSchema,
  },
  reorderPinned: {
    input: z
      .object({
        threadId: idSchema,
        previousThreadId: idSchema.nullable(),
        nextThreadId: idSchema.nullable(),
      })
      .strict(),
    output: z.object({ pinnedThreadIds: z.array(z.string()) }).strict(),
  },
  listInboxOrder: {
    input: emptyInput,
    output: z.object({ inboxThreadIds: z.array(z.string()) }).strict(),
  },
  reorderInbox: {
    input: z.object({ inboxThreadIds: orderedThreadIdsSchema }).strict(),
    output: z.object({ inboxThreadIds: z.array(z.string()) }).strict(),
  },
  getSidebarSettings: {
    input: emptyInput,
    output: sidebarSettingsSchema,
  },
  updateSidebarSettings: {
    input: sidebarSettingsSchema,
    output: sidebarSettingsSchema,
  },
  listProjectIconSettings: {
    input: emptyInput,
    output: z
      .object({
        projects: z.array(
          z
            .object({
              id: z.string(),
              name: z.string(),
              customPath: z.string().nullable(),
              customUploadName: z.string().nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
  },
  searchProjectIconFiles: {
    input: z
      .object({ projectId: idSchema, query: z.string().trim().max(200) })
      .strict(),
    output: z.object({ paths: z.array(z.string()) }).strict(),
  },
  setProjectIcon: {
    input: z
      .object({ projectId: idSchema, path: projectIconPathSchema.nullable() })
      .strict(),
    output: z
      .object({
        customPath: z.string().nullable(),
        customUploadName: z.string().nullable(),
      })
      .strict(),
  },
  uploadProjectIcon: {
    input: z
      .object({
        projectId: idSchema,
        filename: uploadFilenameSchema,
        mimeType: z.string().max(100),
        contentBase64: iconBase64Schema,
      })
      .strict(),
    output: z
      .object({
        customPath: z.string().nullable(),
        customUploadName: z.string().nullable(),
      })
      .strict(),
  },
  listLifecycle: {
    // Q5's single mount RPC. The handler runs the idempotent auto-settle pass
    // before it answers, so there is no separate mount-time evaluation call.
    input: z
      .object({
        signals: z.array(activitySignalSchema).max(10_000).optional().default([]),
      })
      .strict(),
    output: z.object({ rows: z.array(lifecycleRowSchema) }).strict(),
  },
  settle: { input: threadIdInput, output: z.object({ ok: z.boolean() }) },
  unsettle: { input: threadIdInput, output: z.object({ ok: z.boolean() }) },
  snooze: {
    input: z
      .object({
        threadId: idSchema,
        // Absolute wake time, so a snooze means the same thing on every device.
        snoozedUntil: z.number().int().positive(),
      })
      .strict(),
    output: z.object({ ok: z.boolean() }),
  },
  unsnooze: { input: threadIdInput, output: z.object({ ok: z.boolean() }) },
  acknowledgeWake: {
    input: threadIdInput,
    output: z.object({ ok: z.boolean() }),
  },
  bulkSettle: {
    input: z.object({ threadIds: bulkThreadIdsSchema }).strict(),
    output: bulkMutationOutputSchema,
  },
  bulkSnooze: {
    input: z
      .object({
        threadIds: bulkThreadIdsSchema,
        snoozedUntil: z.number().int().positive(),
      })
      .strict(),
    output: bulkMutationOutputSchema,
  },
  evaluateAutoSettle: {
    input: emptyInput,
    output: z.object({ changedThreadIds: z.array(z.string()) }).strict(),
  },
});

export const glassSidebarMigrations = [
  `CREATE TABLE IF NOT EXISTS thread_folders (
     id TEXT PRIMARY KEY, name TEXT NOT NULL,
     color_index INTEGER NOT NULL DEFAULT 0, custom_color TEXT,
     collapsed INTEGER NOT NULL DEFAULT 0, sort_index INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS folder_members (
     thread_id TEXT PRIMARY KEY, folder_id TEXT NOT NULL,
     sort_index INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS thread_accents (
     thread_id TEXT PRIMARY KEY, color_index INTEGER NOT NULL DEFAULT 0,
     custom_color TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS project_accents (
     project_id TEXT PRIMARY KEY, color_index INTEGER NOT NULL DEFAULT 0,
     custom_color TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS project_decor (
     project_id TEXT PRIMARY KEY, icon TEXT, color TEXT,
     source TEXT NOT NULL DEFAULT 'auto', updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS thread_lifecycle (
     thread_id TEXT PRIMARY KEY, state TEXT NOT NULL, wake_at INTEGER,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS inbox_order (
     thread_id TEXT PRIMARY KEY, sort_index INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS project_icons (
     project_id TEXT PRIMARY KEY, path TEXT NOT NULL, updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS project_icon_uploads (
     project_id TEXT PRIMARY KEY, filename TEXT NOT NULL,
     mime_type TEXT NOT NULL, content_base64 TEXT NOT NULL,
     size_bytes INTEGER NOT NULL, updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sidebar_settings (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     snooze_presets TEXT NOT NULL,
     inactive_threads_enabled INTEGER NOT NULL,
     inactive_after_hours INTEGER NOT NULL,
     auto_settle_inactive INTEGER NOT NULL,
     auto_settle_after_days INTEGER NOT NULL,
     auto_settle_on_merge INTEGER NOT NULL,
     auto_project_colours INTEGER NOT NULL
   )`,
  // Q5 schema reconciliation. Q0's `state`, `wake_at` and `updated_at` columns
  // are kept exactly as they are — no drop, no recreate, no constraint change
  // — and every lifecycle write supplies them from `legacyLifecycleColumns`,
  // so the NOT NULL constraints are always satisfied. These four columns carry
  // the fork's real shape and are all nullable, which is what makes
  // `ALTER TABLE … ADD COLUMN` legal here.
  `ALTER TABLE thread_lifecycle ADD COLUMN settled_at INTEGER`,
  `ALTER TABLE thread_lifecycle ADD COLUMN settled_override TEXT
     CHECK (settled_override IN ('active','settled') OR settled_override IS NULL)`,
  `ALTER TABLE thread_lifecycle ADD COLUMN snoozed_until INTEGER`,
  `ALTER TABLE thread_lifecycle ADD COLUMN snoozed_at INTEGER`,
  `CREATE TABLE IF NOT EXISTS legacy_import_state (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     completed_at INTEGER NOT NULL
   )`,
];

/** The fork's five fields: what every reader and Q7's import work with. */
export interface StoredLifecycleRow {
  threadId: string;
  settledAt: number | null;
  settledOverride: SettledOverride | null;
  snoozedUntil: number | null;
  snoozedAt: number | null;
}

interface LifecycleDbRow {
  thread_id: string;
  settled_at: number | null;
  settled_override: SettledOverride | null;
  snoozed_until: number | null;
  snoozed_at: number | null;
}

interface AutoSettleSettingsRow {
  auto_settle_inactive: number;
  auto_settle_after_days: number;
  auto_settle_on_merge: number;
}

// Channel every client re-reads `listLifecycle` on. Declared in the pure
// module so the frontend hook can subscribe without importing this file.
export { LIFECYCLE_CHANNEL };

/**
 * Bounded fan-out for a bulk mutation, reporting per-thread outcomes in input
 * order. Server-local on purpose: Q6 owns the frontend `src/bulk-actions.ts`
 * runner, and the two lifecycle bulk RPCs must not depend on that packet to
 * compile.
 */
async function runBulkThreadAction(
  threadIds: readonly string[],
  action: (threadId: string) => Promise<void>,
  concurrency = 4,
): Promise<{
  succeededThreadIds: string[];
  failures: Array<{ threadId: string; error: string }>;
}> {
  const results = new Map<string, string | null>();
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, threadIds.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < threadIds.length) {
        const threadId = threadIds[nextIndex++]!;
        try {
          await action(threadId);
          results.set(threadId, null);
        } catch (error) {
          const message =
            error instanceof Error && error.message.trim().length > 0
              ? error.message.trim()
              : "Unknown error";
          results.set(threadId, message);
        }
      }
    }),
  );
  return {
    succeededThreadIds: threadIds.filter(
      (threadId) => results.get(threadId) === null,
    ),
    failures: threadIds.flatMap((threadId) => {
      const error = results.get(threadId);
      return error ? [{ threadId, error }] : [];
    }),
  };
}

/** Q6 owns `sidebar_settings`; until it lands the policy runs on these. */
const DEFAULT_AUTO_SETTLE_SETTINGS = Object.freeze({
  autoSettleInactive: true,
  autoSettleAfterDays: DEFAULT_AUTO_SETTLE_AFTER_DAYS,
  autoSettleOnMerge: true,
});

interface StoredProjectIconRow {
  project_id: string;
  path: string;
  updated_at: number;
}

interface StoredProjectIconUploadRow {
  project_id: string;
  filename: string;
  mime_type: string;
  content_base64: string;
  size_bytes: number;
  updated_at: number;
}

interface ResolvedProjectIcon {
  content: string;
  contentEncoding: "base64" | "utf8";
  mimeType: string;
  path: string;
  sizeBytes: number;
}

interface SidebarSettingsDbRow {
  snooze_presets: string;
  inactive_threads_enabled: number;
  inactive_after_hours: number;
  auto_settle_inactive: number;
  auto_settle_after_days: number;
  auto_settle_on_merge: number;
  auto_project_colours: number;
}

const PROJECT_ICON_SOURCE_FILES = [
  "index.html",
  "public/index.html",
  "app/routes/__root.tsx",
  "src/routes/__root.tsx",
  "app/root.tsx",
  "src/root.tsx",
  "src/index.html",
] as const;
const PROJECT_ICON_MAX_BYTES = 1_000_000;
const PROJECT_ICON_CACHE_MS = 5 * 60_000;
// A project with no icon on disk is the steady state. Holding the miss avoids
// repeating dozens of SDK file reads on bb's main server thread. Explicit icon
// changes invalidate immediately, so a long miss TTL does not delay overrides.
export const PROJECT_ICON_MISS_CACHE_MS = 6 * 60 * 60_000;

function iconMimeType(path: string, reported: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".webp")) return "image/webp";
  return reported;
}

interface StoredFolderRow {
  id: string;
  name: string;
  color_index: number;
  custom_color: string | null;
  collapsed: number;
  sort_index: number;
}

interface StoredMemberRow {
  thread_id: string;
  folder_id: string;
  sort_index: number;
}

interface StoredAccentRow {
  owner_id: string;
  color_index: number;
  custom_color: string | null;
}

type ProjectGlyph = ReadonlyArray<[string, Record<string, unknown>]>;

let iconCatalogPromise: Promise<CatalogEntry[]> | null = null;
let iconGlyphsPromise: Promise<Record<string, ProjectGlyph>> | null = null;

async function readAssetText(name: string): Promise<string> {
  try {
    return await readFile(new URL(`../assets/${name}`, import.meta.url), "utf8");
  } catch (error) {
    // Source-mode tests execute server.ts from the repository root; production
    // executes dist/server.js, where the required ../assets path is correct.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return readFile(new URL(`./assets/${name}`, import.meta.url), "utf8");
  }
}

// Read and parsed once each, and separately: a mount needs the drawings for
// the projects on screen, and never the half-megabyte search catalog that only
// the icon picker opens.
function loadIconCatalog(): Promise<CatalogEntry[]> {
  iconCatalogPromise ??= readAssetText("icon-catalog.json").then(
    (json) => JSON.parse(json) as CatalogEntry[],
  );
  return iconCatalogPromise;
}

function loadIconGlyphs(): Promise<Record<string, ProjectGlyph>> {
  iconGlyphsPromise ??= readAssetText("icon-catalog-glyphs.json").then(
    (json) => JSON.parse(json) as Record<string, ProjectGlyph>,
  );
  return iconGlyphsPromise;
}

function newFolderId(): string {
  return `fld_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function sameIdSet(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    new Set(expected).size === expected.length &&
    actual.every((id) => expected.includes(id))
  );
}

function normalizeColor(value: string | null): string | null {
  return value?.toLowerCase() ?? null;
}

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  const dataDir = (() => {
    try {
      const value = (
        bb.server as { experimental_dataDir?: unknown } | undefined
      )?.experimental_dataDir;
      return typeof value === "string" && value.length > 0 ? value : undefined;
    } catch {
      return undefined;
    }
  })();
  const workflowSourcePath = workflowStorePath(db.name, dataDir);
  const DatabaseConstructor = db.constructor as unknown as new (
    sourcePath: string,
    options: { readonly: boolean; fileMustExist: boolean },
  ) => Database.Database;
  const openSiblingDatabase = (sourcePath: string) =>
    new DatabaseConstructor(sourcePath, {
      readonly: true,
      fileMustExist: true,
    });
  bb.storage.migrate(db, glassSidebarMigrations);
  /**
   * better-sqlite3 compiles the SQL text on every `prepare`, and these read
   * paths run on every thread-list revision. Each distinct statement is
   * compiled once, on first use — lazily, so a table a later migration owns
   * is still only touched when a caller asks for it — and then reused for the
   * life of the plugin.
   */
  type CachedStatement = Database.Statement<unknown[], unknown>;
  const statements = new Map<string, CachedStatement>();
  const sql = (source: string): CachedStatement => {
    let statement = statements.get(source);
    if (statement === undefined) {
      statement = db.prepare<unknown[], unknown>(source);
      statements.set(source, statement);
    }
    return statement;
  };
  let awaitingLegacyImport =
    !sql(`SELECT 1 FROM legacy_import_state WHERE id = 1`).get();
  let firstProjectDecorRead = true;
  const projectDecorStore = createProjectDecorStore(db);
  const projectSuggestions = new Map<string, AutoIconSuggestion>();
  bb.onDispose(() => closeWorkflowActivitySource(workflowSourcePath));

  // Both views are rebuilt from SQLite on every read, and every path that
  // writes their tables ends in one of these two publishes — so the publish is
  // also the one place the memoised view has to be dropped. A client refresh
  // that follows a signal then costs one object, not four table scans.
  let organizationView: Organization | null = null;
  let projectDecorViewCache: ReturnType<typeof buildProjectDecorView> | null =
    null;
  const publishOrganization = (reason: string) => {
    organizationView = null;
    bb.realtime.publish(ORGANIZATION_CHANNEL, { reason });
  };
  const publishProjectDecor = (reason: string) => {
    projectDecorViewCache = null;
    bb.realtime.publish("project-decor", { reason });
  };

  bb.cli.register({
    name: "glass-sidebar",
    summary: "Import and manage Glass Sidebar data.",
    commands: [
      {
        name: "import",
        summary: "Copy bb-sidebar and Project Icons data into Glass Sidebar.",
        usage:
          "bb glass-sidebar import [--dry-run] [--force] [--from <dataDir>]",
      },
      {
        name: "help",
        summary: "Show Glass Sidebar command usage.",
        usage: "bb glass-sidebar help",
      },
    ],
    async run(argv) {
      const [command, ...rest] = argv;
      if (command === undefined || command === "help") {
        return { exitCode: 0, stdout: CLI_USAGE };
      }
      if (command !== "import") {
        return {
          exitCode: 2,
          stderr: `Unknown command "${command}".\n${CLI_USAGE}`,
        };
      }
      const parsed = parseImportArguments(rest);
      if (!parsed.ok) {
        return { exitCode: 2, stderr: `${parsed.error}\n${CLI_USAGE}` };
      }
      const report = importGlassSidebarData({
        destination: db,
        dataDir: importDataDir(db.name, dataDir, parsed.options.from),
        dryRun: parsed.options.dryRun,
        force: parsed.options.force,
      });
      if (!report.dryRun) {
        const changed = changedImportTables(report);
        if (
          changed.has("thread_folders") ||
          changed.has("folder_members") ||
          changed.has("thread_accents") ||
          changed.has("project_accents")
        ) {
          publishOrganization("import");
        }
        if (changed.has("thread_lifecycle")) {
          bb.realtime.publish(LIFECYCLE_CHANNEL, { reason: "import" });
        }
        if (changed.has("sidebar_settings")) {
          bb.realtime.publish(SIDEBAR_SETTINGS_CHANNEL, { reason: "import" });
        }
        if (changed.has("inbox_order")) {
          bb.realtime.publish(INBOX_ORDER_CHANNEL, { reason: "import" });
        }
        sql(
          `INSERT INTO legacy_import_state (id, completed_at) VALUES (1, ?)
           ON CONFLICT(id) DO UPDATE SET completed_at = excluded.completed_at`,
        ).run(Date.now());
        awaitingLegacyImport = false;
        // Imported lifecycle rows and settings change what the policy decides.
        forceNextPolicyPass();
        const reconciled = await reconcileProjects("import");
        firstProjectDecorRead = false;
        if (changed.has("project_decor") && !reconciled.changed) {
          publishProjectDecor("import");
        }
      }
      return { exitCode: 0, stdout: formatImportReport(report) };
    },
  });

  const projectIconCache = new Map<
    string,
    { expiresAt: number; icon: ResolvedProjectIcon | null }
  >();
  const pendingProjectIconResolutions = new Map<
    string,
    Promise<ResolvedProjectIcon | null>
  >();
  const defaultProjectHostIds = new Map<string, Promise<string | null>>();
  const readProjectIconOverride = (projectId: string): string | null =>
    (
      sql(
        `SELECT project_id, path, updated_at FROM project_icons
         WHERE project_id = ?`,
      ).get(projectId) as StoredProjectIconRow | undefined
    )?.path ?? null;
  const readProjectIconOverrides = (): Map<string, string> =>
    new Map(
      (
        sql(`SELECT project_id, path FROM project_icons`).all() as Array<{
          project_id: string;
          path: string;
        }>
      ).map((row) => [row.project_id, row.path]),
    );
  // Only the name is wanted here, and an upload row carries up to a megabyte
  // of base64 beside it.
  const readProjectIconUploadNames = (): Map<string, string> =>
    new Map(
      (
        sql(
          `SELECT project_id, filename FROM project_icon_uploads`,
        ).all() as Array<{ project_id: string; filename: string }>
      ).map((row) => [row.project_id, row.filename]),
    );
  const readProjectIconUpload = (
    projectId: string,
  ): StoredProjectIconUploadRow | null =>
    (sql(
      `SELECT project_id, filename, mime_type, content_base64,
              size_bytes, updated_at FROM project_icon_uploads
       WHERE project_id = ?`,
    ).get(projectId) as StoredProjectIconUploadRow | undefined) ?? null;
  const clearProjectIconCache = (projectId: string): void => {
    for (const key of projectIconCache.keys()) {
      if (key.startsWith(`${projectId}\0`)) projectIconCache.delete(key);
    }
  };

  const defaultProjectHostId = async (
    projectId: string,
  ): Promise<string | null> => {
    let pending = defaultProjectHostIds.get(projectId);
    if (!pending) {
      pending = bb.sdk.projects.get({ projectId }).then(
        (project) =>
          project.sources.find((source) => source.isDefault)?.hostId ??
          project.sources[0]?.hostId ??
          null,
      );
      defaultProjectHostIds.set(projectId, pending);
      void pending.catch(() => defaultProjectHostIds.delete(projectId));
    }
    return pending;
  };

  const readProjectFile = async (
    projectId: string,
    environmentId: string | null,
    path: string,
  ) => {
    if (environmentId) {
      return bb.sdk.projects.fileContent({ projectId, environmentId, path });
    }
    const hostId = await defaultProjectHostId(projectId);
    return hostId
      ? bb.sdk.projects.fileContent({ projectId, hostId, path })
      : bb.sdk.projects.fileContent({ projectId, path });
  };

  const tryProjectIcon = async (
    projectId: string,
    environmentId: string | null,
    path: string,
  ): Promise<ResolvedProjectIcon | null> => {
    const normalized = normalizeProjectIconPath(path);
    if (!normalized) return null;
    try {
      const file = await readProjectFile(projectId, environmentId, normalized);
      if (file.sizeBytes > PROJECT_ICON_MAX_BYTES) return null;
      return {
        ...file,
        mimeType: iconMimeType(normalized, file.mimeType),
        path: normalized,
      };
    } catch {
      return null;
    }
  };

  const resolveProjectIconUncached = async (
    projectId: string,
    environmentId: string | null,
  ): Promise<ResolvedProjectIcon | null> => {
    const cacheKey = `${projectId}\0${environmentId ?? ""}`;
    const upload = readProjectIconUpload(projectId);
    if (upload) {
      const icon = {
        content: upload.content_base64,
        contentEncoding: "base64" as const,
        mimeType: upload.mime_type,
        path: upload.filename,
        sizeBytes: upload.size_bytes,
      };
      projectIconCache.set(cacheKey, {
        expiresAt: Date.now() + PROJECT_ICON_CACHE_MS,
        icon,
      });
      return icon;
    }

    const candidates: string[] = [];
    const customPath = readProjectIconOverride(projectId);
    if (customPath) candidates.push(customPath);
    try {
      const projectFile = await readProjectFile(
        projectId,
        environmentId,
        "t3.json",
      );
      if (
        projectFile.contentEncoding === "utf8" &&
        projectFile.sizeBytes <= 100_000
      ) {
        const parsed = JSON.parse(projectFile.content) as { iconPath?: unknown };
        if (typeof parsed.iconPath === "string") candidates.push(parsed.iconPath);
      }
    } catch {
      // t3.json is optional.
    }
    candidates.push(...PROJECT_ICON_CANDIDATES);

    let icon: ResolvedProjectIcon | null = null;
    for (const candidate of new Set(candidates)) {
      icon = await tryProjectIcon(projectId, environmentId, candidate);
      if (icon) break;
    }
    if (!icon) {
      for (const sourcePath of PROJECT_ICON_SOURCE_FILES) {
        try {
          const source = await readProjectFile(
            projectId,
            environmentId,
            sourcePath,
          );
          if (
            source.contentEncoding !== "utf8" ||
            source.sizeBytes > PROJECT_ICON_MAX_BYTES
          ) {
            continue;
          }
          const href = extractProjectIconHref(source.content);
          if (!href) continue;
          for (const path of iconPathsForHref(href)) {
            icon = await tryProjectIcon(projectId, environmentId, path);
            if (icon) break;
          }
          if (icon) break;
        } catch {
          // Each source file is optional.
        }
      }
    }

    projectIconCache.set(cacheKey, {
      expiresAt:
        Date.now() + (icon ? PROJECT_ICON_CACHE_MS : PROJECT_ICON_MISS_CACHE_MS),
      icon,
    });
    return icon;
  };

  const resolveProjectIcon = (
    projectId: string,
    environmentId: string | null,
  ): Promise<ResolvedProjectIcon | null> => {
    const cacheKey = `${projectId}\0${environmentId ?? ""}`;
    const cached = projectIconCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.icon);
    }
    const pending = pendingProjectIconResolutions.get(cacheKey);
    if (pending) return pending;
    const resolution = resolveProjectIconUncached(
      projectId,
      environmentId,
    ).finally(() => pendingProjectIconResolutions.delete(cacheKey));
    pendingProjectIconResolutions.set(cacheKey, resolution);
    return resolution;
  };

  bb.http.route("GET", "/project-icon", async (context) => {
    const projectId = context.req.query("projectId")?.trim();
    const environmentId = context.req.query("environmentId")?.trim() || null;
    if (!projectId) return context.text("Missing projectId", 400);
    const icon = await resolveProjectIcon(projectId, environmentId);
    if (!icon) return context.body(null, 404, { "cache-control": "no-store" });
    const body =
      icon.contentEncoding === "base64"
        ? Uint8Array.from(Buffer.from(icon.content, "base64")).buffer
        : icon.content;
    return new Response(body, {
      headers: {
        "cache-control": "private, max-age=0, must-revalidate",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "content-type": icon.mimeType,
        "x-content-type-options": "nosniff",
      },
    });
  });

  const listProjects = async (): Promise<AutoAssignmentProject[]> => {
    try {
      const projects = await bb.sdk.projects.list({ includePersonal: true });
      return projects.map((project) => ({
        id: project.id,
        name: project.name,
        path:
          project.sources.find((source) => source.isDefault)?.path ??
          project.sources[0]?.path ??
          "",
      }));
    } catch {
      return [];
    }
  };

  const reconcileProjects = async (
    reason: string,
    selectedProjects?: readonly AutoAssignmentProject[],
  ) => {
    const result = await reconcileProjectIcons({
      projects: selectedProjects ?? (await listProjects()),
      store: projectDecorStore,
      listingFor: (project) => readTopLevelListing(project.path),
      publish: () => publishProjectDecor(reason),
    });
    for (const [projectId, suggestion] of Object.entries(result.suggestions)) {
      projectSuggestions.set(projectId, suggestion);
    }
    // The suggestions are part of the decor view and land after the
    // reconcile's own publish, so the view is dropped again here.
    projectDecorViewCache = null;
    return result;
  };

  const listMemberIds = (folderId: string): string[] =>
    (
      sql(
        `SELECT thread_id, folder_id, sort_index FROM folder_members
         WHERE folder_id = ? ORDER BY sort_index, thread_id`,
      ).all(folderId) as StoredMemberRow[]
    ).map((row) => row.thread_id);

  const writeMemberOrder = (folderId: string, threadIds: readonly string[]) => {
    sql(`DELETE FROM folder_members WHERE folder_id = ?`).run(folderId);
    const insert = sql(
      `INSERT INTO folder_members (thread_id, folder_id, sort_index)
       VALUES (?, ?, ?)`,
    );
    threadIds.forEach((threadId, sortIndex) =>
      insert.run(threadId, folderId, sortIndex),
    );
  };

  const requireFolder = (folderId: string) => {
    const found = sql(
      `SELECT 1 AS found FROM thread_folders WHERE id = ?`,
    ).get(folderId) as { found: number } | undefined;
    if (!found) throw new Error(`Unknown folder: ${folderId}`);
  };

  const buildOrganization = (): Organization => {
    const folderRows = sql(
      `SELECT id, name, color_index, custom_color, collapsed, sort_index
       FROM thread_folders ORDER BY sort_index, created_at, id`,
    ).all() as StoredFolderRow[];
    const memberRows = sql(
      `SELECT thread_id, folder_id, sort_index FROM folder_members
       ORDER BY folder_id, sort_index, thread_id`,
    ).all() as StoredMemberRow[];
    const members: Record<string, string> = {};
    const threadIdsByFolder = new Map<string, string[]>();
    for (const row of memberRows) {
      members[row.thread_id] = row.folder_id;
      const ids = threadIdsByFolder.get(row.folder_id) ?? [];
      ids.push(row.thread_id);
      threadIdsByFolder.set(row.folder_id, ids);
    }

    const readAccents = (
      table: "thread_accents" | "project_accents",
      key: "thread_id" | "project_id",
    ) => {
      const rows = sql(
        `SELECT ${key} AS owner_id, color_index, custom_color FROM ${table}`,
      ).all() as StoredAccentRow[];
      return Object.fromEntries(
        rows.map((row) => [
          row.owner_id,
          { colorIndex: row.color_index, customColor: row.custom_color },
        ]),
      );
    };

    return {
      folders: folderRows.map((row) => ({
        id: row.id,
        name: row.name,
        colorIndex: row.color_index,
        customColor: row.custom_color,
        collapsed: row.collapsed !== 0,
        sortIndex: row.sort_index,
        threadIds: threadIdsByFolder.get(row.id) ?? [],
      })),
      members,
      threadAccents: readAccents("thread_accents", "thread_id"),
      projectAccents: readAccents("project_accents", "project_id"),
    };
  };

  const readOrganization = (): Organization =>
    (organizationView ??= buildOrganization());

  const readInboxOrder = (): string[] =>
    (
      sql(
        `SELECT thread_id FROM inbox_order
         ORDER BY sort_index ASC, thread_id ASC`,
      ).all() as Array<{ thread_id: string }>
    ).map((row) => row.thread_id);

  const replaceInboxOrder = db.transaction((inboxThreadIds: string[]) => {
    sql(`DELETE FROM inbox_order`).run();
    const insert = sql(
      `INSERT INTO inbox_order (thread_id, sort_index) VALUES (?, ?)`,
    );
    inboxThreadIds.forEach((threadId, index) => insert.run(threadId, index));
  });

  const buildProjectDecorView = () => {
    const rows = projectDecorStore.list();
    return {
      projects: Object.fromEntries(
        rows.map((row) => {
          const suggestion =
            row.source === "auto" ? projectSuggestions.get(row.projectId) : null;
          return [
            row.projectId,
            {
              icon: row.icon,
              iconColor: row.color,
              source: row.source,
              autoReason: suggestion?.reason ?? null,
              autoKeywords: suggestion?.keywords ?? [],
            },
          ];
        }),
      ),
      updatedAt: rows.reduce((latest, row) => Math.max(latest, row.updatedAt), 0),
    };
  };

  const projectDecorView = () =>
    (projectDecorViewCache ??= buildProjectDecorView());

  const lifecycleColumns = `thread_id, settled_at, settled_override,
                            snoozed_until, snoozed_at`;
  const toLifecycleRow = (row: LifecycleDbRow): StoredLifecycleRow => ({
    threadId: row.thread_id,
    settledAt: row.settled_at,
    settledOverride: row.settled_override,
    snoozedUntil: row.snoozed_until,
    snoozedAt: row.snoozed_at,
  });

  const readAllLifecycle = (): StoredLifecycleRow[] =>
    (
      sql(`SELECT ${lifecycleColumns} FROM thread_lifecycle`)
        .all() as LifecycleDbRow[]
    ).map(toLifecycleRow);

  const readLifecycle = (threadId: string): StoredLifecycleRow | null => {
    const row = sql(
      `SELECT ${lifecycleColumns} FROM thread_lifecycle WHERE thread_id = ?`,
    ).get(threadId) as LifecycleDbRow | undefined;
    return row ? toLifecycleRow(row) : null;
  };

  /**
   * Eight-column upsert: the fork's five fields plus the three scaffold
   * columns, derived on every write so Q0's NOT NULL constraints hold and
   * nothing ever reads the mirrors back as truth.
   */
  const writeLifecycle = (row: StoredLifecycleRow, publish = true): void => {
    const legacy = legacyLifecycleColumns(row, Date.now());
    sql(
      `INSERT INTO thread_lifecycle
         (thread_id, settled_at, settled_override, snoozed_until, snoozed_at,
          state, wake_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET
         settled_at = excluded.settled_at,
         settled_override = excluded.settled_override,
         snoozed_until = excluded.snoozed_until,
         snoozed_at = excluded.snoozed_at,
         state = excluded.state,
         wake_at = excluded.wake_at,
         updated_at = excluded.updated_at`,
    ).run(
      row.threadId,
      row.settledAt,
      row.settledOverride,
      row.snoozedUntil,
      row.snoozedAt,
      legacy.state,
      legacy.wakeAt,
      legacy.updatedAt,
    );
    if (publish) {
      bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId: row.threadId });
    }
  };

  const writeManyLifecycle = db.transaction(
    (rows: readonly StoredLifecycleRow[]) => {
      for (const row of rows) writeLifecycle(row, false);
    },
  );

  const publishLifecycleChanges = (threadIds: readonly string[]): void => {
    if (threadIds.length === 0) return;
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadIds });
  };

  const deleteLifecycle = sql(
    `DELETE FROM thread_lifecycle WHERE thread_id = ?`,
  );

  const clearLifecycle = (threadId: string): void => {
    deleteLifecycle.run(threadId);
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId });
  };

  /** Real work clears both kinds of manual settle override. */
  const clearSettlingState = (threadId: string): boolean => {
    const row = readLifecycle(threadId);
    if (
      row === null ||
      (row.settledAt === null && row.settledOverride === null)
    ) {
      return false;
    }
    if (row.snoozedUntil === null) {
      deleteLifecycle.run(threadId);
    } else {
      writeLifecycle({ ...row, settledAt: null, settledOverride: null }, false);
    }
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId });
    return true;
  };

  const readSidebarSettings = (): SidebarSettingsValues => {
    const row = sql(
      `SELECT snooze_presets, inactive_threads_enabled,
              inactive_after_hours, auto_settle_inactive,
              auto_settle_after_days, auto_settle_on_merge,
              auto_project_colours
       FROM sidebar_settings WHERE id = 1`,
    ).get() as SidebarSettingsDbRow | undefined;
    return row
      ? {
          snoozePresets: row.snooze_presets,
          inactiveThreadsEnabled: row.inactive_threads_enabled === 1,
          inactiveAfterHours: row.inactive_after_hours,
          autoSettleInactive: row.auto_settle_inactive === 1,
          autoSettleAfterDays: row.auto_settle_after_days,
          autoSettleOnMerge: row.auto_settle_on_merge === 1,
          autoProjectColours: row.auto_project_colours === 1,
        }
      : { ...DEFAULT_SIDEBAR_SETTINGS };
  };

  const writeSidebarSettings = (values: SidebarSettingsValues): void => {
    sql(
      `INSERT INTO sidebar_settings (
         id, snooze_presets, inactive_threads_enabled,
         inactive_after_hours, auto_settle_inactive,
         auto_settle_after_days, auto_settle_on_merge,
         auto_project_colours
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         snooze_presets = excluded.snooze_presets,
         inactive_threads_enabled = excluded.inactive_threads_enabled,
         inactive_after_hours = excluded.inactive_after_hours,
         auto_settle_inactive = excluded.auto_settle_inactive,
         auto_settle_after_days = excluded.auto_settle_after_days,
         auto_settle_on_merge = excluded.auto_settle_on_merge,
         auto_project_colours = excluded.auto_project_colours`,
    ).run(
      values.snoozePresets,
      values.inactiveThreadsEnabled ? 1 : 0,
      values.inactiveAfterHours,
      values.autoSettleInactive ? 1 : 0,
      values.autoSettleAfterDays,
      values.autoSettleOnMerge ? 1 : 0,
      values.autoProjectColours ? 1 : 0,
    );
  };

  const readAutoSettleSettings = () => {
    try {
      const row = sql(
        `SELECT auto_settle_inactive, auto_settle_after_days,
                auto_settle_on_merge
           FROM sidebar_settings WHERE id = 1`,
      ).get() as AutoSettleSettingsRow | undefined;
      if (!row) return DEFAULT_AUTO_SETTLE_SETTINGS;
      return {
        autoSettleInactive: row.auto_settle_inactive === 1,
        autoSettleAfterDays: row.auto_settle_after_days,
        autoSettleOnMerge: row.auto_settle_on_merge === 1,
      };
    } catch {
      // Q6 has not created `sidebar_settings` yet.
      return DEFAULT_AUTO_SETTLE_SETTINGS;
    }
  };

  const loadPolicyThreads = async () => {
    const threads: Awaited<ReturnType<typeof bb.sdk.threads.list>> = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const page = await bb.sdk.threads.list({
        archived: false,
        includeHidden: false,
        limit: pageSize,
        offset,
      });
      threads.push(...page);
      if (page.length < pageSize) break;
    }
    return threads;
  };

  /**
   * One host round trip per environment is the expensive half of a policy
   * pass, and several passes can run inside one burst — a released live hold,
   * the generation follow-up it chains, a second client mounting. Results are
   * held briefly so the burst costs one lookup per environment instead of one
   * per pass. `unknown` is never cached: it means the lookup failed, the
   * policy keeps the current state on it, and the next pass must be free to
   * ask again.
   */
  const PULL_REQUEST_CACHE_MS = 60_000;
  const pullRequestCache = new Map<
    string,
    { expiresAt: number; pullRequest: AutoSettlePullRequest }
  >();

  const loadPullRequests = async (environmentIds: readonly string[]) => {
    const startedAt = Date.now();
    for (const [environmentId, entry] of pullRequestCache) {
      if (entry.expiresAt <= startedAt) pullRequestCache.delete(environmentId);
    }
    const results = new Map<string, AutoSettlePullRequest>();
    const pending: string[] = [];
    for (const environmentId of environmentIds) {
      const cached = pullRequestCache.get(environmentId);
      if (cached) results.set(environmentId, cached.pullRequest);
      else pending.push(environmentId);
    }
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(4, pending.length) },
      async () => {
        while (nextIndex < pending.length) {
          const environmentId = pending[nextIndex++]!;
          try {
            const result = await bb.sdk.environments.pullRequest({
              environmentId,
            });
            if (result.outcome === "available") {
              results.set(environmentId, {
                outcome: "available",
                state: result.pullRequest.state,
                updatedAt: result.pullRequest.updatedAt,
              });
            } else if (result.outcome === "absent") {
              results.set(environmentId, { outcome: "absent" });
            } else {
              results.set(environmentId, { outcome: "unknown" });
            }
          } catch {
            results.set(environmentId, { outcome: "unknown" });
          }
          const resolved = results.get(environmentId);
          if (resolved && resolved.outcome !== "unknown") {
            pullRequestCache.set(environmentId, {
              expiresAt: Date.now() + PULL_REQUEST_CACHE_MS,
              pullRequest: resolved,
            });
          }
        }
      },
    );
    await Promise.all(workers);
    return results;
  };

  const applyPolicyChanges = db.transaction(
    (
      changes: ReadonlyArray<{
        decision: "settle" | "unsettle";
        row: StoredLifecycleRow | null;
        threadId: string;
      }>,
      now: number,
    ) => {
      for (const { decision, row, threadId } of changes) {
        if (decision === "settle") {
          writeLifecycle(
            {
              threadId,
              settledAt: now,
              settledOverride: null,
              snoozedUntil: row?.snoozedUntil ?? null,
              snoozedAt: row?.snoozedAt ?? null,
            },
            false,
          );
        } else if (row?.snoozedUntil != null) {
          writeLifecycle(
            { ...row, settledAt: null, settledOverride: null },
            false,
          );
        } else {
          deleteLifecycle.run(threadId);
        }
      }
    },
  );

  /**
   * Live work the sidebar can see and the host cannot: a raised hand, a
   * running workflow, a background command. A client reports the full
   * snapshot of the threads it renders on every `listLifecycle`, so an id is
   * added when that snapshot calls the thread live and removed when a later
   * snapshot calls it quiet. Nothing expires on elapsed time: a long-running
   * action can stay live for hours without changing anything the host would
   * report, and a window that closed under it would let the five-minute sweep
   * park work the user is watching. The end signal is explicit — a quiet
   * report, or the thread's deletion.
   */
  /** Thread ids a client has reported live and has not yet reported quiet. */
  const clientLiveThreadIds = new Set<string>();
  /**
   * Monotonic membership version. A policy pass freezes this beside its live
   * set, then chains one fresh pass if any add or removal happened while its
   * asynchronous host reads were still in flight.
   */
  let clientLiveGeneration = 0;

  /** Returns whether this report actually moved the membership. */
  const setClientLive = (threadId: string, live: boolean): boolean => {
    const changed = live
      ? !clientLiveThreadIds.has(threadId)
      : clientLiveThreadIds.has(threadId);
    if (!changed) return false;
    if (live) clientLiveThreadIds.add(threadId);
    else clientLiveThreadIds.delete(threadId);
    clientLiveGeneration += 1;
    return true;
  };

  /**
   * Applies one client's activity snapshot. Threads the snapshot does not
   * mention are left as they are: it is
   * a snapshot of what that client renders, not of every thread that exists,
   * and another client may be the one watching the rest.
   */
  const recordActivitySignals = (
    signals: readonly LiveSignal[],
  ): boolean => {
    let releasedLiveHold = false;
    for (const signal of signals) {
      const changed = setClientLive(signal.threadId, signal.live);
      if (changed && !signal.live) releasedLiveHold = true;
    }
    return releasedLiveHold;
  };

  /**
   * The host list is authoritative for existence. This is the only memory
   * bound: never discard a live hold merely because it is old or because many
   * other threads are also live.
   */
  const pruneMissingClientLiveThreads = (
    existingThreadIds: ReadonlySet<string>,
  ): void => {
    for (const threadId of clientLiveThreadIds) {
      if (!existingThreadIds.has(threadId)) setClientLive(threadId, false);
    }
  };

  /**
   * Everything the server can say is live right now: the client signals above,
   * plus the Workflows store's own queued and running rows, which are
   * server-side truth and so protect a thread even when no client is open.
   */
  const liveThreadIdsNow = (now: number): Set<string> => {
    const live = new Set(clientLiveThreadIds);
    try {
      for (const run of readWorkflowActivity(
        workflowSourcePath,
        openSiblingDatabase,
        now,
      ).runs) {
        live.add(run.originThreadId);
      }
    } catch {
      // A missing or unreadable sibling store must not stop the sweep; the
      // client signals still stand.
    }
    return live;
  };

  let policyEvaluation: Promise<string[]> | null = null;
  /** Membership generation represented by the in-flight decision's live set. */
  let policyDecisionGeneration: number | null = null;
  /**
   * A full pass pages every non-archived thread and then asks the host for one
   * pull request per environment, so it is far too expensive to run on every
   * `listLifecycle` — the client re-reads on every thread-list revision, which
   * ticks continuously while an agent streams. `lastPolicyPassAt` is the
   * completion time of the newest pass (successful or failed, so a broken host
   * cannot be hammered); `POLICY_PASS_TTL_MS` is the shortest interval between
   * two read-driven passes. Zero means "due now": the state after load, and
   * the state a settings change or a data import restores.
   */
  const POLICY_PASS_TTL_MS = 90_000;
  let lastPolicyPassAt = 0;
  /**
   * Bumped by every force. A pass reads the settings it decides on before its
   * first await, so a force that arrives while it is in flight must survive
   * its completion — otherwise the new settings would wait out the cadence.
   */
  let policyForceGeneration = 0;
  const forceNextPolicyPass = (): void => {
    lastPolicyPassAt = 0;
    policyForceGeneration += 1;
  };
  /**
   * Idempotent: it publishes at most once, and only when it changed state, so
   * a refresh triggered by its own signal cannot loop. Concurrent callers
   * coalesce onto one pass, which is what keeps a freshly opened client from
   * repeating the thread and PR work. If client-live membership changes after
   * the pass freezes its decision set, the stale pass applies nothing and its
   * promise chains exactly one fresh pass derived from current state.
   *
   * Live signals are recorded by the caller, before it decides whether a pass
   * is due, so a report always lands — and always invalidates an in-flight
   * pass — even when the answer itself is served from stored rows.
   */
  const evaluatePolicies = (): Promise<string[]> => {
    if (policyEvaluation !== null) return policyEvaluation;

    const forcedGeneration = policyForceGeneration;
    const stampPassCompletion = () => {
      lastPolicyPassAt =
        policyForceGeneration === forcedGeneration ? Date.now() : 0;
    };
    const pass = (async () => {
      const configured = readAutoSettleSettings();
      const threads = await loadPolicyThreads();
      pruneMissingClientLiveThreads(
        new Set(threads.map((thread) => thread.id)),
      );
      // Freeze the live decision at the last point before the PR reads can
      // yield. Any later client-live membership change invalidates this pass.
      const live = liveThreadIdsNow(Date.now());
      policyDecisionGeneration = clientLiveGeneration;
      const environmentIds = [
        ...new Set(
          threads.flatMap((thread) =>
            thread.environmentId === null ? [] : [thread.environmentId],
          ),
        ),
      ];
      const pullRequests = await loadPullRequests(environmentIds);
      const lifecycleByThreadId = new Map(
        readAllLifecycle().map((row) => [row.threadId, row]),
      );
      const now = Date.now();
      const policySettings = {
        afterDays: parseAutoSettleAfterDays(
          configured.autoSettleInactive,
          String(configured.autoSettleAfterDays),
        ),
        onMerge: configured.autoSettleOnMerge,
      };
      // Never apply a decision against a stale live set. The completion chain
      // below immediately evaluates current membership exactly once.
      if (policyDecisionGeneration !== clientLiveGeneration) return [];
      const changes = threads.flatMap((thread) => {
        if (live.has(thread.id)) return [];
        const row = lifecycleByThreadId.get(thread.id) ?? null;
        const decision = decideAutoSettle({
          lifecycle: row,
          now,
          pullRequest:
            thread.environmentId === null
              ? { outcome: "absent" }
              : (pullRequests.get(thread.environmentId) ?? {
                  outcome: "unknown",
                }),
          settings: policySettings,
          thread,
        });
        return decision === "keep"
          ? []
          : [{ decision, row, threadId: thread.id }];
      });
      if (changes.length === 0) return [];
      applyPolicyChanges(changes, now);
      const changedThreadIds = changes.map((change) => change.threadId);
      bb.realtime.publish(LIFECYCLE_CHANNEL, { threadIds: changedThreadIds });
      return changedThreadIds;
    })();
    policyEvaluation = pass.then(async (changedThreadIds) => {
      const needsFollowUp =
        policyDecisionGeneration !== null &&
        policyDecisionGeneration !== clientLiveGeneration;
      policyEvaluation = null;
      policyDecisionGeneration = null;
      stampPassCompletion();
      if (!needsFollowUp) return changedThreadIds;
      const followUpChangedThreadIds = await evaluatePolicies();
      return [
        ...new Set([...changedThreadIds, ...followUpChangedThreadIds]),
      ];
    }, (error: unknown) => {
      policyEvaluation = null;
      policyDecisionGeneration = null;
      stampPassCompletion();
      throw error;
    });
    return policyEvaluation;
  };

  // The one preserved scheduler. No server timer, no watcher: the sweep claims
  // this durable row only while the plugin is loaded.
  bb.background.schedule("auto-settle", "*/5 * * * *", async () => {
    await evaluatePolicies();
  });

  bb.rpc.register(glassSidebarRpcContract, {
    getWorkflowActivity: () =>
      readWorkflowActivity(
        workflowSourcePath,
        openSiblingDatabase,
        Date.now(),
        (message) => bb.log.warn(message),
      ),
    getOrganization: () => readOrganization(),
    getProjectDecor: async () => {
      if (firstProjectDecorRead && !awaitingLegacyImport) {
        firstProjectDecorRead = false;
        await reconcileProjects("getProjectDecor");
      }
      return projectDecorView();
    },
    getProjectGlyphs: async ({ projectIds }) => {
      const glyphs = await loadIconGlyphs();
      const iconNames = new Set(
        projectIds
          .map((projectId) => projectDecorStore.get(projectId)?.icon)
          .filter((icon): icon is string => Boolean(icon)),
      );
      return {
        glyphs: Object.fromEntries(
          [...iconNames].flatMap((icon) =>
            glyphs[icon] ? [[icon, glyphs[icon]]] : [],
          ),
        ),
      };
    },
    listIconCatalog: async ({ query, category }) => {
      const [catalog, glyphs] = await Promise.all([
        loadIconCatalog(),
        loadIconGlyphs(),
      ]);
      const found = searchIcons(catalog, query, category);
      return {
        icons: found.results.flatMap((entry) =>
          glyphs[entry.name]
            ? [{ ...entry, tags: [...entry.tags], glyph: glyphs[entry.name] }]
            : [],
        ),
        total: found.total,
      };
    },
    setProjectDecorIcon: ({ projectId, icon, color }) => {
      projectDecorStore.set({ projectId, icon, color });
      projectSuggestions.delete(projectId);
      publishProjectDecor("setProjectDecorIcon");
      return { ok: true as const };
    },
    clearProjectDecorIcon: ({ projectId }) => {
      projectDecorStore.clear(projectId);
      projectSuggestions.delete(projectId);
      publishProjectDecor("clearProjectDecorIcon");
      return { ok: true as const };
    },
    resetProjectDecorToAuto: async ({ projectId }) => {
      const cleared = projectDecorStore.clearManual(projectId);
      const projects = (await listProjects()).filter(
        (project) => project.id === projectId,
      );
      const reconciled = await reconcileProjects(
        "resetProjectDecorToAuto",
        projects,
      );
      if (cleared && !reconciled.changed) {
        publishProjectDecor("resetProjectDecorToAuto");
      }
      return { ok: true as const };
    },
    redetectAllAutoIcons: async () => {
      const reconciled = await reconcileProjects("redetectAllAutoIcons");
      if (!reconciled.changed) publishProjectDecor("redetectAllAutoIcons");
      return { ok: true as const };
    },
    createFolder: ({ name, threadIds, colorIndex, customColor }) => {
      const id = newFolderId();
      const uniqueThreadIds = [...new Set(threadIds)];
      const sortIndex = (
        sql(
          `SELECT COALESCE(MAX(sort_index), -1) + 1 AS next_index
           FROM thread_folders`,
        ).get() as { next_index: number }
      ).next_index;
      const folder: Folder = {
        id,
        name,
        colorIndex,
        customColor: normalizeColor(customColor),
        collapsed: false,
        sortIndex,
        threadIds: uniqueThreadIds,
      };
      db.transaction(() => {
        sql(
          `INSERT INTO thread_folders
           (id, name, color_index, custom_color, collapsed, sort_index, created_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
        ).run(
          folder.id,
          folder.name,
          folder.colorIndex,
          folder.customColor,
          folder.sortIndex,
          Date.now(),
        );
        const clearMembership = sql(
          `DELETE FROM folder_members WHERE thread_id = ?`,
        );
        const insertMembership = sql(
          `INSERT INTO folder_members (thread_id, folder_id, sort_index)
           VALUES (?, ?, ?)`,
        );
        uniqueThreadIds.forEach((threadId, index) => {
          clearMembership.run(threadId);
          insertMembership.run(threadId, id, index);
        });
      })();
      publishOrganization("createFolder");
      return { folder };
    },
    renameFolder: ({ folderId, name }) => {
      requireFolder(folderId);
      sql(`UPDATE thread_folders SET name = ? WHERE id = ?`).run(
        name,
        folderId,
      );
      publishOrganization("renameFolder");
      return { ok: true as const };
    },
    setFolderColor: ({ folderId, colorIndex, customColor }) => {
      requireFolder(folderId);
      sql(
        `UPDATE thread_folders SET color_index = ?, custom_color = ? WHERE id = ?`,
      ).run(colorIndex, normalizeColor(customColor), folderId);
      publishOrganization("setFolderColor");
      return { ok: true as const };
    },
    setFolderCollapsed: ({ folderId, collapsed }) => {
      requireFolder(folderId);
      sql(`UPDATE thread_folders SET collapsed = ? WHERE id = ?`).run(
        collapsed ? 1 : 0,
        folderId,
      );
      publishOrganization("setFolderCollapsed");
      return { ok: true as const };
    },
    reorderFolders: ({ folderIds }) => {
      const storedIds = (
        sql(`SELECT id FROM thread_folders`).all() as { id: string }[]
      ).map((row) => row.id);
      if (!sameIdSet(folderIds, storedIds)) {
        throw new Error("reorderFolders requires the complete folder order");
      }
      const update = sql(
        `UPDATE thread_folders SET sort_index = ? WHERE id = ?`,
      );
      db.transaction(() => {
        folderIds.forEach((id, index) => update.run(index, id));
      })();
      publishOrganization("reorderFolders");
      return { ok: true as const };
    },
    deleteFolder: ({ folderId }) => {
      requireFolder(folderId);
      db.transaction(() => {
        sql(`DELETE FROM folder_members WHERE folder_id = ?`).run(folderId);
        sql(`DELETE FROM thread_folders WHERE id = ?`).run(folderId);
      })();
      publishOrganization("deleteFolder");
      return { ok: true as const };
    },
    moveThreadToFolder: ({ threadId, folderId, beforeThreadId }) => {
      if (folderId !== null) requireFolder(folderId);
      db.transaction(() => {
        const previous = sql(`SELECT folder_id FROM folder_members WHERE thread_id = ?`)
          .get(threadId) as { folder_id: string } | undefined;
        sql(`DELETE FROM folder_members WHERE thread_id = ?`).run(threadId);
        if (previous) {
          writeMemberOrder(previous.folder_id, listMemberIds(previous.folder_id));
        }
        if (folderId === null) return;
        const destination = listMemberIds(folderId).filter((id) => id !== threadId);
        const beforeIndex =
          beforeThreadId === null ? -1 : destination.indexOf(beforeThreadId);
        destination.splice(
          beforeIndex === -1 ? destination.length : beforeIndex,
          0,
          threadId,
        );
        writeMemberOrder(folderId, destination);
      })();
      publishOrganization("moveThreadToFolder");
      return { ok: true as const };
    },
    reorderFolderThreads: ({ folderId, threadIds }) => {
      requireFolder(folderId);
      const storedIds = listMemberIds(folderId);
      if (!sameIdSet(threadIds, storedIds)) {
        throw new Error(
          "reorderFolderThreads requires the complete folder thread order",
        );
      }
      db.transaction(() => writeMemberOrder(folderId, threadIds))();
      publishOrganization("reorderFolderThreads");
      return { ok: true as const };
    },
    setThreadAccent: ({ threadId, colorIndex, customColor }) => {
      sql(
        `INSERT INTO thread_accents (thread_id, color_index, custom_color)
         VALUES (?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
           color_index = excluded.color_index,
           custom_color = excluded.custom_color`,
      ).run(threadId, colorIndex, normalizeColor(customColor));
      publishOrganization("setThreadAccent");
      return { ok: true as const };
    },
    setProjectAccent: ({ projectId, colorIndex, customColor }) => {
      sql(
        `INSERT INTO project_accents (project_id, color_index, custom_color)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           color_index = excluded.color_index,
           custom_color = excluded.custom_color`,
      ).run(projectId, colorIndex, normalizeColor(customColor));
      publishOrganization("setProjectAccent");
      return { ok: true as const };
    },
    reorderPinned: async ({ threadId, previousThreadId, nextThreadId }) => {
      const reordered = await bb.sdk.threads.reorderPinned({
        threadId,
        previousThreadId,
        nextThreadId,
      });
      return {
        pinnedThreadIds: reordered
          .filter((thread) => thread.pinnedAt !== null)
          .map((thread) => thread.id),
      };
    },
    listInboxOrder: () => ({ inboxThreadIds: readInboxOrder() }),
    reorderInbox: ({ inboxThreadIds }) => {
      replaceInboxOrder(inboxThreadIds);
      bb.realtime.publish(INBOX_ORDER_CHANNEL, {});
      return { inboxThreadIds: readInboxOrder() };
    },
    getSidebarSettings: () => readSidebarSettings(),
    updateSidebarSettings: (values) => {
      writeSidebarSettings(values);
      // The policy runs on these values, so the next read re-evaluates rather
      // than serving rows decided under the old ones.
      forceNextPolicyPass();
      bb.realtime.publish(SIDEBAR_SETTINGS_CHANNEL, {});
      return readSidebarSettings();
    },
    listProjectIconSettings: async () => {
      const projects = await bb.sdk.projects.list();
      const overrides = readProjectIconOverrides();
      const uploadNames = readProjectIconUploadNames();
      return {
        projects: projects
          .filter((project) => project.kind === "standard")
          .map((project) => ({
            id: project.id,
            name: project.name,
            customPath: overrides.get(project.id) ?? null,
            customUploadName: uploadNames.get(project.id) ?? null,
          })),
      };
    },
    searchProjectIconFiles: async ({ projectId, query }) => {
      const hostId = await defaultProjectHostId(projectId);
      const request = {
        projectId,
        includeFiles: "true" as const,
        includeDirectories: "false" as const,
        limit: "100",
        query,
      };
      const result = hostId
        ? await bb.sdk.projects.paths({ ...request, hostId })
        : await bb.sdk.projects.paths(request);
      return {
        paths: [
          ...new Set(
            result.paths.flatMap((entry) => {
              if (entry.kind !== "file") return [];
              const path = normalizeProjectIconPath(entry.path);
              return path ? [path] : [];
            }),
          ),
        ].slice(0, 30),
      };
    },
    setProjectIcon: async ({ projectId, path }) => {
      await bb.sdk.projects.get({ projectId });
      const normalized = path === null ? null : normalizeProjectIconPath(path);
      if (path !== null && normalized === null) {
        throw new Error("Choose a relative image path inside the project");
      }
      db.transaction(() => {
        if (normalized === null) {
          sql(`DELETE FROM project_icons WHERE project_id = ?`).run(
            projectId,
          );
        } else {
          sql(
            `INSERT INTO project_icons (project_id, path, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(project_id) DO UPDATE SET
               path = excluded.path, updated_at = excluded.updated_at`,
          ).run(projectId, normalized, Date.now());
        }
        sql(`DELETE FROM project_icon_uploads WHERE project_id = ?`).run(
          projectId,
        );
      })();
      clearProjectIconCache(projectId);
      bb.realtime.publish(PROJECT_ICONS_CHANNEL, { projectId });
      return { customPath: normalized, customUploadName: null };
    },
    uploadProjectIcon: async ({
      projectId,
      filename,
      mimeType,
      contentBase64,
    }) => {
      await bb.sdk.projects.get({ projectId });
      const bytes = Buffer.from(contentBase64, "base64");
      if (bytes.byteLength === 0 || bytes.byteLength > PROJECT_ICON_MAX_BYTES) {
        throw new Error("Choose an image smaller than 1 MB");
      }
      const normalizedFilename = filename.trim();
      const canonicalBase64 = bytes.toString("base64");
      if (canonicalBase64 !== contentBase64) {
        throw new Error("The selected image data is invalid");
      }
      const resolvedMimeType = iconMimeType(normalizedFilename, mimeType);
      db.transaction(() => {
        sql(
          `INSERT INTO project_icon_uploads (
             project_id, filename, mime_type, content_base64,
             size_bytes, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(project_id) DO UPDATE SET
             filename = excluded.filename,
             mime_type = excluded.mime_type,
             content_base64 = excluded.content_base64,
             size_bytes = excluded.size_bytes,
             updated_at = excluded.updated_at`,
        ).run(
          projectId,
          normalizedFilename,
          resolvedMimeType,
          canonicalBase64,
          bytes.byteLength,
          Date.now(),
        );
        sql(`DELETE FROM project_icons WHERE project_id = ?`).run(
          projectId,
        );
      })();
      clearProjectIconCache(projectId);
      bb.realtime.publish(PROJECT_ICONS_CHANNEL, { projectId });
      return { customPath: null, customUploadName: normalizedFilename };
    },
    listLifecycle: async ({ signals }) => {
      // The policy pass runs here rather than through a fifth mount RPC. A
      // failure must not cost the user their shelves, so it is logged and the
      // stored rows are answered either way.
      //
      // The whole snapshot is recorded first, not just its live rows: a thread
      // the client reported live earlier stays protected until a report says
      // it has gone quiet, this is the only place that report can arrive, and
      // a report that lands mid-pass still invalidates that pass.
      const releasedLiveHold = recordActivitySignals(
        signals.map((signal) => ({
          threadId: signal.threadId,
          live: signal.hasPendingInteraction || signal.isWorking,
        })),
      );
      const logPolicyFailure = (error: unknown) => {
        bb.log.error(
          `Automatic settle evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      };
      // Two reports can change what the policy decides: the first read after
      // load (or after a settings change or import), and one that releases a
      // live hold — the only transition that can newly park a thread. Those
      // are answered after the pass, exactly as before. A merely stale TTL
      // refreshes in the background instead: the answer is the stored rows,
      // and anything the pass changes reaches every client through
      // LIFECYCLE_CHANNEL, the same route the schedule's pass uses. Every
      // other revision — the constant stream of `updatedAt` ticks while an
      // agent works — costs one table read.
      if (lastPolicyPassAt === 0 || releasedLiveHold) {
        try {
          await evaluatePolicies();
        } catch (error) {
          logPolicyFailure(error);
        }
      } else if (Date.now() - lastPolicyPassAt >= POLICY_PASS_TTL_MS) {
        void evaluatePolicies().catch(logPolicyFailure);
      }
      return { rows: readAllLifecycle() };
    },
    settle: async ({ threadId }) => {
      // Native pinning and this plugin's settled shelf are competing ways to
      // keep a thread out of the ordinary inbox. Settling wins, and a failed
      // unpin leaves the lifecycle row untouched instead of half-applying it.
      await bb.sdk.threads.unpin({ threadId });
      // Settling clears any snooze: they are two answers to the same
      // question, and holding both would make the shelf order ambiguous.
      writeLifecycle({
        threadId,
        settledAt: Date.now(),
        settledOverride: "settled",
        snoozedUntil: null,
        snoozedAt: null,
      });
      return { ok: true };
    },
    unsettle: ({ threadId }) => {
      const current = readLifecycle(threadId);
      writeLifecycle({
        threadId,
        settledAt: null,
        settledOverride: "active",
        snoozedUntil: current?.snoozedUntil ?? null,
        snoozedAt: current?.snoozedAt ?? null,
      });
      return { ok: true };
    },
    snooze: ({ threadId, snoozedUntil }) => {
      writeLifecycle({
        threadId,
        settledAt: null,
        settledOverride: null,
        snoozedUntil,
        snoozedAt: Date.now(),
      });
      return { ok: true };
    },
    unsnooze: ({ threadId }) => {
      clearLifecycle(threadId);
      return { ok: true };
    },
    acknowledgeWake: ({ threadId }) => {
      // A woken snooze row is retained only to make the marker durable. Once
      // the user opens or dismisses it, the thread is ordinary active work.
      clearLifecycle(threadId);
      return { ok: true };
    },
    bulkSettle: async ({ threadIds }) => {
      const unpinned = await runBulkThreadAction(
        threadIds,
        async (threadId) => {
          await bb.sdk.threads.unpin({ threadId });
        },
        4,
      );
      const now = Date.now();
      writeManyLifecycle(
        unpinned.succeededThreadIds.map((threadId) => ({
          threadId,
          settledAt: now,
          settledOverride: "settled" as const,
          snoozedUntil: null,
          snoozedAt: null,
        })),
      );
      publishLifecycleChanges(unpinned.succeededThreadIds);
      return unpinned;
    },
    bulkSnooze: ({ threadIds, snoozedUntil }) => {
      const now = Date.now();
      writeManyLifecycle(
        threadIds.map((threadId) => ({
          threadId,
          settledAt: null,
          settledOverride: null,
          snoozedUntil,
          snoozedAt: now,
        })),
      );
      publishLifecycleChanges(threadIds);
      return { succeededThreadIds: [...threadIds], failures: [] };
    },
    evaluateAutoSettle: async () => ({
      changedThreadIds: await evaluatePolicies(),
    }),
  });

  if (!awaitingLegacyImport) await reconcileProjects("server-start");

  // Real work clears both kinds of manual settle override. The next quiet
  // period can then be judged against the current policies.
  bb.events.on("thread.active", ({ thread }) => {
    // Clearing the override hands the thread back to the policy, so the next
    // read re-evaluates it instead of waiting out the pass cadence.
    if (clearSettlingState(thread.id)) forceNextPolicyPass();
  });

  bb.events.on("thread.deleted", ({ thread }) => {
    const removed = db.transaction(() => {
      const membership = sql(`DELETE FROM folder_members WHERE thread_id = ?`)
        .run(thread.id);
      const accent = sql(`DELETE FROM thread_accents WHERE thread_id = ?`)
        .run(thread.id);
      const lifecycle = deleteLifecycle.run(thread.id);
      // The other way a live signal ends: the thread it protects is gone.
      setClientLive(thread.id, false);
      return {
        organization: membership.changes + accent.changes,
        lifecycle: lifecycle.changes,
      };
    })();
    if (removed.organization + removed.lifecycle > 0) {
      publishOrganization("thread.deleted");
    }
    // A deleted thread must not leave a lifecycle row behind: a future thread
    // reusing the id would come back already parked.
    if (removed.lifecycle > 0) {
      bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId: thread.id });
    }
    // A deleted id must not leave an order row behind that would place a
    // future thread reusing the id, and stale rows accumulate otherwise.
    const removedOrder = sql(`DELETE FROM inbox_order WHERE thread_id = ?`)
      .run(thread.id);
    if (removedOrder.changes > 0) bb.realtime.publish(INBOX_ORDER_CHANNEL, {});
  });
}
