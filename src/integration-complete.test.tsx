// @vitest-environment jsdom
import type { PluginSidebarThread, PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { projectIconColorCss } from "./accent";
import { DEFAULT_SIDEBAR_SETTINGS } from "./sidebar-settings";

const app = await loadPluginApp(() => import("../app"));
const inbox = app.threadLists[0]!;
const settings = app.settingsSections[0]!;
const { resetProjectDecorCacheForTests } = await import("./useProjectDecor");
const glyph = [["path", { d: "M4 4h16v16H4z" }]] as const;

function thread(overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  const recent = Date.now() - 60_000;
  return {
    id: "thr_integration",
    projectId: "proj_integration",
    title: "Integration thread",
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
    createdAt: recent,
    updatedAt: recent,
    lastReadAt: recent,
    latestAttentionAt: recent,
    ...overrides,
  };
}

const defaultRpc = {
  getOrganization: () => ({
    folders: [],
    members: {},
    threadAccents: {},
    projectAccents: {},
  }),
  listInboxOrder: () => ({ inboxThreadIds: ["thr_integration"] }),
  getWorkflowActivity: () => ({
    runs: [],
    updatedAt: 0,
    sourcePath: "",
    sourceStatus: "missing" as const,
  }),
  listLifecycle: () => ({ rows: [] }),
  getProjectDecor: () => ({ projects: {}, updatedAt: 0 }),
  getProjectGlyphs: () => ({ glyphs: {} }),
  getSidebarSettings: () => ({ ...DEFAULT_SIDEBAR_SETTINGS }),
  listProjectIconSettings: () => ({ projects: [] }),
};

const listProps: PluginThreadListProps = {
  activeThreadId: null,
  activeProjectId: "proj_integration",
  isCompactViewport: false,
  onNavigate: () => undefined,
  searchQuery: "",
  Original: () => null,
};

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined,
  });
});

beforeEach(() => {
  window.localStorage.clear();
  resetProjectDecorCacheForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("renders each foreign settings block exactly once", async () => {
  renderSlot(settings, {}, {
    sidebarThreads: {
      status: "ready",
      threads: [thread()],
      projects: [
        { id: "proj_integration", name: "Integration", isPersonal: false },
      ],
    },
    rpc: defaultRpc,
  });
  await screen.findByRole("region", { name: "Project colours" });
  expect(screen.getAllByRole("region", { name: "Project colours" })).toHaveLength(1);
  expect(
    screen.getAllByRole("region", { name: "Project icons & colours" }),
  ).toHaveLength(1);
  expect(screen.getAllByRole("region", { name: "Thread lifecycle" })).toHaveLength(1);
});

it("keeps bulk Settle and Snooze enabled and calls their RPCs", async () => {
  const bulkSettle = vi.fn(async () => ({
    succeededThreadIds: ["thr_integration"],
    failures: [],
  }));
  const bulkSnooze = vi.fn(async (_input: unknown) => ({
    succeededThreadIds: ["thr_integration"],
    failures: [],
  }));
  const slot = renderSlot<PluginThreadListProps>(inbox, listProps, {
    sidebarThreads: {
      status: "ready",
      threads: [thread()],
      projects: [
        { id: "proj_integration", name: "Integration", isPersonal: false },
      ],
    },
    rpc: { ...defaultRpc, bulkSettle, bulkSnooze },
  });
  fireEvent.click(
    slot.container.querySelector('[data-sidebar-thread-id="thr_integration"]')!,
    { ctrlKey: true },
  );
  const settle = await screen.findByRole("button", {
    name: "Settle selected threads",
  });
  const snooze = screen.getByRole("combobox", {
    name: "Snooze selected threads",
  });
  expect((settle as HTMLButtonElement).disabled).toBe(false);
  expect((snooze as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(settle);
  await waitFor(() => expect(bulkSettle).toHaveBeenCalledWith({
    threadIds: ["thr_integration"],
  }));

  fireEvent.click(
    slot.container.querySelector('[data-sidebar-thread-id="thr_integration"]')!,
    { ctrlKey: true },
  );
  fireEvent.pointerDown(
    await screen.findByRole("combobox", { name: "Snooze selected threads" }),
    { button: 0, pointerType: "mouse" },
  );
  fireEvent.click(await screen.findByRole("option", { name: "30 minutes" }));
  await waitFor(() => expect(bulkSnooze).toHaveBeenCalledOnce());
  expect(bulkSnooze.mock.calls[0]?.[0]).toMatchObject({
    threadIds: ["thr_integration"],
    snoozedUntil: expect.any(Number),
  });
  slot.lifecycle.unmount();
});

it("shares project decor across a row, folder header, and live-strip chip", async () => {
  const colour = projectIconColorCss("blue");
  const slot = renderSlot<PluginThreadListProps>(inbox, listProps, {
    sidebarThreads: {
      status: "ready",
      threads: [thread({ indicator: "runtime", indicatorLabel: "Working" })],
      projects: [
        { id: "proj_integration", name: "Integration", isPersonal: false },
      ],
    },
    rpc: {
      ...defaultRpc,
      getOrganization: () => ({
        folders: [
          {
            id: "fld_integration",
            name: "Integration folder",
            colorIndex: 0,
            customColor: null,
            collapsed: false,
            sortIndex: 0,
            threadIds: ["thr_integration"],
          },
        ],
        members: { thr_integration: "fld_integration" },
        threadAccents: {},
        projectAccents: {},
      }),
      getProjectDecor: () => ({
        projects: {
          proj_integration: {
            icon: "rocket",
            iconColor: "blue" as const,
            source: "auto" as const,
            autoReason: "name:integration",
            autoKeywords: [],
          },
        },
        updatedAt: 1,
      }),
      getProjectGlyphs: () => ({ glyphs: { rocket: glyph } }),
    },
  });

  await screen.findByText("Integration folder");
  const row = slot.container
    .querySelector('[data-sidebar-thread-id="thr_integration"]')!
    .closest<HTMLElement>("[data-thread-pane-state]")!;
  const folderHeader = slot.container.querySelector<HTMLElement>(
    '[data-folder-container-id="fld_integration"]',
  )!;
  const liveChip = slot.container.querySelector<HTMLElement>(
    '[data-live-strip="now"]',
  )!;
  await waitFor(() => {
    const rowGlyph = row.querySelector<HTMLElement>(
      '[data-project-glyph-source="project-decor"]',
    );
    const folderGlyph = folderHeader.querySelector<HTMLElement>(
      '[data-project-glyph-source="project-decor"]',
    );
    const liveGlyph = liveChip.querySelector<HTMLElement>(
      '[data-project-glyph-source="project-decor"]',
    );
    for (const projectGlyph of [rowGlyph, folderGlyph, liveGlyph]) {
      expect(projectGlyph).not.toBeNull();
      expect(projectGlyph!.style.getPropertyValue("--project-glyph-color")).toBe(colour);
      expect(
        projectGlyph!.querySelector('path[d="M4 4h16v16H4z"]'),
      ).not.toBeNull();
    }
  });
  expect(row.style.getPropertyValue("--thread-accent")).toBe(colour);
  expect(row.dataset.projectAccentSource).toBe("project-decor");
  const liveColour = [...liveChip.querySelectorAll<HTMLElement>("span")].find(
    (node) => node.style.getPropertyValue("--thread-accent") === colour,
  );
  expect(liveColour).toBeDefined();
  slot.lifecycle.unmount();
});

it("keeps hook order stable across a full-list re-render", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const slot = renderSlot<PluginThreadListProps>(inbox, listProps, {
    sidebarThreads: {
      status: "ready",
      threads: [thread()],
      projects: [
        { id: "proj_integration", name: "Integration", isPersonal: false },
      ],
    },
    rpc: defaultRpc,
  });
  await screen.findByText("Integration thread");
  await act(async () => {
    slot.lifecycle.rerender(
      <inbox.component {...listProps} searchQuery="Integration" />,
    );
  });
  const hookWarnings = consoleError.mock.calls.filter(([message]) =>
    /order of Hooks|Rendered (?:more|fewer) hooks/i.test(String(message)),
  );
  expect(hookWarnings).toEqual([]);
  slot.lifecycle.unmount();
});
