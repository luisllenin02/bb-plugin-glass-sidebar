// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type {
  PluginSidebarThread,
  PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import type { Organization } from "./organization";

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
    createdAt: 1,
    updatedAt: 1,
    lastReadAt: 1,
    latestAttentionAt: 1,
    ...overrides,
  };
}

const organization: Organization = {
  folders: [
    {
      id: "folder_blue",
      name: "Blue work",
      colorIndex: 1,
      customColor: null,
      collapsed: false,
      sortIndex: 0,
      threadIds: ["pinned_member"],
    },
    {
      id: "folder_plain",
      name: "Plain work",
      colorIndex: 0,
      customColor: null,
      collapsed: false,
      sortIndex: 1,
      threadIds: ["active_member"],
    },
  ],
  members: {
    pinned_member: "folder_blue",
    active_member: "folder_plain",
  },
  threadAccents: {},
  projectAccents: {},
};

const props: PluginThreadListProps = {
  activeThreadId: null,
  activeProjectId: "project",
  isCompactViewport: false,
  onNavigate: () => {},
  searchQuery: "",
  Original: () => null,
} as unknown as PluginThreadListProps;

function renderFolders() {
  return renderSlot<PluginThreadListProps>(inbox, props, {
    sidebarThreads: {
      status: "ready",
      threads: [
        thread({
          id: "pinned_member",
          title: "Pinned member",
          isPinned: true,
        }),
        thread({ id: "active_member", title: "Active member" }),
        thread({ id: "loose", title: "Loose active" }),
      ],
      projects: [{ id: "project", name: "Project", isPersonal: false }],
    },
    rpc: {
      getOrganization: () => organization,
      setFolderCollapsed: () => ({ ok: true as const }),
      renameFolder: () => ({ ok: true as const }),
      moveThreadToFolder: () => ({ ok: true as const }),
    },
  });
}

async function blueContainer(): Promise<HTMLElement> {
  const folders = await screen.findByRole("region", { name: "Folders" });
  return folders.querySelector<HTMLElement>(
    '[data-folder-container-id="folder_blue"]',
  )!;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.mocked(document.elementFromPoint).mockReset();
});

describe("FolderShelf integration", () => {
  it("renders ordered folders above the shelves, applies the colour wash, and hides members from the flat shelves", async () => {
    renderFolders();
    const container = await blueContainer();
    expect(within(container).getByText("Blue work")).toBeDefined();
    expect(within(container).getByText("1")).toBeDefined();
    expect(within(container).getByText("Pinned member")).toBeDefined();
    expect(
      container
        .querySelector<HTMLElement>('[data-sidebar-thread-id="pinned_member"]')!
        .closest<HTMLElement>("[data-thread-pane-state]")!
        .style.getPropertyValue("--thread-accent"),
    ).toBe("hsl(211 92% 62%)");
    expect(
      container.querySelector<HTMLElement>('[data-folder-id="folder_blue"]')!
        .parentElement!.style.background,
    ).toContain("color-mix");

    const region = await screen.findByRole("region", { name: "Folders" });
    expect(
      [...region.querySelectorAll("[data-folder-container-id]")].map((node) =>
        node.getAttribute("data-folder-container-id"),
      ),
    ).toEqual(["folder_blue", "folder_plain"]);

    const pinnedShelf = screen.queryByRole("region", { name: "Pinned" });
    expect(pinnedShelf && within(pinnedShelf).queryByText("Pinned member")).toBeNull();
    const active = screen.getByRole("region", { name: "Active" });
    expect(within(active).queryByText("Active member")).toBeNull();
    expect(within(active).getByText("Loose active")).toBeDefined();
  });

  it("persists collapse through the server rather than localStorage", async () => {
    const rendered = renderFolders();
    const container = await blueContainer();
    fireEvent.click(
      within(container).getByRole("button", { name: "Collapse Blue work" }),
    );
    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "setFolderCollapsed",
        input: { folderId: "folder_blue", collapsed: true },
      }),
    );
    expect(window.localStorage.getItem("glass-sidebar:folder-collapse")).toBeNull();
  });

  it("opens a member-project composer and commits an inline rename", async () => {
    const rendered = renderFolders();
    const container = await blueContainer();
    fireEvent.click(
      within(container).getByRole("button", { name: "+ New thread" }),
    );
    await waitFor(() =>
      expect(rendered.sidebarActionCalls).toContainEqual({
        method: "openNewThread",
        options: { projectId: "project", focusPrompt: true },
      }),
    );

    fireEvent.contextMenu(
      within(container).getByRole("button", { name: "Collapse Blue work" }),
    );
    fireEvent.click(await screen.findByText("Rename"));
    const input = await screen.findByRole("textbox", {
      name: "Rename folder Blue work",
    });
    fireEvent.change(input, { target: { value: "Client work" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "renameFolder",
        input: { folderId: "folder_blue", name: "Client work" },
      }),
    );
  });

  it("opens the active project's composer from an empty folder", async () => {
    const emptyFolder: Organization = {
      folders: [
        {
          id: "folder_empty",
          name: "Empty work",
          colorIndex: 0,
          customColor: null,
          collapsed: false,
          sortIndex: 0,
          threadIds: [],
        },
      ],
      members: {},
      threadAccents: {},
      projectAccents: {},
    };
    const rendered = renderSlot<PluginThreadListProps>(
      inbox,
      { ...props, activeProjectId: "route_project" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "loose", title: "Loose active" })],
          projects: [
            { id: "project", name: "Project", isPersonal: false },
            { id: "route_project", name: "Route", isPersonal: false },
          ],
        },
        rpc: { getOrganization: () => emptyFolder },
      },
    );
    const folders = await screen.findByRole("region", { name: "Folders" });
    fireEvent.click(
      within(folders).getByRole("button", { name: "+ New thread" }),
    );
    await waitFor(() =>
      expect(rendered.sidebarActionCalls).toContainEqual({
        method: "openNewThread",
        options: { projectId: "route_project", focusPrompt: true },
      }),
    );
  });

  it("falls back to the folder's own accent dot while Q4 decor is empty", async () => {
    renderFolders();
    const container = await blueContainer();
    const header = container.querySelector<HTMLElement>(
      '[data-folder-id="folder_blue"]',
    )!.parentElement!;
    expect(header.querySelector("[data-project-glyph-source]")).toBeNull();
    // The dot carries the folder's own accent; the wash carries the mix.
    expect(
      [...header.querySelectorAll<HTMLElement>("span")].some(
        (node) =>
          node.style.background.length > 0 &&
          !node.style.background.startsWith("color-mix"),
      ),
    ).toBe(true);
  });
});

describe("FolderHeader project decor", () => {
  it("uses the first member's project glyph once decor exists", async () => {
    const { render } = await import("@testing-library/react");
    const { FolderShelf } = await import("./FolderShelf");
    const { EMPTY_ORGANIZATION_ACCESS } = await import("./row-props");
    const member = thread({ id: "pinned_member", title: "Pinned member" });
    const noDrag = {
      draggingId: null,
      target: null,
      threadControls: () => ({
        disabled: false,
        isDragging: false,
        onPointerDown: () => {},
        onKeyDown: () => {},
      }),
      folderControls: () => ({
        disabled: false,
        isDragging: false,
        onPointerDown: () => {},
        onKeyDown: () => {},
      }),
    } as unknown as Parameters<typeof FolderShelf>[0]["drag"];

    render(
      <FolderShelf
        entries={[{ folder: organization.folders[0]!, members: [member] }]}
        organization={EMPTY_ORGANIZATION_ACCESS}
        drag={noDrag}
        renderThread={(thread) => <li key={thread.id}>{thread.title}</li>}
        activeProjectId="project"
        renamingFolderId={null}
        onRenamingFolderChange={() => {}}
        onNewThread={() => {}}
        projectDecor={{
          project: { icon: "folder-01", iconColor: "blue", source: "manual" },
        }}
      />,
    );

    expect(
      document.querySelector('[data-project-glyph-source="folder"]'),
    ).not.toBeNull();
    cleanup();
  });
});
