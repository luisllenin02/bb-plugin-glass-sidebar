// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
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

/** Recent enough that Q5's default 6-hour Inactive rule does not apply. */
const RECENT_ACTIVITY = Date.now() - 60_000;

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
    // Q5: recent activity, so the default 6-hour Inactive rule leaves this
    // fixture on the Active shelf. Ordering still comes from createdAt.
    updatedAt: RECENT_ACTIVITY,
    lastReadAt: RECENT_ACTIVITY,
    latestAttentionAt: RECENT_ACTIVITY,
    ...overrides,
  };
}

const EMPTY_ORGANIZATION: Organization = {
  folders: [],
  members: {},
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

const threads = [
  thread({ id: "pin_a", title: "Pin A", isPinned: true, createdAt: 30 }),
  thread({ id: "pin_b", title: "Pin B", isPinned: true, createdAt: 20 }),
  thread({ id: "act_a", title: "Act A", createdAt: 3 }),
  thread({ id: "act_b", title: "Act B", createdAt: 2 }),
  thread({ id: "act_c", title: "Act C", createdAt: 1 }),
];

function renderList(options?: {
  organization?: Organization;
  inboxThreadIds?: string[];
}) {
  return renderSlot<PluginThreadListProps>(inbox, props, {
    sidebarThreads: {
      status: "ready",
      threads,
      projects: [{ id: "project", name: "Project", isPersonal: false }],
    },
    rpc: {
      getOrganization: () => options?.organization ?? EMPTY_ORGANIZATION,
      listInboxOrder: () => ({
        inboxThreadIds: options?.inboxThreadIds ?? [],
      }),
      reorderInbox: (input) => ({
        inboxThreadIds: (input as { inboxThreadIds: string[] }).inboxThreadIds,
      }),
      reorderPinned: () => ({ pinnedThreadIds: ["pin_b", "pin_a"] }),
      createFolder: () => ({
        folder: {
          id: "folder_new",
          name: "New folder",
          colorIndex: 0,
          customColor: null,
          collapsed: false,
          sortIndex: 0,
          threadIds: ["act_b", "act_a"],
        },
      }),
      reorderFolderThreads: () => ({ ok: true as const }),
    },
  });
}

function card(title: string): HTMLElement {
  return screen
    .getByText(title)
    .closest("li")!
    .querySelector<HTMLElement>("[data-sidebar-thread-id]")!;
}

function shelfTitles(label: string): string[] {
  const region = screen.getByRole("region", { name: label });
  return [...region.querySelectorAll<HTMLElement>("[data-sidebar-thread-id]")].map(
    (node) =>
      node
        .closest("li")!
        .querySelector<HTMLElement>("[data-thread-title]")
        ?.textContent ?? node.getAttribute("aria-label") ?? "",
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("flat shelf reorder", () => {
  it("issues exactly one listInboxOrder read on mount", async () => {
    const rendered = renderList();
    await waitFor(() =>
      expect(
        rendered.rpcCalls.filter((call) => call.method === "listInboxOrder"),
      ).toHaveLength(1),
    );
    expect(
      rendered.rpcCalls.filter((call) => call.method === "getOrganization"),
    ).toHaveLength(1);
  });

  it("applies the durable inbox order to the Active shelf", async () => {
    renderList({ inboxThreadIds: ["act_c", "act_a", "act_b"] });
    await waitFor(() =>
      expect(shelfTitles("Active").join("|")).toContain("Act C"),
    );
    await waitFor(() => {
      const order = shelfTitles("Active");
      expect(order.indexOf("Act C")).toBeLessThan(order.indexOf("Act A"));
      expect(order.indexOf("Act A")).toBeLessThan(order.indexOf("Act B"));
    });
  });

  it("persists an Alt+ArrowDown move on an ungrouped inbox card", async () => {
    const rendered = renderList();
    await screen.findByText("Act A");
    fireEvent.keyDown(card("Act A"), { key: "ArrowDown", altKey: true });
    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "reorderInbox",
        input: { inboxThreadIds: ["act_b", "act_a", "act_c"] },
      }),
    );
  });

  it("persists an Alt+ArrowUp move on an ungrouped pinned card", async () => {
    const rendered = renderList();
    await screen.findByText("Pin B");
    fireEvent.keyDown(card("Pin B"), { key: "ArrowUp", altKey: true });
    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "reorderPinned",
        input: {
          threadId: "pin_b",
          previousThreadId: null,
          nextThreadId: "pin_a",
        },
      }),
    );
  });

  it("advertises the keyboard shortcut on ungrouped cards", async () => {
    renderList();
    await screen.findByText("Act A");
    expect(card("Act A").getAttribute("aria-keyshortcuts")).toBe(
      "Alt+ArrowUp Alt+ArrowDown",
    );
  });

  it("routes a folder member's Alt+Arrow to the folder, not the shelf", async () => {
    const rendered = renderList({
      organization: {
        ...EMPTY_ORGANIZATION,
        folders: [
          {
            id: "folder_one",
            name: "Work",
            colorIndex: 0,
            customColor: null,
            collapsed: false,
            sortIndex: 0,
            threadIds: ["act_a", "act_b"],
          },
        ],
        members: { act_a: "folder_one", act_b: "folder_one" },
      },
    });
    const folders = await screen.findByRole("region", { name: "Folders" });
    const member = within(folders)
      .getByText("Act A")
      .closest("li")!
      .querySelector<HTMLElement>("[data-sidebar-thread-id]")!;
    fireEvent.keyDown(member, { key: "ArrowDown", altKey: true });
    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "reorderFolderThreads",
        input: { folderId: "folder_one", threadIds: ["act_b", "act_a"] },
      }),
    );
    expect(
      rendered.rpcCalls.some((call) => call.method === "reorderInbox"),
    ).toBe(false);
  });
});

/** A pointer gesture jsdom can dispatch: MouseEvent plus the pointer fields. */
function pointer(type: string, clientX: number, clientY: number): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "pointerId", { value: 7 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}

async function drag(from: HTMLElement, endY: number): Promise<void> {
  await act(async () => {
    from.dispatchEvent(pointer("pointerdown", 0, 0));
  });
  await act(async () => {
    window.dispatchEvent(pointer("pointermove", 0, 10));
  });
  await act(async () => {
    window.dispatchEvent(pointer("pointerup", 0, endY));
  });
}

describe("flat shelf and folder drags do not both write", () => {
  const rect = {
    left: 0,
    top: 0,
    right: 200,
    bottom: 20,
    width: 200,
    height: 20,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;

  afterEach(() => {
    vi.mocked(document.elementFromPoint).mockReset();
  });

  async function setUp(): Promise<{
    rendered: ReturnType<typeof renderList>;
    source: HTMLElement;
  }> {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect);
    const rendered = renderList();
    await screen.findByText("Act B");
    vi.mocked(document.elementFromPoint).mockReturnValue(card("Act B"));
    return { rendered, source: card("Act A") };
  }

  it("creates a folder on a centre drop and does not also reorder the shelf", async () => {
    const { rendered, source } = await setUp();
    await drag(source, 10);
    await waitFor(() =>
      expect(
        rendered.rpcCalls.some((call) => call.method === "createFolder"),
      ).toBe(true),
    );
    expect(rendered.rpcCalls.some((call) => call.method === "reorderInbox")).toBe(
      false,
    );
  });

  it("reorders the shelf on an edge drop and does not create a folder", async () => {
    const { rendered, source } = await setUp();
    await drag(source, 19);
    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "reorderInbox",
        input: { inboxThreadIds: ["act_b", "act_a", "act_c"] },
      }),
    );
    expect(rendered.rpcCalls.some((call) => call.method === "createFolder")).toBe(
      false,
    );
  });
});
