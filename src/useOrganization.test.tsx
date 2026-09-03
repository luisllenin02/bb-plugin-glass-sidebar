// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
      id: "folder_one",
      name: "Work",
      colorIndex: 0,
      customColor: null,
      collapsed: false,
      sortIndex: 0,
      threadIds: ["member"],
    },
  ],
  members: { member: "folder_one" },
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

function renderList() {
  return renderSlot<PluginThreadListProps>(inbox, props, {
    sidebarThreads: {
      status: "ready",
      threads: [thread({ id: "member", title: "Member" })],
      projects: [{ id: "project", name: "Project", isPersonal: false }],
    },
    rpc: {
      getOrganization: () => organization,
      listInboxOrder: () => ({ inboxThreadIds: [] }),
      setFolderCollapsed: () => ({ ok: true as const }),
    },
  });
}

function organizationReads(calls: readonly { method: string }[]): number {
  return calls.filter((call) => call.method === "getOrganization").length;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("useOrganization read budget", () => {
  it("reads getOrganization once on mount", async () => {
    const rendered = renderList();
    await screen.findByRole("region", { name: "Folders" });
    await waitFor(() => expect(organizationReads(rendered.rpcCalls)).toBe(1));
  });

  it("does not re-read after a successful mutation", async () => {
    const rendered = renderList();
    const folders = await screen.findByRole("region", { name: "Folders" });
    fireEvent.click(
      within(folders).getByRole("button", { name: "Collapse Work" }),
    );
    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "setFolderCollapsed",
        input: { folderId: "folder_one", collapsed: true },
      }),
    );
    // The optimistic state already shows the collapse; the server's signal is
    // what reconciles it, so no second read may follow the write.
    await waitFor(() =>
      expect(
        within(folders).getByRole("button", { name: "Expand Work" }),
      ).toBeDefined(),
    );
    expect(organizationReads(rendered.rpcCalls)).toBe(1);
  });

  it("re-reads when the organization signal arrives", async () => {
    const rendered = renderList();
    await screen.findByRole("region", { name: "Folders" });
    await waitFor(() => expect(organizationReads(rendered.rpcCalls)).toBe(1));
    await rendered.emitRealtime("organization", { reason: "test" });
    await waitFor(() => expect(organizationReads(rendered.rpcCalls)).toBe(2));
  });
});
