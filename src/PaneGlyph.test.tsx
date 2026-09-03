// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PluginSidebarSplitPane } from "@get-bb/plugin-sdk";
import { PaneGlyph } from "./PaneGlyph";

afterEach(cleanup);

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
const MIDDLE = pane({
  paneId: "middle",
  rect: { x: 0.34, y: 0, width: 0.33, height: 1 },
});
const RIGHT = pane({
  paneId: "right",
  rect: { x: 0.67, y: 0, width: 0.33, height: 1 },
});

describe("PaneGlyph", () => {
  it("draws one rect per pane and says which one is this thread's", () => {
    render(
      <PaneGlyph
        panes={[RIGHT, { ...MIDDLE, isMe: true, isFocused: true }, LEFT]}
      />,
    );

    const glyph = screen.getByRole("img", {
      name: "Open in pane 2 of 3, focused",
    });
    const rects = glyph.querySelectorAll("rect");
    expect(rects).toHaveLength(3);
    expect(
      [...rects].map((rect) => rect.getAttribute("data-pane-id")),
    ).toEqual(["left", "middle", "right"]);

    const me = glyph.querySelector('rect[data-pane-id="middle"]')!;
    expect(me.getAttribute("class")).toContain("fill-primary/70");
    expect(me.getAttribute("stroke-width")).toBe("0");

    const other = glyph.querySelector('rect[data-pane-id="left"]')!;
    expect(other.getAttribute("class")).toContain("stroke-muted-foreground/30");
    expect(other.getAttribute("class")).toContain("fill-none");

    expect(screen.getByText("Pane 2 of 3")).toBeTruthy();
  });

  it("dims itself and says so when this thread's pane is not focused", () => {
    render(
      <PaneGlyph panes={[{ ...LEFT, isMe: true }, { ...RIGHT, isFocused: true }]} />,
    );

    const glyph = screen.getByRole("img", {
      name: "Open in pane 1 of 2, not focused",
    });
    expect(glyph.getAttribute("class")).toContain("opacity-60");
    expect(
      glyph
        .querySelector('rect[data-pane-id="left"]')!
        .getAttribute("class"),
    ).toContain("fill-muted-foreground/45");
    expect(screen.getByText("Pane 1 of 2")).toBeTruthy();
  });

  it("draws nothing when there is no split to describe", () => {
    const { container } = render(
      <PaneGlyph panes={[{ ...LEFT, isMe: true, isFocused: true }]} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
