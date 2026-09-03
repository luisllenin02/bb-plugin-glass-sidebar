import { describe, expect, it } from "vitest";
import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk/app";
import { chipLabel, classifyNow, nowRows } from "./live-strip";

function row(indicator: PluginSidebarThreadIndicator, updatedAt: number) {
  return { indicator, updatedAt };
}

describe("classifyNow", () => {
  it("classifies waiting-for-input and unread-error as needs-you", () => {
    expect(classifyNow({ indicator: "waiting-for-input" })).toBe("needs-you");
    expect(classifyNow({ indicator: "unread-error" })).toBe("needs-you");
  });

  it("classifies the working indicators as working", () => {
    for (const indicator of [
      "runtime",
      "workflow",
      "background-agent",
      "background-command",
      "plan-mode",
      "working-draft",
    ] as const) {
      expect(classifyNow({ indicator })).toBe("working");
    }
  });

  it("classifies every non-zero live activity count as working", () => {
    for (const key of [
      "workflows",
      "backgroundAgents",
      "backgroundCommands",
      "planMode",
      "goals",
    ] as const) {
      expect(
        classifyNow({
          indicator: "none",
          activity: {
            workflows: 0,
            backgroundAgents: 0,
            backgroundCommands: 0,
            planMode: 0,
            goals: 0,
            [key]: 1,
          },
        }),
      ).toBe("working");
    }
  });

  it("classifies everything else as null", () => {
    expect(classifyNow({ indicator: "none" })).toBeNull();
    expect(classifyNow({ indicator: "unread-success" })).toBeNull();
    expect(classifyNow({ indicator: "draft" })).toBeNull();
    expect(classifyNow({ indicator: "goal" })).toBeNull();
  });
});

describe("nowRows", () => {
  it("orders needs-you before working, and working by most recently updated", () => {
    const a = { id: "a", ...row("runtime", 100) };
    const b = { id: "b", ...row("waiting-for-input", 50) };
    const c = { id: "c", ...row("runtime", 300) };
    const d = { id: "d", ...row("none", 999) };
    const { rows, overflow } = nowRows([a, b, c, d]);
    expect(rows.map((thread) => thread.id)).toEqual(["b", "c", "a"]);
    expect(overflow).toBe(0);
  });

  it("keeps needs-you threads in their given order", () => {
    const first = { id: "first", ...row("waiting-for-input", 10) };
    const second = { id: "second", ...row("unread-error", 20) };
    const { rows } = nowRows([first, second]);
    expect(rows.map((thread) => thread.id)).toEqual(["first", "second"]);
  });

  it("caps at max and reports overflow", () => {
    const threads = Array.from({ length: 10 }, (_, index) => ({
      id: `t${index}`,
      ...row("runtime", index),
    }));
    const { rows, overflow } = nowRows(threads, 8);
    expect(rows).toHaveLength(8);
    expect(overflow).toBe(2);
  });

  it("returns no overflow when nothing qualifies", () => {
    const { rows, overflow } = nowRows([{ id: "x", ...row("none", 1) }]);
    expect(rows).toEqual([]);
    expect(overflow).toBe(0);
  });
});

describe("chipLabel", () => {
  it("returns short titles unchanged", () => {
    expect(chipLabel("Short title")).toBe("Short title");
  });

  it("truncates with an ellipsis at the configured max", () => {
    const label = chipLabel("A very long thread title that overflows", 18);
    expect(label).toHaveLength(18);
    expect(label.endsWith("…")).toBe(true);
    expect(label).toBe("A very long threa…");
  });
});
