import Database from "better-sqlite3";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "../server";
import type { Folder, Organization } from "./organization";
import { workflowStorePath } from "./workflow-activity";

interface CreatedFolderResult {
  folder: Folder;
}

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});

async function loadPlugin() {
  const { bb, harness } = createFakePluginHost({
    pluginId: "glass-sidebar",
    sdk: {
      threads: {
        list: async () => [],
        reorderPinned: async ({ threadId }) => [
          makeThreadResponse({ id: threadId, pinnedAt: 1 }),
          makeThreadResponse({ id: "thr_unpinned", pinnedAt: null }),
        ],
      },
    },
  });
  await plugin(bb);
  disposers.push(() => harness.lifecycle.dispose());
  return harness;
}

describe("workflow activity RPC", () => {
  it("reads active workflow rows from the host experimental data directory", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "glass-sidebar-workflow-rpc-"));
    const { bb, harness } = createFakePluginHost({
      pluginId: "glass-sidebar",
      dataDir,
    });
    const sourcePath = workflowStorePath(bb.storage.database().name, dataDir);
    mkdirSync(dirname(sourcePath), { recursive: true });
    const source = new Database(sourcePath);
    source.exec(`CREATE TABLE workflow_runs (
      id TEXT PRIMARY KEY,
      origin_thread_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      phase TEXT,
      started_at INTEGER,
      created_at INTEGER NOT NULL
    )`);
    source
      .prepare(
        `INSERT INTO workflow_runs
           (id, origin_thread_id, name, status, phase, started_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "wfr_active",
        "thr_origin",
        "glass-sidebar",
        "running",
        "Produce 2/3",
        123,
        100,
      );
    source.close();

    try {
      await plugin(bb);
      await expect(
        harness.behavior.callRpc("getWorkflowActivity", {}),
      ).resolves.toEqual({
        runs: [
          {
            id: "wfr_active",
            originThreadId: "thr_origin",
            name: "glass-sidebar",
            status: "running",
            phase: "Produce 2/3",
            startedAt: 123,
          },
        ],
        updatedAt: expect.any(Number),
        sourcePath,
        sourceStatus: "ok",
      });
    } finally {
      await harness.lifecycle.dispose();
      rmSync(dataDir, { recursive: true });
    }
  });
});

describe("organization RPC", () => {
  it("round-trips a created folder through plugin SQLite", async () => {
    const harness = await loadPlugin();

    const created = (await harness.behavior.callRpc("createFolder", {
      name: "Active matters",
      threadIds: ["thr_1", "thr_2"],
      colorIndex: 4,
      customColor: null,
    })) as { folder: Folder };
    const organization = (await harness.behavior.callRpc(
      "getOrganization",
      {},
    )) as Organization;

    expect(created.folder.id).toMatch(/^fld_[a-z0-9]{12}$/);
    expect(organization.folders).toEqual([created.folder]);
    expect(organization.members).toEqual({
      thr_1: created.folder.id,
      thr_2: created.folder.id,
    });
    expect(harness.realtimeSignals).toContainEqual({
      channel: "organization",
      payload: { reason: "createFolder" },
    });
  });
});

describe("organization", () => {
  it("manages folder metadata and rejects a partial folder order", async () => {
    const harness = await loadPlugin();
    await expect(
      harness.behavior.callRpc("getOrganization", {}),
    ).resolves.toEqual({
      folders: [],
      members: {},
      threadAccents: {},
      projectAccents: {},
    });

    const first = (await harness.behavior.callRpc("createFolder", {
      name: "  Alpha  ",
      threadIds: ["thr_1", "thr_2"],
      colorIndex: 1,
      customColor: null,
    })) as CreatedFolderResult;
    expect(first.folder).toMatchObject({
      name: "Alpha",
      colorIndex: 1,
      customColor: null,
      collapsed: false,
      sortIndex: 0,
      threadIds: ["thr_1", "thr_2"],
    });
    const second = (await harness.behavior.callRpc("createFolder", {
      name: "Beta",
    })) as CreatedFolderResult;

    await expect(
      harness.behavior.callRpc("renameFolder", {
        folderId: first.folder.id,
        name: "Renamed",
      }),
    ).resolves.toEqual({ ok: true });
    await harness.behavior.callRpc("setFolderColor", {
      folderId: first.folder.id,
      colorIndex: 2,
      customColor: "#AABBCC",
    });
    await harness.behavior.callRpc("setFolderCollapsed", {
      folderId: first.folder.id,
      collapsed: true,
    });
    await harness.behavior.callRpc("reorderFolders", {
      folderIds: [second.folder.id, first.folder.id],
    });

    const organized = (await harness.behavior.callRpc(
      "getOrganization",
      {},
    )) as Organization;
    expect(organized.folders.map((folder) => folder.id)).toEqual([
      second.folder.id,
      first.folder.id,
    ]);
    expect(organized.folders[1]).toMatchObject({
      name: "Renamed",
      colorIndex: 2,
      customColor: "#aabbcc",
      collapsed: true,
      sortIndex: 1,
    });

    await expect(
      harness.behavior.callRpc("reorderFolders", {
        folderIds: [first.folder.id],
      }),
    ).rejects.toThrow();
    await expect(
      harness.behavior.callRpc("reorderFolders", {
        folderIds: [first.folder.id, second.folder.id, "fld_unknown"],
      }),
    ).rejects.toThrow();
    await expect(
      harness.behavior.callRpc("setFolderCollapsed", {
        folderId: "fld_missing",
        collapsed: true,
      }),
    ).rejects.toThrow(/Unknown folder/);
  });

  it("dissolves a folder without deleting its threads and survives a reload", async () => {
    const harness = await loadPlugin();
    const folder = (await harness.behavior.callRpc("createFolder", {
      name: "Alpha",
      threadIds: ["thr_1"],
    })) as CreatedFolderResult;
    const kept = (await harness.behavior.callRpc("createFolder", {
      name: "Beta",
    })) as CreatedFolderResult;

    await expect(
      harness.behavior.callRpc("deleteFolder", { folderId: folder.folder.id }),
    ).resolves.toEqual({ ok: true });
    const afterDelete = (await harness.behavior.callRpc(
      "getOrganization",
      {},
    )) as Organization;
    expect(afterDelete.folders).toHaveLength(1);
    expect(afterDelete.members).toEqual({});
    expect(harness.realtimeSignals).toContainEqual({
      channel: "organization",
      payload: { reason: "deleteFolder" },
    });

    const reloaded = await harness.lifecycle.reload(plugin);
    disposers.push(() => reloaded.harness.lifecycle.dispose());
    const persisted = (await reloaded.harness.behavior.callRpc(
      "getOrganization",
      {},
    )) as Organization;
    expect(persisted.folders[0]).toMatchObject({
      id: kept.folder.id,
      name: "Beta",
    });
  });

  it("moves and reorders folder members at the requested position", async () => {
    const harness = await loadPlugin();
    const first = (await harness.behavior.callRpc("createFolder", {
      name: "Alpha",
      threadIds: ["thr_1", "thr_2"],
    })) as CreatedFolderResult;
    const second = (await harness.behavior.callRpc("createFolder", {
      name: "Beta",
      threadIds: ["thr_3"],
    })) as CreatedFolderResult;

    await harness.behavior.callRpc("moveThreadToFolder", {
      threadId: "thr_3",
      folderId: first.folder.id,
      beforeThreadId: "thr_2",
    });
    let organized = (await harness.behavior.callRpc(
      "getOrganization",
      {},
    )) as Organization;
    expect(
      organized.folders.find((folder) => folder.id === first.folder.id)
        ?.threadIds,
    ).toEqual(["thr_1", "thr_3", "thr_2"]);
    expect(
      organized.folders.find((folder) => folder.id === second.folder.id)
        ?.threadIds,
    ).toEqual([]);

    await harness.behavior.callRpc("reorderFolderThreads", {
      folderId: first.folder.id,
      threadIds: ["thr_2", "thr_1", "thr_3"],
    });
    organized = (await harness.behavior.callRpc(
      "getOrganization",
      {},
    )) as Organization;
    expect(organized.folders[0]?.threadIds).toEqual([
      "thr_2",
      "thr_1",
      "thr_3",
    ]);

    await harness.behavior.callRpc("moveThreadToFolder", {
      threadId: "thr_1",
      folderId: null,
    });
    organized = (await harness.behavior.callRpc(
      "getOrganization",
      {},
    )) as Organization;
    expect(organized.members.thr_1).toBeUndefined();
    await expect(
      harness.behavior.callRpc("moveThreadToFolder", {
        threadId: "thr_1",
        folderId: "fld_missing",
      }),
    ).rejects.toThrow(/Unknown folder/);
  });

  it("stores thread and project accents and rejects invalid inputs", async () => {
    const harness = await loadPlugin();
    await harness.behavior.callRpc("setThreadAccent", {
      threadId: "thr_1",
      colorIndex: 4,
      customColor: null,
    });
    await harness.behavior.callRpc("setProjectAccent", {
      projectId: "proj_1",
      colorIndex: 0,
      customColor: "#ABCDEF",
    });
    await expect(
      harness.behavior.callRpc("getOrganization", {}),
    ).resolves.toMatchObject({
      threadAccents: { thr_1: { colorIndex: 4, customColor: null } },
      projectAccents: { proj_1: { colorIndex: 0, customColor: "#abcdef" } },
    });

    await expect(
      harness.behavior.callRpc("setThreadAccent", {
        threadId: "thr_1",
        colorIndex: 9,
        customColor: null,
      }),
    ).rejects.toThrow();
    await expect(
      harness.behavior.callRpc("setProjectAccent", {
        projectId: "proj_1",
        colorIndex: 1,
        customColor: "#abc",
      }),
    ).rejects.toThrow();
    await expect(
      harness.behavior.callRpc("createFolder", { name: "   " }),
    ).rejects.toThrow();
  });

  it("prunes membership and thread accents when bb deletes a thread", async () => {
    const harness = await loadPlugin();
    const created = (await harness.behavior.callRpc("createFolder", {
      name: "Alpha",
      threadIds: ["thr_1"],
    })) as CreatedFolderResult;
    await harness.behavior.callRpc("setThreadAccent", {
      threadId: "thr_1",
      colorIndex: 8,
      customColor: null,
    });

    await harness.behavior.emitThreadEvent("thread.deleted", {
      thread: makeThreadResponse({ id: "thr_1" }),
    });

    const organized = (await harness.behavior.callRpc(
      "getOrganization",
      {},
    )) as Organization;
    expect(organized.members).toEqual({});
    expect(organized.threadAccents).toEqual({});
    expect(organized.folders[0]).toMatchObject({
      id: created.folder.id,
      threadIds: [],
    });
    expect(harness.realtimeSignals).toContainEqual({
      channel: "organization",
      payload: { reason: "thread.deleted" },
    });
  });
});

describe("inbox order", () => {
  it("stores a durable inbox order, signals it, and drops deleted rows", async () => {
    const harness = await loadPlugin();
    await expect(
      harness.behavior.callRpc("listInboxOrder", {}),
    ).resolves.toEqual({ inboxThreadIds: [] });

    await expect(
      harness.behavior.callRpc("reorderInbox", {
        inboxThreadIds: ["thr_b", "thr_a", "thr_c"],
      }),
    ).resolves.toEqual({ inboxThreadIds: ["thr_b", "thr_a", "thr_c"] });
    expect(harness.realtimeSignals).toContainEqual({
      channel: "inbox-order",
      payload: {},
    });

    await expect(
      harness.behavior.callRpc("reorderInbox", {
        inboxThreadIds: ["thr_a", "thr_a"],
      }),
    ).rejects.toThrow();

    await harness.behavior.emitThreadEvent("thread.deleted", {
      thread: makeThreadResponse({ id: "thr_a" }),
    });
    await expect(
      harness.behavior.callRpc("listInboxOrder", {}),
    ).resolves.toEqual({ inboxThreadIds: ["thr_b", "thr_c"] });
  });

  it("returns only still-pinned ids from the host reorder", async () => {
    const harness = await loadPlugin();
    await expect(
      harness.behavior.callRpc("reorderPinned", {
        threadId: "thr_pin",
        previousThreadId: null,
        nextThreadId: "thr_next",
      }),
    ).resolves.toEqual({ pinnedThreadIds: ["thr_pin"] });
  });
});
