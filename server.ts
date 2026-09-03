import { randomUUID } from "node:crypto";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import type Database from "better-sqlite3";
import { z } from "zod";
import {
  INBOX_ORDER_CHANNEL,
  ORGANIZATION_CHANNEL,
  type Folder,
  type Organization,
  type ProjectDecorMap,
} from "./src/organization";
import {
  closeWorkflowActivitySource,
  readWorkflowActivity,
  workflowStorePath,
} from "./src/workflow-activity";

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
  color: z.string().nullable(),
  source: z.string(),
  updatedAt: z.number().int(),
});
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
    output: z.object({ decor: z.record(z.string(), projectDecorSchema) }),
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
});

const migrations = [
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
];

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

interface StoredProjectDecorRow {
  project_id: string;
  icon: string | null;
  color: string | null;
  source: string;
  updated_at: number;
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
  bb.storage.migrate(db, migrations);
  bb.onDispose(() => closeWorkflowActivitySource(workflowSourcePath));

  const publishOrganization = (reason: string) => {
    bb.realtime.publish(ORGANIZATION_CHANNEL, { reason });
  };

  const listMemberIds = (folderId: string): string[] =>
    (
      db
        .prepare(
          `SELECT thread_id, folder_id, sort_index FROM folder_members
           WHERE folder_id = ? ORDER BY sort_index, thread_id`,
        )
        .all(folderId) as StoredMemberRow[]
    ).map((row) => row.thread_id);

  const writeMemberOrder = (folderId: string, threadIds: readonly string[]) => {
    db.prepare(`DELETE FROM folder_members WHERE folder_id = ?`).run(folderId);
    const insert = db.prepare(
      `INSERT INTO folder_members (thread_id, folder_id, sort_index)
       VALUES (?, ?, ?)`,
    );
    threadIds.forEach((threadId, sortIndex) =>
      insert.run(threadId, folderId, sortIndex),
    );
  };

  const requireFolder = (folderId: string) => {
    const found = db
      .prepare(`SELECT 1 AS found FROM thread_folders WHERE id = ?`)
      .get(folderId) as { found: number } | undefined;
    if (!found) throw new Error(`Unknown folder: ${folderId}`);
  };

  const readOrganization = (): Organization => {
    const folderRows = db
      .prepare(
        `SELECT id, name, color_index, custom_color, collapsed, sort_index
         FROM thread_folders ORDER BY sort_index, created_at, id`,
      )
      .all() as StoredFolderRow[];
    const memberRows = db
      .prepare(
        `SELECT thread_id, folder_id, sort_index FROM folder_members
         ORDER BY folder_id, sort_index, thread_id`,
      )
      .all() as StoredMemberRow[];
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
      const rows = db
        .prepare(
          `SELECT ${key} AS owner_id, color_index, custom_color FROM ${table}`,
        )
        .all() as StoredAccentRow[];
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

  const readInboxOrder = (): string[] =>
    (
      db
        .prepare(
          `SELECT thread_id FROM inbox_order
           ORDER BY sort_index ASC, thread_id ASC`,
        )
        .all() as Array<{ thread_id: string }>
    ).map((row) => row.thread_id);

  const replaceInboxOrder = db.transaction((inboxThreadIds: string[]) => {
    db.prepare(`DELETE FROM inbox_order`).run();
    const insert = db.prepare(
      `INSERT INTO inbox_order (thread_id, sort_index) VALUES (?, ?)`,
    );
    inboxThreadIds.forEach((threadId, index) => insert.run(threadId, index));
  });

  const readProjectDecor = (): ProjectDecorMap => {
    const rows = db
      .prepare(`SELECT project_id, icon, color, source, updated_at FROM project_decor`)
      .all() as StoredProjectDecorRow[];
    return Object.fromEntries(
      rows.map((row) => [
        row.project_id,
        {
          icon: row.icon,
          color: row.color,
          source: row.source,
          updatedAt: row.updated_at,
        },
      ]),
    );
  };

  bb.rpc.register(glassSidebarRpcContract, {
    getWorkflowActivity: () =>
      readWorkflowActivity(
        workflowSourcePath,
        openSiblingDatabase,
        Date.now(),
        (message) => bb.log.warn(message),
      ),
    getOrganization: () => readOrganization(),
    getProjectDecor: () => ({ decor: readProjectDecor() }),
    createFolder: ({ name, threadIds, colorIndex, customColor }) => {
      const id = newFolderId();
      const uniqueThreadIds = [...new Set(threadIds)];
      const sortIndex = (
        db
          .prepare(
            `SELECT COALESCE(MAX(sort_index), -1) + 1 AS next_index
             FROM thread_folders`,
          )
          .get() as { next_index: number }
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
        db.prepare(
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
        const clearMembership = db.prepare(
          `DELETE FROM folder_members WHERE thread_id = ?`,
        );
        const insertMembership = db.prepare(
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
      db.prepare(`UPDATE thread_folders SET name = ? WHERE id = ?`).run(
        name,
        folderId,
      );
      publishOrganization("renameFolder");
      return { ok: true as const };
    },
    setFolderColor: ({ folderId, colorIndex, customColor }) => {
      requireFolder(folderId);
      db.prepare(
        `UPDATE thread_folders SET color_index = ?, custom_color = ? WHERE id = ?`,
      ).run(colorIndex, normalizeColor(customColor), folderId);
      publishOrganization("setFolderColor");
      return { ok: true as const };
    },
    setFolderCollapsed: ({ folderId, collapsed }) => {
      requireFolder(folderId);
      db.prepare(`UPDATE thread_folders SET collapsed = ? WHERE id = ?`).run(
        collapsed ? 1 : 0,
        folderId,
      );
      publishOrganization("setFolderCollapsed");
      return { ok: true as const };
    },
    reorderFolders: ({ folderIds }) => {
      const storedIds = (
        db.prepare(`SELECT id FROM thread_folders`).all() as { id: string }[]
      ).map((row) => row.id);
      if (!sameIdSet(folderIds, storedIds)) {
        throw new Error("reorderFolders requires the complete folder order");
      }
      const update = db.prepare(
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
        db.prepare(`DELETE FROM folder_members WHERE folder_id = ?`).run(folderId);
        db.prepare(`DELETE FROM thread_folders WHERE id = ?`).run(folderId);
      })();
      publishOrganization("deleteFolder");
      return { ok: true as const };
    },
    moveThreadToFolder: ({ threadId, folderId, beforeThreadId }) => {
      if (folderId !== null) requireFolder(folderId);
      db.transaction(() => {
        const previous = db
          .prepare(`SELECT folder_id FROM folder_members WHERE thread_id = ?`)
          .get(threadId) as { folder_id: string } | undefined;
        db.prepare(`DELETE FROM folder_members WHERE thread_id = ?`).run(threadId);
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
      db.prepare(
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
      db.prepare(
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
  });

  bb.events.on("thread.deleted", ({ thread }) => {
    const removed = db.transaction(() => {
      const membership = db
        .prepare(`DELETE FROM folder_members WHERE thread_id = ?`)
        .run(thread.id);
      const accent = db
        .prepare(`DELETE FROM thread_accents WHERE thread_id = ?`)
        .run(thread.id);
      const lifecycle = db
        .prepare(`DELETE FROM thread_lifecycle WHERE thread_id = ?`)
        .run(thread.id);
      return membership.changes + accent.changes + lifecycle.changes;
    })();
    if (removed > 0) publishOrganization("thread.deleted");
    // A deleted id must not leave an order row behind that would place a
    // future thread reusing the id, and stale rows accumulate otherwise.
    const removedOrder = db
      .prepare(`DELETE FROM inbox_order WHERE thread_id = ?`)
      .run(thread.id);
    if (removedOrder.changes > 0) bb.realtime.publish(INBOX_ORDER_CHANNEL, {});
  });
}
