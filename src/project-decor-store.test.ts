import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createProjectDecorStore } from "./project-decor-store";

function createStore() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE project_decor (
    project_id TEXT PRIMARY KEY, icon TEXT, color TEXT,
    source TEXT NOT NULL DEFAULT 'auto', updated_at INTEGER NOT NULL
  )`);
  return { db, store: createProjectDecorStore(db) };
}

describe("project decor store", () => {
  it("writes manual rows and lists the owned table", () => {
    const { db, store } = createStore();
    try {
      store.set({ projectId: "proj_1", icon: "rocket", color: "blue" });
      expect(store.get("proj_1")).toMatchObject({
        projectId: "proj_1",
        icon: "rocket",
        color: "blue",
        source: "manual",
      });
      expect(store.list()).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("changes auto rows only when needed and never overwrites manual rows", () => {
    const { db, store } = createStore();
    try {
      expect(
        store.upsertAuto({ projectId: "proj_auto", icon: "code", color: "pink" }),
      ).toBe(true);
      expect(
        store.upsertAuto({ projectId: "proj_auto", icon: "code", color: "pink" }),
      ).toBe(false);
      expect(
        store.upsertAuto({ projectId: "proj_auto", icon: "folder-01", color: "red" }),
      ).toBe(true);

      store.set({ projectId: "proj_auto", icon: "star", color: "teal" });
      expect(
        store.upsertAuto({ projectId: "proj_auto", icon: "code", color: "pink" }),
      ).toBe(false);
      expect(store.get("proj_auto")).toMatchObject({
        icon: "star",
        color: "teal",
        source: "manual",
      });
    } finally {
      db.close();
    }
  });

  it("distinguishes clearing any row from clearing manual rows", () => {
    const { db, store } = createStore();
    try {
      store.upsertAuto({ projectId: "proj_auto", icon: "code", color: "pink" });
      store.set({ projectId: "proj_manual", icon: "star", color: null });
      expect(store.clearManual("proj_auto")).toBe(false);
      expect(store.clearManual("proj_manual")).toBe(true);
      expect(store.clear("proj_auto")).toBe(true);
      expect(store.list()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("reads many rows in one chunked batch, omitting absent ids", () => {
    const { db, store } = createStore();
    try {
      store.set({ projectId: "proj_1", icon: "rocket", color: "blue" });
      store.set({ projectId: "proj_2", icon: "code", color: "pink" });

      const many = store.getMany(["proj_1", "proj_missing", "proj_2"]);
      expect([...many.keys()].sort()).toEqual(["proj_1", "proj_2"]);
      expect(many.get("proj_1")).toMatchObject({ icon: "rocket" });
      expect(many.get("proj_2")).toMatchObject({ icon: "code" });
      expect(many.has("proj_missing")).toBe(false);
    } finally {
      db.close();
    }
  });
});
