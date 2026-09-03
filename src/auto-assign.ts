// Ported from ariofrio/bb-plugins with the firm's P8/P8b automatic project
// assignment rules; all classification remains deterministic and local-only.
import { readdir } from "node:fs/promises";
import {
  ACCENT_NAMES,
  autoProjectColorCss,
  autoProjectPaletteIndex,
} from "./accent";
import {
  MATTER_PROJECT_NAME_PATTERN,
  classifyMatter,
  matterIconName,
  type MatterClassification,
  type MatterFamily,
} from "./matter-classifier";
import type { ProjectIconColorName } from "./accent";
import type { ProjectDecorStore } from "./project-decor-store";

export interface AutoAssignmentProject {
  id: string;
  name: string;
  path: string;
}

export type AutoIconReason =
  | `matter:${MatterFamily}`
  | "name:legal"
  | "name:dev"
  | "name:docs"
  | "name:personal"
  | "name:finance"
  | "name:design"
  | "name:data"
  | "name:mobile"
  | "name:web"
  | "content:package.json"
  | "content:pnpm-lock.yaml"
  | "content:cargo.toml"
  | "content:pyproject.toml"
  | "content:go.mod"
  | "content:documents"
  | "content:.git"
  | "default";

export interface AutoIconSuggestion {
  /** Hugeicons export name, as recorded in icon-catalog.json. */
  icon: string;
  reason: AutoIconReason;
  /** Up to three scored terms, populated for matter classifications. */
  keywords: string[];
}

interface AutoIconChoice {
  /** Stable picker/storage name. */
  name: string;
  /** Hugeicons export requested by the packet and shown in suggestion results. */
  export: string;
}

export const AUTO_ICON_CHOICES = {
  matter: { name: "balance-scale", export: "BalanceScaleIcon" },
  legal: { name: "briefcase-01", export: "Briefcase01Icon" },
  code: { name: "code", export: "CodeIcon" },
  document: { name: "file-01", export: "File01Icon" },
  user: { name: "user", export: "UserIcon" },
  money: { name: "money-01", export: "Money01Icon" },
  paint: { name: "paint-board", export: "PaintBoardIcon" },
  database: { name: "database", export: "DatabaseIcon" },
  smartphone: { name: "smart-phone-01", export: "SmartPhone01Icon" },
  globe: { name: "globe", export: "GlobeIcon" },
  git: { name: "git-branch", export: "GitBranchIcon" },
  folder: { name: "folder-01", export: "Folder01Icon" },
} as const satisfies Record<string, AutoIconChoice>;

const NAME_RULES: ReadonlyArray<{
  pattern: RegExp;
  choice: AutoIconChoice;
  reason: AutoIconReason;
}> = [
  // Matter folders are named `Last, First 1101.XXXX`; the number is the
  // reliable part. BalanceScaleIcon is tagged law/legal/court/justice.
  {
    pattern: MATTER_PROJECT_NAME_PATTERN,
    choice: AUTO_ICON_CHOICES.matter,
    reason: "matter:fallback",
  },
  {
    pattern: /(?:^|[^a-z0-9])(?:esq|counsel|law|legal)(?:$|[^a-z0-9])/iu,
    choice: AUTO_ICON_CHOICES.legal,
    reason: "name:legal",
  },
  {
    pattern:
      /(?:^|[^a-z0-9])(?:dev|development|plugin|code|repo|src)(?:$|[^a-z0-9])/iu,
    choice: AUTO_ICON_CHOICES.code,
    reason: "name:dev",
  },
  {
    pattern: /(?:^|[^a-z0-9])(?:docs|notes|writing)(?:$|[^a-z0-9])/iu,
    choice: AUTO_ICON_CHOICES.document,
    reason: "name:docs",
  },
  {
    pattern: /(?:^|[^a-z0-9])(?:personal|home)(?:$|[^a-z0-9])/iu,
    choice: AUTO_ICON_CHOICES.user,
    reason: "name:personal",
  },
  {
    pattern:
      /(?:^|[^a-z0-9])(?:finance|billing|invoice)(?:$|[^a-z0-9])/iu,
    choice: AUTO_ICON_CHOICES.money,
    reason: "name:finance",
  },
  {
    pattern: /(?:^|[^a-z0-9])(?:design|ui|theme)(?:$|[^a-z0-9])/iu,
    choice: AUTO_ICON_CHOICES.paint,
    reason: "name:design",
  },
  {
    pattern: /(?:^|[^a-z0-9])(?:data|db|sql)(?:$|[^a-z0-9])/iu,
    choice: AUTO_ICON_CHOICES.database,
    reason: "name:data",
  },
  {
    pattern: /(?:^|[^a-z0-9])(?:mobile|ios|android)(?:$|[^a-z0-9])/iu,
    choice: AUTO_ICON_CHOICES.smartphone,
    reason: "name:mobile",
  },
  {
    pattern: /(?:^|[^a-z0-9])(?:web|site)(?:$|[^a-z0-9])/iu,
    choice: AUTO_ICON_CHOICES.globe,
    reason: "name:web",
  },
];

const PACKAGE_RULES = [
  ["package.json", "content:package.json"],
  ["pnpm-lock.yaml", "content:pnpm-lock.yaml"],
  ["cargo.toml", "content:cargo.toml"],
  ["pyproject.toml", "content:pyproject.toml"],
  ["go.mod", "content:go.mod"],
] as const satisfies ReadonlyArray<readonly [string, AutoIconReason]>;

const ICON_NAME_BY_EXPORT: ReadonlyMap<string, string> = new Map(
  Object.values(AUTO_ICON_CHOICES).map((choice) => [choice.export, choice.name]),
);

export function autoIconName(exportName: string): string {
  return (
    ICON_NAME_BY_EXPORT.get(exportName) ??
    matterIconName(exportName) ??
    AUTO_ICON_CHOICES.folder.name
  );
}

function suggestion(
  icon: string,
  reason: AutoIconReason,
  keywords: string[] = [],
): AutoIconSuggestion {
  return { icon, reason, keywords };
}

/**
 * Deterministic, local-only icon choice. The listing contains top-level names
 * only; callers bound it before passing it here.
 */
export function suggestIcon(
  project: AutoAssignmentProject,
  listing: readonly string[],
): AutoIconSuggestion {
  for (const rule of NAME_RULES) {
    if (rule.pattern.test(project.name)) {
      return suggestion(rule.choice.export, rule.reason);
    }
  }

  const names = listing.map((name) => name.toLowerCase());
  for (const [filename, reason] of PACKAGE_RULES) {
    if (names.includes(filename)) {
      return suggestion(AUTO_ICON_CHOICES.code.export, reason);
    }
  }

  const documents = names.filter((name) => /\.(?:docx|pdf|msg)$/iu.test(name));
  if (documents.length > names.length / 2) {
    return suggestion(AUTO_ICON_CHOICES.document.export, "content:documents");
  }

  if (names.length === 1 && names[0] === ".git") {
    return suggestion(AUTO_ICON_CHOICES.git.export, "content:.git");
  }

  return suggestion(AUTO_ICON_CHOICES.folder.export, "default");
}

/** Read one directory level and never expose more than 200 entry names. */
export async function readTopLevelListing(
  path: string,
  cap = 200,
): Promise<string[]> {
  if (!path) return [];
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
  const boundedCap = Math.max(0, Math.min(200, Math.trunc(cap)));
  return entries
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, boundedCap);
}

export const SIDEBAR_ACCENT_TO_PROJECT_ICON_COLOR = [
  null,
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "teal",
  "orange",
] as const satisfies ReadonlyArray<ProjectIconColorName | null>;

export function autoProjectColor(projectId: string): ProjectIconColorName {
  return SIDEBAR_ACCENT_TO_PROJECT_ICON_COLOR[
    autoProjectPaletteIndex(projectId)
  ]!;
}

export interface ReconcileProjectIconsOptions {
  projects: readonly AutoAssignmentProject[];
  store: ProjectDecorStore;
  listingFor: (project: AutoAssignmentProject) => Promise<readonly string[]>;
  matterClassifier?: (root: string) => Promise<MatterClassification>;
  publish: () => void;
}

export { autoProjectColorCss, autoProjectPaletteIndex };
export const SIDEBAR_ACCENT_NAMES = ACCENT_NAMES;

export interface ReconcileProjectIconsResult {
  changed: boolean;
  suggestions: Record<string, AutoIconSuggestion>;
}

/** Reconcile a batch and emit at most one invalidation when rows changed. */
export async function reconcileProjectIcons({
  projects,
  store,
  listingFor,
  matterClassifier = classifyMatter,
  publish,
}: ReconcileProjectIconsOptions): Promise<ReconcileProjectIconsResult> {
  let changed = false;
  const suggestions: Record<string, AutoIconSuggestion> = {};
  for (const project of projects) {
    if (store.get(project.id)?.source === "manual") continue;
    const suggestion = MATTER_PROJECT_NAME_PATTERN.test(project.name)
      ? await matterClassifier(project.path).then((classification) => ({
          icon: classification.icon,
          reason: classification.reason,
          keywords: classification.topKeywords,
        }))
      : suggestIcon(project, await listingFor(project));
    suggestions[project.id] = suggestion;
    changed =
      store.upsertAuto({
        projectId: project.id,
        icon: autoIconName(suggestion.icon),
        color: autoProjectColor(project.id),
      }) || changed;
  }
  if (changed) publish();
  return { changed, suggestions };
}
