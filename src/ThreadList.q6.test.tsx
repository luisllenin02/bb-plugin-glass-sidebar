// @vitest-environment jsdom
import type {
  PluginSidebarThread,
  PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SIDEBAR_SETTINGS } from "./row-props";

const RECENT_ACTIVITY = Date.now() - 60_000;

function thread(
  id: string,
  projectId: string,
  options: {
    createdAt: number;
    hasPendingInteraction?: boolean;
    indicator?: PluginSidebarThread["indicator"];
  },
): PluginSidebarThread {
  return {
    id,
    projectId,
    title: `Thread ${id}`,
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: options.hasPendingInteraction ?? false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: options.indicator ?? "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: options.createdAt,
    updatedAt: RECENT_ACTIVITY,
    lastReadAt: null,
    latestAttentionAt: RECENT_ACTIVITY,
  };
}

const rpcDefaults = {
  getWorkflowActivity: () => ({
    runs: [],
    updatedAt: 0,
    sourcePath: "",
    sourceStatus: "missing" as const,
  }),
  getOrganization: () => ({
    folders: [],
    members: {},
    threadAccents: {},
    projectAccents: {},
  }),
  getProjectDecor: () => ({ projects: {}, updatedAt: 0 }),
  getProjectGlyphs: () => ({ glyphs: {} }),
  listInboxOrder: () => ({ inboxThreadIds: [] }),
  listLifecycle: () => ({ rows: [] }),
  getSidebarSettings: () => ({ ...DEFAULT_SIDEBAR_SETTINGS }),
};

beforeEach(() => {
  window.localStorage.clear();
});

it("removes selected rows when a search makes them unselectable", async () => {
  const app = await loadPluginApp(() => import("../app"));
  const registration = app.threadLists[0]!;
  const Component = registration.component;
  const threads = [
    thread("alpha", "project", { createdAt: 2 }),
    thread("beta", "project", { createdAt: 1 }),
  ];
  const props: PluginThreadListProps = {
    activeThreadId: "alpha",
    activeProjectId: "project",
    isCompactViewport: false,
    onNavigate: () => undefined,
    searchQuery: "",
    Original: () => null,
  };
  const slot = renderSlot<PluginThreadListProps>(registration, props, {
    sidebarThreads: {
      status: "ready",
      threads,
      projects: [{ id: "project", name: "Project", isPersonal: false }],
    },
    rpc: rpcDefaults,
  });

  fireEvent.click(
    slot.container.querySelector('[data-sidebar-thread-id="alpha"]')!,
    { ctrlKey: true },
  );
  fireEvent.click(
    slot.container.querySelector('[data-sidebar-thread-id="beta"]')!,
    { ctrlKey: true },
  );
  expect(slot.getByRole("toolbar", { name: "2 threads selected" })).toBeTruthy();

  slot.lifecycle.rerender(
    <Component {...props} searchQuery="alpha" />,
  );
  await waitFor(() =>
    expect(
      slot.getByRole("toolbar", { name: "1 threads selected" }),
    ).toBeTruthy(),
  );

  slot.lifecycle.rerender(<Component {...props} />);
  await waitFor(() =>
    expect(
      slot.container
        .querySelector('[data-sidebar-thread-id="beta"]')
        ?.getAttribute("data-selected"),
    ).toBeNull(),
  );
  slot.lifecycle.unmount();
});

it("parks only eligible selections, retains blocked rows, and navigates off the active row", async () => {
  const app = await loadPluginApp(() => import("../app"));
  const registration = app.threadLists[0]!;
  const bulkSettle = vi.fn(async (input: unknown) => {
    const { threadIds } = input as { threadIds: string[] };
    return {
      succeededThreadIds: threadIds,
      failures: [],
    };
  });
  const onNavigate = vi.fn();
  const threads = [
    thread("active", "project", { createdAt: 3 }),
    thread("blocked", "project", {
      createdAt: 2,
      hasPendingInteraction: true,
      indicator: "waiting-for-input",
    }),
    thread("next", "project", { createdAt: 1 }),
  ];
  const slot = renderSlot<PluginThreadListProps>(
    registration,
    {
      activeThreadId: "active",
      activeProjectId: "project",
      isCompactViewport: false,
      onNavigate,
      searchQuery: "",
      Original: () => null,
    },
    {
      sidebarThreads: {
        status: "ready",
        threads,
        projects: [{ id: "project", name: "Project", isPersonal: false }],
      },
      rpc: { ...rpcDefaults, bulkSettle },
    },
  );

  fireEvent.click(
    slot.container.querySelector('[data-sidebar-thread-id="active"]')!,
    { ctrlKey: true },
  );
  fireEvent.click(
    slot.container.querySelector('[data-sidebar-thread-id="blocked"]')!,
    { ctrlKey: true },
  );
  fireEvent.click(
    slot.getByRole("button", { name: "Settle selected threads" }),
  );

  await waitFor(() => expect(bulkSettle).toHaveBeenCalledOnce());
  expect(bulkSettle).toHaveBeenCalledWith({ threadIds: ["active"] });
  await waitFor(() =>
    expect(
      slot.getByRole("toolbar", { name: "1 threads selected" }),
    ).toBeTruthy(),
  );
  expect(
    slot.container
      .querySelector('[data-sidebar-thread-id="blocked"]')
      ?.getAttribute("data-selected"),
  ).toBe("true");
  expect(slot.inspection.sidebarActionCalls).toContainEqual({
    method: "open",
    threadId: "blocked",
  });
  expect(onNavigate).toHaveBeenCalledOnce();
  slot.lifecycle.unmount();
});
