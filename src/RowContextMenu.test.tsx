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

function MenuHarness({ onRename }: { onRename?: () => void }) {
  return (
    <RowContextMenu thread={thread} onRename={onRename}>
      <button type="button">Thread row</button>
    </RowContextMenu>
  );
}

function renderMenu(onRename?: () => void) {
  return renderSlot(
    { component: MenuHarness },
    { onRename },
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
