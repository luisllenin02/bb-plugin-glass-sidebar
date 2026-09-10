// @vitest-environment jsdom
//
// Shelf windowing. A shelf of hundreds of threads mounts a capped number of
// cards and a "Load N more" control; the rest stay in the list model (search,
// bulk actions) without being in the DOM.
import type {
  PluginSidebarThread,
  PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DEFAULT_SIDEBAR_SETTINGS } from "./sidebar-settings";

const app = await loadPluginApp(() => import("../app"));
const registration = app.threadLists[0]!;
const { resetProjectDecorCacheForTests } = await import("./useProjectDecor");

const ROW_COUNT = 100;
// 100 cards through the real slot is slow under a parallel suite.
const TIMEOUT_MS = 30_000;
const NOW = Date.now();

function thread(index: number): PluginSidebarThread {
  return {
    id: `thr_${index}`,
    projectId: "proj_window",
    title: `Thread ${index}`,
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: NOW - index * 1_000,
    updatedAt: NOW - index * 1_000,
    lastReadAt: NOW,
    latestAttentionAt: NOW,
  };
}

const threads = Array.from({ length: ROW_COUNT }, (_, index) => thread(index));

function mount(activeThreadId: string) {
  const props: PluginThreadListProps = {
    activeThreadId,
    activeProjectId: "proj_window",
    isCompactViewport: false,
    onNavigate: () => undefined,
    searchQuery: "",
    Original: () => null,
  };
  return renderSlot<PluginThreadListProps>(registration, props, {
    sidebarThreads: {
      status: "ready",
      threads,
      projects: [{ id: "proj_window", name: "Window", isPersonal: false }],
    },
    rpc: {
      getOrganization: () => ({ folders: [], members: {}, threadAccents: {}, projectAccents: {} }),
      listInboxOrder: () => ({ inboxThreadIds: threads.map((row) => row.id) }),
      getProjectDecor: () => ({ projects: {}, updatedAt: 0 }),
      listProjectGlyphs: () => ({ glyphs: {} }),
      listLifecycle: () => ({ rows: [] }),
      // The inactive shelf is off so every row lands on Active.
      getSidebarSettings: () => ({ ...DEFAULT_SIDEBAR_SETTINGS, inactiveThreadsEnabled: false }),
      getWorkflowActivity: () => ({ runs: [], updatedAt: 0, sourcePath: "", sourceStatus: "missing" as const }),
    },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  resetProjectDecorCacheForTests();
});
afterEach(() => cleanup());

const cardCount = (slot: { container: HTMLElement }) =>
  slot.container.querySelectorAll("[data-sidebar-thread-id]").length;

it("mounts a capped Active shelf and grows it a page at a time", async () => {
  const slot = mount("thr_0");
  await waitFor(() => expect(cardCount(slot)).toBeGreaterThan(0), { timeout: TIMEOUT_MS });
  expect(cardCount(slot)).toBe(60);
  const more = slot.getByRole("button", { name: "Load 40 more" });
  await act(async () => {
    fireEvent.click(more);
  });
  await waitFor(() => expect(cardCount(slot)).toBe(100));
  expect(slot.queryByRole("button", { name: /Load \d+ more/ })).toBeNull();
}, TIMEOUT_MS);

it("keeps the thread you are on mounted even past the window", async () => {
  const slot = mount("thr_90");
  await waitFor(() => expect(cardCount(slot)).toBeGreaterThan(0), { timeout: TIMEOUT_MS });
  expect(cardCount(slot)).toBe(61);
  expect(slot.container.querySelector('[data-sidebar-thread-id="thr_90"]')).toBeTruthy();
}, TIMEOUT_MS);
