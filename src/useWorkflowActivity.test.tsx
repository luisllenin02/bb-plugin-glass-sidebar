// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => {
  const call = vi.fn(async () => ({
    runs: [],
    updatedAt: 1,
    sourcePath: "/tmp/workflows/data.db",
    sourceStatus: "ok" as const,
  }));
  return {
    call,
    rpc: { call },
    status: "ready" as "loading" | "ready" | "error",
    threads: [] as PluginSidebarThread[],
  };
});

vi.mock("@get-bb/plugin-sdk/app", () => ({
  experimental_useSidebarThreads: () => ({
    status: sdk.status,
    threads: sdk.threads,
    projects: [],
  }),
  useRpc: () => sdk.rpc,
}));

const { useWorkflowActivity } = await import("./useWorkflowActivity");

function thread(updatedAt: number): PluginSidebarThread {
  return {
    id: "thr_origin",
    projectId: "proj_1",
    title: "Origin",
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
    updatedAt,
    lastReadAt: 1,
    latestAttentionAt: 1,
  };
}

function Probe() {
  useWorkflowActivity();
  return null;
}

afterEach(() => {
  cleanup();
  sdk.call.mockClear();
  sdk.status = "ready";
  sdk.threads = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useWorkflowActivity", () => {
  it("does not issue its first RPC during the mount render pass", () => {
    vi.useFakeTimers();
    render(<Probe />);
    expect(sdk.call).not.toHaveBeenCalled();
  });

  it("loads post-paint, refetches for host revisions, and clears its interval", async () => {
    vi.useFakeTimers();
    sdk.threads = [thread(100)];
    const clearInterval = vi.spyOn(window, "clearInterval");
    const rendered = render(<Probe />);

    expect(sdk.call).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(sdk.call).toHaveBeenCalledTimes(1);

    sdk.threads = [thread(200)];
    rendered.rerender(<Probe />);
    await act(async () => Promise.resolve());
    expect(sdk.call).toHaveBeenCalledTimes(2);

    rendered.rerender(<Probe />);
    await act(async () => Promise.resolve());
    expect(sdk.call).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(sdk.call).toHaveBeenCalledTimes(3);

    rendered.unmount();
    expect(clearInterval).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(sdk.call).toHaveBeenCalledTimes(3);
  });

  it("uses the first host list revision before the idle fallback", async () => {
    vi.useFakeTimers();
    sdk.status = "loading";
    const rendered = render(<Probe />);
    expect(sdk.call).not.toHaveBeenCalled();

    sdk.status = "ready";
    sdk.threads = [thread(100)];
    rendered.rerender(<Probe />);
    await act(async () => Promise.resolve());
    expect(sdk.call).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(sdk.call).toHaveBeenCalledTimes(1);
  });
});
