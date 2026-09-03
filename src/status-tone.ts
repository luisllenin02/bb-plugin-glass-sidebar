import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk/app";

/** Status palette shared by cards, live rows, and child-thread chips. */
export function statusToneClass(
  indicator: PluginSidebarThreadIndicator,
): string {
  switch (indicator) {
    case "unread-error":
      return "text-red-700 dark:text-red-300";
    case "waiting-for-input":
      return "text-indigo-600 dark:text-indigo-300";
    case "unread-success":
      return "text-emerald-700 dark:text-emerald-300";
    case "runtime":
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "goal":
      return "text-sky-600 dark:text-sky-400";
    case "draft":
    case "working-draft":
      return "text-amber-700 dark:text-amber-300";
    case "none":
    default:
      return "text-muted-foreground";
  }
}
