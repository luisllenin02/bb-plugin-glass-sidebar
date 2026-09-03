import { describe, expect, it } from "vitest";
import type { PluginSidebarSplitPane } from "@get-bb/plugin-sdk";
import {
  ACCENT_ROW_CLASS,
  isFocusedPane,
  orderedPanes,
  paneOrdinal,
  railOpacity,
  resolvePaneState,
  rowAccentStyle,
  rowRootClasses,
  rowStateClasses,
  rowTitleClass,
  showAccentRail,
} from "./pane-state";

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

const LEFT = pane({
  paneId: "left",
  rect: { x: 0, y: 0, width: 0.5, height: 1 },
});
const RIGHT = pane({
  paneId: "right",
  rect: { x: 0.5, y: 0, width: 0.5, height: 1 },
});

describe("resolvePaneState", () => {
  it("calls the route's thread focused whatever the layout says", () => {
    expect(resolvePaneState(true, null)).toBe("focused");
    expect(resolvePaneState(true, { panes: [LEFT, RIGHT] })).toBe("focused");
  });

  it("calls a thread in the focused pane focused", () => {
    expect(
      resolvePaneState(false, {
        panes: [{ ...LEFT, isMe: true, isFocused: true }, RIGHT],
      }),
    ).toBe("focused");
  });

  it("calls a thread in another pane open", () => {
    expect(
      resolvePaneState(false, {
        panes: [{ ...LEFT, isMe: true }, { ...RIGHT, isFocused: true }],
      }),
    ).toBe("open");
  });

  it("calls a thread that is not on screen none", () => {
    expect(resolvePaneState(false, null)).toBe("none");
  });
});
describe("paneOrdinal", () => {
  it("orders a 1x2 split left to right", () => {
    expect(paneOrdinal([RIGHT, { ...LEFT, isMe: true }])).toEqual({
      index: 1,
      count: 2,
    });
    expect(paneOrdinal([{ ...RIGHT, isMe: true }, LEFT])).toEqual({
      index: 2,
      count: 2,
    });
  });

  it("orders a 2x2 grid by column, then by row", () => {
    const grid = [
      pane({
        paneId: "bottom-right",
        rect: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
      }),
      pane({
        paneId: "top-right",
        rect: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
        isMe: true,
      }),
      pane({
        paneId: "bottom-left",
        rect: { x: 0, y: 0.5, width: 0.5, height: 0.5 },
      }),
      pane({
        paneId: "top-left",
        rect: { x: 0, y: 0, width: 0.5, height: 0.5 },
      }),
    ];
    expect(orderedPanes(grid).map((entry) => entry.paneId)).toEqual([
      "top-left",
      "bottom-left",
      "top-right",
      "bottom-right",
    ]);
    expect(paneOrdinal(grid)).toEqual({ index: 3, count: 4 });
  });

  it("does not sort the caller's readonly array in place", () => {
    const panes = [RIGHT, { ...LEFT, isMe: true }];
    paneOrdinal(panes);
    expect(panes.map((entry) => entry.paneId)).toEqual(["right", "left"]);
  });

  it("returns null for a single pane, which is not a split", () => {
    expect(paneOrdinal([{ ...LEFT, isMe: true, isFocused: true }])).toBeNull();
    expect(paneOrdinal([])).toBeNull();
  });

  it("returns null when no pane holds this thread", () => {
    expect(paneOrdinal([LEFT, RIGHT])).toBeNull();
  });
});

describe("isFocusedPane", () => {
  it("is true only when this row's own pane has focus", () => {
    expect(
      isFocusedPane([{ ...LEFT, isMe: true, isFocused: true }, RIGHT]),
    ).toBe(true);
    expect(
      isFocusedPane([{ ...LEFT, isMe: true }, { ...RIGHT, isFocused: true }]),
    ).toBe(false);
  });
});

describe("rowStateClasses", () => {
  it("gives focused a solid surface and a ring", () => {
    const classes = rowStateClasses("focused", false);
    expect(classes).toContain("bg-sidebar-accent");
    expect(classes).not.toContain("bg-sidebar-accent/");
    expect(classes).toContain("ring-1");
    expect(classes).toContain("ring-primary/60");
    expect(classes).not.toContain("outline-dashed");
  });

  it("gives open its own quieter surface and a dashed outline", () => {
    const classes = rowStateClasses("open", false);
    expect(classes).toContain("bg-sidebar-accent/25");
    expect(classes).toContain("outline-dashed");
    expect(classes).toContain("outline-primary/50");
    expect(classes).not.toContain("ring-1");
  });

  it("leaves an idle row unpainted apart from hover", () => {
    const classes = rowStateClasses("none", false);
    expect(classes).toBe("hover:bg-sidebar-accent/60");
  });

  it("keeps the three states apart", () => {
    const seen = new Set(
      (["focused", "open", "none"] as const).map((state) =>
        rowStateClasses(state, false),
      ),
    );
    expect(seen.size).toBe(3);
  });

  it("marks an accented row for theme CSS", () => {
    expect(rowStateClasses("none", true)).toContain(ACCENT_ROW_CLASS);
    expect(rowStateClasses("none", false)).not.toContain(ACCENT_ROW_CLASS);
  });
});

describe("rowRootClasses", () => {
  it("lets the selection ring win over the pane outline", () => {
    const classes = rowRootClasses({
      state: "open",
      hasAccent: false,
      isSelected: true,
    });
    expect(classes).toContain("ring-primary/60");
    expect(classes).not.toContain("outline-dashed");
    expect(classes).toContain("bg-sidebar-accent");
  });

  it("falls back to the pane state when nothing is selected", () => {
    expect(
      rowRootClasses({ state: "open", hasAccent: false, isSelected: false }),
    ).toBe(rowStateClasses("open", false));
  });
});

describe("rowTitleClass", () => {
  it("weights the focused title and leaves an idle one alone", () => {
    expect(rowTitleClass("focused")).toBe("text-foreground font-semibold");
    expect(rowTitleClass("open")).toBe("text-foreground");
    expect(rowTitleClass("none")).toBe("");
  });
});

describe("the accent rail", () => {
  it("fades with distance from the user's attention", () => {
    expect(railOpacity("focused")).toBeGreaterThan(railOpacity("open"));
    expect(railOpacity("open")).toBeGreaterThan(railOpacity("none"));
  });

  it("shows on any on-screen row, and on an idle row only with a colour", () => {
    expect(showAccentRail("focused", false)).toBe(true);
    expect(showAccentRail("open", false)).toBe(true);
    expect(showAccentRail("none", true)).toBe(true);
    expect(showAccentRail("none", false)).toBe(false);
  });
});

describe("rowAccentStyle", () => {
  it("omits the property entirely when there is no accent", () => {
    expect(rowAccentStyle(undefined)).toBeUndefined();
    expect(rowAccentStyle("")).toBeUndefined();
  });

  it("carries a resolved colour as a custom property", () => {
    expect(rowAccentStyle("hsl(211 92% 62%)")).toEqual({
      "--thread-accent": "hsl(211 92% 62%)",
    });
  });
});
