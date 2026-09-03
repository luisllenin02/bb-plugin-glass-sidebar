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
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

await loadPluginApp(() => import("../app"));
const { RowContextMenu } = await import("./RowContextMenu");
const { EMPTY_ORGANIZATION_ACCESS } = await import("./row-props");
const { ACCENT_PALETTE } = await import("./accent");
type OrganizationAccess = typeof EMPTY_ORGANIZATION_ACCESS;

const thread: PluginSidebarThread = {
  id: "thr_menu",
  projectId: "project",
  title: "Menu thread",
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
};

function MenuHarness({
  onRename,
  organization,
  onFolderCreated,
}: {
  onRename?: () => void;
  organization?: OrganizationAccess;
  onFolderCreated?: (folderId: string) => void;
}) {
  return (
    <RowContextMenu
      thread={thread}
      onRename={onRename}
      organization={organization}
      onFolderCreated={onFolderCreated}
    >
      <button type="button">Thread row</button>
    </RowContextMenu>
  );
}

function renderMenu(
  onRename?: () => void,
  organization?: OrganizationAccess,
  onFolderCreated?: (folderId: string) => void,
) {
  return renderSlot(
    { component: MenuHarness },
    { onRename, organization, onFolderCreated },
    {
      sidebarThreads: {
        status: "ready",
        threads: [thread],
        projects: [{ id: "project", name: "Project", isPersonal: false }],
      },
    },
  );
}

async function openMenu() {
  fireEvent.contextMenu(screen.getByRole("button", { name: "Thread row" }));
  return screen.findByRole("menu", { name: "Thread actions" });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RowContextMenu Q1 base", () => {
  it("opens normally or in a split and exposes native actions", async () => {
    const rendered = renderMenu();
    let menu = await openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Open" }));
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: thread.id,
      options: { split: false },
    });

    menu = await openMenu();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Open in split" }),
    );
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: thread.id,
      options: { split: true },
    });

    menu = await openMenu();
    expect(within(menu).getByRole("menuitem", { name: "Pin" })).toBeDefined();
    expect(
      within(menu).getByRole("menuitem", { name: "Mark unread" }),
    ).toBeDefined();
    expect(
      within(menu).getByRole("menuitem", { name: "Archive" }),
    ).toBeDefined();
    expect(
      within(menu).getByRole("menuitem", { name: "Delete" }),
    ).toBeDefined();
  });

  it("defers inline rename until the menu closes", async () => {
    const onRename = vi.fn();
    renderMenu(onRename);
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Rename" }));
    await waitFor(() => expect(onRename).toHaveBeenCalledOnce());
  });

  it("copies the title and id", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderMenu();
    let menu = await openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Copy" }));
    let submenu = await waitFor(() =>
      document.querySelector<HTMLElement>('[aria-label="Copy thread data"]'),
    );
    expect(submenu).toBeTruthy();
    fireEvent.click(
      within(submenu!).getByRole("menuitem", { name: "Copy title" }),
    );
    expect(writeText).toHaveBeenCalledWith("Menu thread");

    menu = await openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Copy" }));
    submenu = await waitFor(() =>
      document.querySelector<HTMLElement>('[aria-label="Copy thread data"]'),
    );
    expect(submenu).toBeTruthy();
    fireEvent.click(
      within(submenu!).getByRole("menuitem", { name: "Copy thread ID" }),
    );
    expect(writeText).toHaveBeenCalledWith("thr_menu");
  });
});

const folder = {
  id: "fld_work",
  name: "Client work",
  colorIndex: 3,
  customColor: null,
  collapsed: false,
  sortIndex: 0,
  threadIds: ["thr_menu"],
};

function organizationAccess(
  overrides: Partial<OrganizationAccess> = {},
  actions: Partial<OrganizationAccess["actions"]> = {},
): OrganizationAccess {
  return {
    ...EMPTY_ORGANIZATION_ACCESS,
    folders: [folder],
    ...overrides,
    actions: { ...EMPTY_ORGANIZATION_ACCESS.actions, ...actions },
  };
}

async function openSubmenu(label: string, panel: string) {
  const menu = await openMenu();
  fireEvent.click(within(menu).getByRole("menuitem", { name: label }));
  const submenu = await waitFor(() => {
    const node = document.querySelector<HTMLElement>(`[aria-label="${panel}"]`);
    expect(node).toBeTruthy();
    return node!;
  });
  return submenu;
}

describe("RowContextMenu Q2 organisation items", () => {
  it("hides the organisation items entirely when no api is supplied", async () => {
    renderMenu();
    const menu = await openMenu();
    expect(
      within(menu).queryByRole("menuitem", { name: "Move to folder" }),
    ).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", { name: "Thread colour" }),
    ).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", { name: "Remove from folder" }),
    ).toBeNull();
  });

  it("moves the thread into an existing folder", async () => {
    const moveThreadToFolder = vi.fn(async () => ({ ok: true as const }));
    renderMenu(undefined, organizationAccess({}, { moveThreadToFolder }));
    const submenu = await openSubmenu("Move to folder", "Move to folder");
    fireEvent.click(
      within(submenu).getByRole("menuitem", { name: "Client work" }),
    );
    await waitFor(() =>
      expect(moveThreadToFolder).toHaveBeenCalledWith({
        threadId: "thr_menu",
        folderId: "fld_work",
      }),
    );
  });

  it("creates a uniquely named folder and reports the new id", async () => {
    const created = { ...folder, id: "fld_new", name: "New folder" };
    const createFolder = vi.fn(async () => ({ folder: created }));
    const onFolderCreated = vi.fn();
    renderMenu(
      undefined,
      organizationAccess({}, { createFolder }),
      onFolderCreated,
    );
    const submenu = await openSubmenu("Move to folder", "Move to folder");
    fireEvent.click(
      within(submenu).getByRole("menuitem", { name: "New folder…" }),
    );
    await waitFor(() =>
      expect(createFolder).toHaveBeenCalledWith({
        name: "New folder",
        threadIds: ["thr_menu"],
      }),
    );
    await waitFor(() => expect(onFolderCreated).toHaveBeenCalledWith("fld_new"));
  });

  it("offers Remove from folder only for a member, and clears membership", async () => {
    const moveThreadToFolder = vi.fn(async () => ({ ok: true as const }));
    renderMenu(
      undefined,
      organizationAccess(
        { folderOf: () => folder },
        { moveThreadToFolder },
      ),
    );
    const menu = await openMenu();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Remove from folder" }),
    );
    await waitFor(() =>
      expect(moveThreadToFolder).toHaveBeenCalledWith({
        threadId: "thr_menu",
        folderId: null,
      }),
    );
  });

  it("sets and clears the thread accent from the colour submenu", async () => {
    const setThreadAccent = vi.fn(async () => ({ ok: true as const }));
    renderMenu(
      undefined,
      organizationAccess(
        { accentFor: () => ACCENT_PALETTE[3] },
        { setThreadAccent },
      ),
    );
    const submenu = await openSubmenu(
      "Thread colour",
      "Colour for Menu thread",
    );
    fireEvent.click(
      within(submenu).getByRole("button", { name: "teal colour" }),
    );
    await waitFor(() =>
      expect(setThreadAccent).toHaveBeenCalledWith({
        threadId: "thr_menu",
        colorIndex: 7,
        customColor: null,
      }),
    );

    fireEvent.click(within(submenu).getByRole("menuitem", { name: "Clear" }));
    await waitFor(() =>
      expect(setThreadAccent).toHaveBeenCalledWith({
        threadId: "thr_menu",
        colorIndex: 0,
        customColor: null,
      }),
    );
  });
});
