import { describe, expect, it } from "vitest";
import { dropTargetFromPoint, partitionByFolder } from "./folder-list";
import type { Folder } from "./organization";

const folders: Folder[] = [
  {
    id: "later",
    name: "Later",
    colorIndex: 0,
    customColor: null,
    collapsed: false,
    sortIndex: 1,
    threadIds: ["c"],
  },
  {
    id: "first",
    name: "First",
    colorIndex: 1,
    customColor: null,
    collapsed: false,
    sortIndex: 0,
    threadIds: ["b", "missing", "a", "archived"],
  },
];

describe("partitionByFolder", () => {
  it("uses folder and member order while leaving lifecycle-hidden rows out", () => {
    const result = partitionByFolder(
      [
        { id: "a", isArchived: false },
        { id: "b", isArchived: false },
        { id: "c", isArchived: false },
        { id: "loose", isArchived: false },
        { id: "archived", isArchived: true },
      ],
      { folders },
    );

    expect(result.folderEntries.map((entry) => entry.folder.id)).toEqual([
      "first",
      "later",
    ]);
    expect(result.folderEntries[0]!.members.map((thread) => thread.id)).toEqual([
      "b",
      "a",
    ]);
    expect(result.ungrouped.map((thread) => thread.id)).toEqual(["loose"]);
  });

  it("lets a parked member reappear when the caller restores it", () => {
    const hidden = partitionByFolder(
      [{ id: "loose", isArchived: false }],
      { folders },
    );
    expect(hidden.folderEntries[0]!.members).toEqual([]);

    const restored = partitionByFolder(
      [
        { id: "a", isArchived: false },
        { id: "loose", isArchived: false },
      ],
      { folders },
    );
    expect(restored.folderEntries[0]!.members.map((thread) => thread.id)).toEqual([
      "a",
    ]);
  });
});

describe("dropTargetFromPoint", () => {
  const folder = {
    kind: "folder" as const,
    folderId: "first",
    rect: { left: 0, top: 0, right: 200, bottom: 100 },
  };

  it("prefers a nested member and returns its insertion edge", () => {
    expect(
      dropTargetFromPoint(
        { x: 50, y: 25 },
        [
          folder,
          {
            kind: "thread",
            threadId: "a",
            folderId: "first",
            rect: { left: 10, top: 20, right: 190, bottom: 60 },
          },
        ],
      ),
    ).toEqual({
      kind: "thread",
      threadId: "a",
      folderId: "first",
      placement: "before",
    });
  });

  it("reserves the centre of an ungrouped card for folder creation", () => {
    expect(
      dropTargetFromPoint(
        { x: 50, y: 50 },
        [
          {
            kind: "thread",
            threadId: "loose",
            folderId: null,
            rect: { left: 0, top: 0, right: 100, bottom: 100 },
          },
        ],
      ),
    ).toEqual({
      kind: "thread",
      threadId: "loose",
      folderId: null,
      placement: "on",
    });
  });

  it("returns null outside every supplied rectangle", () => {
    expect(dropTargetFromPoint({ x: 250, y: 250 }, [folder])).toBeNull();
  });
});
