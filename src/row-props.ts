import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { AccentValue } from "./accent";
import type { Folder } from "./organization";

/** Q3 owns the workflow reader; rows consume this canonical run shape. */
export interface WorkflowRun {
  id: string;
  originThreadId: string;
  name: string;
  status: "queued" | "running";
  phase: string | null;
  startedAt: number;
}

export type ProjectIconColorName =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "pink";

export type ProjectGlyph = ReadonlyArray<
  readonly [string, Record<string, unknown>]
>;

/** Q4 owns project decor; absence is represented by no map entry. */
export interface ProjectDecorEntry {
  icon: string | null;
  iconColor: ProjectIconColorName | null;
  source: "manual" | "auto";
  glyph?: ProjectGlyph | null;
}

/** Q5 owns lifecycle persistence and the preset parser. */
export interface ConfiguredSnoozePreset {
  id: string;
  label: string;
  durationMs: number;
}

export type AccentSource =
  | "thread"
  | "folder"
  | "project"
  | "project-decor"
  | "auto"
  | "none";

export interface ResolvedAccentSource {
  css: string | undefined;
  source: AccentSource;
}

export interface SidebarSettingsValues {
  snoozePresets: string;
  inactiveThreadsEnabled: boolean;
  inactiveAfterHours: number;
  autoSettleInactive: boolean;
  autoSettleAfterDays: number;
  autoSettleOnMerge: boolean;
  autoProjectColours: boolean;
}

export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettingsValues = Object.freeze({
  snoozePresets: "30m, 2h, 1d, 1w",
  inactiveThreadsEnabled: true,
  inactiveAfterHours: 6,
  autoSettleInactive: true,
  autoSettleAfterDays: 3,
  autoSettleOnMerge: true,
  autoProjectColours: true,
});

type ThreadIdentity = Pick<PluginSidebarThread, "id" | "projectId">;
type MutationResult = { ok: true };

export interface OrganizationActionsAccess {
  createFolder(input: {
    name: string;
    threadIds?: string[];
    colorIndex?: number;
    customColor?: string | null;
  }): Promise<{ folder: Folder }>;
  renameFolder(input: { folderId: string; name: string }): Promise<MutationResult>;
  setFolderColor(input: {
    folderId: string;
    colorIndex: number;
    customColor: string | null;
  }): Promise<MutationResult>;
  setFolderCollapsed(input: {
    folderId: string;
    collapsed: boolean;
  }): Promise<MutationResult>;
  reorderFolders(input: { folderIds: string[] }): Promise<MutationResult>;
  deleteFolder(input: { folderId: string }): Promise<MutationResult>;
  moveThreadToFolder(input: {
    threadId: string;
    folderId: string | null;
    beforeThreadId?: string | null;
  }): Promise<MutationResult>;
  reorderFolderThreads(input: {
    folderId: string;
    threadIds: string[];
  }): Promise<MutationResult>;
  setThreadAccent(input: {
    threadId: string;
    colorIndex: number;
    customColor: string | null;
  }): Promise<MutationResult>;
  setProjectAccent(input: {
    projectId: string;
    colorIndex: number;
    customColor: string | null;
  }): Promise<MutationResult>;
}

export interface OrganizationAccess {
  status: "loading" | "ready" | "error";
  folders: readonly Folder[];
  folderOf(threadId: string): Folder | null;
  accentFor(thread: ThreadIdentity, folderId: string | null): string | undefined;
  accentSourceFor(
    thread: ThreadIdentity,
    folderId: string | null,
  ): ResolvedAccentSource;
  projectAccentFor(projectId: string): ResolvedAccentSource;
  manualProjectAccentFor(projectId: string): AccentValue | undefined;
  actions: OrganizationActionsAccess;
}

const EMPTY_ACCENT: ResolvedAccentSource = Object.freeze({
  css: undefined,
  source: "none",
});
const OK = Object.freeze({ ok: true as const });
const EMPTY_FOLDER: Folder = Object.freeze({
  id: "",
  name: "",
  colorIndex: 0,
  customColor: null,
  collapsed: false,
  sortIndex: 0,
  threadIds: [],
});
const EMPTY_ORGANIZATION_ACTIONS: OrganizationActionsAccess = Object.freeze({
  createFolder: async () => ({ folder: EMPTY_FOLDER }),
  renameFolder: async () => OK,
  setFolderColor: async () => OK,
  setFolderCollapsed: async () => OK,
  reorderFolders: async () => OK,
  deleteFolder: async () => OK,
  moveThreadToFolder: async () => OK,
  reorderFolderThreads: async () => OK,
  setThreadAccent: async () => OK,
  setProjectAccent: async () => OK,
});

export const EMPTY_ORGANIZATION_ACCESS: OrganizationAccess = Object.freeze({
  status: "ready",
  folders: Object.freeze([]),
  folderOf: () => null,
  accentFor: () => undefined,
  accentSourceFor: () => EMPTY_ACCENT,
  projectAccentFor: () => EMPTY_ACCENT,
  manualProjectAccentFor: () => undefined,
  actions: EMPTY_ORGANIZATION_ACTIONS,
});

export interface WorkflowAccess {
  status: "loading" | "ready" | "error";
  runs: readonly WorkflowRun[];
  updatedAt: number;
  runsFor(threadId: string): readonly WorkflowRun[];
}

export const EMPTY_WORKFLOW_ACCESS: WorkflowAccess = Object.freeze({
  status: "ready",
  runs: Object.freeze([]),
  updatedAt: 0,
  runsFor: () => Object.freeze([]),
});

export interface DecorAccess {
  projects: Readonly<Record<string, ProjectDecorEntry>>;
  decorFor(projectId: string): ProjectDecorEntry | null;
}

export const EMPTY_DECOR_ACCESS: DecorAccess = Object.freeze({
  projects: Object.freeze({}),
  decorFor: () => null,
});

export interface BulkActionFailure {
  threadId: string;
  error: string;
}

export interface BulkActionResult {
  succeededThreadIds: string[];
  failures: BulkActionFailure[];
}

export interface LifecycleAccess {
  shelfFor(thread: PluginSidebarThread): "active" | "snoozed" | "settled";
  canPark(thread: PluginSidebarThread): boolean;
  wakeAtFor(thread: PluginSidebarThread): number | null;
  settledAtFor(thread: PluginSidebarThread): number | null;
  wokeFor(thread: PluginSidebarThread): boolean;
  acknowledgeWake(threadId: string): Promise<boolean>;
  settle(threadId: string): Promise<boolean>;
  unsettle(threadId: string): Promise<boolean>;
  snooze(threadId: string, snoozedUntil: number): Promise<boolean>;
  unsnooze(threadId: string): Promise<boolean>;
  bulkSettle(threadIds: readonly string[]): Promise<BulkActionResult>;
  bulkSnooze(
    threadIds: readonly string[],
    snoozedUntil: number,
  ): Promise<BulkActionResult>;
}

const EMPTY_BULK_RESULT = (): BulkActionResult => ({
  succeededThreadIds: [],
  failures: [],
});

export const EMPTY_LIFECYCLE_ACCESS: LifecycleAccess = Object.freeze({
  shelfFor: () => "active",
  canPark: () => true,
  wakeAtFor: () => null,
  settledAtFor: () => null,
  wokeFor: () => false,
  acknowledgeWake: async () => false,
  settle: async () => false,
  unsettle: async () => false,
  snooze: async () => false,
  unsnooze: async () => false,
  bulkSettle: async () => EMPTY_BULK_RESULT(),
  bulkSnooze: async () => EMPTY_BULK_RESULT(),
});

export interface SettingsAccess extends SidebarSettingsValues {}

export const DEFAULT_SETTINGS_ACCESS: SettingsAccess = Object.freeze({
  ...DEFAULT_SIDEBAR_SETTINGS,
});
