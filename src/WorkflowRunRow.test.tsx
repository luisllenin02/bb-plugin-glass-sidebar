// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { WorkflowRun } from "./workflow-activity";

await loadPluginApp(() => import("../app"));
const { WorkflowRunRow } = await import("./WorkflowRunRow");
const { ThreadCard } = await import("./ThreadCard");

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "wfr_1",
    originThreadId: "thr_origin",
    name: "glass-sidebar",
    status: "running",
    phase: "Produce 2/3",
    startedAt: 1_000,
    ...overrides,
  };
}

function thread(): PluginSidebarThread {
  return {
    id: "thr_origin",
    projectId: "proj_1",
    title: "Origin",
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
    createdAt: 1_000,
    updatedAt: 1_000,
    lastReadAt: 1_000,
    latestAttentionAt: 1_000,
  };
}

afterEach(cleanup);

describe("WorkflowRunRow", () => {
  it("renders the workflow grammar, phase, spinner, and elapsed age", () => {
    const rendered = renderSlot(
      { component: WorkflowRunRow },
      { run: run(), now: 301_000 },
    );

    const row = screen.getByRole("button", {
      name: "workflow · glass-sidebar, Produce 2/3, running, 5m",
    });
    expect(row.querySelector('[data-icon="Workflow"]')).toBeTruthy();
    expect(row.querySelector('[data-icon="Loading"]')).toBeTruthy();
    expect(screen.getByText("Produce 2/3")).toBeTruthy();
    expect(screen.getByText("5m")).toBeTruthy();

    fireEvent.click(row);
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: "thr_origin",
      options: undefined,
    });
  });

  it("shows queued in place of the running spinner", () => {
    renderSlot(
      { component: WorkflowRunRow },
      { run: run({ status: "queued", phase: null }), now: 301_000 },
    );

    expect(screen.getByText("queued")).toBeTruthy();
    expect(document.querySelector('[data-icon="Loading"]')).toBeNull();
  });

  it("counts and expands a workflow run under its origin thread card", () => {
    const origin = thread();
    renderSlot(
      { component: ThreadCard },
      {
        thread: origin,
        threads: [origin],
        workflowRuns: [run()],
        projectName: "Glass Sidebar",
        isActive: false,
        onNavigate: () => {},
        now: 301_000,
      },
    );

    expect(screen.queryByText("workflow · glass-sidebar")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Show 1 related child threads",
      }),
    );
    expect(screen.getByText("workflow · glass-sidebar")).toBeTruthy();
    expect(
      screen.getByRole("tree", { name: "Related child threads for Origin" }),
    ).toBeTruthy();
  });
});
