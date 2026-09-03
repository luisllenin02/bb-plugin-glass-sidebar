import type { PluginRpcClient } from "@get-bb/plugin-sdk/app";
import type { glassSidebarRpcContract } from "../server";
import type { ProjectDecorMap } from "./project-decor";
import type { ProjectGlyph } from "./row-props";

export type ProjectGlyphMap = Record<string, ProjectGlyph>;

function isGlyph(value: unknown): value is ProjectGlyph {
  return (
    Array.isArray(value) &&
    value.every(
      (element) =>
        Array.isArray(element) &&
        element.length === 2 &&
        typeof element[0] === "string" &&
        typeof element[1] === "object" &&
        element[1] !== null,
    )
  );
}

/** Parse this plugin's direct `{ glyphs: { [iconName]: drawing } }` reply. */
export function parseProjectGlyphReply(reply: unknown): ProjectGlyphMap | null {
  if (typeof reply !== "object" || reply === null) return null;
  const glyphs = (reply as { glyphs?: unknown }).glyphs;
  if (typeof glyphs !== "object" || glyphs === null || Array.isArray(glyphs)) {
    return null;
  }
  const parsed: ProjectGlyphMap = {};
  for (const [name, drawing] of Object.entries(glyphs)) {
    if (name && isGlyph(drawing) && drawing.length > 0) parsed[name] = drawing;
  }
  return parsed;
}

export async function fetchProjectGlyphs(
  rpc: PluginRpcClient<typeof glassSidebarRpcContract>,
  projectIds: readonly string[],
): Promise<ProjectGlyphMap | null> {
  if (projectIds.length === 0) return {};
  try {
    return parseProjectGlyphReply(
      await rpc.call("getProjectGlyphs", { projectIds: [...projectIds] }),
    );
  } catch {
    return null;
  }
}

/** Attach drawings only when the owned decor row names the same icon. */
export function mergeProjectGlyphs(
  projects: ProjectDecorMap,
  glyphs: ProjectGlyphMap | null,
): ProjectDecorMap {
  if (glyphs === null) return projects;
  return Object.fromEntries(
    Object.entries(projects).map(([projectId, entry]) => [
      projectId,
      entry.icon && glyphs[entry.icon]
        ? { ...entry, glyph: glyphs[entry.icon] }
        : entry,
    ]),
  );
}
