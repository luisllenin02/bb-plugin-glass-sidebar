// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type {
  PluginSidebarThread,
  PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import type { StoredLifecycleRow } from "../server";
import { DEFAULT_SIDEBAR_SETTINGS } from "./row-props";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});
Object.defineProperty(Document.prototype, "elementFromPoint", {
  configurable: true,
  value: vi.fn(),
});

const app = await loadPluginApp(() => import("../app"));
const inbox = app.threadLists[0]!;

/** Recent enough that the default 6-hour Inactive rule leaves it on Active. */
const NOW = Date.now();
const RECENT = NOW - 60_000;

function thread(overrides: Partial<PluginSidebarThread>): PluginSidebarThread {
  return {
    id: "thread",
    projectId: "project",
    title: "Thread",
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
    createdAt: RECENT,
    updatedAt: RECENT,
    lastReadAt: RECENT,
    latestAttentionAt: RECENT,
    ...overrides,
  };
}

const props: PluginThreadListProps = {
  activeThreadId: null,
  activeProjectId: "project",
  isCompactViewport: false,
  onNavigate: () => {},
  searchQuery: "",
  Original: () => null,
} as unknown as PluginThreadListProps;

function renderList(
  threads: readonly PluginSidebarThread[],
  rows: StoredLifecycleRow[],
  overrides: Record<string, (input: never) => unknown> = {},
) {
  return renderSlot<PluginThreadListProps>(inbox, props, {
    sidebarThreads: {
      status: "ready",
      threads: [...threads],
      projects: [{ id: "project", name: "Project", isPersonal: false }],
    },
    rpc: {
      getOrganization: () => ({
        folders: [],
        members: {},
        threadAccents: {},
        projectAccents: {},
      }),
      listInboxOrder: () => ({ inboxThreadIds: [] }),
      listLifecycle: () => ({ rows }),
      settle: () => ({ ok: true }),
      unsettle: () => ({ ok: true }),
      snooze: () => ({ ok: true }),
      unsnooze: () => ({ ok: true }),
      acknowledgeWake: () => ({ ok: true }),
      ...overrides,
    } as never,
  });
}

function callsTo(calls: readonly { method: string }[], method: string): number {
  return calls.filter((call) => call.method === method).length;
}

const settledRow = (threadId: string): StoredLifecycleRow => ({
  threadId,
  settledAt: NOW,
  settledOverride: "settled",
  snoozedUntil: null,
  snoozedAt: null,
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("useLifecycle mount budget", () => {
  it("issues listLifecycle once and never a separate evaluateAutoSettle", async () => {
    const rendered = renderList([thread({ id: "thr_1" })], []);
    await screen.findByRole("region", { name: "Active" });
    await waitFor(() =>
      expect(callsTo(rendered.rpcCalls, "listLifecycle")).toBe(1),
    );
    // Let every remaining mount effect settle before the negative assertion.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callsTo(rendered.rpcCalls, "listLifecycle")).toBe(1);
    expect(callsTo(rendered.rpcCalls, "evaluateAutoSettle")).toBe(0);
  });

  it("sends the live-work signals the server cannot see", async () => {
    const rendered = renderList(
      [
        thread({
          id: "thr_working",
          activity: {
            workflows: 1,
            backgroundAgents: 0,
            backgroundCommands: 0,
            planMode: 0,
            goals: 0,
          },
        }),
        thread({ id: "thr_quiet" }),
      ],
      [],
    );
    await waitFor(() =>
      expect(callsTo(rendered.rpcCalls, "listLifecycle")).toBe(1),
    );
    const call = rendered.rpcCalls.find(
      (entry) => entry.method === "listLifecycle",
    ) as { input: { signals: Array<Record<string, unknown>> } };
    expect(call.input.signals).toEqual([
      {
        threadId: "thr_working",
        hasPendingInteraction: false,
        isWorking: true,
      },
      {
        threadId: "thr_quiet",
        hasPendingInteraction: false,
        isWorking: false,
      },
    ]);
  });

  it("re-reads when the lifecycle signal arrives", async () => {
    const rendered = renderList([thread({ id: "thr_1" })], []);
    await waitFor(() =>
      expect(callsTo(rendered.rpcCalls, "listLifecycle")).toBe(1),
    );
    await rendered.emitRealtime("lifecycle", { threadId: "thr_1" });
    await waitFor(() =>
      expect(callsTo(rendered.rpcCalls, "listLifecycle")).toBe(2),
    );
  });
});

describe("parked shelves", () => {
  it("moves a settled thread off Active onto the Settled shelf", async () => {
    renderList(
      [
        thread({ id: "thr_active", title: "Still going" }),
        thread({ id: "thr_settled", title: "Filed away" }),
      ],
      [settledRow("thr_settled")],
    );

    const settled = await screen.findByRole("region", { name: "Settled" });
    // Collapsed by default: the count is its whole footprint.
    expect(
      within(settled).getByRole("button", { name: /Settled \(1\)/ }),
    ).toBeDefined();
    const active = screen.getByRole("region", { name: "Active" });
    expect(
      within(active).queryByText("Filed away"),
    ).toBeNull();
    expect(within(active).getByText("Still going")).toBeDefined();

    fireEvent.click(within(settled).getByRole("button", { name: /Settled/ }));
    expect(within(settled).getByText("Filed away")).toBeDefined();
  });

  it("restores a settled row through its un-settle control", async () => {
    const rendered = renderList(
      [thread({ id: "thr_settled", title: "Filed away" })],
      [settledRow("thr_settled")],
    );
    const settled = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(settled).getByRole("button", { name: /Settled/ }));

    fireEvent.click(
      within(settled).getByRole("button", { name: "Un-settle thread" }),
    );
    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "unsettle",
        input: { threadId: "thr_settled" },
      }),
    );
    // Optimistic: the row leaves the shelf before the signal comes back.
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Settled" })).toBeNull(),
    );
  });

  it("pages the Settled shelf ten rows at a time", async () => {
    const threads = Array.from({ length: 40 }, (_, index) =>
      thread({ id: `thr_${index}`, title: `Settled ${index}` }),
    );
    renderList(
      threads,
      threads.map((entry) => settledRow(entry.id)),
    );

    const settled = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(settled).getByRole("button", { name: /Settled/ }));
    expect(
      within(settled).getAllByRole("link", { name: /Settled \d+/ }),
    ).toHaveLength(10);

    const loadMore = within(settled).getByRole("button", {
      name: "Load 25 more",
    });
    fireEvent.click(loadMore);
    expect(
      within(settled).getAllByRole("link", { name: /Settled \d+/ }),
    ).toHaveLength(35);
  });

  it("keeps a snoozed thread on its own shelf with a wake label", async () => {
    const wakeAt = Date.now() + 2 * 60 * 60 * 1_000;
    renderList([thread({ id: "thr_snoozed", title: "Back later" })], [
      {
        threadId: "thr_snoozed",
        settledAt: null,
        settledOverride: null,
        snoozedUntil: wakeAt,
        snoozedAt: NOW,
      },
    ]);

    const snoozed = await screen.findByRole("region", { name: "Snoozed" });
    fireEvent.click(within(snoozed).getByRole("button", { name: /Snoozed/ }));
    expect(within(snoozed).getByText("Back later")).toBeDefined();
    // The row's clock is quantized to the minute, so the label is 2h or 3h.
    expect(within(snoozed).getByText(/^[23]h$/)).toBeDefined();
  });

  it("keeps a working thread active even when the store says it is parked", async () => {
    renderList(
      [
        thread({
          id: "thr_busy",
          title: "Still running",
          activity: {
            workflows: 1,
            backgroundAgents: 0,
            backgroundCommands: 0,
            planMode: 0,
            goals: 0,
          },
        }),
      ],
      [settledRow("thr_busy")],
    );

    const active = await screen.findByRole("region", { name: "Active" });
    expect(within(active).getByText("Still running")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Settled" })).toBeNull();
  });
});

const quietThreads = () => [
  thread({ id: "thr_fresh", title: "Fresh" }),
  thread({
    id: "thr_stale",
    title: "Stale",
    createdAt: NOW - 8 * 60 * 60 * 1_000,
    updatedAt: NOW - 8 * 60 * 60 * 1_000,
    latestAttentionAt: NOW - 8 * 60 * 60 * 1_000,
  }),
];

describe("inactive threads", () => {
  it("files a quiet thread under Inactive at the configured threshold", async () => {
    renderList(quietThreads(), [], {
      getSidebarSettings: () => ({ ...DEFAULT_SIDEBAR_SETTINGS }),
    } as never);

    const inactive = await screen.findByRole("region", { name: "Inactive" });
    expect(
      within(inactive).getByRole("button", { name: /Inactive \(1\)/ }),
    ).toBeDefined();
    const active = screen.getByRole("region", { name: "Active" });
    expect(within(active).getByText("Fresh")).toBeDefined();
    expect(within(active).queryByText("Stale")).toBeNull();

    fireEvent.click(within(inactive).getByRole("button", { name: /Inactive/ }));
    expect(within(inactive).getByText("Stale")).toBeDefined();
  });

  it("files nothing away until the settings read answers", async () => {
    // The fork holds `sidebarSettings` at null until `getSidebarSettings`
    // returns, so a quiet thread is never hidden on a default the user may
    // have switched off. Without this the first paint files threads under
    // Inactive and then has to take them back.
    renderList(quietThreads(), [], {
      getSidebarSettings: () => {
        throw new Error("settings backend still reloading");
      },
    } as never);

    const active = await screen.findByRole("region", { name: "Active" });
    expect(within(active).getByText("Fresh")).toBeDefined();
    expect(within(active).getByText("Stale")).toBeDefined();
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Inactive" })).toBeNull(),
    );
  });
});

describe("bulk parking", () => {
  const anchorFor = (threadId: string) =>
    document.querySelector<HTMLAnchorElement>(
      `[data-sidebar-thread-id="${threadId}"]`,
    )!;

  const settleButton = (bar: HTMLElement) =>
    within(bar).getByRole("button", {
      name: "Settle selected threads",
    }) as HTMLButtonElement;

  it("never parks a selected thread that is still working", async () => {
    // Behavioural, not visual: whether the bar disables the button on a mixed
    // selection or filters on the way out, the live row must not reach the RPC.
    const settled: string[][] = [];
    const bulkSettle = vi.fn(({ threadIds }: { threadIds: string[] }) => {
      settled.push(threadIds);
      return { succeededThreadIds: threadIds, failures: [] };
    });
    renderList(
      [
        thread({ id: "thr_idle", title: "Idle" }),
        thread({
          id: "thr_busy",
          title: "Busy",
          indicator: "runtime",
          indicatorLabel: "Working",
        }),
      ],
      [],
      { bulkSettle } as never,
    );
    await screen.findByText("Idle");
    fireEvent.click(anchorFor("thr_idle"), { ctrlKey: true });
    fireEvent.click(anchorFor("thr_busy"), { ctrlKey: true });
    const bar = await screen.findByRole("toolbar", {
      name: "2 threads selected",
    });

    fireEvent.click(settleButton(bar));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled.flat()).not.toContain("thr_busy");
  });

  it("sends only the parkable ids when the bulk settle fires", async () => {
    const calls: unknown[] = [];
    const bulkSettle = vi.fn((input: unknown) => {
      calls.push(input);
      return { succeededThreadIds: ["thr_idle"], failures: [] };
    });
    renderList(
      [
        thread({ id: "thr_idle", title: "Idle" }),
        thread({ id: "thr_quiet", title: "Quiet" }),
      ],
      [],
      { bulkSettle } as never,
    );
    await screen.findByText("Idle");
    fireEvent.click(anchorFor("thr_idle"), { ctrlKey: true });
    fireEvent.click(anchorFor("thr_quiet"), { ctrlKey: true });
    const bar = await screen.findByRole("toolbar", {
      name: "2 threads selected",
    });
    // Every selected row is parkable, so the bar's lifecycle controls are live.
    expect(settleButton(bar).disabled).toBe(false);

    fireEvent.click(settleButton(bar));
    await waitFor(() => expect(bulkSettle).toHaveBeenCalledTimes(1));
    expect(calls[0]).toEqual({ threadIds: ["thr_idle", "thr_quiet"] });
  });
});
