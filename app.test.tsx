// Guard against the duplicate child-thread button regression (2026-08-26 / 2026-08-27).
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  definePluginApp: (setup: (app: unknown) => void) => setup,
}));

import setup, { HEADER_ACTIONS } from "./app";

export const EXPECTED_HEADER_ACTIONS = ["parent", "children", "project"] as const;

function record() {
  const calls: Record<string, string[]> = {};
  const slot = (name: string) => (definition: { id: string }) => {
    (calls[name] ??= []).push(definition.id);
  };
  const app = {
    slots: new Proxy({}, { get: (_target, name: string) => slot(name) }),
  };
  (setup as unknown as (app: unknown) => void)(app);
  return calls;
}

describe("plugin registration", () => {
  it("registers one thread list and one action for each direction", () => {
    const calls = record();
    expect(calls.experimental_threadList).toEqual(["inbox"]);
    const headerActionIds = calls.experimental_threadHeaderAction ?? [];
    expect(headerActionIds).toEqual(EXPECTED_HEADER_ACTIONS);
    expect(HEADER_ACTIONS.map((action) => action.id)).toEqual(
      EXPECTED_HEADER_ACTIONS,
    );
  });

  it("registers at most one settings section, and exactly one after Q6", () => {
    const settingsSectionIds = record().settingsSection ?? [];
    expect(settingsSectionIds.length).toBeLessThanOrEqual(1);
    if (existsSync(new URL("./src/SidebarSettings.tsx", import.meta.url))) {
      expect(settingsSectionIds).toEqual(["glass-sidebar-settings"]);
    } else {
      expect(settingsSectionIds).toEqual([]);
    }
  });

  it("ships the paired child-thread controls", () => {
    expect(
      existsSync(new URL("./src/SubagentsChip.tsx", import.meta.url)),
    ).toBe(true);
    expect(existsSync(new URL("./src/ParentChip.tsx", import.meta.url))).toBe(
      true,
    );
  });
});
