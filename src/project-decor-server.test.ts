import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});

async function loadProjectPlugin() {
  const { bb, harness } = createFakePluginHost({
    pluginId: "glass-sidebar",
    sdk: {
      projects: {
        list: async () =>
          [
            {
              id: "proj_alpha",
              name: "Plugin Development",
              kind: "standard",
              createdAt: 1,
              updatedAt: 1,
              gitRemoteUrl: null,
              defaultExecutionOptions: null,
              sources: [],
            },
          ] as never,
      },
      threads: { list: async () => [] },
    },
  });
  await plugin(bb);
  disposers.push(() => harness.lifecycle.dispose());
  return harness;
}

describe("project decor RPCs", () => {
  it("reconciles automatic rows after import completion", async () => {
    const harness = await loadProjectPlugin();
    await expect(harness.behavior.runCli(["import"])).resolves.toMatchObject({
      exitCode: 0,
    });
    await expect(harness.behavior.callRpc("getProjectDecor", {})).resolves.toMatchObject({
      projects: {
        proj_alpha: {
          icon: "code",
          iconColor: "pink",
          source: "auto",
          autoReason: "name:dev",
          autoKeywords: [],
        },
      },
      updatedAt: expect.any(Number),
    });
    expect(
      harness.realtimeSignals.filter((signal) => signal.channel === "project-decor"),
    ).toHaveLength(1);
    expect(harness.realtimeSignals).toContainEqual({
      channel: "project-decor",
      payload: { reason: "import" },
    });
  });

  it("keeps manual choices through redetection and can reset or clear them", async () => {
    const harness = await loadProjectPlugin();
    await harness.behavior.callRpc("setProjectDecorIcon", {
      projectId: "proj_alpha",
      icon: "rocket",
      color: "blue",
    });
    await harness.behavior.callRpc("redetectAllAutoIcons", {});
    await expect(harness.behavior.callRpc("getProjectDecor", {})).resolves.toMatchObject({
      projects: {
        proj_alpha: { icon: "rocket", iconColor: "blue", source: "manual" },
      },
    });

    await harness.behavior.callRpc("resetProjectDecorToAuto", {
      projectId: "proj_alpha",
    });
    await expect(harness.behavior.callRpc("getProjectDecor", {})).resolves.toMatchObject({
      projects: {
        proj_alpha: { icon: "code", iconColor: "pink", source: "auto" },
      },
    });

    await harness.behavior.callRpc("clearProjectDecorIcon", {
      projectId: "proj_alpha",
    });
    await expect(harness.behavior.callRpc("getProjectDecor", {})).resolves.toEqual({
      projects: {},
      updatedAt: 0,
    });
  });

  it("serves only selected drawings and capped searched catalog results", async () => {
    const harness = await loadProjectPlugin();
    await expect(harness.behavior.runCli(["import"])).resolves.toMatchObject({
      exitCode: 0,
    });
    const drawings = (await harness.behavior.callRpc("getProjectGlyphs", {
      projectIds: ["proj_alpha"],
    })) as { glyphs: Record<string, unknown[]> };
    expect(drawings.glyphs.code?.length).toBeGreaterThan(0);

    const catalog = (await harness.behavior.callRpc("listIconCatalog", {
      query: "rocket",
      category: null,
    })) as { icons: Array<{ name: string; glyph: unknown[] }>; total: number };
    expect(catalog.total).toBeGreaterThan(0);
    expect(catalog.icons[0]).toMatchObject({ name: "rocket" });
    expect(catalog.icons[0]?.glyph.length).toBeGreaterThan(0);

    await expect(
      harness.behavior.callRpc("getProjectGlyphs", {
        projectIds: Array.from({ length: 201 }, (_, index) => `proj_${index}`),
      }),
    ).rejects.toThrow();
  });
});
