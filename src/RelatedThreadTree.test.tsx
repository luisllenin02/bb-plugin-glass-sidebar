// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

const splitRuntime = vi.hoisted(() => ({
  layouts: new Map<string, unknown>(),
  onPointerDown: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@get-bb/plugin-sdk/app", () => ({
  experimental_useSidebarThreadActions: () => ({ open: splitRuntime.open }),
  experimental_useSidebarThreadSplit: (threadId: string) => ({
    splitProps: { onPointerDown: splitRuntime.onPointerDown },
    layout: splitRuntime.layouts.get(threadId) ?? null,
  }),
}));

vi.mock("./components/Icon", () => ({ Icon: () => null }));
vi.mock("./Disc", () => ({ Disc: () => null }));
vi.mock("./RowContextMenu", () => ({
  RowContextMenu: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./StatusGlyph", () => ({ StatusGlyph: () => null }));
vi.mock("./WorkflowRunRow", () => ({ WorkflowRunRow: () => null }));

const { RelatedThreadNode } = await import("./RelatedThreadTree");

function thread(id: string, title: string): PluginSidebarThread {
  return {
    id,
    projectId: "proj_1",
    title,
    titleFallback: null,
    parentThreadId: "thr_parent",
    sectionId: null,
    originKind: "fork",
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 100,
    updatedAt: 100,
    lastReadAt: 100,
    latestAttentionAt: 100,
  };
}

function splitLayout(isFocused: boolean) {
  return {
    panes: [
      {
        paneId: "pane_me",
        isMe: true,
        isFocused,
        rect: { x: 0, y: 0, width: 0.5, height: 1 },
      },
      {
        paneId: "pane_other",
        isMe: false,
        isFocused: !isFocused,
        rect: { x: 0.5, y: 0, width: 0.5, height: 1 },
      },
    ],
  };
}

function renderNode(id: string, title: string) {
  render(
    <RelatedThreadNode node={{ thread: thread(id, title), children: [] }} />,
  );
  return screen.getByRole("button", { name: title });
}

afterEach(() => {
  cleanup();
  splitRuntime.layouts.clear();
  splitRuntime.onPointerDown.mockReset();
  splitRuntime.open.mockReset();
});

describe("RelatedThreadNode pane state", () => {
  it("renders focused, open, and idle related rows as distinct surfaces", () => {
    splitRuntime.layouts.set("thr_focused", splitLayout(true));
    splitRuntime.layouts.set("thr_open", splitLayout(false));

    const focused = renderNode("thr_focused", "Focused child");
    const open = renderNode("thr_open", "Open child");
    const idle = renderNode("thr_idle", "Idle child");

    expect(focused.dataset.threadPaneState).toBe("focused");
    expect(focused.className).toContain("ring-primary/60");
    expect(focused.querySelector('[data-accent-rail="focused"]')).toBeTruthy();
    expect(screen.getByLabelText(/Open in pane 1 of 2, focused/)).toBeTruthy();

    expect(open.dataset.threadPaneState).toBe("open");
    expect(open.className).toContain("bg-sidebar-accent/25");
    expect(open.className).toContain("outline-dashed");
    expect(open.querySelector('[data-accent-rail="open"]')).toBeTruthy();
    expect(
      screen.getByLabelText(/Open in pane 1 of 2, not focused/),
    ).toBeTruthy();

    expect(idle.dataset.threadPaneState).toBe("none");
    expect(idle.className).toContain("hover:bg-sidebar-accent/60");
    expect(idle.querySelector("[data-accent-rail]")).toBeNull();

    expect(new Set([focused.className, open.className, idle.className]).size).toBe(
      3,
    );
  });

  it("preserves split pointer handling and the existing open action", () => {
    const row = renderNode("thr_child", "Child thread");

    fireEvent.pointerDown(row);
    fireEvent.click(row);

    expect(splitRuntime.onPointerDown).toHaveBeenCalledOnce();
    expect(splitRuntime.open).toHaveBeenCalledWith("thr_child", { split: false });
  });
});
