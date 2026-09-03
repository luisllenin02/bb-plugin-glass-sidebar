import { describe, expect, it } from "vitest";
import { decorFor } from "./project-decor";

describe("project decor map", () => {
  it("uses absence rather than a sentinel row", () => {
    const entry = {
      icon: "rocket",
      iconColor: "blue" as const,
      source: "auto" as const,
    };
    expect(decorFor({ proj_1: entry }, "proj_1")).toBe(entry);
    expect(decorFor({ proj_1: entry }, "proj_missing")).toBeNull();
  });
});
