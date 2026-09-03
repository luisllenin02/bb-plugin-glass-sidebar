import type {
  PluginSidebarThread,
  PluginSidebarThreadIndicator,
} from "@get-bb/plugin-sdk/app";

const NEEDS_YOU_INDICATORS: readonly PluginSidebarThreadIndicator[] = [
  "waiting-for-input",
  "unread-error",
];

const WORKING_INDICATORS: readonly PluginSidebarThreadIndicator[] = [
  "runtime",
  "workflow",
  "background-agent",
  "background-command",
  "plan-mode",
  "working-draft",
];

export type NowClass = "needs-you" | "working" | null;

export function classifyNow(
  thread: Pick<PluginSidebarThread, "indicator"> &
    Partial<Pick<PluginSidebarThread, "activity">>,
): NowClass {
  if (NEEDS_YOU_INDICATORS.includes(thread.indicator)) return "needs-you";
  if (WORKING_INDICATORS.includes(thread.indicator)) return "working";
  if (
    thread.activity &&
    Object.values(thread.activity).some((count) => count > 0)
  ) {
    return "working";
  }
  return null;
}

export interface NowRowsResult<T> {
  rows: T[];
  overflow: number;
}

export function nowRows<
  T extends Pick<PluginSidebarThread, "indicator" | "updatedAt"> &
    Partial<Pick<PluginSidebarThread, "activity">>,
>(threads: readonly T[], max = 8): NowRowsResult<T> {
  const needsYou: T[] = [];
  const working: T[] = [];
  for (const thread of threads) {
    const kind = classifyNow(thread);
    if (kind === "needs-you") needsYou.push(thread);
    else if (kind === "working") working.push(thread);
  }
  working.sort((a, b) => b.updatedAt - a.updatedAt);
  const ordered = [...needsYou, ...working];
  return {
    rows: ordered.slice(0, max),
    overflow: Math.max(0, ordered.length - max),
  };
}

/** Truncate a chip's title to `max` characters, ellipsis included. */
export function chipLabel(title: string, max = 18): string {
  if (title.length <= max) return title;
  if (max <= 1) return title.slice(0, max);
  return `${title.slice(0, max - 1)}…`;
}
