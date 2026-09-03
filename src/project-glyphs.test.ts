import { describe, expect, it, vi } from "vitest";
import {
  fetchProjectGlyphs,
  mergeProjectGlyphs,
  parseProjectGlyphReply,
} from "./project-glyphs";

const glyph = [["path", { d: "M4 4h16v16H4z" }]] as const;

describe("owned project glyph replies", () => {
  it("parses valid named drawings and rejects malformed replies", () => {
    expect(
      parseProjectGlyphReply({ glyphs: { rocket: glyph, empty: [], bad: "x" } }),
    ).toEqual({ rocket: glyph });
    expect(parseProjectGlyphReply(null)).toBeNull();
    expect(parseProjectGlyphReply({ glyphs: [] })).toBeNull();
  });

  it("calls this plugin's RPC with the bounded project-id list", async () => {
    const rpc = {
      call: vi.fn(async () => ({ glyphs: { rocket: glyph } })),
    };
    await expect(
      fetchProjectGlyphs(rpc as never, ["proj_1"]),
    ).resolves.toEqual({ rocket: glyph });
    expect(rpc.call).toHaveBeenCalledWith("getProjectGlyphs", {
      projectIds: ["proj_1"],
    });
  });

  it("attaches a glyph only to the matching owned icon name", () => {
    const projects = {
      proj_1: { icon: "rocket", iconColor: "blue" as const, source: "auto" as const },
      proj_2: { icon: "folder-01", iconColor: null, source: "manual" as const },
    };
    const merged = mergeProjectGlyphs(projects, { rocket: glyph });
    expect(merged.proj_1?.glyph).toBe(glyph);
    expect(merged.proj_2?.glyph).toBeUndefined();
  });
});
