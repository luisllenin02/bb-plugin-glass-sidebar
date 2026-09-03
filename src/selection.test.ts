import { describe, expect, it } from "vitest";
import {
  EMPTY_THREAD_SELECTION,
  keepFailedSelection,
  reconcileThreadSelection,
  updateThreadSelection,
} from "./selection";

describe("thread selection", () => {
  it("toggles individual rows with the platform modifier", () => {
    const first = updateThreadSelection(
      EMPTY_THREAD_SELECTION,
      ["a", "b", "c"],
      "a",
      { shiftKey: false, toggleKey: true },
    );
    const second = updateThreadSelection(first, ["a", "b", "c"], "c", {
      shiftKey: false,
      toggleKey: true,
    });
    const third = updateThreadSelection(second, ["a", "b", "c"], "a", {
      shiftKey: false,
      toggleKey: true,
    });
    expect([...second.selectedIds]).toEqual(["a", "c"]);
    expect([...third.selectedIds]).toEqual(["c"]);
  });

  it("selects a contiguous range from the visible anchor", () => {
    const anchored = updateThreadSelection(
      EMPTY_THREAD_SELECTION,
      ["a", "b", "c", "d"],
      "b",
      { shiftKey: false, toggleKey: true },
    );
    const ranged = updateThreadSelection(
      anchored,
      ["a", "b", "c", "d"],
      "d",
      { shiftKey: true, toggleKey: false },
    );
    expect([...ranged.selectedIds]).toEqual(["b", "c", "d"]);
    expect(ranged.anchorId).toBe("b");
  });

  it("reconciles hidden rows and keeps only visible failures", () => {
    const reconciled = reconcileThreadSelection(
      { selectedIds: new Set(["a", "b", "c"]), anchorId: "a" },
      ["b", "c", "d"],
    );
    expect([...reconciled.selectedIds]).toEqual(["b", "c"]);
    expect(reconciled.anchorId).toBeNull();
    const retained = keepFailedSelection(["b", "gone", "d"], ["a", "b", "d"]);
    expect([...retained.selectedIds]).toEqual(["b", "d"]);
    expect(retained.anchorId).toBe("b");
  });
});
