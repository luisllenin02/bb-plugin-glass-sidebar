import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { buildColumns } from "./columns-view";
import type { SplitPaneEntry } from "./split-registry";
import type { WorkflowRun } from "./workflow-activity-shared";

function thread(
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id: "thr_1",
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
    updatedAt: 200,
    lastReadAt: 100,
    latestAttentionAt: 100,
    ...overrides,
  };
}

function pane(
  threadId: string,
  ordinal: number,
  isFocused = false,
): SplitPaneEntry {
  return { threadId, ordinal, count: 2, isFocused };
}

function workflow(id: string, status: WorkflowRun["status"]): WorkflowRun {
  return {
    id,
    originThreadId: "thr_a",
    name: id,
    status,
    phase: null,
    startedAt: 100,
  };
}

describe("buildColumns", () => {
  it("orders columns by pane ordinal, independent of input order", () => {
    const columns = buildColumns(
      [pane("thr_b", 2), pane("thr_a", 1)],
      [
        thread({ id: "thr_b", title: "Second" }),
        thread({ id: "thr_a", title: "First" }),
      ],
      [],
      (candidate) => `accent:${candidate.id}`,
    );

    expect(
      columns.map(({ threadId, ordinal }) => ({ threadId, ordinal })),
    ).toEqual([
      { threadId: "thr_a", ordinal: 1 },
      { threadId: "thr_b", ordinal: 2 },
    ]);
    expect(columns[0]).toMatchObject({
      title: "First",
      projectGlyph: "proj_1",
      projectAccent: "accent:thr_a",
      elapsed: 200,
    });
  });

  it("puts waiting workflow rows before running rows", () => {
    const columns = buildColumns(
      [pane("thr_a", 1)],
      [thread({ id: "thr_a" })],
      [workflow("running", "running"), workflow("queued", "queued")],
      () => undefined,
    );

    expect(columns[0]!.workflowRows.map((row) => row.id)).toEqual([
      "queued",
      "running",
    ]);
  });

  it("carries the focused pane flag and status glyph", () => {
    const columns = buildColumns(
      [pane("thr_a", 1, true)],
      [
        thread({
          id: "thr_a",
          indicator: "waiting-for-input",
          indicatorLabel: "Needs a decision",
        }),
      ],
      [],
      () => undefined,
    );

    expect(columns[0]).toMatchObject({
      isFocused: true,
      statusGlyph: "waiting-for-input",
    });
  });

  it("returns no columns for an empty pane snapshot", () => {
    expect(buildColumns([], [thread()], [], () => undefined)).toEqual([]);
  });
});
