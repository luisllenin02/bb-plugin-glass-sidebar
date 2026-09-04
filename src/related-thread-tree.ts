import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

export interface RelatedThreadTreeNode {
  thread: PluginSidebarThread;
  children: RelatedThreadTreeNode[];
}

/**
 * Children by parent, in the order `inbox.childrenOf` produces: oldest first
 * (the order they were spawned), ties keeping their place in the incoming
 * list. Built once per tree instead of filtering and sorting the whole thread
 * array again at every node.
 */
function indexChildren(
  threads: readonly PluginSidebarThread[],
): Map<string, PluginSidebarThread[]> {
  const byParent = new Map<string, PluginSidebarThread[]>();
  for (const thread of threads) {
    const parentThreadId = thread.parentThreadId;
    if (parentThreadId === null) continue;
    const siblings = byParent.get(parentThreadId);
    if (siblings) siblings.push(thread);
    else byParent.set(parentThreadId, [thread]);
  }
  // Sorting each bucket after a stable partition gives exactly what filtering
  // then sorting the whole list gave: `Array.prototype.sort` is stable, so
  // equal `createdAt` keeps list order either way.
  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => left.createdAt - right.createdAt);
  }
  return byParent;
}

function branchFrom(
  byParent: ReadonlyMap<string, PluginSidebarThread[]>,
  parentThreadId: string,
  path: Set<string>,
): RelatedThreadTreeNode[] {
  const children = byParent.get(parentThreadId);
  if (children === undefined) return [];
  return children.map((thread) => {
    if (path.has(thread.id)) return { thread, children: [] };
    const nextPath = new Set(path);
    nextPath.add(thread.id);
    return { thread, children: branchFrom(byParent, thread.id, nextPath) };
  });
}

/** Build a cycle-safe descendant tree from the sidebar's flat thread view. */
export function buildRelatedThreadTree(
  threads: readonly PluginSidebarThread[],
  parentThreadId: string,
  path = new Set<string>([parentThreadId]),
): RelatedThreadTreeNode[] {
  return branchFrom(indexChildren(threads), parentThreadId, path);
}

export function flattenRelatedThreadTree(
  tree: readonly RelatedThreadTreeNode[],
): RelatedThreadTreeNode[] {
  // Pre-order, same as before, but appending in place: the old spread copied
  // every subtree into its parent's result on the way back up.
  const result: RelatedThreadTreeNode[] = [];
  const visit = (nodes: readonly RelatedThreadTreeNode[]): void => {
    for (const node of nodes) {
      result.push(node);
      visit(node.children);
    }
  };
  visit(tree);
  return result;
}
