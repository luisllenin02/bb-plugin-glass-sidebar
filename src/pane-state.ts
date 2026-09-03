import type { CSSProperties } from "react";
import type {
  PluginSidebarSplitPane,
  PluginSidebarThreadSplit,
} from "@get-bb/plugin-sdk/app";
import { cn } from "./lib/utils";

/**
 * How a row relates to what is on screen right now.
 *
 * The whole point of this module is that the three states must be told apart at
 * a glance. Every marketplace thread list descended from T3 Sidebar draws
 * "active" as `bg-sidebar-accent` and "open in another pane" as
 * `bg-sidebar-accent/30` — same hue, a few percent of alpha apart — which is
 * unreadable once three panes are open. Background, rail, outline and title
 * weight all move together here instead, and the tests below lock the three
 * apart so the row rule cannot quietly regress to a tint.
 */
export type PaneState = "focused" | "open" | "none";

/** Marker class for rows carrying a user-picked accent, for theme CSS to hook. */
export const ACCENT_ROW_CLASS = "bb-sidebar-accent-row";

/** Multi-select ring. It wins over the pane outline: two rings read as noise. */
export const SELECTED_ROW_CLASS =
  "bg-sidebar-accent ring-1 ring-inset ring-primary/60";

export function resolvePaneState(
  isActive: boolean,
  layout: PluginSidebarThreadSplit["layout"],
): PaneState {
  if (isActive) return "focused";
  if (layout === null) return "none";
  if (layout.panes.some((pane) => pane.isMe && pane.isFocused)) return "focused";
  return "open";
}

/**
 * Panes left-to-right, then top-to-bottom, the reading order the host's own
 * mini-map uses. Sorting a copy keeps the SDK's readonly array intact.
 */
export function orderedPanes(
  panes: readonly PluginSidebarSplitPane[],
): PluginSidebarSplitPane[] {
  return [...panes].sort(
    (a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y,
  );
}

/**
 * Which pane of how many holds this thread, 1-based, or null when the answer
 * would say nothing: a single pane is not a split, and a layout without an
 * `isMe` pane does not describe this row.
 */
export function paneOrdinal(
  panes: readonly PluginSidebarSplitPane[],
): { index: number; count: number } | null {
  if (panes.length < 2) return null;
  const ordered = orderedPanes(panes);
  const index = ordered.findIndex((pane) => pane.isMe);
  if (index === -1) return null;
  return { index: index + 1, count: ordered.length };
}

/** True when this row's pane is the focused one. */
export function isFocusedPane(
  panes: readonly PluginSidebarSplitPane[],
): boolean {
  return panes.some((pane) => pane.isMe && pane.isFocused);
}

export function rowBackgroundClass(state: PaneState): string {
  switch (state) {
    case "focused":
      return "bg-sidebar-accent";
    case "open":
      return "bg-sidebar-accent/25";
    case "none":
      return "hover:bg-sidebar-accent/60";
  }
}

/** The ring (focused) or dashed outline (open) that separates the two states. */
export function rowEmphasisClass(state: PaneState): string {
  switch (state) {
    case "focused":
      return "ring-1 ring-inset ring-primary/60";
    case "open":
      return "outline-dashed outline-1 -outline-offset-1 outline-primary/50";
    case "none":
      return "";
  }
}

export function rowSurfaceClass(state: PaneState): string {
  return cn(rowBackgroundClass(state), rowEmphasisClass(state));
}

export function rowTitleClass(state: PaneState): string {
  switch (state) {
    case "focused":
      return "text-foreground font-semibold";
    case "open":
      return "text-foreground";
    case "none":
      return "";
  }
}

/**
 * The accent rail's opacity per state. The rail is drawn with an inline style
 * because its colour is `var(--thread-accent)`, a user-picked value the
 * plugin's Tailwind pass cannot emit a utility for.
 */
export function railOpacity(state: PaneState): number {
  switch (state) {
    case "focused":
      return 1;
    case "open":
      return 0.55;
    case "none":
      return 0.4;
  }
}

/** An idle row only earns a rail when the user gave the thread a colour. */
export function showAccentRail(state: PaneState, hasAccent: boolean): boolean {
  return state !== "none" || hasAccent;
}

/**
 * Row-root classes for a pane state. The rail draws inside the row's existing
 * left padding, so `hasAccent` costs no layout; it only marks the row for theme
 * CSS.
 */
export function rowStateClasses(state: PaneState, hasAccent: boolean): string {
  return cn(rowSurfaceClass(state), hasAccent && ACCENT_ROW_CLASS);
}

/** The row root's full class set, selection included. */
export function rowRootClasses(options: {
  state: PaneState;
  hasAccent: boolean;
  isSelected: boolean;
}): string {
  const { state, hasAccent, isSelected } = options;
  if (!isSelected) return rowStateClasses(state, hasAccent);
  return cn(
    rowBackgroundClass(state),
    hasAccent && ACCENT_ROW_CLASS,
    SELECTED_ROW_CLASS,
  );
}

/**
 * The row root's inline style: the resolved accent travels as a custom
 * property so the rail (and anything a theme keys off it) can read it, and the
 * property is omitted entirely when the thread has no accent.
 */
export function rowAccentStyle(
  accent: string | undefined,
): CSSProperties | undefined {
  if (!accent) return undefined;
  return { "--thread-accent": accent } as CSSProperties;
}
