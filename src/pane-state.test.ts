import type { PluginSidebarSplitPane } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";
import { orderedPanes, paneOrdinal, resolvePaneState } from "./pane-state";

function pane(
  overrides: Partial<PluginSidebarSplitPane> & { paneId: string },
): PluginSidebarSplitPane {
  return {
    rect: { x: 0, y: 0, width: 1, height: 1 },
    isMe: false,
    isFocused: false,
    ...overrides,
  };
}

const left = pane({
  paneId: "left",
  rect: { x: 0, y: 0, width: 0.5, height: 1 },
});
const right = pane({
  paneId: "right",
  rect: { x: 0.5, y: 0, width: 0.5, height: 1 },
});

describe("pane state", () => {
  it("distinguishes route focus, split focus, open, and absent", () => {
    expect(resolvePaneState(true, null)).toBe("focused");
    expect(
      resolvePaneState(false, {
        panes: [{ ...left, isMe: true, isFocused: true }, right],
      }),
    ).toBe("focused");
    expect(
      resolvePaneState(false, {
        panes: [{ ...left, isMe: true }, { ...right, isFocused: true }],
      }),
    ).toBe("open");
    expect(resolvePaneState(false, null)).toBe("none");
  });

  it("orders panes left-to-right then top-to-bottom", () => {
    expect(orderedPanes([right, left]).map((entry) => entry.paneId)).toEqual([
      "left",
      "right",
    ]);
    expect(paneOrdinal([right, { ...left, isMe: true }])).toEqual({
      index: 1,
      count: 2,
    });
    expect(paneOrdinal([{ ...right, isMe: true }, left])).toEqual({
      index: 2,
      count: 2,
    });
  });

  it("returns null when an ordinal would be meaningless", () => {
    expect(paneOrdinal([{ ...left, isMe: true }])).toBeNull();
    expect(paneOrdinal([left, right])).toBeNull();
  });
});
