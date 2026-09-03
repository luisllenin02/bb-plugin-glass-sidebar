import {
  createFakePluginHost,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin, { PROJECT_ICON_MISS_CACHE_MS } from "../server";
import { DEFAULT_SIDEBAR_SETTINGS } from "./sidebar-settings";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const dispose of disposers.splice(0)) await dispose();
});

function standardProject() {
  return {
    id: "proj_1",
    name: "Sidebar",
    kind: "standard" as const,
    gitRemoteUrl: null,
    createdAt: 1,
    updatedAt: 1,
    sources: [
      {
        id: "source_1",
        projectId: "proj_1",
        type: "local_path" as const,
        hostId: "host_1",
        path: "/workspace/sidebar",
        isDefault: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

async function loadQ6Host(
  fileContent: ((input: { path: string }) => Promise<never>) | undefined =
    undefined,
) {
  const project = standardProject();
  const { bb, harness } = createFakePluginHost({
    pluginId: "glass-sidebar",
    sdk: {
      projects: {
        get: async () => project,
        list: async () => [project],
        paths: async () => ({
          paths: [
            {
              kind: "file" as const,
              name: "brand.svg",
              path: "public/brand.svg",
              positions: [],
              score: 1,
            },
            {
              kind: "file" as const,
              name: "README.md",
              path: "README.md",
              positions: [],
              score: 0.5,
            },
          ],
          truncated: false,
        }),
        ...(fileContent ? { fileContent } : {}),
      },
    },
  });
  await plugin(bb);
  disposers.push(() => harness.lifecycle.dispose());
  return harness;
}

describe("Q6 settings RPC", () => {
  it("round-trips every canonical setting and publishes the channel", async () => {
    const harness = await loadQ6Host();
    await expect(
      harness.behavior.callRpc("getSidebarSettings", {}),
    ).resolves.toEqual(DEFAULT_SIDEBAR_SETTINGS);

    const changed = {
      snoozePresets: "45m, 1d",
      inactiveThreadsEnabled: false,
      inactiveAfterHours: 24,
      autoSettleInactive: false,
      autoSettleAfterDays: 12,
      autoSettleOnMerge: false,
      autoProjectColours: false,
    };
    await expect(
      harness.behavior.callRpc("updateSidebarSettings", changed),
    ).resolves.toEqual(changed);
    await expect(
      harness.behavior.callRpc("getSidebarSettings", {}),
    ).resolves.toEqual(changed);
    expect(harness.realtimeSignals).toContainEqual({
      channel: "sidebar-settings",
      payload: {},
    });
  });
});

describe("Q6 project favicon RPC and route", () => {
  it("stores uploads, canonicalizes MIME, rejects oversize data, and searches images only", async () => {
    const harness = await loadQ6Host();
    await expect(
      harness.behavior.callRpc("searchProjectIconFiles", {
        projectId: "proj_1",
        query: "brand",
      }),
    ).resolves.toEqual({ paths: ["public/brand.svg"] });

    await expect(
      harness.behavior.callRpc("uploadProjectIcon", {
        projectId: "proj_1",
        filename: "brand.svg",
        mimeType: "text/plain",
        contentBase64: "PHN2Zy8+",
      }),
    ).resolves.toEqual({
      customPath: null,
      customUploadName: "brand.svg",
    });
    const response = await harness.behavior.fetchHttp(
      "GET",
      "/project-icon?projectId=proj_1",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    await expect(
      harness.behavior.callRpc("uploadProjectIcon", {
        projectId: "proj_1",
        filename: "too-big.png",
        mimeType: "image/png",
        contentBase64: Buffer.alloc(1_000_001).toString("base64"),
      }),
    ).rejects.toThrow(/smaller than 1 MB/i);
  });

  it("holds a missing icon for six hours without a timer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
    const fileContent = vi.fn(async () => {
      throw new Error("not found");
    });
    const harness = await loadQ6Host(fileContent);

    expect(
      (await harness.behavior.fetchHttp(
        "GET",
        "/project-icon?projectId=proj_1",
      )).status,
    ).toBe(404);
    const firstProbeCount = fileContent.mock.calls.length;
    expect(firstProbeCount).toBeGreaterThan(20);

    await harness.behavior.fetchHttp("GET", "/project-icon?projectId=proj_1");
    expect(fileContent).toHaveBeenCalledTimes(firstProbeCount);

    vi.advanceTimersByTime(PROJECT_ICON_MISS_CACHE_MS + 1);
    await harness.behavior.fetchHttp("GET", "/project-icon?projectId=proj_1");
    expect(fileContent.mock.calls.length).toBeGreaterThan(firstProbeCount);
  });
});
