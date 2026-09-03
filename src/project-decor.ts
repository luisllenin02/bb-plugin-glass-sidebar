import type {
  ProjectDecorEntry as CanonicalProjectDecorEntry,
  ProjectGlyph,
} from "./row-props";

export type { ProjectDecorEntry } from "./row-props";

/** Additive UI metadata over Q1's canonical row declaration. */
export type ProjectDecorValue = CanonicalProjectDecorEntry & {
  glyph?: ProjectGlyph | null;
  autoReason?: string | null;
  autoKeywords?: readonly string[];
};

export type ProjectDecorMap = Record<string, ProjectDecorValue>;

export function decorFor(
  projects: Readonly<ProjectDecorMap>,
  projectId: string,
): ProjectDecorValue | null {
  return projects[projectId] ?? null;
}
