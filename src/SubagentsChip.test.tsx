// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

const app = await loadPluginApp(() => import("../app"));
const childrenChip = app.threadHeaderActions.find(
  (slot) => slot.id === "children",
)!;

function thread(
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id: "thr_root",
    projectId: "proj_1",
    title: "A thread",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
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
    ...overrides,
  };
}

function renderChildren(isCompactViewport = false) {
  return renderSlot(
    childrenChip,
    { threadId: "root", projectId: "proj_1", isCompactViewport },
    {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({ id: "root", title: "Root" }),
          thread({ id: "child", title: "Child", parentThreadId: "root" }),
          thread({
            id: "grandchild",
            title: "Grandchild",
            parentThreadId: "child",
          }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false }],
      },
    },
  );
}

afterEach(cleanup);

describe("SubagentsChip", () => {
  it("renders nested descendants and opens all of them in split panes", () => {
    const rendered = renderChildren();
    fireEvent.click(screen.getByRole("button", { name: "2 child threads" }));

    expect(screen.getByRole("menu", { name: "Child threads" }).parentElement).toBe(
      document.body,
    );
    expect(screen.getByText("Child")).toBeDefined();
    expect(screen.getByText("Grandchild")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Open all in split" }));

    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: "child",
      options: { split: true },
    });
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: "grandchild",
      options: { split: true },
    });
  });

  it("gives a child row the host split context menu", () => {
    renderChildren();
    fireEvent.click(screen.getByRole("button", { name: "2 child threads" }));

    const child = screen.getByRole("menuitem", { name: "Child" });
    fireEvent.contextMenu(child);

    expect(screen.getByText("Open in split")).toBeDefined();
  });

  it("keeps the child count visible in compact mode", () => {
    renderChildren(true);
    expect(
      screen.getByRole("button", { name: "2 child threads" }).textContent,
    ).toBe("2");
  });
});
