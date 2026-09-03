import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import plugin from "../server";
import type { Folder, Organization } from "./organization";

describe("organization RPC", () => {
  it("round-trips a created folder through plugin SQLite", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "glass-sidebar",
    });
    await plugin(bb);

    const created = (await harness.behavior.callRpc("createFolder", {
      name: "Active matters",
      threadIds: ["thr_1", "thr_2"],
      colorIndex: 4,
      customColor: null,
    })) as { folder: Folder };
    const organization = (await harness.behavior.callRpc(
      "getOrganization",
      {},
    )) as Organization;

    expect(created.folder.id).toMatch(/^fld_[a-z0-9]{12}$/);
    expect(organization.folders).toEqual([created.folder]);
    expect(organization.members).toEqual({
      thr_1: created.folder.id,
      thr_2: created.folder.id,
    });
    expect(harness.realtimeSignals).toContainEqual({
      channel: "organization",
      payload: { reason: "createFolder" },
    });

    await harness.lifecycle.dispose();
  });
});
