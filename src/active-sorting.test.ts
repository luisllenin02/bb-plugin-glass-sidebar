import { describe, expect, it } from "vitest";
import {
  groupActiveThreadsByProject,
  sortActiveThreads,
} from "./active-sorting";
import { filterByProject } from "./inbox";

const threads = [
  { id: "a", projectId: "p2", createdAt: 10, updatedAt: 30 },
  { id: "b", projectId: "p1", createdAt: 30, updatedAt: 10 },
  { id: "c", projectId: "p1", createdAt: 20, updatedAt: 20 },
];
const names = new Map([
  ["p1", "Alpha"],
  ["p2", "Beta"],
]);

describe("active sort and project scope", () => {
  it("orders every active sort mode deterministically", () => {
    expect(sortActiveThreads(threads, "manual", names).map(({ id }) => id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(sortActiveThreads(threads, "activity", names).map(({ id }) => id)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(sortActiveThreads(threads, "created", names).map(({ id }) => id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortActiveThreads(threads, "project", names).map(({ id }) => id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("groups by project name and filters one project", () => {
    expect(
      groupActiveThreadsByProject(threads, names).map((group) => group.projectId),
    ).toEqual(["p1", "p2"]);
    expect(filterByProject(threads as never, "p1").map(({ id }) => id)).toEqual([
      "b",
      "c",
    ]);
    expect(filterByProject(threads as never, null)).toHaveLength(3);
  });
});
