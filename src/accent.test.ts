import { describe, expect, it } from "vitest";
import {
  ACCENT_PALETTE,
  NO_ACCENT,
  accentCss,
  accentWash,
  parseCustomHex,
  sanitizeAccent,
} from "./accent";

describe("accent helpers", () => {
  it("normalizes short and long custom hex colours", () => {
    expect(parseCustomHex(" #AbC ")).toBe("#aabbcc");
    expect(parseCustomHex("#12EF90")).toBe("#12ef90");
    expect(parseCustomHex("red")).toBeNull();
  });

  it("sanitizes invalid values to no accent", () => {
    expect(sanitizeAccent(null)).toEqual(NO_ACCENT);
    expect(sanitizeAccent({ colorIndex: 9, customColor: "bad" })).toEqual(
      NO_ACCENT,
    );
  });

  it("prefers custom colours and builds the contracted wash", () => {
    expect(accentCss({ colorIndex: 1, customColor: "#ABCDEF" })).toBe(
      "#abcdef",
    );
    expect(accentCss({ colorIndex: 1, customColor: null })).toBe(
      ACCENT_PALETTE[1],
    );
    expect(accentWash({ colorIndex: 7, customColor: null })).toBe(
      `color-mix(in srgb, ${ACCENT_PALETTE[7]} 18%, transparent)`,
    );
  });
});
