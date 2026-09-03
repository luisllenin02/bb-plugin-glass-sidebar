import { accentCss, type AccentValue } from "./accent";
import type { AccentSource, ResolvedAccentSource } from "./row-props";

// Q1 declares the accent-source vocabulary canonically in `row-props.ts`; this
// module only re-exports it so organisation consumers have one import.
export type { AccentSource, ResolvedAccentSource };

export const ORGANIZATION_CHANNEL = "organization";
/** Channel the durable inbox order is re-read on. */
export const INBOX_ORDER_CHANNEL = "inbox-order";

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

/**
 * Options for the full precedence chain. Q4 owns the decor and automatic
 * steps in `src/accent-source.ts`; this packet owns only the manual ones.
 */
export interface AccentResolutionOptions {
  autoProjectColours?: boolean;
}

export function folderOf(
  organization: Organization,
  threadId: string,
): Folder | null {
  const folderId = organization.members[threadId];
  if (!folderId) return null;
  return organization.folders.find((folder) => folder.id === folderId) ?? null;
}

/** Resolve the first non-empty thread, folder, or project accent. */
export function resolveAccent(
  threadId: string,
  projectId: string,
  organization: Organization,
): AccentValue | null {
  const candidates = [
    organization.threadAccents[threadId],
    folderOf(organization, threadId),
    organization.projectAccents[projectId],
  ];
  for (const candidate of candidates) {
    if (candidate && accentCss(candidate)) {
      return {
        colorIndex: candidate.colorIndex,
        customColor: candidate.customColor,
      };
    }
  }
  return null;
}

export function uniqueFolderName(
  folders: readonly Folder[],
  base = "New folder",
): string {
  const names = new Set(folders.map((folder) => folder.name));
  if (!names.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!names.has(candidate)) return candidate;
  }
}

function copyOrganization(organization: Organization): Organization {
  return {
    folders: organization.folders.map((folder) => ({
      ...folder,
      threadIds: [...folder.threadIds],
    })),
    members: { ...organization.members },
    threadAccents: { ...organization.threadAccents },
    projectAccents: { ...organization.projectAccents },
  };
}

export function applyMove(
  organization: Organization,
  threadId: string,
  folderId: string | null,
  beforeThreadId: string | null = null,
): Organization {
  if (
    folderId !== null &&
    !organization.folders.some((folder) => folder.id === folderId)
  ) {
    return organization;
  }
  const next = copyOrganization(organization);
  for (const folder of next.folders) {
    folder.threadIds = folder.threadIds.filter((id) => id !== threadId);
  }
  delete next.members[threadId];
  if (folderId === null) return next;

  const destination = next.folders.find((folder) => folder.id === folderId)!;
  const beforeIndex =
    beforeThreadId === null
      ? -1
      : destination.threadIds.indexOf(beforeThreadId);
  const insertionIndex =
    beforeIndex < 0 ? destination.threadIds.length : beforeIndex;
  destination.threadIds.splice(insertionIndex, 0, threadId);
  next.members[threadId] = folderId;
  return next;
}

export type OrganizationReorder =
  | { folderIds: readonly string[] }
  | { folderId: string; threadIds: readonly string[] };

export function applyReorder(
  organization: Organization,
  reorder: OrganizationReorder,
): Organization {
  const next = copyOrganization(organization);
  if ("folderIds" in reorder) {
    const byId = new Map(next.folders.map((folder) => [folder.id, folder]));
    if (
      reorder.folderIds.length !== next.folders.length ||
      new Set(reorder.folderIds).size !== reorder.folderIds.length ||
      reorder.folderIds.some((id) => !byId.has(id))
    ) {
      return organization;
    }
    next.folders = reorder.folderIds.map((id, sortIndex) => ({
      ...byId.get(id)!,
      sortIndex,
    }));
    return next;
  }

  const folder = next.folders.find(
    (candidate) => candidate.id === reorder.folderId,
  );
  if (
    !folder ||
    reorder.threadIds.length !== folder.threadIds.length ||
    new Set(reorder.threadIds).size !== reorder.threadIds.length ||
    reorder.threadIds.some((id) => !folder.threadIds.includes(id))
  ) {
    return organization;
  }
  folder.threadIds = [...reorder.threadIds];
  return next;
}
