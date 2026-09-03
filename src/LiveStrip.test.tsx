// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render as renderReact,
  screen,
  within,
} from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type {
  PluginSidebarThread,
  PluginSidebarThreadActions,
} from "@get-bb/plugin-sdk/app";
import {
  COLUMNS_EXPANDED_STORAGE_KEY,
  OpenPanesRow,
} from "./LiveStrip";
import { buildColumns } from "./columns-view";
import { reportPane, resetSplitRegistryForTests } from "./split-registry";

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
    updatedAt: 100,
    lastReadAt: 100,
    latestAttentionAt: 100,
    ...overrides,
  };
}

const listProps = {
  activeThreadId: null,
  activeProjectId: null,
  isCompactViewport: false,
  onNavigate: () => {},
  searchQuery: "",
  Original: () => null,
  experimental_Original: () => null,
};

function renderList(threads: PluginSidebarThread[]) {
  return renderSlot(inbox, listProps, {
    sidebarThreads: {
      status: "ready",
      threads,
      projects: [{ id: "proj_1", name: "bb", isPersonal: false }],
    },
    rpc: {
      getWorkflowActivity: () => ({
        runs: [],
        updatedAt: 1,
        sourcePath: "/tmp/workflows/data.db",
        sourceStatus: "ok",
      }),
    },
  });
}

afterEach(() => {
  cleanup();
  resetSplitRegistryForTests();
  window.localStorage.clear();
  vi.mocked(document.elementFromPoint).mockReset();
});

describe("OpenPanesRow", () => {
  it("renders nothing under the SDK harness because layouts cannot be seeded", () => {
    renderList([
      thread({ id: "thr_a", isPinned: true }),
      thread({ id: "thr_b" }),
    ]);
    expect(screen.queryByRole("group", { name: "Open panes" })).toBeNull();
  });

  it("uses project decor for a colour dot and provider glyph as the fallback", () => {
    const threads = [
      thread({ id: "thr_a", projectId: "proj_a", title: "Decor" }),
      thread({ id: "thr_b", projectId: "proj_b", title: "Provider" }),
    ];
    reportPane("thr_a", { ordinal: 1, count: 2, isFocused: true });
    reportPane("thr_b", { ordinal: 2, count: 2, isFocused: false });
    const open = vi.fn();
    const actions = { open } as unknown as PluginSidebarThreadActions;

    renderReact(
      <OpenPanesRow
        threads={threads}
        projectNameById={new Map()}
        accentFor={() => undefined}
        projectDecor={{
          proj_a: {
            icon: "folder-01",
            iconColor: "blue",
            source: "manual",
          },
        }}
        activeThreadId="thr_a"
        onNavigate={() => {}}
        actions={actions}
      />,
    );

    const decorChip = screen.getByRole("button", { name: /Open pane: Decor/ });
    expect(decorChip.querySelector('[data-project-colour-dot="true"]')).not.toBeNull();
    expect(decorChip.className).toContain("bg-primary/15");
    const providerChip = screen.getByRole("button", {
      name: /Open pane: Provider/,
    });
    expect(providerChip.querySelector('[aria-label="Codex"]')).not.toBeNull();
    expect(providerChip.querySelector('[data-project-colour-dot="true"]')).toBeNull();

    fireEvent.click(providerChip, { ctrlKey: true });
    expect(open).toHaveBeenCalledWith("thr_b", { split: true });

    fireEvent.click(screen.getByRole("button", { name: "Open panes" }));
    expect(
      window.localStorage.getItem("bb-sidebar.liveStrip.openPanes"),
    ).toBe("collapsed");
  });

  it("persists the columns toggle across remounts", () => {
    const threads = [
      thread({ id: "thr_a", title: "First" }),
      thread({ id: "thr_b", title: "Second" }),
    ];
    reportPane("thr_a", { ordinal: 1, count: 2, isFocused: true });
    reportPane("thr_b", { ordinal: 2, count: 2, isFocused: false });
    const actions = { open: vi.fn() } as unknown as PluginSidebarThreadActions;
    const props = {
      threads,
      projectNameById: new Map<string, string>(),
      accentFor: () => undefined,
      activeThreadId: "thr_a",
      onNavigate: () => {},
      actions,
      now: 1_000,
    };

    const first = renderReact(<OpenPanesRow {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    expect(window.localStorage.getItem(COLUMNS_EXPANDED_STORAGE_KEY)).toBe(
      "expanded",
    );
    expect(
      screen.getByRole("group", { name: "Session columns" }),
    ).toBeDefined();

    first.unmount();
    renderReact(<OpenPanesRow {...props} />);
    expect(
      screen.getByRole("group", { name: "Session columns" }),
    ).toBeDefined();
    expect(screen.queryByRole("group", { name: "Open panes" })).toBeNull();
  });

  it("feeds pane-ordinal build output into expanded cards", () => {
    const threads = [
      thread({ id: "thr_b", title: "Second" }),
      thread({ id: "thr_a", title: "First" }),
    ];
    const panes = [
      { threadId: "thr_b", ordinal: 2, count: 2, isFocused: false },
      { threadId: "thr_a", ordinal: 1, count: 2, isFocused: true },
    ];
    for (const { threadId, ...entry } of panes) reportPane(threadId, entry);
    const expected = buildColumns(panes, threads, [], () => undefined);

    const open = vi.fn();
    renderReact(
      <OpenPanesRow
        threads={threads}
        projectNameById={new Map()}
        accentFor={() => undefined}
        activeThreadId="thr_a"
        onNavigate={() => {}}
        actions={{ open } as unknown as PluginSidebarThreadActions}
        now={1_000}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));

    const cards = Array.from(
      screen
        .getByRole("group", { name: "Session columns" })
        .querySelectorAll("[data-column-thread-id]"),
    );
    expect(
      cards.map((card) => card.getAttribute("data-column-thread-id")),
    ).toEqual(expected.map((column) => column.threadId));
    expect(cards[0]!.className).toContain("ring-2");
    fireEvent.click(cards[1]!, { metaKey: true });
    expect(open).toHaveBeenCalledWith("thr_b", { split: true });
  });

  it("keeps the compact chips as the default mode", () => {
    const threads = [thread({ id: "thr_a" }), thread({ id: "thr_b" })];
    reportPane("thr_a", { ordinal: 1, count: 2, isFocused: true });
    reportPane("thr_b", { ordinal: 2, count: 2, isFocused: false });
    renderReact(
      <OpenPanesRow
        threads={threads}
        projectNameById={new Map()}
        accentFor={() => undefined}
        activeThreadId="thr_a"
        onNavigate={() => {}}
        actions={{ open: vi.fn() } as unknown as PluginSidebarThreadActions}
      />,
    );

    expect(screen.getByRole("group", { name: "Open panes" })).toBeDefined();
    expect(screen.queryByRole("group", { name: "Session columns" })).toBeNull();
  });
});

describe("NowRow", () => {
  function seedNow() {
    return renderList([
      thread({
        id: "thr_waiting",
        title: "Needs a decision",
        indicator: "waiting-for-input",
        indicatorLabel: "Thread needs user input",
        updatedAt: 50,
      }),
      thread({
        id: "thr_running",
        title: "Still working",
        indicator: "runtime",
        indicatorLabel: "Thread is running",
        updatedAt: 200,
      }),
      thread({
        id: "thr_unread",
        title: "Just finished",
        indicator: "unread-success",
        updatedAt: 300,
      }),
      thread({
        id: "thr_idle",
        title: "Nothing going on",
        indicator: "none",
        updatedAt: 400,
      }),
    ]);
  }

  it("shows needs-you before working and applies the attention tone", () => {
    seedNow();
    const now = screen.getByRole("region", { name: "Now" });
    const rows = Array.from(now.querySelectorAll("[data-now-thread-id]"));
    expect(rows.map((row) => row.getAttribute("data-now-thread-id"))).toEqual([
      "thr_waiting",
      "thr_running",
    ]);
    expect(rows[0]!.className).toContain("text-attention");
    expect(rows[1]!.className).not.toContain("text-attention");
  });

  it("opens a thread and labels workflow activity", () => {
    const rendered = renderList([
      thread({
        id: "thr_activity",
        title: "Workflow activity",
        activity: {
          workflows: 1,
          backgroundAgents: 0,
          backgroundCommands: 0,
          planMode: 0,
          goals: 0,
        },
      }),
    ]);
    const row = screen.getByRole("button", {
      name: /Now: bb · Workflow activity/,
    });
    expect(row.querySelector('[data-icon="Workflow"]')).not.toBeNull();
    expect(within(row).getByText("Workflow")).toBeDefined();
    fireEvent.click(row);
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: "thr_activity",
      options: undefined,
    });
  });

  it("persists the literal contract collapse key", () => {
    seedNow();
    fireEvent.click(screen.getByRole("button", { name: "Now" }));
    expect(window.localStorage.getItem("bb-sidebar.liveStrip.now")).toBe(
      "collapsed",
    );
    expect(screen.getByRole("button", { name: "Now (2)" })).toBeDefined();
  });

  it("caps at 8 rows and reports overflow", () => {
    renderList(
      Array.from({ length: 9 }, (_, index) =>
        thread({
          id: `thr_running_${index}`,
          title: `Working ${index}`,
          indicator: "runtime",
          updatedAt: index,
        }),
      ),
    );
    const now = screen.getByRole("region", { name: "Now" });
    expect(now.querySelectorAll("[data-now-thread-id]")).toHaveLength(8);
    expect(within(now).getByText("+1 more")).toBeDefined();
  });

  it("is hidden entirely when nothing qualifies", () => {
    renderList([thread({ id: "thr_idle", indicator: "none" })]);
    expect(screen.queryByRole("region", { name: "Now" })).toBeNull();
  });
});
