// @vitest-environment jsdom
import type { PluginSidebarThread, PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SIDEBAR_SETTINGS } from "./sidebar-settings";

const app = await loadPluginApp(() => import("../app"));
const registration = app.threadLists[0]!;
const { resetProjectDecorCacheForTests } = await import("./useProjectDecor");

function thread(): PluginSidebarThread {
  return {
    id: "thr_mount_budget",
    projectId: "proj_mount_budget",
    title: "Mount budget",
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
    createdAt: 1,
    updatedAt: 1,
    lastReadAt: 1,
    latestAttentionAt: 1,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetProjectDecorCacheForTests();
  Object.defineProperty(window, "requestIdleCallback", {
    configurable: true,
    value: vi.fn(() => 1),
  });
  Object.defineProperty(window, "cancelIdleCallback", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "requestIdleCallback");
  Reflect.deleteProperty(window, "cancelIdleCallback");
});

it("spends exactly the four allocated first-paint RPCs", async () => {
  const props: PluginThreadListProps = {
    activeThreadId: "thr_mount_budget",
    activeProjectId: "proj_mount_budget",
    isCompactViewport: false,
    onNavigate: () => undefined,
    searchQuery: "",
    Original: () => null,
  };
  const slot = renderSlot<PluginThreadListProps>(registration, props, {
    sidebarThreads: {
      status: "ready",
      threads: [thread()],
      projects: [
        { id: "proj_mount_budget", name: "Mount budget", isPersonal: false },
      ],
    },
    rpc: {
      getOrganization: () => ({
        folders: [],
        members: {},
        threadAccents: {},
        projectAccents: {},
      }),
      listInboxOrder: () => ({ inboxThreadIds: ["thr_mount_budget"] }),
      getProjectDecor: () => ({ projects: {}, updatedAt: 0 }),
      listLifecycle: () => ({ rows: [] }),
      getSidebarSettings: () => ({ ...DEFAULT_SIDEBAR_SETTINGS }),
      getWorkflowActivity: () => ({
        runs: [],
        updatedAt: 0,
        sourcePath: "",
        sourceStatus: "missing" as const,
      }),
    },
  });

  await waitFor(() => expect(slot.inspection.rpcCalls).toHaveLength(4));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  const orderedLog = slot.inspection.rpcCalls.map((call) => call.method);
  expect(orderedLog).toEqual([
    "getOrganization",
    "getProjectDecor",
    "listLifecycle",
    "listInboxOrder",
  ]);
  expect(new Set(orderedLog)).toEqual(
    new Set([
      "getOrganization",
      "listInboxOrder",
      "getProjectDecor",
      "listLifecycle",
    ]),
  );
  expect(orderedLog).not.toContain("evaluateAutoSettle");
  expect(orderedLog).not.toContain("getSidebarSettings");
  expect(orderedLog).not.toContain("getWorkflowActivity");
  slot.lifecycle.unmount();
});
