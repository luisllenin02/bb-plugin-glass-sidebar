import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../dist/server.js";

test("the built plugin wires bb glass-sidebar import and help", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "glass-sidebar-cli-"));
  const overrideDir = await mkdtemp(join(tmpdir(), "glass-sidebar-cli-from-"));
  const { bb, harness } = createFakePluginHost({
    pluginId: "glass-sidebar",
    dataDir,
    sdk: {
      projects: { list: async () => [] },
      threads: { list: async () => [] },
    },
  });
  try {
    await plugin(bb);
    assert.equal(harness.inspection.registrations.cli?.name, "glass-sidebar");
    assert.deepEqual(
      harness.inspection.registrations.cli?.commands.map((command) => command.name),
      ["import", "help"],
    );

    const help = await harness.behavior.runCli(["help"]);
    assert.equal(help.exitCode, 0);
    assert.match(help.stdout ?? "", /bb glass-sidebar import \[--dry-run]/);

    const missing = await harness.behavior.runCli([
      "import",
      "--dry-run",
      "--from",
      overrideDir,
    ]);
    assert.equal(missing.exitCode, 0);
    assert.match(missing.stdout ?? "", /source bb-sidebar: missing /);
    assert.match(missing.stdout ?? "", /source project-icons: missing /);
    assert.match(missing.stdout ?? "", /thread_lifecycle\s+0\s+0\s+0/);

    const invalid = await harness.behavior.runCli(["import", "--unknown"]);
    assert.equal(invalid.exitCode, 2);
    assert.match(invalid.stderr ?? "", /Unknown import option/);
  } finally {
    await harness.lifecycle.dispose();
    await rm(dataDir, { recursive: true, force: true });
    await rm(overrideDir, { recursive: true, force: true });
  }
});
