import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { childrenOf } from "./inbox";

export interface RelatedThreadTreeNode {
  thread: PluginSidebarThread;
  children: RelatedThreadTreeNode[];
}

/** Build a cycle-safe descendant tree from the sidebar's flat thread view. */
export function buildRelatedThreadTree(
  threads: readonly PluginSidebarThread[],
  parentThreadId: string,
  path = new Set<string>([parentThreadId]),
): RelatedThreadTreeNode[] {
  return childrenOf(threads, parentThreadId).map((thread) => {
    if (path.has(thread.id)) return { thread, children: [] };
    const nextPath = new Set(path);
    nextPath.add(thread.id);
    return {
      thread,
      children: buildRelatedThreadTree(threads, thread.id, nextPath),
    };
  });
}

export function flattenRelatedThreadTree(
  tree: readonly RelatedThreadTreeNode[],
): RelatedThreadTreeNode[] {
  const result: RelatedThreadTreeNode[] = [];
  for (const node of tree) {
    result.push(node, ...flattenRelatedThreadTree(node.children));
  }
  return result;
}
