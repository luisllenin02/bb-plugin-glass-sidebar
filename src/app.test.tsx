// @vitest-environment jsdom
import type {
  PluginSidebarThread,
  PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { expect, it } from "vitest";

/** Recent enough that Q5's default 6-hour Inactive rule does not apply. */
const RECENT_ACTIVITY = Date.now() - 60_000;

function thread(id: string, projectId: string): PluginSidebarThread {
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
    // Q5: recent activity, so the default 6-hour Inactive rule leaves this
    // fixture on the Active shelf. Ordering still comes from createdAt.
    updatedAt: RECENT_ACTIVITY,
    lastReadAt: null,
    latestAttentionAt: RECENT_ACTIVITY,
  };
}

it("registers one thread list and renders one shortcut row per seeded thread", async () => {
  const app = await loadPluginApp(() => import("../app"));
  expect(app.threadLists).toHaveLength(1);

  const threads = [thread("thr_1", "proj_1"), thread("thr_2", "proj_1")];
  const slot = renderSlot<PluginThreadListProps>(
    app.threadLists[0]!,
    {
      activeThreadId: "thr_1",
      activeProjectId: "proj_1",
      isCompactViewport: false,
      onNavigate: () => undefined,
      searchQuery: "",
      Original: () => null,
    },
    {
      sidebarThreads: {
        status: "ready",
        threads,
        projects: [{ id: "proj_1", name: "Project One", isPersonal: false }],
      },
    },
  );

  expect(slot.container.querySelector("[data-glass-sidebar-root]")).not.toBeNull();
  expect(
    slot.container.querySelectorAll("[data-sidebar-thread-id]"),
  ).toHaveLength(threads.length);
  expect(
    slot.container.querySelector('[data-sidebar-thread-id="thr_1"]')
      ?.closest("[data-thread-pane-state]")
      ?.getAttribute("data-thread-pane-state"),
  ).toBe("focused");

  slot.lifecycle.unmount();
});
