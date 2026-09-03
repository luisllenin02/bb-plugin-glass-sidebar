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

export const PROJECT_ICON_COLOR_NAMES = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
] as const;

export type ProjectIconColorName = (typeof PROJECT_ICON_COLOR_NAMES)[number];

interface ProjectIconColorAnchor {
  hue: number;
  light: { lightness: number; chroma: number };
  dark: { lightness: number; chroma: number };
}

// Copied verbatim from ariofrio/bb-plugins' project-icon-colors.ts so the
// owned header chip and sidebar glyph use the same accessible colour anchors.
const PROJECT_ICON_COLOR_ANCHORS: Record<
  ProjectIconColorName,
  ProjectIconColorAnchor
> = {
  red: {
    hue: 23.5,
    light: { lightness: 0.531, chroma: 0.212 },
    dark: { lightness: 0.8, chroma: 0.103 },
  },
  orange: {
    hue: 52.9,
    light: { lightness: 0.595, chroma: 0.151 },
    dark: { lightness: 0.72, chroma: 0.179 },
  },
  yellow: {
    hue: 95,
    light: { lightness: 0.52, chroma: 0.107 },
    dark: { lightness: 0.8, chroma: 0.159 },
  },
  green: {
    hue: 140,
    light: { lightness: 0.56, chroma: 0.171 },
    dark: { lightness: 0.729, chroma: 0.235 },
  },
  teal: {
    hue: 191.6,
    light: { lightness: 0.556, chroma: 0.086 },
    dark: { lightness: 0.793, chroma: 0.136 },
  },
  blue: {
    hue: 256,
    light: { lightness: 0.522, chroma: 0.175 },
    dark: { lightness: 0.72, chroma: 0.148 },
  },
  purple: {
    hue: 306,
    light: { lightness: 0.6, chroma: 0.279 },
    dark: { lightness: 0.8, chroma: 0.128 },
  },
  pink: {
    hue: 345.5,
    light: { lightness: 0.52, chroma: 0.207 },
    dark: { lightness: 0.72, chroma: 0.21 },
  },
};

export function projectIconColorCss(
  color: ProjectIconColorName | null,
): string | undefined {
  if (color === null) return undefined;
  const { hue, light, dark } = PROJECT_ICON_COLOR_ANCHORS[color];
  return `light-dark(oklch(${light.lightness} ${light.chroma} ${hue}), oklch(${dark.lightness} ${dark.chroma} ${hue}))`;
}

/** Stable project-colour index, matching monocode's `tabGroupColor` hash. */
export function autoProjectPaletteIndex(projectId: string): number {
  let hash = 0;
  for (let index = 0; index < projectId.length; index += 1) {
    hash = (hash * 31 + projectId.charCodeAt(index)) >>> 0;
  }
  return (hash % (ACCENT_PALETTE.length - 1)) + 1;
}

/** The single CSS definition of automatic project colours. */
export function autoProjectColorCss(projectId: string): string {
  return ACCENT_PALETTE[autoProjectPaletteIndex(projectId)]!;
}
