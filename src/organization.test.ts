import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_CHANNEL,
  applyMove,
  applyReorder,
  folderOf,
  resolveAccent,
  type Organization,
  uniqueFolderName,
} from "./organization";

function organization(): Organization {
  return {
    folders: [
      {
        id: "fld_a",
        name: "Alpha",
        colorIndex: 2,
        customColor: null,
        collapsed: false,
        sortIndex: 0,
        threadIds: ["thr_1", "thr_2"],
      },
      {
        id: "fld_b",
        name: "Beta",
        colorIndex: 0,
        customColor: null,
        collapsed: true,
        sortIndex: 1,
        threadIds: ["thr_3"],
      },
    ],
    members: { thr_1: "fld_a", thr_2: "fld_a", thr_3: "fld_b" },
    threadAccents: {},
    projectAccents: {},
  };
}

describe("organization helpers", () => {
  it("names the realtime channel the server publishes on", () => {
    expect(ORGANIZATION_CHANNEL).toBe("organization");
  });

  it("finds folders and generates unique names", () => {
    const org = organization();
    expect(folderOf(org, "thr_2")?.id).toBe("fld_a");
    expect(folderOf(org, "missing")).toBeNull();
    expect(uniqueFolderName(org.folders, "Alpha")).toBe("Alpha 2");
    expect(uniqueFolderName(org.folders)).toBe("New folder");
  });

  it("resolves thread, folder, then project accents while skipping empty values", () => {
    const org = organization();
    org.threadAccents.thr_1 = { colorIndex: 4, customColor: null };
    org.projectAccents.proj_1 = { colorIndex: 7, customColor: null };
    expect(resolveAccent("thr_1", "proj_1", org)?.colorIndex).toBe(4);
    org.threadAccents.thr_1 = { colorIndex: 0, customColor: null };
    expect(resolveAccent("thr_1", "proj_1", org)?.colorIndex).toBe(2);
    expect(resolveAccent("thr_3", "proj_1", org)?.colorIndex).toBe(7);
    expect(resolveAccent("missing", "missing", org)).toBeNull();
  });

  it("moves a thread between folders at the requested position", () => {
    const org = organization();
    const moved = applyMove(org, "thr_3", "fld_a", "thr_2");
    expect(moved.folders[0]?.threadIds).toEqual(["thr_1", "thr_3", "thr_2"]);
    expect(moved.folders[1]?.threadIds).toEqual([]);
    expect(moved.members.thr_3).toBe("fld_a");
    expect(org.folders[1]?.threadIds).toEqual(["thr_3"]);
    expect(applyMove(moved, "thr_3", null).members.thr_3).toBeUndefined();
    expect(applyMove(org, "thr_3", "fld_missing")).toBe(org);
  });

  it("reorders folders and members only for complete valid orders", () => {
    const org = organization();
    const folders = applyReorder(org, { folderIds: ["fld_b", "fld_a"] });
    expect(folders.folders.map(({ id, sortIndex }) => [id, sortIndex])).toEqual([
      ["fld_b", 0],
      ["fld_a", 1],
    ]);
    const members = applyReorder(org, {
      folderId: "fld_a",
      threadIds: ["thr_2", "thr_1"],
    });
    expect(members.folders[0]?.threadIds).toEqual(["thr_2", "thr_1"]);
    expect(applyReorder(org, { folderIds: ["fld_a"] })).toBe(org);
    expect(
      applyReorder(org, { folderId: "fld_a", threadIds: ["thr_1"] }),
    ).toBe(org);
  });
});
