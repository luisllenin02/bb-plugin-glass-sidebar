import {
  accentCss,
  autoProjectColorCss,
  projectIconColorCss,
} from "./accent";
import {
  folderOf,
  resolveAccent,
  type AccentResolutionOptions,
  type Organization,
} from "./organization";
import type { ProjectDecorMap } from "./project-decor";
import type { ResolvedAccentSource } from "./row-props";

export function resolveAccentSource(
  threadId: string,
  projectId: string,
  organization: Organization,
  decor: Readonly<ProjectDecorMap>,
  options: AccentResolutionOptions = {},
): ResolvedAccentSource {
  const manual = resolveAccent(threadId, projectId, organization);
  if (manual) {
    const source = organization.threadAccents[threadId]
      ? "thread"
      : folderOf(organization, threadId)
        ? "folder"
        : "project";
    return { css: accentCss(manual), source };
  }

  const decorCss = projectIconColorCss(decor[projectId]?.iconColor ?? null);
  if (decorCss) return { css: decorCss, source: "project-decor" };

  if (options.autoProjectColours !== false) {
    return { css: autoProjectColorCss(projectId), source: "auto" };
  }
  return { css: undefined, source: "none" };
}
