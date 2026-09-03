// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => {
  const call = vi.fn(async () => ({
    snoozePresets: "30m, 2h, 1d, 1w",
    inactiveThreadsEnabled: true,
    inactiveAfterHours: 6,
    autoSettleInactive: true,
    autoSettleAfterDays: 3,
    autoSettleOnMerge: true,
    autoProjectColours: true,
  }));
  return {
    call,
    rpc: { call },
    realtime: null as null | (() => void),
    status: "ready" as "loading" | "ready" | "error",
    threads: [] as Array<{ id: string; updatedAt: number }>,
  };
});

vi.mock("@get-bb/plugin-sdk/app", () => ({
  experimental_useSidebarThreads: () => ({
    status: sdk.status,
    threads: sdk.threads,
    projects: [],
  }),
  useRpc: () => sdk.rpc,
  useRealtime: (_channel: string, callback: () => void) => {
    sdk.realtime = callback;
  },
}));

const { useSidebarSettings } = await import("./useSidebarSettings");

function Probe() {
  useSidebarSettings();
  return null;
}

afterEach(() => {
  cleanup();
  sdk.call.mockClear();
  sdk.realtime = null;
  sdk.status = "ready";
  sdk.threads = [];
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("useSidebarSettings", () => {
  it("does not issue an RPC during the mount render pass", () => {
    vi.useFakeTimers();
    render(<Probe />);
    expect(sdk.call).not.toHaveBeenCalled();
  });

  it("loads on the idle fallback and refreshes from realtime", async () => {
    vi.useFakeTimers();
    render(<Probe />);
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(sdk.call).toHaveBeenCalledTimes(1);
    await act(async () => {
      sdk.realtime?.();
      await Promise.resolve();
    });
    expect(sdk.call).toHaveBeenCalledTimes(2);
  });
});
