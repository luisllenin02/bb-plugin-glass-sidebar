import type {
  PluginSidebarThread,
  PluginSidebarThreadIndicator,
} from "@get-bb/plugin-sdk/app";
import { cn } from "./lib/utils";
import { relativeTimeLabel } from "./relative-time";
import { StatusGlyph } from "./StatusGlyph";
import { statusToneClass } from "./status-tone";

export { statusToneClass } from "./status-tone";

/**
 * The row's trailing slot: one fixed width, right-aligned, on every row.
 *
 * Fixed rather than intrinsic because both ages and live-status labels vary in
 * width. The slot holds "Needs you" without dragging the project column back
 * and forth as a thread changes state.
 */
export const STATUS_SLOT_CLASS = "flex w-16 shrink-0 items-center justify-end";

/**
 * The box every trailing glyph sits in, whatever its artwork measures.
 *
 * The status glyph, the provider glyph and a shelf's chevron all end a line at
 * the same inset, but they are drawn at different sizes. A shared box centres
 * each one on the same vertical axis, so right-aligning the boxes lines the
 * icons up instead of leaving them one or two pixels apart.
 */
export const TRAILING_GLYPH_BOX_CLASS =
  "flex size-3.5 shrink-0 items-center justify-center";

/**
 * Status OR age, never both: the glyph already implies the row is current, and
 * the age only earns its place once the thread has nothing to say.
 */
export function StatusOrTime({
  thread,
  now,
}: {
  thread: PluginSidebarThread;
  /** Quantized clock, shared by every row in one render. */
  now: number;
}) {
  if (
    thread.activity.workflows > 0 &&
    thread.indicator !== "unread-error" &&
    thread.indicator !== "waiting-for-input" &&
    !isWorkingIndicator(thread.indicator)
  ) {
    return (
      <StatusGlyph
        indicator="workflow"
        label={thread.indicatorLabel ?? "Workflow running"}
      />
    );
  }
  const status = shortStatus(thread.indicator);
  if (status !== null) {
    return (
      <span
        aria-label={thread.indicatorLabel ?? status.label}
        className={cn(
          "max-w-full truncate text-2xs font-medium",
          status.className,
        )}
      >
        {status.label}
      </span>
    );
  }
  return (
    <span className="tabular-nums text-2xs text-muted-foreground">
      {relativeTimeLabel(thread.updatedAt, now)}
    </span>
  );
}

function isWorkingIndicator(
  indicator: PluginSidebarThreadIndicator,
): boolean {
  switch (indicator) {
    case "runtime":
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "goal":
    case "working-draft":
      return true;
    default:
      return false;
  }
}

function shortStatus(indicator: PluginSidebarThreadIndicator): {
  label: string;
  className: string;
} | null {
  switch (indicator) {
    case "unread-error":
      return { label: "Failed", className: statusToneClass(indicator) };
    case "waiting-for-input":
      return { label: "Needs you", className: statusToneClass(indicator) };
    case "unread-success":
      return { label: "Unread", className: statusToneClass(indicator) };
    case "runtime":
      return { label: "Working", className: statusToneClass(indicator) };
    case "workflow":
      return { label: "Workflow", className: statusToneClass(indicator) };
    case "background-agent":
      return { label: "Agent", className: statusToneClass(indicator) };
    case "background-command":
      return { label: "Command", className: statusToneClass(indicator) };
    case "plan-mode":
      return { label: "Planning", className: statusToneClass(indicator) };
    case "goal":
      return { label: "Goal", className: statusToneClass(indicator) };
    case "draft":
      return { label: "Draft", className: statusToneClass(indicator) };
    case "working-draft":
      return { label: "Drafting", className: statusToneClass(indicator) };
    case "none":
      return null;
    default:
      return null;
  }
}
