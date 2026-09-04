// @vitest-environment jsdom
//
// Render fan-out budget. A realtime push that changes nothing a row draws must
// not re-render a single row: the counter below is the measurement, not an
// assertion about internals. `ProviderGlyph` is drawn exactly once per
// `ThreadCard`, so counting its renders counts card renders.
import type {
  PluginSidebarThread,
  PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SIDEBAR_SETTINGS } from "./sidebar-settings";

const counter = vi.hoisted(() => ({ cardRenders: 0 }));
vi.mock("./ProviderGlyph", () => ({
  ProviderGlyph: () => {
    counter.cardRenders += 1;
    return null;
  },
}));

const app = await loadPluginApp(() => import("../app"));
const registration = app.threadLists[0]!;
const { resetProjectDecorCacheForTests } = await import("./useProjectDecor");
const { ORGANIZATION_CHANNEL } = await import("./organization");
const { PROJECT_DECOR_CHANNEL } = await import("./useProjectDecor");

const ROW_COUNT = 8;
const NOW = Date.now();

function thread(index: number): PluginSidebarThread {
  return {
    id: `thr_${index}`,
    projectId: "proj_fanout",
    title: `Thread ${index}`,
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
    createdAt: NOW - index * 1_000,
    updatedAt: NOW - index * 1_000,
    lastReadAt: NOW,
    latestAttentionAt: NOW,
  };
}

const threads = Array.from({ length: ROW_COUNT }, (_, index) => thread(index));

const props: PluginThreadListProps = {
  activeThreadId: "thr_0",
  activeProjectId: "proj_fanout",
  isCompactViewport: false,
  onNavigate: () => undefined,
  searchQuery: "",
  Original: () => null,
};

function mount() {
  return renderSlot<PluginThreadListProps>(registration, props, {
    sidebarThreads: {
      status: "ready",
      threads,
      projects: [{ id: "proj_fanout", name: "Fanout", isPersonal: false }],
    },
    rpc: {
      getOrganization: () => ({
        folders: [],
        members: {},
        threadAccents: {},
        projectAccents: {},
      }),
      listInboxOrder: () => ({
        inboxThreadIds: threads.map((row) => row.id),
      }),
      getProjectDecor: () => ({ projects: {}, updatedAt: 0 }),
      listProjectGlyphs: () => ({ glyphs: {} }),
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
}

beforeEach(() => {
  window.localStorage.clear();
  resetProjectDecorCacheForTests();
  counter.cardRenders = 0;
});

afterEach(() => {
  cleanup();
});

it("spends no row render on a push that changes nothing, one on a selection", async () => {
  const slot = mount();
  await waitFor(() => expect(counter.cardRenders).toBeGreaterThanOrEqual(ROW_COUNT));
  await act(async () => {
    await Promise.resolve();
  });

  // First paint settles the four mount RPCs; three passes per row is the
  // budget, and every later push below must cost nothing at all.
  expect(document.querySelectorAll("[data-sidebar-thread-id]")).toHaveLength(
    ROW_COUNT,
  );
  expect(counter.cardRenders).toBeLessThanOrEqual(ROW_COUNT * 3);
  counter.cardRenders = 0;
  await slot.emitRealtime(ORGANIZATION_CHANNEL, null);
  await act(async () => {
    await Promise.resolve();
  });
  expect(counter.cardRenders).toBe(0);

  await slot.emitRealtime(PROJECT_DECOR_CHANNEL, null);
  await act(async () => {
    await Promise.resolve();
  });
  expect(counter.cardRenders).toBe(0);

  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
  });
  expect(counter.cardRenders).toBe(0);

  // Selecting one row is a list-level state change: only the row whose
  // selection actually flipped may redraw.
  counter.cardRenders = 0;
  const row = document.querySelector<HTMLAnchorElement>(
    '[data-sidebar-thread-id="thr_1"]',
  )!;
  await act(async () => {
    fireEvent.click(row, { metaKey: true });
    await Promise.resolve();
  });
  expect(row.getAttribute("data-selected")).toBe("true");
  expect(counter.cardRenders).toBe(1);
  slot.lifecycle.unmount();
});
