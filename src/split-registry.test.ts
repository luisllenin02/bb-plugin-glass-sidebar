import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSnapshot,
  reportPane,
  resetSplitRegistryForTests,
  subscribe,
} from "./split-registry";

afterEach(() => {
  resetSplitRegistryForTests();
});

describe("split-registry", () => {
  it("returns a stable snapshot ordered by pane ordinal", () => {
    reportPane("thr_b", { ordinal: 2, count: 2, isFocused: false });
    reportPane("thr_a", { ordinal: 1, count: 2, isFocused: true });
    const snapshot = getSnapshot();
    expect(snapshot.map((entry) => entry.threadId)).toEqual([
      "thr_a",
      "thr_b",
    ]);
    expect(getSnapshot()).toBe(snapshot);
  });

  it("notifies subscribers on a real change and not on a no-op report", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    reportPane("thr_a", { ordinal: 1, count: 2, isFocused: true });
    expect(listener).toHaveBeenCalledTimes(1);

    reportPane("thr_a", { ordinal: 1, count: 2, isFocused: true });
    expect(listener).toHaveBeenCalledTimes(1);

    reportPane("thr_a", { ordinal: 1, count: 2, isFocused: false });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    reportPane("thr_a", null);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("removes a thread on cleanup and is a no-op clearing an absent thread", () => {
    reportPane("thr_a", { ordinal: 1, count: 2, isFocused: true });
    reportPane("thr_a", null);
    expect(getSnapshot()).toEqual([]);

    const listener = vi.fn();
    subscribe(listener);
    reportPane("thr_never_reported", null);
    expect(listener).not.toHaveBeenCalled();
  });
});
