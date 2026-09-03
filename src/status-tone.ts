import type {
  PluginSidebarPullRequest,
  PluginSidebarThreadIndicator,
} from "@get-bb/plugin-sdk/app";

/** Host semantic token for a thread returning from a lifecycle shelf. */
export const WOKE_TONE_CLASS = "text-warning";

/** Status palette shared by cards, live rows, and child-thread chips. */
export function statusToneClass(
  indicator: PluginSidebarThreadIndicator,
): string {
  switch (indicator) {
    case "unread-error":
      return "text-destructive";
    case "waiting-for-input":
      return "text-attention";
    case "unread-success":
      return "text-success";
    case "runtime":
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "goal":
      return "text-primary";
    case "draft":
    case "working-draft":
      return "text-warning";
    case "none":
    default:
      return "text-muted-foreground";
  }
}

/** Pull-request tones use the same host semantics as the native sidebar. */
export function pullRequestToneClass(
  pullRequest: PluginSidebarPullRequest,
): string {
  if (pullRequest.state === "merged" || pullRequest.attention === "merged") {
    return "text-pr-merged";
  }
  if (
    pullRequest.attention === "blocked" ||
    pullRequest.attention === "changes_requested" ||
    pullRequest.attention === "checks_failed" ||
    pullRequest.attention === "conflicts"
  ) {
    return "text-destructive";
  }
  if (pullRequest.state === "draft" || pullRequest.attention === "draft") {
    return "text-muted-foreground/60";
  }
  if (pullRequest.state === "closed" || pullRequest.attention === "closed") {
    return "text-destructive";
  }
  if (pullRequest.state === "open") {
    return "text-success";
  }
  return "text-muted-foreground";
}
