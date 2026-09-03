// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render as renderReact,
  screen,
  waitFor,
} from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

const app = await loadPluginApp(() => import("../app"));
const projectChip = app.threadHeaderActions.find((slot) => slot.id === "project")!;
const inbox = app.threadLists[0]!;
const { IconPicker } = await import("./IconPicker");
const { ProjectDecorBlock } = await import("./ProjectDecorBlock");
const { ProjectGlyph } = await import("./ProjectGlyph");
const { resetProjectDecorCacheForTests } = await import("./useProjectDecor");
const { projectIconColorCss } = await import("./accent");

const glyph = [["path", { d: "M4 4h16v16H4z" }]] as const;

function thread(overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
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

afterEach(() => {
  cleanup();
  resetProjectDecorCacheForTests();
  window.localStorage.clear();
});

describe("ProjectGlyph", () => {
  it("uses owned drawing, favicon, then tinted folder fallback", () => {
    const owned = renderReact(
      <ProjectGlyph
        decor={{ icon: "rocket", iconColor: "blue", source: "auto", glyph }}
        faviconUrl="/favicon.svg"
        className="size-3"
      />,
    );
    expect(owned.container.querySelector("[data-project-glyph-source=project-decor]")).not.toBeNull();
    owned.unmount();

    const favicon = renderReact(<ProjectGlyph faviconUrl="/favicon.svg" />);
    expect(favicon.container.querySelector("[data-project-glyph-source=favicon]")).not.toBeNull();
    favicon.unmount();

    const fallback = renderReact(<ProjectGlyph faviconUrl={null} resolvedAccent="#abcdef" />);
    const node = fallback.container.querySelector<HTMLElement>("[data-project-glyph-source=folder]")!;
    expect(node.style.color).toBe("rgb(171, 205, 239)");
  });
});

describe("IconPicker", () => {
  const rpc = {
    listIconCatalog: () => ({
      icons: [
        { name: "rocket", export: "RocketIcon", category: "space", tags: ["launch"], glyph },
      ],
      total: 1,
    }),
    setProjectDecorIcon: () => ({ ok: true as const }),
    clearProjectDecorIcon: () => ({ ok: true as const }),
    resetProjectDecorToAuto: () => ({ ok: true as const }),
    redetectAllAutoIcons: () => ({ ok: true as const }),
  };

  it("hides Suggest with AI when the host capability is absent", async () => {
    renderSlot(
      { component: IconPicker },
      {
        open: true,
        onOpenChange: () => undefined,
        projectId: "proj_1",
        projectName: "Project One",
        decor: null,
      },
      { rpc },
    );
    await screen.findByLabelText("rocket");
    expect(screen.queryByRole("button", { name: "Suggest with AI" })).toBeNull();
  });

  it("runs one optional AI suggestion only on an explicit click", async () => {
    const aiSuggester = vi.fn(async () => "rocket");
    renderSlot(
      { component: IconPicker },
      {
        open: true,
        onOpenChange: () => undefined,
        projectId: "proj_1",
        projectName: "Project One",
        decor: null,
        topLevelListingNames: ["README.md", "package.json"],
        aiSuggester,
      },
      { rpc },
    );
    const button = await screen.findByRole("button", { name: "Suggest with AI" });
    expect(aiSuggester).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(aiSuggester).toHaveBeenCalledTimes(1));
    expect(aiSuggester).toHaveBeenCalledWith({
      projectName: "Project One",
      listingNames: ["README.md", "package.json"],
      candidateIconNames: ["rocket"],
    });
  });
});

describe("project decor consumers", () => {
  it("registers a header chip that opens the owned picker", async () => {
    renderSlot(
      projectChip,
      { threadId: "thr_1", projectId: "proj_1", isCompactViewport: false },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread()],
          projects: [{ id: "proj_1", name: "Project One", isPersonal: false }],
        },
        rpc: {
          getProjectDecor: () => ({
            projects: {
              proj_1: {
                icon: "rocket",
                iconColor: "blue",
                source: "auto",
                autoReason: "name:dev",
                autoKeywords: [],
              },
            },
            updatedAt: 1,
          }),
          getProjectGlyphs: () => ({ glyphs: { rocket: glyph } }),
          listIconCatalog: () => ({ icons: [], total: 0 }),
        },
      },
    );
    const button = await screen.findByRole("button", {
      name: "Project icon and colour for Project One",
    });
    await waitFor(() =>
      expect(document.querySelector("[data-project-glyph-source=project-decor]")).not.toBeNull(),
    );
    fireEvent.click(button);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("feeds one decor map to the row, folder header, and live-strip chip", async () => {
    renderSlot(
      inbox,
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
          threads: [thread({ indicator: "runtime", indicatorLabel: "Working" })],
          projects: [{ id: "proj_1", name: "Project One", isPersonal: false }],
        },
        rpc: {
          getOrganization: () => ({
            folders: [
              {
                id: "fld_1",
                name: "Matter shelf",
                colorIndex: 0,
                customColor: null,
                collapsed: false,
                sortIndex: 0,
                threadIds: ["thr_1"],
              },
            ],
            members: { thr_1: "fld_1" },
            threadAccents: {},
            projectAccents: {},
          }),
          listInboxOrder: () => ({ inboxThreadIds: ["thr_1"] }),
          getWorkflowActivity: () => ({
            runs: [], updatedAt: 0, sourcePath: "", sourceStatus: "missing",
          }),
          listLifecycle: () => ({ rows: [] }),
          getProjectDecor: () => ({
            projects: {
              proj_1: {
                icon: "rocket",
                iconColor: "blue",
                source: "auto",
                autoReason: "name:dev",
                autoKeywords: [],
              },
            },
            updatedAt: 1,
          }),
          getProjectGlyphs: () => ({ glyphs: { rocket: glyph } }),
        },
      },
    );

    await screen.findByText("Matter shelf");
    await waitFor(() =>
      expect(
        document.querySelectorAll("[data-project-glyph-source=project-decor]"),
      ).toHaveLength(2),
    );
    const glyphs = [...document.querySelectorAll<HTMLElement>("[data-project-glyph-source=project-decor]")];
    expect(glyphs.map((node) => node.style.getPropertyValue("--project-glyph-color"))).toEqual([
      projectIconColorCss("blue"),
      projectIconColorCss("blue"),
    ]);
    const row = document
      .querySelector('[data-sidebar-thread-id="thr_1"]')!
      .closest<HTMLElement>("[data-thread-pane-state]")!;
    expect(row.style.getPropertyValue("--thread-accent")).toBe(
      projectIconColorCss("blue"),
    );
    expect(row.dataset.projectAccentSource).toBe("project-decor");

    const stripChip = document.querySelector<HTMLElement>(
      '[data-live-strip="now"]',
    )!;
    const stripDot = [...stripChip.querySelectorAll<HTMLElement>("span")].find(
      (node) => node.style.getPropertyValue("--thread-accent"),
    );
    expect(stripDot?.style.getPropertyValue("--thread-accent")).toBe(
      projectIconColorCss("blue"),
    );
  });
});

describe("ProjectDecorBlock", () => {
  it("shows effective source and exposes the auto-colour toggle", () => {
    const onChange = vi.fn();
    renderReact(
      <ProjectDecorBlock
        settings={{
          snoozePresets: "30m",
          inactiveThreadsEnabled: true,
          inactiveAfterHours: 6,
          autoSettleInactive: true,
          autoSettleAfterDays: 3,
          autoSettleOnMerge: true,
          autoProjectColours: true,
        }}
        projects={{
          proj_1: { icon: "rocket", iconColor: "blue", source: "manual" },
          proj_2: { icon: "folder-01", iconColor: "pink", source: "auto" },
        }}
        projectNames={{ proj_1: "One", proj_2: "Two" }}
        onAutoProjectColoursChange={onChange}
      />,
    );
    expect(screen.getByText("Manual")).toBeTruthy();
    expect(screen.getByText("Auto")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto colours" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
