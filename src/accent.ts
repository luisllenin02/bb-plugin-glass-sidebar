// Palette and helpers ported from yusuf8834/bb-sidebar, whose colour model is
// derived from hardbeat920/monocode's TAB_GROUP_COLORS.
export const ACCENT_PALETTE = [
  undefined,
  "hsl(211 92% 62%)",
  "hsl(12 80% 58%)",
  "hsl(45 90% 55%)",
  "hsl(142 55% 50%)",
  "hsl(330 70% 62%)",
  "hsl(280 55% 62%)",
  "hsl(175 55% 48%)",
  "hsl(25 85% 58%)",
] as const;

export interface AccentValue {
  colorIndex: number;
  customColor: string | null;
}

export const NO_ACCENT: AccentValue = { colorIndex: 0, customColor: null };

export function parseCustomHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
  return short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    : null;
}

export function sanitizeAccent(input: unknown): AccentValue {
  if (typeof input !== "object" || input === null) return { ...NO_ACCENT };
  const candidate = input as { colorIndex?: unknown; customColor?: unknown };
  const colorIndex =
    typeof candidate.colorIndex === "number" &&
    Number.isInteger(candidate.colorIndex) &&
    candidate.colorIndex >= 0 &&
    candidate.colorIndex < ACCENT_PALETTE.length
      ? candidate.colorIndex
      : 0;
  return { colorIndex, customColor: parseCustomHex(candidate.customColor) };
}

export function accentCss(
  value: AccentValue | string | null | undefined,
): string | undefined {
  if (typeof value === "string") return value.trim() ? value : undefined;
  const sanitized = sanitizeAccent(value);
  return sanitized.customColor ?? ACCENT_PALETTE[sanitized.colorIndex];
}

export function accentWash(
  value: AccentValue | string | null | undefined,
): string | undefined {
  const accent = accentCss(value);
  return accent
    ? `color-mix(in srgb, ${accent} 18%, transparent)`
    : undefined;
}

/** Display names for the palette, index-aligned with `ACCENT_PALETTE`. */
export const ACCENT_NAMES = [
  "none",
  "blue",
  "coral",
  "amber",
  "green",
  "pink",
  "violet",
  "teal",
  "orange",
] as const;
