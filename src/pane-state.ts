import type {
  PluginSidebarSplitPane,
  PluginSidebarThreadSplit,
} from "@get-bb/plugin-sdk/app";

// Ported from yusuf8834/bb-sidebar's split-state helpers.
export type PaneState = "focused" | "open" | "none";

export function resolvePaneState(
  isActive: boolean,
  layout: PluginSidebarThreadSplit["layout"],
): PaneState {
  if (isActive) return "focused";
  if (layout === null) return "none";
  return layout.panes.some((pane) => pane.isMe && pane.isFocused)
    ? "focused"
    : "open";
}

export function orderedPanes(
  panes: readonly PluginSidebarSplitPane[],
): PluginSidebarSplitPane[] {
  return [...panes].sort(
    (a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y,
  );
}

export function paneOrdinal(
  panes: readonly PluginSidebarSplitPane[],
): { index: number; count: number } | null {
  if (panes.length < 2) return null;
  const ordered = orderedPanes(panes);
  const index = ordered.findIndex((pane) => pane.isMe);
  return index === -1 ? null : { index: index + 1, count: ordered.length };
}
