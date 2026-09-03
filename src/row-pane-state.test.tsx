// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

// Load through the harness so the plugin's `@get-bb/plugin-sdk/app` import binds
// to the test runtime; the row modules below come from that same graph.
const app = await loadPluginApp(() => import("../app"));
const inbox = app.threadLists[0]!;
const { ThreadCard } = await import("./ThreadCard");
const { SlimRow } = await import("./SlimRow");
const { SearchResults } = await import("./SearchResults");

/** Recent enough that Q5's default 6-hour Inactive rule does not apply. */
const RECENT_ACTIVITY = Date.now() - 60_000;

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
    // Q5: recent activity, so the default 6-hour Inactive rule leaves this
    // fixture on the Active shelf. Ordering still comes from createdAt.
    updatedAt: RECENT_ACTIVITY,
    lastReadAt: RECENT_ACTIVITY,
    latestAttentionAt: RECENT_ACTIVITY,
    ...overrides,
  };
}

const listProps = {
  activeThreadId: null as string | null,
  activeProjectId: null,
  isCompactViewport: false,
  onNavigate: () => {},
  searchQuery: "",
  Original: () => null,
  experimental_Original: () => null,
};

function renderInbox(
  threads: PluginSidebarThread[],
  props: Partial<typeof listProps> = {},
) {
  return renderSlot(
    inbox,
    { ...listProps, ...props },
    {
      sidebarThreads: {
        status: "ready",
        threads,
        projects: [{ id: "proj_1", name: "bb", isPersonal: false }],
      },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    },
  );
}

function rowFor(threadId: string): HTMLElement {
  const anchor = document.querySelector(
    `[data-sidebar-thread-id="${threadId}"]`,
  )!;
  return anchor.closest("[data-thread-pane-state]") as HTMLElement;
}

const cardProps = {
  thread: thread(),
  threads: [thread()],
  projectName: "bb",
  projectIconUrl: null,
  isActive: false,
  isSelected: false,
  isWoke: false,
  canPark: true,
  snoozePresets: [],
  onNavigate: () => {},
  onSettle: () => {},
  onSnooze: () => {},
  onAcknowledgeWake: () => {},
  onSelectionClick: () => false,
  now: 1_000,
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
});

describe("row pane state", () => {
  it("marks the route's thread focused and every other row none", () => {
    renderInbox(
      [thread({ id: "thr_1" }), thread({ id: "thr_2", title: "Another" })],
      { activeThreadId: "thr_1" },
    );

    expect(rowFor("thr_1").dataset.threadPaneState).toBe("focused");
    expect(rowFor("thr_2").dataset.threadPaneState).toBe("none");
  });

  it("keeps aria-current on the route's thread alone", () => {
    renderInbox(
      [thread({ id: "thr_1" }), thread({ id: "thr_2", title: "Another" })],
      { activeThreadId: "thr_1" },
    );

    expect(
      document.querySelectorAll('[data-sidebar-thread-id][aria-current="page"]'),
    ).toHaveLength(1);
    expect(
      document
        .querySelector('[data-sidebar-thread-id="thr_1"]')!
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("gives a focused row a different surface from an idle one", () => {
    renderInbox(
      [thread({ id: "thr_1" }), thread({ id: "thr_2", title: "Another" })],
      { activeThreadId: "thr_1" },
    );

    const focused = rowFor("thr_1").className;
    const idle = rowFor("thr_2").className;
    expect(focused).toContain("ring-primary/60");
    expect(idle).not.toContain("ring-primary/60");
    expect(focused).not.toBe(idle);
  });

  it("draws a rail on focused and automatically coloured idle rows", () => {
    renderInbox(
      [thread({ id: "thr_1" }), thread({ id: "thr_2", title: "Another" })],
      { activeThreadId: "thr_1" },
    );

    expect(rowFor("thr_1").querySelector("[data-accent-rail]")).toBeTruthy();
    expect(rowFor("thr_2").querySelector("[data-accent-rail]")).toBeTruthy();
    expect(rowFor("thr_2").dataset.projectAccentSource).toBe("auto");
  });
});

describe("row accent", () => {
  it("carries a resolved accent on the card root", () => {
    renderSlot(
      { component: ThreadCard },
      { ...cardProps, accent: "hsl(211 92% 62%)" },
    );

    const row = rowFor("thr_1");
    expect(row.style.getPropertyValue("--thread-accent")).toBe(
      "hsl(211 92% 62%)",
    );
    expect(row.className).toContain("bb-sidebar-accent-row");
    // An idle row earns a rail once it has a colour to show.
    expect(row.querySelector("[data-accent-rail]")).toBeTruthy();
  });

  it("sets no custom property when the thread has no accent", () => {
    renderSlot({ component: ThreadCard }, cardProps);

    const row = rowFor("thr_1");
    expect(row.style.getPropertyValue("--thread-accent")).toBe("");
    expect(row.className).not.toContain("bb-sidebar-accent-row");
    expect(row.querySelector("[data-accent-rail]")).toBeNull();
  });

  it("carries a resolved accent on a parked row too", () => {
    renderSlot(
      { component: SlimRow },
      {
        thread: thread(),
        projectName: "bb",
        projectIconUrl: null,
        isActive: false,
        isSelected: false,
        shelf: "settled" as const,
        wakeAt: null,
        now: 1_000,
        snoozePresets: [],
        onNavigate: () => {},
        onRestore: () => {},
        onSnooze: () => {},
        onSelectionClick: () => false,
        accent: "#aabbcc",
      },
    );

    const row = rowFor("thr_1");
    expect(row.dataset.threadPaneState).toBe("none");
    expect(row.style.getPropertyValue("--thread-accent")).toBe("#aabbcc");
    expect(row.querySelector("[data-accent-rail]")).toBeTruthy();
  });

  it("lets the selection ring win over the pane surface", () => {
    renderSlot(
      { component: ThreadCard },
      { ...cardProps, isActive: true, isSelected: true },
    );

    const row = rowFor("thr_1");
    expect(row.dataset.threadPaneState).toBe("focused");
    expect(row.className).toContain("ring-primary/60");
    expect(screen.getByLabelText(/^Selected, /)).toBeTruthy();
  });
});

describe("semantic row tones", () => {
  it("renders a Woke card with the host warning token", () => {
    renderSlot({ component: ThreadCard }, { ...cardProps, isWoke: true });

    const marker = screen.getByRole("button", {
      name: "Dismiss Woke marker",
    });
    expect(marker.className).toContain("text-warning");
    expect(marker.className).not.toMatch(/(?:amber|orange|yellow)-\d/);
  });

  it("renders a Woke search result with the same host warning token", () => {
    renderSlot(
      { component: SearchResults },
      {
        threads: [thread()],
        projectNameById: new Map([["proj_1", "bb"]]),
        projectIconRevision: 0,
        activeThreadId: null,
        now: 1_000,
        wokeThreadIds: new Set(["thr_1"]),
        onAcknowledgeWake: () => {},
        selectedThreadIds: new Set<string>(),
        onSelectionClick: () => false,
        onNavigate: () => {},
      },
    );

    const marker = screen.getByText("Woke");
    expect(marker.className).toContain("text-warning");
    expect(marker.className).not.toMatch(/(?:amber|orange|yellow)-\d/);
  });
});
