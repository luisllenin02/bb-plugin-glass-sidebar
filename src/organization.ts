import type { AccentValue } from "./accent";

export const ORGANIZATION_CHANNEL = "organization";

export interface Folder extends AccentValue {
  id: string;
  name: string;
  collapsed: boolean;
  sortIndex: number;
  threadIds: string[];
}

export interface Organization {
  folders: Folder[];
  members: Record<string, string>;
  threadAccents: Record<string, AccentValue>;
  projectAccents: Record<string, AccentValue>;
}

export interface ProjectDecor {
  icon: string | null;
  color: string | null;
  source: string;
  updatedAt: number;
}

export type ProjectDecorMap = Record<string, ProjectDecor>;
