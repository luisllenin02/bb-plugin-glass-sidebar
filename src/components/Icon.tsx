import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowTurnBackwardIcon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
  CancelCircleIcon,
  CheckListIcon,
  Clock01Icon,
  ComputerIcon,
  ComputerTerminal01Icon,
  Mail01Icon,
  MailOpen01Icon,
  Edit02Icon,
  Folder01Icon,
  FolderGitIcon,
  GitBranchIcon,
  HelpCircleIcon,
  Loading03Icon,
  PinOffIcon,
  Target02Icon,
  Tick02Icon,
  UserAdd01Icon,
  WorkflowCircle03Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "../lib/utils";

const ICON_MAP = {
  ArrowTurnBackward: ArrowTurnBackwardIcon,
  ArrowUpDown: ArrowUpDownIcon,
  Check: Tick02Icon,
  ChevronDown: ArrowDown01Icon,
  ChevronLeft: ArrowLeft01Icon,
  ChevronRight: ArrowRight01Icon,
  ChevronUp: ArrowUp01Icon,
  CircleQuestion: HelpCircleIcon,
  CircleX: CancelCircleIcon,
  Clock: Clock01Icon,
  Computer: ComputerIcon,
  Edit: Edit02Icon,
  Folder: Folder01Icon,
  FolderGit: FolderGitIcon,
  GitBranch: GitBranchIcon,
  ListTodo: CheckListIcon,
  Loading: Loading03Icon,
  Mail: Mail01Icon,
  MailOpen: MailOpen01Icon,
  PinOff: PinOffIcon,
  Target: Target02Icon,
  Terminal: ComputerTerminal01Icon,
  UserRoundPlus: UserAdd01Icon,
  Workflow: WorkflowCircle03Icon,
} as const satisfies Record<string, IconSvgElement>;

export type IconName = keyof typeof ICON_MAP;

function resolveIcon(name: string): IconSvgElement | null {
  return ICON_MAP[name as IconName] ?? null;
}

export function hasHugeicon(name: string): boolean {
  return resolveIcon(name) !== null;
}

export function Icon({
  name,
  fallbackName,
  className,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
}: {
  name: IconName | string;
  fallbackName?: IconName;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
}) {
  const icon = resolveIcon(name) ?? (fallbackName ? resolveIcon(fallbackName) : null);
  if (!icon) return null;
  return (
    <HugeiconsIcon
      icon={icon}
      className={cn(className)}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      data-icon={resolveIcon(name) ? name : fallbackName}
    />
  );
}
